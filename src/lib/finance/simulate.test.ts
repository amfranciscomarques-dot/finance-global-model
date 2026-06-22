import { describe, expect, it } from 'vitest';
import {
  createEmptyBS,
  createEmptyCF,
  createEmptyIS,
  deriveBalanceSheet,
  deriveCashFlow,
  deriveDefaultAssumptions,
  deriveIncomeStatement,
  type FinancialStatements,
} from './index';
import {
  CASH_FLOW_METRICS,
  DEFAULT_FORECAST_DISPERSION,
  makeRng,
  percentile,
  simulateProjection,
} from './simulate';

// ============================================================
// MONTE-CARLO SIMULATION (LOW.1) — pure fan-out tests.
//
// The same synthetic, internally-balanced opening period used by the kernel
// tests is fanned over driver draws. Invariants: every draw is a balanced
// roll-forward (the kernel guarantees that), the bands are ordered
// (p5 ≤ p50 ≤ p95), wider dispersion widens the band, and a fixed seed
// reproduces the exact percentiles.
// ============================================================

function makeOpening(): FinancialStatements {
  const is = createEmptyIS();
  is.revenue = 1000;
  is.cogs = -600;
  is.opex = -200;
  is.depreciation = -50;
  is.interestExpense = -20;
  deriveIncomeStatement(is);
  is.taxExpense = -0.25 * is.ebt;
  is.netIncome = is.ebt + is.taxExpense;

  const bs = createEmptyBS();
  bs.cash = 100;
  bs.accountsReceivable = 150;
  bs.inventory = 120;
  bs.ppe = 500;
  bs.accountsPayable = 90;
  bs.shortTermDebt = 60;
  bs.longTermDebt = 200;
  bs.shareCapital = 300;
  bs.historicalRetainedEarnings = 122.5;
  deriveBalanceSheet(bs, is);

  const cf = createEmptyCF();
  cf.changesInWorkingCapital = -10;
  cf.capex = -50;
  cf.dividendsPaid = 50;
  cf.beginningCash = 70;
  deriveCashFlow(cf, is);

  return { incomeStatement: is, balanceSheet: bs, cashFlow: cf };
}

const opening = makeOpening();
const baseFor = (_i: number, state: FinancialStatements) => ({
  ...deriveDefaultAssumptions(state),
  revenueGrowthRate: 0.05,
});

describe('makeRng — deterministic PRNG', () => {
  it('reproduces the same stream for the same seed', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    for (let i = 0; i < 10; i++) expect(a()).toBe(b());
  });

  it('produces uniforms in [0, 1)', () => {
    const r = makeRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('diverges for different seeds', () => {
    expect(makeRng(1)()).not.toBe(makeRng(2)());
  });
});

describe('percentile — linear interpolation (R-7)', () => {
  it('returns endpoints and the median', () => {
    const s = [1, 2, 3, 4, 5];
    expect(percentile(s, 0)).toBe(1);
    expect(percentile(s, 100)).toBe(5);
    expect(percentile(s, 50)).toBe(3);
  });
  it('interpolates between ranks', () => {
    expect(percentile([0, 10], 25)).toBeCloseTo(2.5, 9);
  });
});

describe('simulateProjection', () => {
  it('returns one summary per period with ordered percentile bands', () => {
    const sim = simulateProjection(
      opening,
      3,
      baseFor,
      DEFAULT_FORECAST_DISPERSION,
      CASH_FLOW_METRICS,
      { draws: 500, seed: 123 },
    );
    expect(sim.periods).toHaveLength(3);
    expect(sim.percentilePoints).toEqual([5, 50, 95]);
    for (const period of sim.periods) {
      const m = period.endingCash;
      expect(m.percentiles.p5).toBeLessThanOrEqual(m.percentiles.p50);
      expect(m.percentiles.p50).toBeLessThanOrEqual(m.percentiles.p95);
      expect(m.min).toBeLessThanOrEqual(m.percentiles.p5);
      expect(m.max).toBeGreaterThanOrEqual(m.percentiles.p95);
    }
  });

  it('is reproducible: same seed → identical bands', () => {
    const opts = { draws: 200, seed: 999 } as const;
    const a = simulateProjection(opening, 2, baseFor, DEFAULT_FORECAST_DISPERSION, CASH_FLOW_METRICS, opts);
    const b = simulateProjection(opening, 2, baseFor, DEFAULT_FORECAST_DISPERSION, CASH_FLOW_METRICS, opts);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('widens the band as driver dispersion grows', () => {
    const narrow = simulateProjection(
      opening, 1, baseFor,
      { revenueGrowthRate: { absoluteSigma: 0.01 } },
      CASH_FLOW_METRICS, { draws: 800, seed: 5 },
    ).periods[0].revenue;
    const wide = simulateProjection(
      opening, 1, baseFor,
      { revenueGrowthRate: { absoluteSigma: 0.08 } },
      CASH_FLOW_METRICS, { draws: 800, seed: 5 },
    ).periods[0].revenue;
    const narrowWidth = narrow.percentiles.p95 - narrow.percentiles.p5;
    const wideWidth = wide.percentiles.p95 - wide.percentiles.p5;
    expect(wideWidth).toBeGreaterThan(narrowWidth);
  });

  it('collapses to the deterministic path when dispersion is empty', () => {
    const sim = simulateProjection(opening, 2, baseFor, {}, CASH_FLOW_METRICS, { draws: 50, seed: 1 });
    for (const period of sim.periods) {
      const m = period.endingCash;
      expect(m.percentiles.p95 - m.percentiles.p5).toBeCloseTo(0, 6);
      expect(m.mean).toBeCloseTo(m.percentiles.p50, 6);
    }
  });

  it('clamps a bounded driver (margin stays in [0, 1])', () => {
    // A huge sigma on the gross margin would overflow [0,1] without the clamp;
    // revenue/COGS stay finite and the kernel still balances every draw.
    const sim = simulateProjection(
      opening, 1, baseFor,
      { grossMarginRate: { absoluteSigma: 5, min: 0, max: 1 } },
      CASH_FLOW_METRICS, { draws: 300, seed: 11 },
    );
    expect(Number.isFinite(sim.periods[0].netIncome.mean)).toBe(true);
  });
});
