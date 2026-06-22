import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { parsePeriodParam } from '@/lib/period';
import { buildStatements, resolveMetric, type CoaAmount, type StatementMetric } from '@/lib/finance';

// Variance analysis: group actual vs budget vs forecast per metric, for the
// period. Metrics are resolved through the shared finance domain
// (buildStatements + resolveMetric) — the single source for the COA→statement
// rollup — instead of the hand-maintained prefix subsets this route used to
// carry (which also had an unused `sign` field). These are pre-elimination group
// totals, which is the right basis for comparing against (uneliminated) budgets.

const METRICS: Array<{ label: string; metric: StatementMetric }> = [
  { label: 'Revenue', metric: 'revenue' },
  { label: 'COGS', metric: 'cogs' },
  { label: 'Gross Profit', metric: 'grossProfit' },
  { label: 'OPEX', metric: 'opex' },
  { label: 'EBITDA', metric: 'ebitda' },
  { label: 'Depreciation', metric: 'depreciation' },
  { label: 'EBIT', metric: 'ebit' },
  { label: 'Interest Expense', metric: 'interestExpense' },
  { label: 'Net Income', metric: 'netIncome' },
  { label: 'Operating Cash Flow', metric: 'operatingCashFlow' },
  { label: 'Capex', metric: 'capex' },
  { label: 'Total Assets', metric: 'assets' },
];

const toAmounts = (rows: Array<{ groupCOACode: string; amountEUR: number }>): CoaAmount[] =>
  rows.map((r) => ({ groupCOACode: r.groupCOACode, amountEUR: r.amountEUR }));

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const parsedPeriod = parsePeriodParam(searchParams.get('period'));
    if (!parsedPeriod.ok) {
      return NextResponse.json({ error: parsedPeriod.error }, { status: 400 });
    }
    const { period, periodDate } = parsedPeriod;

    const entities = await db.entity.findMany({ where: { isActive: true } });
    const entityIds = entities.map((e) => e.id);

    const [actuals, budgets, forecasts] = await Promise.all([
      db.trialBalance.findMany({
        where: { entityId: { in: entityIds }, period: periodDate, periodType: 'actual' },
      }),
      db.budgetEntry.findMany({
        where: { entityId: { in: entityIds }, period: periodDate },
      }),
      db.forecastEntry.findMany({
        where: { entityId: { in: entityIds }, period: periodDate, scenarioType: 'base' },
      }),
    ]);

    // Build each statement set once, then resolve every metric from it.
    const actualStmts = buildStatements(toAmounts(actuals));
    const budgetStmts = buildStatements(toAmounts(budgets));
    const forecastStmts = buildStatements(toAmounts(forecasts));

    const varianceData = METRICS.map(({ label, metric }) => {
      const actual = resolveMetric(actualStmts, metric);
      const budget = resolveMetric(budgetStmts, metric);
      const forecast = resolveMetric(forecastStmts, metric);

      const varianceVsBudget = actual - budget;
      const varianceVsForecast = actual - forecast;
      const variancePctBudget = budget !== 0 ? (varianceVsBudget / Math.abs(budget)) * 100 : 0;

      return {
        metric: label,
        actual: Math.round(actual),
        budget: Math.round(budget),
        forecast: Math.round(forecast),
        varianceVsBudget: Math.round(varianceVsBudget),
        varianceVsForecast: Math.round(varianceVsForecast),
        variancePctBudget: Math.round(variancePctBudget * 10) / 10,
      };
    });

    // Summary cards
    const card = (label: string) => {
      const v = varianceData.find((d) => d.metric === label);
      return v
        ? { actual: v.actual, budget: v.budget, variance: v.varianceVsBudget, variancePct: v.variancePctBudget }
        : null;
    };

    return NextResponse.json({
      period,
      varianceData,
      summary: {
        revenue: card('Revenue'),
        ebitda: card('EBITDA'),
        netIncome: card('Net Income'),
      },
      totalActuals: actuals.length,
      totalBudgets: budgets.length,
      totalForecasts: forecasts.length,
    });
  } catch (error) {
    console.error('Error calculating variance:', error);
    return NextResponse.json({ error: 'Failed to calculate variance analysis' }, { status: 500 });
  }
}
