import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '2024-12';
    const periodDate = new Date(period + '-01');

    // Fetch active entities
    const entities = await db.entity.findMany({ where: { isActive: true } });
    const entityIds = entities.map((e) => e.id);

    // Fetch actuals, budget, and forecast for the period
    const [actuals, budgets, forecasts] = await Promise.all([
      db.trialBalance.findMany({
        where: { entityId: { in: entityIds }, period: periodDate, periodType: 'actual' },
        include: { groupCOA: { select: { code: true, name: true, accountType: true, statementType: true } } },
      }),
      db.budgetEntry.findMany({
        where: { entityId: { in: entityIds }, period: periodDate },
        include: { groupCOA: { select: { code: true, name: true, accountType: true, statementType: true } } },
      }),
      db.forecastEntry.findMany({
        where: { entityId: { in: entityIds }, period: periodDate, scenarioType: 'base' },
        include: { groupCOA: { select: { code: true, name: true, accountType: true, statementType: true } } },
      }),
    ]);

    // Group amounts by account category
    const metricDefinitions: Array<{
      metric: string;
      prefixes: string[];
      sign: number; // 1 for positive metrics, -1 for expense metrics
    }> = [
      { metric: 'Revenue', prefixes: ['REV-'], sign: 1 },
      { metric: 'COGS', prefixes: ['COGS-'], sign: -1 },
      { metric: 'Gross Profit', prefixes: ['REV-', 'COGS-'], sign: 0 },
      { metric: 'OPEX', prefixes: ['OPX-', 'PAY-'], sign: -1 },
      { metric: 'EBITDA', prefixes: ['REV-', 'COGS-', 'OPX-', 'PAY-'], sign: 0 },
      { metric: 'Depreciation', prefixes: ['DEP-'], sign: -1 },
      { metric: 'EBIT', prefixes: ['REV-', 'COGS-', 'OPX-', 'PAY-', 'DEP-'], sign: 0 },
      { metric: 'Interest Expense', prefixes: ['INT-'], sign: -1 },
      { metric: 'Net Income', prefixes: ['REV-', 'COGS-', 'OPX-', 'PAY-', 'DEP-', 'INT-', 'TAX-'], sign: 0 },
      { metric: 'Operating Cash Flow', prefixes: ['CFA-001'], sign: 1 },
      { metric: 'Capex', prefixes: ['CFA-002'], sign: -1 },
      { metric: 'Total Assets', prefixes: ['AST-'], sign: 1 },
    ];

    const varianceData = metricDefinitions.map((def) => {
      const filterByPrefixes = (entries: Array<{ groupCOACode: string; amountEUR: number }>) => {
        return entries
          .filter((e) => def.prefixes.some((p) => e.groupCOACode.startsWith(p)))
          .reduce((sum, e) => sum + e.amountEUR, 0);
      };

      let actual = filterByPrefixes(actuals);
      let budget = filterByPrefixes(budgets);
      let forecast = filterByPrefixes(forecasts);

      const varianceVsBudget = actual - budget;
      const varianceVsForecast = actual - forecast;
      const variancePctBudget = budget !== 0 ? (varianceVsBudget / Math.abs(budget)) * 100 : 0;

      return {
        metric: def.metric,
        actual: Math.round(actual),
        budget: Math.round(budget),
        forecast: Math.round(forecast),
        varianceVsBudget: Math.round(varianceVsBudget),
        varianceVsForecast: Math.round(varianceVsForecast),
        variancePctBudget: Math.round(variancePctBudget * 10) / 10,
      };
    });

    // Summary cards
    const revenueVariance = varianceData.find((v) => v.metric === 'Revenue');
    const ebitdaVariance = varianceData.find((v) => v.metric === 'EBITDA');
    const netIncomeVariance = varianceData.find((v) => v.metric === 'Net Income');

    const summary = {
      revenue: revenueVariance
        ? { actual: revenueVariance.actual, budget: revenueVariance.budget, variance: revenueVariance.varianceVsBudget, variancePct: revenueVariance.variancePctBudget }
        : null,
      ebitda: ebitdaVariance
        ? { actual: ebitdaVariance.actual, budget: ebitdaVariance.budget, variance: ebitdaVariance.varianceVsBudget, variancePct: ebitdaVariance.variancePctBudget }
        : null,
      netIncome: netIncomeVariance
        ? { actual: netIncomeVariance.actual, budget: netIncomeVariance.budget, variance: netIncomeVariance.varianceVsBudget, variancePct: netIncomeVariance.variancePctBudget }
        : null,
    };

    return NextResponse.json({
      period,
      varianceData,
      summary,
      totalActuals: actuals.length,
      totalBudgets: budgets.length,
      totalForecasts: forecasts.length,
    });
  } catch (error) {
    console.error('Error calculating variance:', error);
    return NextResponse.json({ error: 'Failed to calculate variance analysis' }, { status: 500 });
  }
}
