import { describe, expect, it } from 'vitest';
import {
  monthLabel,
  previousPeriod,
  buildWaterfall,
  buildWaterfallChartData,
  buildCashFlowBridge,
  computeCardDeltas,
  computeHealthIndicators,
  computeOverallScore,
  entityHealthScore,
  buildMarketSnapshot,
  timeAgo,
} from './helpers';
import type { KPIs, IncomeStatement, CashFlowStatement, EntityBreakdown, ExchangeRateInfo } from '@/lib/types';

const IS: IncomeStatement = {
  revenue: 100, cogs: -40, grossProfit: 60, opex: -20, ebitda: 40,
  depreciation: -10, ebit: 30, interestExpense: -5, ebt: 25, taxExpense: -5,
  netIncome: 20, minorityInterest: 0,
};

const KPI: KPIs = {
  totalRevenue: 110, totalEBITDA: 40, ebitdaMargin: 28, netIncome: 20,
  totalAssets: 200, netDebt: 30, leverage: 1.5, roe: 18, roce: 14, liquidityRatio: 1.7,
};

describe('period helpers', () => {
  it('monthLabel maps YYYY-MM to a short month, falling back to the input', () => {
    expect(monthLabel('2024-03')).toBe('Mar');
    expect(monthLabel('2024-12')).toBe('Dec');
    expect(monthLabel('garbage')).toBe('garbage');
  });

  it('previousPeriod steps back a month and rolls the year', () => {
    expect(previousPeriod('2024-12')).toBe('2024-11');
    expect(previousPeriod('2024-01')).toBe('2023-12');
  });
});

describe('buildWaterfall / buildWaterfallChartData', () => {
  it('passes engine-signed values straight through with correct row types', () => {
    const rows = buildWaterfall(IS);
    expect(rows[0]).toEqual({ name: 'Revenue', value: 100, type: 'positive' });
    expect(rows[1]).toEqual({ name: 'COGS', value: -40, type: 'negative' });
    expect(rows.at(-1)).toEqual({ name: 'Net Income', value: 20, type: 'total' });
  });

  it('stacks negative steps on a running base and totals reset to zero base', () => {
    const data = buildWaterfallChartData(buildWaterfall(IS));
    const byName = Object.fromEntries(data.map((d) => [d.name, d]));
    expect(byName['Revenue']).toMatchObject({ base: 0, barValue: 100 });
    expect(byName['COGS']).toMatchObject({ base: 60, barValue: 40, rawValue: -40 });
    expect(byName['OPEX']).toMatchObject({ base: 40, barValue: 20 });
    expect(byName['Net Income']).toMatchObject({ base: 0, barValue: 20 });
  });
});

describe('buildCashFlowBridge', () => {
  it('projects the three flows plus net change', () => {
    const cf = { operatingCashFlow: 30, investingCashFlow: -10, financingCashFlow: -5, netChangeInCash: 15 } as CashFlowStatement;
    const bridge = buildCashFlowBridge(cf);
    expect(bridge.map((b) => [b.label, b.value])).toEqual([
      ['Operating CF', 30], ['Investing CF', -10], ['Financing CF', -5], ['Net Change', 15],
    ]);
  });
});

describe('computeCardDeltas', () => {
  it('returns an empty map when there is no prior-period data (badges omitted, not faked)', () => {
    expect(computeCardDeltas(KPI, null)).toEqual({});
    expect(computeCardDeltas(KPI, { ...KPI, totalRevenue: 0 })).toEqual({});
  });

  it('computes signed deltas and inverts the leverage direction (lower is better)', () => {
    const prev: KPIs = { ...KPI, totalRevenue: 100, leverage: 3 };
    const d = computeCardDeltas(KPI, prev);
    expect(d['Total Revenue']).toEqual({ trend: '+10.0%', trendUp: true });
    // leverage fell 3 → 1.5, so trend is negative but trendUp is true (improvement)
    expect(d['Net Debt / EBITDA'].trendUp).toBe(true);
    expect(d['Net Debt / EBITDA'].trend).toBe('-1.50x');
  });
});

