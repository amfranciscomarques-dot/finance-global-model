import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import type { BudgetEntry } from '@prisma/client';
import { z } from 'zod';
import { categorizeCoaCode } from '@/lib/coa-data';

const budgetEntrySchema = z.object({
  entityCode: z.string().min(1),
  period: z.string().min(1),
  entries: z.array(z.object({
    groupCOACode: z.string().min(1),
    budgetAmount: z.number(),
  })).min(1),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '2024-12';
    const entityCode = searchParams.get('entityCode');
    const periodDate = new Date(period + '-01');

    // Build entity filter
    const entityFilter: Record<string, unknown> = { isActive: true };
    if (entityCode) entityFilter.code = entityCode;

    const entities = await db.entity.findMany({ where: entityFilter });
    const entityIds = entities.map((e) => e.id);

    // Fetch budget entries and actuals in parallel
    const [budgetEntries, actualEntries] = await Promise.all([
      db.budgetEntry.findMany({
        where: {
          entityId: { in: entityIds },
          period: periodDate,
        },
        include: {
          entity: { select: { code: true, legalName: true } },
          groupCOA: { select: { code: true, name: true, accountType: true } },
        },
      }),
      db.trialBalance.findMany({
        where: {
          entityId: { in: entityIds },
          period: periodDate,
          periodType: 'actual',
        },
        include: {
          entity: { select: { code: true, legalName: true } },
          groupCOA: { select: { code: true, name: true, accountType: true } },
        },
      }),
    ]);

    // Aggregate budget by entity and COA code
    const budgetByEntityCOA = new Map<string, number>();
    for (const entry of budgetEntries) {
      const key = `${entry.entity.code}|${entry.groupCOACode}`;
      budgetByEntityCOA.set(key, (budgetByEntityCOA.get(key) || 0) + entry.amountEUR);
    }

    // Aggregate actuals by entity and COA code
    const actualsByEntityCOA = new Map<string, number>();
    for (const entry of actualEntries) {
      const key = `${entry.entity.code}|${entry.groupCOACode}`;
      actualsByEntityCOA.set(key, (actualsByEntityCOA.get(key) || 0) + entry.amountEUR);
    }

    // Build entity breakdown
    const entityBreakdownMap = new Map<string, { entityCode: string; entityName: string; totalBudget: number; totalActual: number }>();
    for (const entity of entities) {
      entityBreakdownMap.set(entity.code, {
        entityCode: entity.code,
        entityName: entity.legalName,
        totalBudget: 0,
        totalActual: 0,
      });
    }

    for (const [key, budget] of budgetByEntityCOA) {
      const [entityCodeKey] = key.split('|');
      const breakdown = entityBreakdownMap.get(entityCodeKey);
      if (breakdown) breakdown.totalBudget += budget;
    }

    for (const [key, actual] of actualsByEntityCOA) {
      const [entityCodeKey] = key.split('|');
      const breakdown = entityBreakdownMap.get(entityCodeKey);
      if (breakdown) breakdown.totalActual += actual;
    }

    const entityBreakdown = Array.from(entityBreakdownMap.values()).map((e) => ({
      ...e,
      variance: e.totalActual - e.totalBudget,
      variancePct: e.totalBudget !== 0 ? ((e.totalActual - e.totalBudget) / Math.abs(e.totalBudget)) * 100 : 0,
    }));

    // Build category breakdown
    const categoryMap = new Map<string, { totalBudget: number; totalActual: number }>();
    for (const [key, budget] of budgetByEntityCOA) {
      const [, coaCode] = key.split('|');
      const cat = categorizeCoaCode(coaCode);
      if (!categoryMap.has(cat)) categoryMap.set(cat, { totalBudget: 0, totalActual: 0 });
      categoryMap.get(cat)!.totalBudget += budget;
    }
    for (const [key, actual] of actualsByEntityCOA) {
      const [, coaCode] = key.split('|');
      const cat = categorizeCoaCode(coaCode);
      if (!categoryMap.has(cat)) categoryMap.set(cat, { totalBudget: 0, totalActual: 0 });
      categoryMap.get(cat)!.totalActual += actual;
    }

    const categoryBreakdown = Array.from(categoryMap.entries()).map(([category, data]) => ({
      category,
      totalBudget: Math.round(data.totalBudget),
      totalActual: Math.round(data.totalActual),
      variance: Math.round(data.totalActual - data.totalBudget),
      variancePct: data.totalBudget !== 0 ? Math.round(((data.totalActual - data.totalBudget) / Math.abs(data.totalBudget)) * 1000) / 10 : 0,
    }));

    // Calculate totals
    const totalBudget = entityBreakdown.reduce((sum, e) => sum + e.totalBudget, 0);
    const totalActual = entityBreakdown.reduce((sum, e) => sum + e.totalActual, 0);
    const totalVariance = totalActual - totalBudget;
    const variancePct = totalBudget !== 0 ? (totalVariance / Math.abs(totalBudget)) * 100 : 0;

    const summary = {
      totalBudget: Math.round(totalBudget),
      totalActual: Math.round(totalActual),
      totalVariance: Math.round(totalVariance),
      variancePct: Math.round(variancePct * 10) / 10,
      entityBreakdown,
      categoryBreakdown,
    };

    return NextResponse.json({
      budget: budgetEntries.map((e) => ({
        id: e.id,
        entityCode: e.entity.code,
        period,
        groupCOACode: e.groupCOACode,
        budgetAmount: e.amountEUR,
        actualAmount: actualsByEntityCOA.get(`${e.entity.code}|${e.groupCOACode}`) || 0,
      })),
      actuals: actualEntries.map((e) => ({
        id: e.id,
        entityCode: e.entity.code,
        period,
        groupCOACode: e.groupCOACode,
        actualAmount: e.amountEUR,
      })),
      summary,
    });
  } catch (error) {
    console.error('Error fetching budget vs actual:', error);
    return NextResponse.json({ error: 'Failed to fetch budget vs actual data' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = budgetEntrySchema.parse(body);

    // Find entity by code
    const entity = await db.entity.findFirst({
      where: { code: validated.entityCode },
    });
    if (!entity) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 });
    }

    const periodDate = new Date(validated.period + '-01');

    // Create or update budget entries
    const results: BudgetEntry[] = [];
    for (const entry of validated.entries) {
      // Check if entry already exists
      const existing = await db.budgetEntry.findFirst({
        where: {
          entityId: entity.id,
          period: periodDate,
          groupCOACode: entry.groupCOACode,
        },
      });

      if (existing) {
        const updated = await db.budgetEntry.update({
          where: { id: existing.id },
          data: {
            amountEUR: entry.budgetAmount,
            amountLocal: entry.budgetAmount,
          },
        });
        results.push(updated);
      } else {
        const created = await db.budgetEntry.create({
          data: {
            entityId: entity.id,
            period: periodDate,
            groupCOACode: entry.groupCOACode,
            amountEUR: entry.budgetAmount,
            amountLocal: entry.budgetAmount,
            currency: entity.localCurrency,
            budgetVersion: 'v1',
          },
        });
        results.push(created);
      }
    }

    return NextResponse.json({
      message: `Saved ${results.length} budget entries`,
      entries: results.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 });
    }
    console.error('Error saving budget entries:', error);
    return NextResponse.json({ error: 'Failed to save budget entries' }, { status: 500 });
  }
}
