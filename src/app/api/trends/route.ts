import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Metric calculation helpers
const METRIC_CONFIG: Record<string, {
  revenueCodes: string[];
  expenseCodes: string[];
  assetCodes: string[];
  liabilityCodes: string[];
  compute: (vals: Record<string, number>) => number;
}> = {
  revenue: {
    revenueCodes: ['REV-001', 'REV-002', 'REV-003'],
    expenseCodes: [],
    assetCodes: [],
    liabilityCodes: [],
    compute: (vals) => vals.revenue || 0,
  },
  ebitda: {
    revenueCodes: ['REV-001', 'REV-002', 'REV-003'],
    expenseCodes: ['COGS-001', 'COGS-002', 'OPX-001', 'PAY-001'],
    assetCodes: [],
    liabilityCodes: [],
    compute: (vals) => (vals.revenue || 0) - (vals.cogs || 0) - (vals.opex || 0),
  },
  netIncome: {
    revenueCodes: ['REV-001', 'REV-002', 'REV-003'],
    expenseCodes: ['COGS-001', 'COGS-002', 'OPX-001', 'PAY-001', 'DEP-001', 'DEP-002', 'INT-001', 'TAX-001'],
    assetCodes: [],
    liabilityCodes: [],
    compute: (vals) => (vals.revenue || 0) - (vals.cogs || 0) - (vals.opex || 0) - (vals.da || 0) - (vals.interest || 0) - (vals.tax || 0),
  },
  assets: {
    revenueCodes: [],
    expenseCodes: [],
    assetCodes: ['AST-001', 'AST-002', 'AST-003', 'AST-004', 'AST-005', 'AST-006'],
    liabilityCodes: [],
    compute: (vals) => vals.assets || 0,
  },
  leverage: {
    revenueCodes: [],
    expenseCodes: [],
    assetCodes: ['AST-001', 'AST-002', 'AST-003', 'AST-004', 'AST-005', 'AST-006'],
    liabilityCodes: ['LIA-001', 'LIA-002', 'LIA-003', 'LIA-004', 'LIA-005'],
    compute: (vals) => {
      const equity = (vals.assets || 0) - (vals.liabilities || 0);
      return equity > 0 ? (vals.liabilities || 0) / equity : 0;
    },
  },
  ebitdaMargin: {
    revenueCodes: ['REV-001', 'REV-002', 'REV-003'],
    expenseCodes: ['COGS-001', 'COGS-002', 'OPX-001', 'PAY-001'],
    assetCodes: [],
    liabilityCodes: [],
    compute: (vals) => {
      const ebitda = (vals.revenue || 0) - (vals.cogs || 0) - (vals.opex || 0);
      return (vals.revenue || 0) > 0 ? (ebitda / vals.revenue) * 100 : 0;
    },
  },
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const metric = searchParams.get('metric') || 'revenue';
    const periodsParam = searchParams.get('periods') || '2024-01,2024-02,2024-03,2024-04,2024-05,2024-06,2024-07,2024-08,2024-09,2024-10,2024-11,2024-12';
    const entityCode = searchParams.get('entityCode') || undefined;

    const periods = periodsParam.split(',').filter(Boolean);
    const config = METRIC_CONFIG[metric] || METRIC_CONFIG.revenue;

    // Fetch all entities
    const entities = await db.entity.findMany({
      where: { isActive: true },
    });

    const filteredEntities = entityCode
      ? entities.filter((e) => e.code === entityCode)
      : entities;

    // For each period, compute the metric per entity and consolidated
    const allCOACodes = [
      ...config.revenueCodes,
      ...config.expenseCodes,
      ...config.assetCodes,
      ...config.liabilityCodes,
    ];

    const periodData: Array<{
      period: string;
      value: number;
      entityBreakdown: Array<{ entityCode: string; entityName: string; value: number }>;
    }> = [];

    for (const period of periods) {
      const periodDate = new Date(period + '-01');

      const trialBalances = await db.trialBalance.findMany({
        where: {
          period: periodDate,
          groupCOACode: { in: allCOACodes.length > 0 ? allCOACodes : undefined },
          entityId: { in: filteredEntities.map((e) => e.id) },
          periodType: 'actual',
        },
      });

      // Group by entity
      const entityValues: Record<string, Record<string, number>> = {};
      for (const tb of trialBalances) {
        if (!entityValues[tb.entityId]) entityValues[tb.entityId] = {};
        entityValues[tb.entityId][tb.groupCOACode] =
          (entityValues[tb.entityId][tb.groupCOACode] || 0) + tb.amountEUR;
      }

      const entityBreakdown: Array<{ entityCode: string; entityName: string; value: number }> = [];
      let consolidatedValue = 0;

      for (const entity of filteredEntities) {
        const vals = entityValues[entity.id] || {};
        const computedVals: Record<string, number> = {
          revenue: config.revenueCodes.reduce((s, c) => s + (vals[c] || 0), 0),
          cogs: ['COGS-001', 'COGS-002'].reduce((s, c) => s + (vals[c] || 0), 0),
          opex: ['OPX-001', 'PAY-001'].reduce((s, c) => s + (vals[c] || 0), 0),
          da: ['DEP-001', 'DEP-002'].reduce((s, c) => s + (vals[c] || 0), 0),
          interest: ['INT-001'].reduce((s, c) => s + (vals[c] || 0), 0),
          tax: ['TAX-001'].reduce((s, c) => s + (vals[c] || 0), 0),
          assets: config.assetCodes.reduce((s, c) => s + (vals[c] || 0), 0),
          liabilities: config.liabilityCodes.reduce((s, c) => s + (vals[c] || 0), 0),
        };
        const value = config.compute(computedVals);
        entityBreakdown.push({
          entityCode: entity.code,
          entityName: entity.legalName,
          value,
        });
        consolidatedValue += value;
      }

      periodData.push({
        period,
        value: consolidatedValue,
        entityBreakdown,
      });
    }

    // Compute QoQ changes
    const qoqChanges: Array<{ fromPeriod: string; toPeriod: string; change: number; changePct: number }> = [];
    for (let i = 1; i < periodData.length; i++) {
      const prev = periodData[i - 1].value;
      const curr = periodData[i].value;
      qoqChanges.push({
        fromPeriod: periodData[i - 1].period,
        toPeriod: periodData[i].period,
        change: curr - prev,
        changePct: prev !== 0 ? ((curr - prev) / Math.abs(prev)) * 100 : 0,
      });
    }

    // Compute YoY changes (compare to same month 12 periods ago, or 3 periods if not enough)
    const yoyOffset = periodData.length >= 12 ? 12 : 3;
    const yoyChanges: Array<{ fromPeriod: string; toPeriod: string; change: number; changePct: number }> = [];
    for (let i = yoyOffset; i < periodData.length; i++) {
      const prev = periodData[i - yoyOffset].value;
      const curr = periodData[i].value;
      yoyChanges.push({
        fromPeriod: periodData[i - yoyOffset].period,
        toPeriod: periodData[i].period,
        change: curr - prev,
        changePct: prev !== 0 ? ((curr - prev) / Math.abs(prev)) * 100 : 0,
      });
    }

    // Compute entity trends (sparkline data for last 6 periods)
    const entityTrends: Array<{
      entityCode: string;
      entityName: string;
      currentPeriod: string;
      currentValue: number;
      previousValue: number;
      change: number;
      changePct: number;
      sparklineData: number[];
    }> = [];

    for (const entity of filteredEntities) {
      const sparklineData: number[] = [];
      const lastPeriods = periodData.slice(-6);

      for (const pd of lastPeriods) {
        const eb = pd.entityBreakdown.find((e) => e.entityCode === entity.code);
        sparklineData.push(eb?.value || 0);
      }

      const currentPeriod = periodData[periodData.length - 1];
      const previousPeriod = periodData.length >= 2 ? periodData[periodData.length - 2] : periodData[0];
      const currentEB = currentPeriod.entityBreakdown.find((e) => e.entityCode === entity.code);
      const previousEB = previousPeriod.entityBreakdown.find((e) => e.entityCode === entity.code);
      const currentValue = currentEB?.value || 0;
      const previousValue = previousEB?.value || 0;

      entityTrends.push({
        entityCode: entity.code,
        entityName: entity.legalName,
        currentPeriod: currentPeriod.period,
        currentValue,
        previousValue,
        change: currentValue - previousValue,
        changePct: previousValue !== 0 ? ((currentValue - previousValue) / Math.abs(previousValue)) * 100 : 0,
        sparklineData,
      });
    }

    return NextResponse.json({
      metric,
      periods: periodData,
      qoqChanges,
      yoyChanges,
      entityTrends,
    });
  } catch (error) {
    console.error('Trend analysis error:', error);
    return NextResponse.json(
      { error: 'Failed to compute trend analysis' },
      { status: 500 }
    );
  }
}
