import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  addEntry,
  createEmptyBS,
  createEmptyCF,
  createEmptyIS,
  deriveBalanceSheet,
  deriveCashFlow,
  deriveDefaultAssumptions,
  deriveIncomeStatement,
  projectPeriod,
  type FinancialStatements,
  type ProjectionAssumptions,
} from '@/lib/finance';
import type { CashFlowForecast, ForecastPeriod, ForecastProjectionYear } from '@/lib/types';

// ============================================================
// FORECAST ASSUMPTIONS (UI inputs — percentages and days)
// ============================================================
interface ForecastAssumptions {
  revenueGrowthRate: number;    // % annual
  capexGrowthRate: number;      // % annual, flexes capex vs. the opening run-rate
  workingCapitalDays: number;   // DSO override; 0 ⇒ hold the opening ratio
  debtRepaymentSchedule: number;// extra MONTHLY debt repayment (→ annual net debt change)
}

const DEFAULT_ASSUMPTIONS: ForecastAssumptions = {
  revenueGrowthRate: 5.0,
  capexGrowthRate: 3.0,
  workingCapitalDays: 0, // 0 = use the opening DSO (no working-capital step change)
  debtRepaymentSchedule: 0,
};

// Months charted forward (= forecast year + 1) and full annual projection depth.
const FORECAST_HORIZON = 12;
const PROJECTION_YEARS = 3;

// ============================================================
// REAL DATA — aggregate the year's actual trial balances into one derived,
// balanced statement set (the opening state for the projection kernel).
//
// The model stores annual actuals as a single year-end snapshot (no monthly
// history), so we sum every actual trial-balance entry for the year and run the
// finance-domain derivation. Pure read — no ConsolidationRun row is written.
// ============================================================
async function buildRealAnnualStatements(
  year: number,
): Promise<{ statements: FinancialStatements; yearEndCash: number } | null> {
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year, 11, 31);

  const entries = await db.trialBalance.findMany({
    where: { period: { gte: startDate, lte: endDate }, periodType: 'actual' },
    select: { groupCOACode: true, amountEUR: true },
  });

  if (entries.length === 0) return null;

  const stmts: FinancialStatements = {
    incomeStatement: createEmptyIS(),
    balanceSheet: createEmptyBS(),
    cashFlow: createEmptyCF(),
  };
  for (const e of entries) addEntry(stmts, e.groupCOACode, e.amountEUR);

  deriveIncomeStatement(stmts.incomeStatement);
  deriveBalanceSheet(stmts.balanceSheet, stmts.incomeStatement);
  deriveCashFlow(stmts.cashFlow, stmts.incomeStatement);

  return { statements: stmts, yearEndCash: stmts.balanceSheet.cash };
}

// Map the UI's percentage/day assumptions onto the kernel's driver set, anchored
// on the opening period's structural ratios (margin, depreciation/interest/tax
// rates, payout). Only the levers the UI exposes are flexed.
function kernelAssumptions(
  opening: FinancialStatements,
  ui: ForecastAssumptions,
): ProjectionAssumptions {
  const base = deriveDefaultAssumptions(opening);
  return {
    ...base,
    revenueGrowthRate: ui.revenueGrowthRate / 100,
    capex: base.capex * (1 + ui.capexGrowthRate / 100),
    // Hold the opening DSO unless the user pins a target (avoids a one-off WC
    // step). DIO/DPO continue to scale with revenue via the opening ratios.
    receivableDays: ui.workingCapitalDays > 0 ? ui.workingCapitalDays : base.receivableDays,
    // A monthly extra repayment becomes an annual reduction in net debt.
    netDebtChange: -(ui.debtRepaymentSchedule * 12),
  };
}

// Project one fiscal year and report its net change in cash — used for the
// optimistic/base/pessimistic comparison without fabricating ±% on a total.
function projectedNetChange(opening: FinancialStatements, ui: ForecastAssumptions): number {
  return projectPeriod(opening, kernelAssumptions(opening, ui)).cashFlow.netChangeInCash;
}

