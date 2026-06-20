import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { z } from 'zod';

const generateReportSchema = z.object({
  reportType: z.enum([
    'consolidated-income',
    'consolidated-balance-sheet',
    'consolidated-cash-flow',
    'variance-analysis',
    'ic-elimination',
    'entity-comparison',
    'scenario-impact',
    'audit-trail',
  ]),
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Period must be in YYYY-MM format'),
  scenarioType: z.enum(['base', 'optimistic', 'pessimistic']).default('base'),
  entityCodes: z.array(z.string()).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');

    // Build report history from consolidation runs
    const runs = await db.consolidationRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const reports = runs.map((run) => ({
      id: run.id,
      reportType: 'consolidation',
      title: `Consolidation Run - ${run.period.toISOString().slice(0, 7)}`,
      period: run.period.toISOString().slice(0, 7),
      scenarioType: run.scenarioType,
      entityCodes: run.entityCodes ? JSON.parse(run.entityCodes) : [],
      generatedAt: run.createdAt.toISOString(),
      format: 'system',
    }));

    return NextResponse.json({ reports });
  } catch (error) {
    console.error('Error fetching reports:', error);
    return NextResponse.json({ error: 'Failed to fetch reports' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = generateReportSchema.parse(body);

    const periodDate = new Date(validated.period + '-01');
    const periodEnd = new Date(periodDate.getFullYear(), periodDate.getMonth() + 1, 1);

    // Determine entity codes
    let entityCodes = validated.entityCodes || [];
    if (entityCodes.length === 0) {
      const allEntities = await db.entity.findMany({
        where: { isActive: true },
        select: { code: true },
      });
      entityCodes = allEntities.map(e => e.code);
    }

    let reportData: Record<string, unknown> = {};

    switch (validated.reportType) {
      case 'consolidated-income': {
        const tb = await db.trialBalance.findMany({
          where: {
            period: { gte: periodDate, lt: periodEnd },
            periodType: 'actual',
            groupCOA: { statementType: 'income' },
          },
          include: {
            entity: { select: { code: true, legalName: true } },
            groupCOA: { select: { code: true, name: true, accountType: true } },
          },
        });
        const byAccount = new Map<string, { name: string; accountType: string; totalEUR: number }>();
        for (const entry of tb) {
          const key = entry.groupCOACode;
          const existing = byAccount.get(key) || { name: entry.groupCOA.name, accountType: entry.groupCOA.accountType, totalEUR: 0 };
          existing.totalEUR += entry.amountEUR;
          byAccount.set(key, existing);
        }
        reportData = { accounts: Object.fromEntries(byAccount), totalEntries: tb.length };
        break;
      }
      case 'consolidated-balance-sheet': {
        const tb = await db.trialBalance.findMany({
          where: {
            period: { gte: periodDate, lt: periodEnd },
            periodType: 'actual',
            groupCOA: { statementType: 'balance' },
          },
          include: {
            entity: { select: { code: true } },
            groupCOA: { select: { code: true, name: true, accountType: true } },
          },
        });
        const byAccount = new Map<string, { name: string; accountType: string; totalEUR: number }>();
        for (const entry of tb) {
          const key = entry.groupCOACode;
          const existing = byAccount.get(key) || { name: entry.groupCOA.name, accountType: entry.groupCOA.accountType, totalEUR: 0 };
          existing.totalEUR += entry.amountEUR;
          byAccount.set(key, existing);
        }
        reportData = { accounts: Object.fromEntries(byAccount), totalEntries: tb.length };
        break;
      }
      case 'consolidated-cash-flow': {
        const tb = await db.trialBalance.findMany({
          where: {
            period: { gte: periodDate, lt: periodEnd },
            periodType: 'actual',
            groupCOA: { statementType: 'cashflow' },
          },
          include: {
            entity: { select: { code: true } },
            groupCOA: { select: { code: true, name: true } },
          },
        });
        reportData = { totalEntries: tb.length, period: validated.period };
        break;
      }
      case 'ic-elimination': {
        const icTxns = await db.intercompanyTransaction.findMany({
          where: {
            period: { gte: periodDate, lt: periodEnd },
          },
          include: {
            fromEntity: { select: { code: true, legalName: true } },
            toEntity: { select: { code: true, legalName: true } },
          },
        });
        reportData = {
          totalTransactions: icTxns.length,
          eliminated: icTxns.filter(t => t.isEliminated).length,
          pending: icTxns.filter(t => !t.isEliminated).length,
          transactions: icTxns.map(t => ({
            transactionId: t.transactionId,
            from: t.fromEntity.code,
            to: t.toEntity.code,
            amountEUR: t.amountEUR,
            type: t.transactionType,
            isEliminated: t.isEliminated,
          })),
        };
        break;
      }
      case 'entity-comparison': {
        const entities = await db.entity.findMany({
          where: { isActive: true },
          select: { code: true, legalName: true, localCurrency: true, consolidationMethod: true, ownershipPercentage: true },
        });
        reportData = { entities, period: validated.period };
        break;
      }
      case 'scenario-impact': {
        const scenarios = await db.scenario.findMany({
          where: { isActive: true },
        });
        reportData = { scenarios, period: validated.period };
        break;
      }
      case 'variance-analysis': {
        const budgetEntries = await db.budgetEntry.findMany({
          where: {
            period: { gte: periodDate, lt: periodEnd },
          },
          include: {
            entity: { select: { code: true } },
            groupCOA: { select: { code: true, name: true } },
          },
        });
        reportData = { budgetEntries: budgetEntries.length, period: validated.period };
        break;
      }
      case 'audit-trail': {
        const runs = await db.consolidationRun.findMany({
          orderBy: { createdAt: 'desc' },
          take: 50,
        });
        reportData = { runs: runs.length, period: validated.period };
        break;
      }
    }

    const report = {
      id: `rpt-${Date.now()}`,
      reportType: validated.reportType,
      title: getReportTitle(validated.reportType),
      period: validated.period,
      scenarioType: validated.scenarioType,
      entityCodes,
      generatedAt: new Date().toISOString(),
      format: 'json',
      data: reportData,
    };

    return NextResponse.json({ report }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error generating report:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate report' },
      { status: 500 }
    );
  }
}

function getReportTitle(reportType: string): string {
  const titles: Record<string, string> = {
    'consolidated-income': 'Consolidated Income Statement',
    'consolidated-balance-sheet': 'Consolidated Balance Sheet',
    'consolidated-cash-flow': 'Consolidated Cash Flow Statement',
    'variance-analysis': 'Variance Analysis Report',
    'ic-elimination': 'Intercompany Elimination Report',
    'entity-comparison': 'Entity Comparison Report',
    'scenario-impact': 'Scenario Impact Report',
    'audit-trail': 'Audit Trail Report',
  };
  return titles[reportType] || 'Report';
}
