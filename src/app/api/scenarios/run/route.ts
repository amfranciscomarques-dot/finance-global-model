import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { runConsolidation } from '@/lib/consolidation-engine';
import {
  calculateKPIs,
  deriveBalanceSheet,
  deriveCashFlow,
  deriveIncomeStatement,
} from '@/lib/finance';
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

    // Project the scenario from the base consolidation by applying the
    // scenario's growth factors. We deliberately do NOT call runConsolidation a
    // second time with the scenario type: the engine only swaps actual→forecast
    // trial balances on scenarioType, so layering growth factors on top of an
    // already-forecasted base would double-count the assumptions. The base
    // (actuals) is the single anchor; the projection is pure arithmetic on top.
    const baseIS = baseResult.incomeStatement;
    const baseBS = baseResult.balanceSheet;
    const baseCF = baseResult.cashFlow;

    // Effective tax rate implied by the base consolidation. This ties scenario
    // tax to the group's actual burden instead of a hard-coded rate. (Full
    // per-jurisdiction modelling via src/lib/tax would need per-entity, currency-
    // aware EBT, which the consolidated what-if doesn't currently carry — the tax
    // module is not yet wired into the engine.)
    const baseEffectiveTaxRate = baseIS.ebt !== 0 ? baseIS.taxExpense / baseIS.ebt : 0;

    // --- Scenario income statement -------------------------------------------
    const adjustedIS = { ...baseIS };
    adjustedIS.revenue = baseIS.revenue * scenario.revenueGrowthFactor;
    adjustedIS.cogs = baseIS.cogs * scenario.revenueGrowthFactor;   // COGS scales with volume
    adjustedIS.opex = baseIS.opex * scenario.opexGrowthFactor;
    adjustedIS.depreciation = baseIS.depreciation * scenario.capexGrowthFactor;
    // Interest-rate and FX sensitivity are not modelled at the consolidated level
    // (they need per-instrument debt schedules and per-entity FX exposure, not a
    // flat multiplier on a blended number). Interest is carried from the base.
    adjustedIS.interestExpense = baseIS.interestExpense;
    deriveIncomeStatement(adjustedIS);                              // grossProfit→ebt chain
    adjustedIS.taxExpense = adjustedIS.ebt * baseEffectiveTaxRate;  // preserve effective rate (signed)
    adjustedIS.netIncome = adjustedIS.ebt + adjustedIS.taxExpense;
    adjustedIS.minorityInterest = baseIS.minorityInterest;         // ownership structure unchanged

    // --- Scenario balance sheet ----------------------------------------------
    // Simplified, balanced roll-forward: the change in net income flows into
    // cash + retained earnings, and incremental capex moves cash → PPE. Both
    // legs keep assets = liabilities + equity (the old code overwrote cash and
    // broke the balance check).
    const adjustedBS = { ...baseBS };
    const deltaNI = (adjustedIS.netIncome + adjustedIS.minorityInterest)
      - (baseIS.netIncome + baseIS.minorityInterest);
    const deltaCapex = baseCF.capex * (scenario.capexGrowthFactor - 1); // capex stored negative
    adjustedBS.ppe = baseBS.ppe - deltaCapex;                      // extra spend increases PPE
    adjustedBS.cash = baseBS.cash + deltaNI + deltaCapex;          // earnings in, extra capex out
    deriveBalanceSheet(adjustedBS, adjustedIS);                                // recompute subtotals + balanceCheck

    // --- Scenario cash flow ---------------------------------------------------
    const adjustedCF = { ...baseCF };
    adjustedCF.capex = baseCF.capex * scenario.capexGrowthFactor;
    deriveCashFlow(adjustedCF, adjustedIS);                        // links NI/dep, rolls up subtotals

    // Headline KPIs through the same calculator the engine uses.
    const scenarioKPIs = calculateKPIs(adjustedIS, adjustedBS, adjustedCF);

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
        { error: 'Validation failed', details: error.issues },
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