// ============================================================
// FORECAST CONSTRUCTION
//   Anchor : the real year as ONE actual period (true annual figures).
//   Project: chain the pure kernel forward PROJECTION_YEARS (driver-based, full
//            balanced IS/BS/CF), then spread year+1's cash flow across 12 months
//            for the chart. Year-end cumulative cash ties to the projected
//            balance sheet's cash by construction.
// ============================================================
function buildForecast(
  opening: FinancialStatements,
  yearEndCash: number,
  year: number,
  assumptions: ForecastAssumptions,
): CashFlowForecast {
  // --- Driver-based annual projection (chained kernel) ---
  const projYears: ForecastProjectionYear[] = [];
  let state = opening;
  let firstDrivers = kernelAssumptions(opening, assumptions);
  for (let i = 0; i < PROJECTION_YEARS; i++) {
    const a = kernelAssumptions(state, assumptions);
    if (i === 0) firstDrivers = a;
    state = projectPeriod(state, a);
    projYears.push({
      year: year + 1 + i,
      incomeStatement: state.incomeStatement,
      balanceSheet: state.balanceSheet,
      cashFlow: state.cashFlow,
    });
  }
  const y1 = projYears[0].cashFlow;

  // Monthly baselines: spread year+1's driver-based cash flow evenly. The growth
  // already lives in the annual kernel step, so the within-year line is flat and
  // the month-12 cumulative cash equals the projected closing balance-sheet cash.
  const monthlyOp = y1.operatingCashFlow / 12;
  const monthlyInv = y1.investingCashFlow / 12;
  const monthlyFin = y1.financingCashFlow / 12;

  const periods: ForecastPeriod[] = [];

  // --- Real annual actual anchor (no uncertainty band on history) ---
  const annualOp = opening.cashFlow.operatingCashFlow;
  const annualInv = opening.cashFlow.investingCashFlow;
  const annualFin = opening.cashFlow.financingCashFlow;
  const actualNet = annualOp + annualInv + annualFin;
  periods.push({
    month: `${year} (FY)`,
    isForecast: false,
    operatingCF: Math.round(annualOp),
    investingCF: Math.round(annualInv),
    financingCF: Math.round(annualFin),
    netChange: Math.round(actualNet),
    cumulativeCash: Math.round(yearEndCash),
    operatingCFHigh: Math.round(annualOp),
    operatingCFLow: Math.round(annualOp),
    investingCFHigh: Math.round(annualInv),
    investingCFLow: Math.round(annualInv),
    financingCFHigh: Math.round(annualFin),
    financingCFLow: Math.round(annualFin),
    netChangeHigh: Math.round(actualNet),
    netChangeLow: Math.round(actualNet),
    cumulativeCashHigh: Math.round(yearEndCash),
    cumulativeCashLow: Math.round(yearEndCash),
  });

  // --- Monthly forecast for the following year ---
  let runningCash = yearEndCash;
  let runningCashHigh = yearEndCash;
  let runningCashLow = yearEndCash;

  for (let i = 0; i < FORECAST_HORIZON; i++) {
    const m = i + 1;
    const monthLabel = `${year + 1}-${String(m).padStart(2, '0')}`;

    const op = monthlyOp;
    const inv = monthlyInv;
    const fin = monthlyFin;
    const net = op + inv + fin;
    runningCash += net;

    // Uncertainty fan widens with the forecast horizon.
    const opHigh = op * (1 + 0.05 * m);
    const opLow = op * (1 - 0.05 * m);
    const invHigh = inv * (1 + 0.08 * m);
    const invLow = inv * (1 - 0.08 * m);
    const finHigh = fin * (1 + 0.03 * m);
    const finLow = fin * (1 - 0.03 * m);
    const netHigh = opHigh + invHigh + finHigh;
    const netLow = opLow + invLow + finLow;
    runningCashHigh += netHigh;
    runningCashLow += netLow;

    periods.push({
      month: monthLabel,
      isForecast: true,
      operatingCF: Math.round(op),
      investingCF: Math.round(inv),
      financingCF: Math.round(fin),
      netChange: Math.round(net),
      cumulativeCash: Math.round(runningCash),
      operatingCFHigh: Math.round(opHigh),
      operatingCFLow: Math.round(opLow),
      investingCFHigh: Math.round(invHigh),
      investingCFLow: Math.round(invLow),
      financingCFHigh: Math.round(finHigh),
      financingCFLow: Math.round(finLow),
      netChangeHigh: Math.round(netHigh),
      netChangeLow: Math.round(netLow),
      cumulativeCashHigh: Math.round(runningCashHigh),
      cumulativeCashLow: Math.round(runningCashLow),
    });
  }

  // --- Key metrics, computed from the forecast tail ---
  const forecastPeriods = periods.filter((p) => p.isForecast);
  const totalForecastOpCF = forecastPeriods.reduce((s, p) => s + p.operatingCF, 0);
  const totalForecastInvCF = forecastPeriods.reduce((s, p) => s + p.investingCF, 0);

  // Cash runway: months until pessimistic cumulative cash turns negative.
  let runwayMonths = 0;
  for (const p of forecastPeriods) {
    if (p.cumulativeCashLow < 0) break;
    runwayMonths++;
  }

  // Min cash position across the forecast horizon (base case).
  let minCash = Infinity;
  let minCashMonth = '';
  for (const p of forecastPeriods) {
    if (p.cumulativeCash < minCash) {
      minCash = p.cumulativeCash;
      minCashMonth = p.month;
    }
  }

  // Breakeven: first forecast month with a positive net change.
  let breakevenMonth = '';
  for (const p of forecastPeriods) {
    if (p.netChange > 0) {
      breakevenMonth = p.month;
      break;
    }
  }

  const sixMonthCash = forecastPeriods[Math.min(5, forecastPeriods.length - 1)]?.cumulativeCash ?? yearEndCash;

  // Scenario comparison: re-run the kernel at ±5pp revenue growth (real
  // projections, not a flat ±% on the base total).
  const baseNet = projectedNetChange(opening, assumptions);
  const optimisticNet = projectedNetChange(opening, { ...assumptions, revenueGrowthRate: assumptions.revenueGrowthRate + 5 });
  const pessimisticNet = projectedNetChange(opening, { ...assumptions, revenueGrowthRate: assumptions.revenueGrowthRate - 5 });

  return {
    periods,
    assumptions: {
      revenueGrowthRate: assumptions.revenueGrowthRate,
      capexGrowthRate: assumptions.capexGrowthRate,
      // Echo the EFFECTIVE DSO actually used (resolved from the opening ratio
      // when the UI leaves it on auto), so the displayed figure is meaningful.
      workingCapitalDays: Math.round(firstDrivers.receivableDays),
      debtRepaymentSchedule: assumptions.debtRepaymentSchedule,
    },
    keyMetrics: {
      currentCashPosition: Math.round(yearEndCash),
      projected6MCash: Math.round(sixMonthCash),
      operatingCFForecast: totalForecastOpCF,
      freeCashFlowForecast: totalForecastOpCF + totalForecastInvCF,
      cashRunwayMonths: runwayMonths,
      breakevenMonth,
      minCashPosition: Math.round(minCash),
      minCashMonth,
    },
    scenarioComparison: {
      optimistic: { totalNetChange: Math.round(optimisticNet), label: 'Optimistic (+5pp)' },
      base: { totalNetChange: Math.round(baseNet), label: 'Base Case' },
      pessimistic: { totalNetChange: Math.round(pessimisticNet), label: 'Pessimistic (-5pp)' },
    },
    projection: {
      drivers: {
        revenueGrowthRate: firstDrivers.revenueGrowthRate,
        grossMarginRate: firstDrivers.grossMarginRate,
        receivableDays: firstDrivers.receivableDays,
        capex: firstDrivers.capex,
        netDebtChange: firstDrivers.netDebtChange,
      },
      years: projYears,
    },
  };
}

