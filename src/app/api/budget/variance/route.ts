import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { categorizeCoaCode } from '@/lib/coa-data';

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

    // Fetch budget and actuals
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

    // Aggregate budget by entity + COA code
    const budgetMap = new Map<string, number>();
    for (const entry of budgetEntries) {
      const key = `${entry.entity.code}|${entry.groupCOACode}`;
      budgetMap.set(key, (budgetMap.get(key) || 0) + entry.amountEUR);
    }

    // Aggregate actuals by entity + COA code
    const actualsMap = new Map<string, number>();
    for (const entry of actualEntries) {
      const key = `${entry.entity.code}|${entry.groupCOACode}`;
      actualsMap.set(key, (actualsMap.get(key) || 0) + entry.amountEUR);
    }

    // Build COA name map
    const coaNameMap = new Map<string, { name: string; accountType: string }>();
    for (const entry of budgetEntries) {
      coaNameMap.set(entry.groupCOACode, { name: entry.groupCOA.name, accountType: entry.groupCOA.accountType });
    }
    for (const entry of actualEntries) {
      coaNameMap.set(entry.groupCOACode, { name: entry.groupCOA.name, accountType: entry.groupCOA.accountType });
    }

    // Combine all keys
    const allKeys = new Set([...budgetMap.keys(), ...actualsMap.keys()]);

    // Build variance detail
    const varianceData = Array.from(allKeys).map((key) => {
      const [entityCodeKey, coaCode] = key.split('|');
      const budget = budgetMap.get(key) || 0;
      const actual = actualsMap.get(key) || 0;
      const variance = actual - budget;
      const variancePct = budget !== 0 ? (variance / Math.abs(budget)) * 100 : 0;

      const entity = entities.find((e) => e.code === entityCodeKey);
      const coaInfo = coaNameMap.get(coaCode);

      return {
        entityCode: entityCodeKey,
        entityName: entity?.legalName || entityCodeKey,
        groupCOACode: coaCode,
        accountName: coaInfo?.name || coaCode,
        accountType: coaInfo?.accountType || 'unknown',
        category: categorizeCoaCode(coaCode),
        budgetAmount: Math.round(budget),
        actualAmount: Math.round(actual),
        variance: Math.round(variance),
        variancePct: Math.round(variancePct * 10) / 10,
      };
    });

    // Group by entity
    const byEntity = new Map<string, BudgetVarianceDetail[]>();
    for (const item of varianceData) {
      if (!byEntity.has(item.entityCode)) byEntity.set(item.entityCode, []);
      byEntity.get(item.entityCode)!.push(item);
    }

    // Group by category
    const byCategory = new Map<string, BudgetVarianceDetail[]>();
    for (const item of varianceData) {
      if (!byCategory.has(item.category)) byCategory.set(item.category, []);
      byCategory.get(item.category)!.push(item);
    }

    return NextResponse.json({
      varianceData,
      byEntity: Object.fromEntries(byEntity),
      byCategory: Object.fromEntries(byCategory),
      totalEntries: varianceData.length,
    });
  } catch (error) {
    console.error('Error calculating budget variance:', error);
    return NextResponse.json({ error: 'Failed to calculate budget variance' }, { status: 500 });
  }
}

interface BudgetVarianceDetail {
  entityCode: string;
  entityName: string;
  groupCOACode: string;
  accountName: string;
  accountType: string;
  category: string;
  budgetAmount: number;
  actualAmount: number;
  variance: number;
  variancePct: number;
}
