import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { runConsolidation } from '@/lib/consolidation-engine';
import { z } from 'zod';

const scenarioRunSchema = z.object({
  scenarioId: z.string().min(1),
  basePeriod: z.string().regex(/^\d{4}-\d{2}$/, 'Period must be in YYYY-MM format'),
  entityCodes: z.array(z.string()).min(1, 'At least one entity code is required'),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = scenarioRunSchema.parse(body);

    // Fetch the scenario
    const scenario = await db.scenario.findUnique({
      where: { id: validated.scenarioId },
    });

    if (!scenario) {
      return NextResponse.json({ error: 'Scenario not found' }, { status: 404 });
    }

    // Run base case consolidation for comparison
    const baseResult = await runConsolidation({
      period: validated.basePeriod,
      entityCodes: validated.entityCodes,
      scenarioType: 'base',
    });

    // Run scenario consolidation with scenario type
    const scenarioResult = await runConsolidation({
      period: validated.basePeriod,
      entityCodes: validated.entityCodes,
      scenarioType: scenario.scenarioType,
    });

    // Apply scenario adjustments to base data
    // The scenario factors modify the financial outcomes
    const adjustedIS = { ...scenarioResult.incomeStatement };
    const adjustedBS = { ...scenarioResult.balanceSheet };
    const adjustedCF = { ...scenarioResult.cashFlow };

    // Apply growth factors
    adjustedIS.revenue *= scenario.revenueGrowthFactor;
    adjustedIS.cogs *= scenario.revenueGrowthFactor * 0.95; // COGS scales slightly less
    adjustedIS.opex *= scenario.opexGrowthFactor;
    adjustedIS.grossProfit = adjustedIS.revenue + adjustedIS.cogs;
    adjustedIS.ebitda = adjustedIS.grossProfit + adjustedIS.opex;
    adjustedIS.depreciation *= scenario.capexGrowthFactor;
    adjustedIS.ebit = adjustedIS.ebitda + adjustedIS.depreciation;
    adjustedIS.interestExpense *= (1 + (scenario.interestRate - 0.03) * 10); // Adjust for interest rate changes
    adjustedIS.ebt = adjustedIS.ebit + adjustedIS.interestExpense;
    adjustedIS.taxExpense = -(Math.abs(adjustedIS.ebt) * 0.25); // 25% effective tax rate
    adjustedIS.netIncome = adjustedIS.ebt + adjustedIS.taxExpense;

    adjustedCF.capex *= scenario.capexGrowthFactor;
    adjustedCF.investingCashFlow = adjustedCF.capex;
    adjustedCF.operatingCashFlow = adjustedIS.netIncome + adjustedCF.depreciation + adjustedCF.changesInWorkingCapital;
    adjustedCF.netChangeInCash = adjustedCF.operatingCashFlow + adjustedCF.investingCashFlow + adjustedCF.financingCashFlow;
    adjustedCF.endingCash = adjustedCF.beginningCash + adjustedCF.netChangeInCash;

    adjustedBS.cash = adjustedCF.endingCash;
    adjustedBS.ppe *= scenario.capexGrowthFactor;
    adjustedBS.nonCurrentAssets = adjustedBS.ppe + adjustedBS.intangibleAssets + adjustedBS.goodwill;
    adjustedBS.totalAssets = adjustedBS.currentAssets + adjustedBS.nonCurrentAssets;

    // Apply FX volatility effect on non-EUR entity exposures
    if (scenario.fxVolatility > 0.05) {
      const fxImpact = 1 + (scenario.fxVolatility - 0.05) * 0.5; // Simplified FX impact
      adjustedIS.revenue *= fxImpact;
    }

    // Recalculate with adjustments
    adjustedIS.grossProfit = adjustedIS.revenue + adjustedIS.cogs;
    adjustedIS.ebitda = adjustedIS.grossProfit + adjustedIS.opex;
    adjustedIS.ebit = adjustedIS.ebitda + adjustedIS.depreciation;

    // Calculate scenario KPIs
    const totalRevenue = adjustedIS.revenue;
    const totalEBITDA = adjustedIS.ebitda;
    const ebitdaMargin = totalRevenue > 0 ? (totalEBITDA / totalRevenue) * 100 : 0;
    const netIncome = adjustedIS.netIncome + adjustedIS.minorityInterest;
    const totalAssets = adjustedBS.totalAssets;
    const netDebt = adjustedBS.shortTermDebt + adjustedBS.longTermDebt - adjustedBS.cash;
    const totalEquity = adjustedBS.totalEquity;
    const leverage = totalEBITDA !== 0 ? netDebt / totalEBITDA : 0;
    const roe = totalEquity !== 0 ? (netIncome / totalEquity) * 100 : 0;
    const roce = (totalAssets - adjustedBS.currentLiabilities) !== 0
      ? (adjustedIS.ebit / (totalAssets - adjustedBS.currentLiabilities)) * 100
      : 0;

    const scenarioKPIs = {
      totalRevenue,
      totalEBITDA,
      ebitdaMargin: Math.round(ebitdaMargin * 10) / 10,
      netIncome,
      totalAssets,
      netDebt: Math.round(netDebt),
      leverage: Math.round(leverage * 100) / 100,
      roe: Math.round(roe * 10) / 10,
      roce: Math.round(roce * 10) / 10,
      liquidityRatio: adjustedBS.currentLiabilities !== 0
        ? Math.round((adjustedBS.currentAssets / adjustedBS.currentLiabilities) * 100) / 100
        : 0,
    };

    // Build comparison data
    const comparison = [
      {
        metric: 'Revenue',
        base: baseResult.kpis.totalRevenue,
        scenario: scenarioKPIs.totalRevenue,
        variance: scenarioKPIs.totalRevenue - baseResult.kpis.totalRevenue,
        variancePct: baseResult.kpis.totalRevenue > 0
          ? ((scenarioKPIs.totalRevenue - baseResult.kpis.totalRevenue) / baseResult.kpis.totalRevenue * 100)
          : 0,
      },
      {
        metric: 'EBITDA',
        base: baseResult.kpis.totalEBITDA,
        scenario: scenarioKPIs.totalEBITDA,
        variance: scenarioKPIs.totalEBITDA - baseResult.kpis.totalEBITDA,
        variancePct: baseResult.kpis.totalEBITDA > 0
          ? ((scenarioKPIs.totalEBITDA - baseResult.kpis.totalEBITDA) / baseResult.kpis.totalEBITDA * 100)
          : 0,
      },
      {
        metric: 'EBITDA Margin %',
        base: baseResult.kpis.ebitdaMargin,
        scenario: scenarioKPIs.ebitdaMargin,
        variance: scenarioKPIs.ebitdaMargin - baseResult.kpis.ebitdaMargin,
        variancePct: 0,
      },
      {
        metric: 'Net Income',
        base: baseResult.kpis.netIncome,
        scenario: scenarioKPIs.netIncome,
        variance: scenarioKPIs.netIncome - baseResult.kpis.netIncome,
        variancePct: baseResult.kpis.netIncome > 0
          ? ((scenarioKPIs.netIncome - baseResult.kpis.netIncome) / baseResult.kpis.netIncome * 100)
          : 0,
      },
      {
        metric: 'Leverage',
        base: baseResult.kpis.leverage,
        scenario: scenarioKPIs.leverage,
        variance: scenarioKPIs.leverage - baseResult.kpis.leverage,
        variancePct: 0,
      },
      {
        metric: 'ROE %',
        base: baseResult.kpis.roe,
        scenario: scenarioKPIs.roe,
        variance: scenarioKPIs.roe - baseResult.kpis.roe,
        variancePct: 0,
      },
    ];

    return NextResponse.json({
      scenario: {
        id: scenario.id,
        name: scenario.name,
        scenarioType: scenario.scenarioType,
        inflationRate: scenario.inflationRate,
        interestRate: scenario.interestRate,
        fxVolatility: scenario.fxVolatility,
        revenueGrowthFactor: scenario.revenueGrowthFactor,
        opexGrowthFactor: scenario.opexGrowthFactor,
        capexGrowthFactor: scenario.capexGrowthFactor,
      },
      baseResult: {
        period: baseResult.period,
        incomeStatement: baseResult.incomeStatement,
        kpis: baseResult.kpis,
      },
      scenarioResult: {
        incomeStatement: adjustedIS,
        balanceSheet: adjustedBS,
        cashFlow: adjustedCF,
        kpis: scenarioKPIs,
      },
      comparison,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error running scenario:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to run scenario' },
      { status: 500 }
    );
  }
}
