import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  addEntry,
  createEmptyBS,
  createEmptyCF,
  createEmptyIS,
  deriveBalanceSheet,
  deriveCashFlow,
  deriveIncomeStatement,
  type CashFlowData,
} from '@/lib/finance';
import type { CashFlowForecast, ForecastPeriod } from '@/lib/types';

// ============================================================
// FORECAST ASSUMPTIONS
// ============================================================
interface ForecastAssumptions {
  revenueGrowthRate: number;    // % annual, drives operating CF
  capexGrowthRate: number;      // % annual, drives investing CF
  workingCapitalDays: number;   // displayed assumption (informational)
  debtRepaymentSchedule: number;// extra monthly debt repayment on top of run-rate
}

const DEFAULT_ASSUMPTIONS: ForecastAssumptions = {
  revenueGrowthRate: 5.0,
  capexGrowthRate: 3.0,
  workingCapitalDays: 45,
  debtRepaymentSchedule: 0,
};

// How many months forward we project from the real year-end run-rate.
const FORECAST_HORIZON = 12;

// ============================================================
// REAL DATA — derive the consolidated annual cash flow from trial balances.
//
// The model stores annual actuals as a single year-end snapshot (no monthly
// history), so we aggregate every actual trial-balance entry for the year into
// one consolidated statement set and run the finance-domain derivation. This
// reuses deriveCashFlow() (indirect method) instead of fabricating monthly data.
// Pure read — no ConsolidationRun audit record is written for a forecast view.
// ============================================================
async function buildRealAnnualCashFlow(
  year: number,
): Promise<{ cashFlow: CashFlowData; yearEndCash: number } | null> {
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year, 11, 31);

  const entries = await db.trialBalance.findMany({
    where: { period: { gte: startDate, lte: endDate }, periodType: 'actual' },
    select: { groupCOACode: true, amountEUR: true },
  });

  if (entries.length === 0) return null;

  const stmts = {
    incomeStatement: createEmptyIS(),
    balanceSheet: createEmptyBS(),
    cashFlow: createEmptyCF(),
  };
  for (const e of entries) addEntry(stmts, e.groupCOACode, e.amountEUR);

  deriveIncomeStatement(stmts.incomeStatement);
  deriveBalanceSheet(stmts.balanceSheet, stmts.incomeStatement);
  deriveCashFlow(stmts.cashFlow, stmts.incomeStatement);

  return { cashFlow: stmts.cashFlow, yearEndCash: stmts.balanceSheet.cash };
}

// ============================================================
// FORECAST CONSTRUCTION
// Anchor: the real year as ONE actual period (true annual figures).
// Projection: monthly run-rate (annual / 12) grown by the assumptions.
// ============================================================
function buildForecast(
  annual: CashFlowData,
  yearEndCash: number,
  year: number,
  assumptions: ForecastAssumptions,
): CashFlowForecast {
  const { revenueGrowthRate, capexGrowthRate, debtRepaymentSchedule } = assumptions;

  const annualOp = annual.operatingCashFlow;
  const annualInv = annual.investingCashFlow;
  const annualFin = annual.financingCashFlow;

  // Monthly run-rate baselines from the real annual cash flow.
  const monthlyOp = annualOp / 12;
  const monthlyInv = annualInv / 12;
  const monthlyFin = annualFin / 12;

  const periods: ForecastPeriod[] = [];

  // --- Real annual actual anchor (no uncertainty band on history) ---
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

  // --- Monthly run-rate forecast for the following year ---
  let runningCash = yearEndCash;
  let runningCashHigh = yearEndCash;
  let runningCashLow = yearEndCash;

  for (let i = 0; i < FORECAST_HORIZON; i++) {
    const m = i + 1;
    const monthLabel = `${year + 1}-${String(m).padStart(2, '0')}`;

    // Compound the annual growth rate pro-rata across the months elapsed.
    const opGrowth = Math.pow(1 + revenueGrowthRate / 100, m / 12);
    const capexGrowth = Math.pow(1 + capexGrowthRate / 100, m / 12);

    const op = monthlyOp * opGrowth;
    const inv = monthlyInv * capexGrowth;
    const fin = monthlyFin - debtRepaymentSchedule; // planned extra repayment
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
  const baseTotal = forecastPeriods.reduce((s, p) => s + p.netChange, 0);

  return {
    periods,
    assumptions: {
      revenueGrowthRate: assumptions.revenueGrowthRate,
      capexGrowthRate: assumptions.capexGrowthRate,
      workingCapitalDays: assumptions.workingCapitalDays,
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
      optimistic: { totalNetChange: Math.round(baseTotal * 1.25), label: 'Optimistic (+25%)' },
      base: { totalNetChange: Math.round(baseTotal), label: 'Base Case' },
      pessimistic: { totalNetChange: Math.round(baseTotal * 0.75), label: 'Pessimistic (-25%)' },
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

    const real = await buildRealAnnualCashFlow(year);
    if (!real) {
      return NextResponse.json(
        { error: `No actual trial-balance data found for ${year}` },
        { status: 404 },
      );
    }

    return NextResponse.json(
      buildForecast(real.cashFlow, real.yearEndCash, year, DEFAULT_ASSUMPTIONS),
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

    const real = await buildRealAnnualCashFlow(year);
    if (!real) {
      return NextResponse.json(
        { error: `No actual trial-balance data found for ${year}` },
        { status: 404 },
      );
    }

    const data = buildForecast(real.cashFlow, real.yearEndCash, year, assumptions);
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