function parseAssumptions(body: Record<string, unknown>): ForecastAssumptions {
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && isFinite(v) ? v : fallback);
  return {
    revenueGrowthRate: num(body.revenueGrowthRate, DEFAULT_ASSUMPTIONS.revenueGrowthRate),
    capexGrowthRate: num(body.capexGrowthRate, DEFAULT_ASSUMPTIONS.capexGrowthRate),
    workingCapitalDays: num(body.workingCapitalDays, DEFAULT_ASSUMPTIONS.workingCapitalDays),
    debtRepaymentSchedule: num(body.debtRepaymentSchedule, DEFAULT_ASSUMPTIONS.debtRepaymentSchedule),
  };
}

// ============================================================
// GET /api/forecast?period=YYYY-MM
// ============================================================
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '2024-12';
    const year = parseInt(period.substring(0, 4), 10) || new Date().getFullYear();

    const real = await buildRealAnnualStatements(year);
    if (!real) {
      return NextResponse.json(
        { error: `No actual trial-balance data found for ${year}` },
        { status: 404 },
      );
    }

    return NextResponse.json(
      buildForecast(real.statements, real.yearEndCash, year, DEFAULT_ASSUMPTIONS),
    );
  } catch (error) {
    console.error('Error building forecast:', error);
    return NextResponse.json({ error: 'Failed to build forecast' }, { status: 500 });
  }
}

// ============================================================
// POST /api/forecast - recompute the forecast with custom assumptions
// ============================================================
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const period = typeof body.period === 'string' ? body.period : '2024-12';
    const year = parseInt(period.substring(0, 4), 10) || new Date().getFullYear();
    const assumptions = parseAssumptions(body);

    const real = await buildRealAnnualStatements(year);
    if (!real) {
      return NextResponse.json(
        { error: `No actual trial-balance data found for ${year}` },
        { status: 404 },
      );
    }

    const data = buildForecast(real.statements, real.yearEndCash, year, assumptions);
    return NextResponse.json({
      success: true,
      message: 'Forecast recalculated from real year-end cash flow',
      data,
    });
  } catch (error) {
    console.error('Error recalculating forecast:', error);
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}