describe('health scorecard', () => {
  it('classifies indicators and produces a bounded overall score', () => {
    const inds = computeHealthIndicators(KPI, 6, 30, 5); // 6% growth, EBIT 30, interest 5 → coverage 6x
    const margin = inds.find((i) => i.name === 'EBITDA Margin')!;
    expect(margin.trafficLight).toBe('green'); // 28% > 25%
    const coverage = inds.find((i) => i.name === 'Interest Coverage')!;
    expect(coverage.trafficLight).toBe('green'); // 6x > 5x
    const score = computeOverallScore(inds);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('uses a sentinel coverage when interest expense is zero (no divide-by-zero)', () => {
    const inds = computeHealthIndicators(KPI, 6, 30, 0);
    const coverage = inds.find((i) => i.name === 'Interest Coverage')!;
    expect(coverage.value).toBe(25);
    expect(coverage.trafficLight).toBe('green');
  });

  it('keeps every indicator score finite at zero revenue growth (earliest period, no prior)', () => {
    // Regression: growth of exactly 0 used to compute `0 / 0 = NaN`, blanking the
    // overall gauge to "NaN OUT OF 100". The score must stay a finite number.
    const inds = computeHealthIndicators(KPI, 0, 30, 5);
    const growth = inds.find((i) => i.name === 'Revenue Growth')!;
    expect(Number.isFinite(growth.score)).toBe(true);
    expect(growth.score).toBeCloseTo(30); // boundary of the amber band
    expect(growth.trafficLight).toBe('amber'); // 0% is the floor of amber, not red
    const score = computeOverallScore(inds);
    expect(Number.isFinite(score)).toBe(true);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('scores negative revenue growth as a finite, clamped red value', () => {
    const inds = computeHealthIndicators({ ...KPI }, -3, 30, 5);
    const growth = inds.find((i) => i.name === 'Revenue Growth')!;
    expect(growth.trafficLight).toBe('red');
    expect(growth.displayValue).toBe('-3.0%'); // signed, no stray leading '+'
    expect(Number.isFinite(growth.score)).toBe(true);
    expect(growth.score).toBeGreaterThanOrEqual(0); // -3% → 12, still ≥ 0
    // far below the band stays clamped at 0, never negative or NaN
    const crash = computeHealthIndicators({ ...KPI }, -50, 30, 5).find((i) => i.name === 'Revenue Growth')!;
    expect(crash.score).toBe(0);
    expect(Number.isFinite(computeOverallScore([crash]))).toBe(true);
  });
});

describe('entityHealthScore', () => {
  const mk = (over: Partial<IncomeStatement>, bs: Partial<EntityBreakdown['balanceSheet']>): EntityBreakdown => ({
    entityCode: 'X', legalName: 'X', localCurrency: 'EUR', ownershipPercentage: 1, consolidationMethod: 'full',
    incomeStatement: { ...IS, ...over },
    balanceSheet: { shortTermDebt: 0, longTermDebt: 0, cash: 0, ...bs } as EntityBreakdown['balanceSheet'],
    cashFlow: {} as CashFlowStatement,
  });

  it('rewards strong margin and low leverage (capped at 100)', () => {
    const s = entityHealthScore(mk({ revenue: 100, ebitda: 35 }, { longTermDebt: 0, cash: 0 }));
    expect(s).toBe(100); // 35% margin → 70pts, 0x leverage → 30pts
  });

  it('penalises high leverage and thin margin', () => {
    const s = entityHealthScore(mk({ revenue: 100, ebitda: 10 }, { longTermDebt: 30, cash: 0 }));
    expect(s).toBe(20); // 10% margin → 20pts, 3x leverage → 0pts
  });
});

describe('buildMarketSnapshot', () => {
  const rate = (currency: string, rateType: string, r: number): ExchangeRateInfo => ({
    id: `${currency}-${rateType}`, currency, rateType, rate: r, rateDate: '2024-12-31', source: 'ECB',
  });

  it('builds EUR/X tiles, orders majors first, excludes EUR, and computes YTD change', () => {
    const snap = buildMarketSnapshot([
      rate('GBP', 'closing', 0.85),
      rate('USD', 'closing', 1.08),
      rate('USD', 'historical', 1.10),
      rate('EUR', 'closing', 1),
    ]);
    expect(snap.map((s) => s.pair)).toEqual(['EUR/USD', 'EUR/GBP']); // USD preferred before GBP, EUR excluded
    const usd = snap[0];
    expect(usd.up).toBe(false);
    expect(usd.change).toBe('-1.82% YTD'); // (1.08-1.10)/1.10
    const gbp = snap[1];
    expect(gbp.change).toBe(''); // no historical → no change shown
  });
});

describe('timeAgo', () => {
  it('formats recent timestamps and rejects invalid input', () => {
    expect(timeAgo(new Date().toISOString())).toBe('just now');
    expect(timeAgo(new Date(Date.now() - 5 * 60 * 1000).toISOString())).toBe('5 min ago');
    expect(timeAgo(new Date(Date.now() - 2 * 3600 * 1000).toISOString())).toBe('2 hours ago');
    expect(timeAgo('not-a-date')).toBe('');
  });
});
