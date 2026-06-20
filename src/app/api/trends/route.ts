import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { buildStatements, resolveMetric, type StatementMetric } from '@/lib/finance';

// Public trend metric names → canonical statement metric. All metrics roll up
// through the shared finance pipeline (buildStatements + resolveMetric), so the
// full Group COA is included rather than a hand-maintained subset of codes.
const METRIC_ALIASES: Record<string, StatementMetric> = {
  revenue: 'revenue',
  ebitda: 'ebitda',
  netincome: 'netIncome',
  assets: 'assets',
  leverage: 'leverage',
  ebitdamargin: 'ebitdaMargin',
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const metricParam = searchParams.get('metric') || 'revenue';
    const periodsParam = searchParams.get('periods') || '2024-01,2024-02,2024-03,2024-04,2024-05,2024-06,2024-07,2024-08,2024-09,2024-10,2024-11,2024-12';
    const entityCode = searchParams.get('entityCode') || undefined;

    const periods = periodsParam.split(',').filter(Boolean);
    const metric: StatementMetric = METRIC_ALIASES[metricParam.toLowerCase()] ?? 'revenue';
    // Ratios (margins, leverage) cannot be summed across entities — they must be
    // resolved on the aggregated statements for the consolidated period value.
    const isRatio = metric === 'ebitdaMargin' || metric === 'leverage';

    // Fetch all entities
    const entities = await db.entity.findMany({
      where: { isActive: true },
    });

    const filteredEntities = entityCode
      ? entities.filter((e) => e.code === entityCode)
      : entities;

    const periodData: Array<{
      period: string;
      value: number;
      entityBreakdown: Array<{ entityCode: string; entityName: string; value: number }>;
    }> = [];

    for (const period of periods) {
      const periodDate = new Date(period + '-01');

      // All actual entries for the period — no COA-code filter, so every mapped
      // detail account is captured.
      const trialBalances = await db.trialBalance.findMany({
        where: {
          period: periodDate,
          entityId: { in: filteredEntities.map((e) => e.id) },
          periodType: 'actual',
        },
      });

      // Group entries by entity
      const entriesByEntity: Record<string, Array<{ groupCOACode: string; amountEUR: number }>> = {};
      for (const tb of trialBalances) {
        (entriesByEntity[tb.entityId] ??= []).push({ groupCOACode: tb.groupCOACode, amountEUR: tb.amountEUR });
      }

      const entityBreakdown: Array<{ entityCode: string; entityName: string; value: number }> = [];
      let additiveTotal = 0;

      for (const entity of filteredEntities) {
        const stmts = buildStatements(entriesByEntity[entity.id] || []);
        const value = resolveMetric(stmts, metric);
        entityBreakdown.push({
          entityCode: entity.code,
          entityName: entity.legalName,
          value,
        });
        additiveTotal += value;
      }

      // Consolidated period value: aggregate all entries for ratios; sum the
      // per-entity values for additive metrics (equivalent, and cheaper).
      const consolidatedValue = isRatio
        ? resolveMetric(buildStatements(trialBalances.map((tb) => ({ groupCOACode: tb.groupCOACode, amountEUR: tb.amountEUR }))), metric)
        : additiveTotal;

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
      metric: metricParam,
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
