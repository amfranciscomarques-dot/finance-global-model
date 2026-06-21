import { describe, expect, it } from 'vitest';
import {
  normalizeOwnership,
  toEntityCSV,
  buildComparisonMetrics,
  formatMetricValue,
  computeMetricDelta,
  countMetricLeads,
  buildEntityBarChartData,
  buildOwnershipWaterfall,
  buildOwnershipData,
  buildFinancialRatios,
  type ComparisonMetric,
} from './helpers';
import type { Entity, IncomeStatement, BalanceSheet } from '@/lib/types';

const IS: IncomeStatement = {
  revenue: 15000, cogs: -9000, grossProfit: 6000, opex: -2000, ebitda: 4000,
  depreciation: -500, ebit: 3500, interestExpense: -300, ebt: 3200, taxExpense: -700,
  netIncome: 2500, minorityInterest: 0,
};

const IS_B: IncomeStatement = {
  revenue: 10000, cogs: -7000, grossProfit: 3000, opex: -1000, ebitda: 2000,
  depreciation: -300, ebit: 1700, interestExpense: -200, ebt: 1500, taxExpense: -400,
  netIncome: 1100, minorityInterest: 0,
};

const BS: BalanceSheet = {
  cash: 1000, accountsReceivable: 800, inventory: 700, currentAssets: 2500,
  ppe: 4000, intangibleAssets: 500, goodwill: 1000, nonCurrentAssets: 5500, totalAssets: 8000,
  accountsPayable: 600, shortTermDebt: 400, currentLiabilities: 1000,
  longTermDebt: 2000, nonCurrentLiabilities: 2000, totalLiabilities: 3000,
  shareCapital: 1000, retainedEarnings: 3800, minorityEquity: 200, totalEquity: 5000, balanceCheck: 0,
};

const BS_B: BalanceSheet = {
  cash: 500, accountsReceivable: 400, inventory: 300, currentAssets: 1200,
  ppe: 2000, intangibleAssets: 300, goodwill: 500, nonCurrentAssets: 2800, totalAssets: 4000,
  accountsPayable: 400, shortTermDebt: 200, currentLiabilities: 800,
  longTermDebt: 1200, nonCurrentLiabilities: 1200, totalLiabilities: 2000,
  shareCapital: 500, retainedEarnings: 1400, minorityEquity: 100, totalEquity: 2000, balanceCheck: 0,
};

const entity = (over: Partial<Entity>): Entity => ({
  id: 'id', code: 'PT0001', legalName: 'TechNova PT', countryCode: 'PT', localCurrency: 'EUR',
  consolidationMethod: 'full', ownershipPercentage: 1, sector: 'Technology', isActive: true, ...over,
});

describe('normalizeOwnership', () => {
  it('scales fractions to a percentage and passes percentages through', () => {
    expect(normalizeOwnership(1)).toBe(100);
    expect(normalizeOwnership(0.8)).toBeCloseTo(80);
    expect(normalizeOwnership(80)).toBe(80);
    expect(normalizeOwnership(50)).toBe(50);
  });
});

describe('toEntityCSV', () => {
  it('emits a header row plus one quoted row per entity with rounded ownership %', () => {
    const csv = toEntityCSV([
      entity({ code: 'PT0001', ownershipPercentage: 1 }),
      entity({ code: 'FR0005', legalName: 'TechNova FR', countryCode: 'FR', consolidationMethod: 'proportional', ownershipPercentage: 0.5, sector: null, isActive: false }),
    ]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Code,Legal Name,Country,Currency,Method,Ownership %,Sector,Status');
    expect(lines[1]).toBe('"PT0001","TechNova PT","PT","EUR","full","100","Technology","Active"');
    expect(lines[2]).toBe('"FR0005","TechNova FR","FR","EUR","proportional","50","","Inactive"');
  });
});

describe('buildComparisonMetrics', () => {
  it('produces 15 metrics with COGS as an absolute value and lower-is-better flags', () => {
    const metrics = buildComparisonMetrics(IS, BS, IS_B, BS_B);
    expect(metrics).toHaveLength(15);
    const cogs = metrics.find(m => m.label === 'COGS')!;
    expect(cogs.entityA).toBe(9000); // abs of -9000
    expect(cogs.higherIsBetter).toBe(false);
    const de = metrics.find(m => m.label === 'Debt/Equity')!;
    expect(de.higherIsBetter).toBe(false);
    expect(de.entityA).toBeCloseTo(0.6); // 3000 / 5000
    const roe = metrics.find(m => m.label === 'ROE')!;
    expect(roe.entityA).toBeCloseTo(50); // 2500/5000 * 100
  });
});

describe('formatMetricValue', () => {
  it('renders €K values as €M, percents, and ratios', () => {
    expect(formatMetricValue(15000, 'currency')).toBe('€15.0M');
    expect(formatMetricValue(12.345, 'percent')).toBe('12.3%');
    expect(formatMetricValue(1.5, 'ratio')).toBe('1.50x');
  });
});

describe('computeMetricDelta', () => {
  const mk = (over: Partial<ComparisonMetric>): ComparisonMetric =>
    ({ label: 'X', entityA: 0, entityB: 0, format: 'currency', higherIsBetter: true, ...over });

  it('flags a positive delta when A leads on a higher-is-better metric', () => {
    const d = computeMetricDelta(mk({ entityA: 120, entityB: 100, higherIsBetter: true }));
    expect(d.diff).toBe(20);
    expect(d.pctDiff).toBeCloseTo(20);
    expect(d.isPositive).toBe(true);
  });

  it('inverts direction for lower-is-better and guards divide-by-zero', () => {
    const d = computeMetricDelta(mk({ entityA: 120, entityB: 100, higherIsBetter: false }));
    expect(d.isPositive).toBe(false); // A is higher, but lower is better
    const z = computeMetricDelta(mk({ entityA: 50, entityB: 0 }));
    expect(z.pctDiff).toBe(0);
  });
});

describe('countMetricLeads', () => {
  it('counts how many metrics each entity wins, honouring direction', () => {
    const metrics: ComparisonMetric[] = [
      { label: 'Revenue', entityA: 100, entityB: 80, format: 'currency', higherIsBetter: true }, // A
      { label: 'COGS', entityA: 60, entityB: 40, format: 'currency', higherIsBetter: false }, // B (lower wins)
      { label: 'Equal', entityA: 10, entityB: 10, format: 'currency', higherIsBetter: true }, // neither
    ];
    expect(countMetricLeads(metrics)).toEqual({ a: 1, b: 1 });
  });
});

describe('buildEntityBarChartData', () => {
  it('keys each row by entity code for the grouped bars', () => {
    const data = buildEntityBarChartData(IS, BS, IS_B, BS_B, entity({ code: 'PT0001' }), entity({ code: 'FR0005' }));
    expect(data[0]).toEqual({ metric: 'Revenue', PT0001: 15000, FR0005: 10000 });
    expect(data[3]).toEqual({ metric: 'Total Assets', PT0001: 8000, FR0005: 4000 });
  });
});

describe('buildOwnershipWaterfall', () => {
  it('splits net income into a negative minority share and the group share', () => {
    const bars = buildOwnershipWaterfall(IS, entity({ ownershipPercentage: 0.8 }));
    expect(bars[0]).toEqual({ name: 'Net Income', value: 2500, fill: '#10b981' });
    expect(bars[1].value).toBeCloseTo(-500); // 20% minority of 2500
    expect(bars[2].value).toBeCloseTo(2000); // 80% group share
  });

  it('gives a fully-owned entity no minority share', () => {
    const bars = buildOwnershipWaterfall(IS, entity({ ownershipPercentage: 1 }));
    expect(bars[1].value).toBe(-0);
    expect(bars[2].value).toBe(2500);
  });
});

describe('buildOwnershipData', () => {
  it('returns group and complementary minority slices', () => {
    expect(buildOwnershipData(entity({ ownershipPercentage: 0.5 }))).toEqual([
      { name: 'Group Share', value: 50 },
      { name: 'Minority', value: 50 },
    ]);
  });
});

describe('buildFinancialRatios', () => {
  it('computes the four headline ratios as display strings', () => {
    const ratios = buildFinancialRatios(IS, BS);
    expect(ratios.find(r => r.label === 'ROE')!.value).toBe('50.0%'); // 2500/5000
    expect(ratios.find(r => r.label === 'Current Ratio')!.value).toBe('2.50x'); // 2500/1000
    expect(ratios.find(r => r.label === 'Debt/Equity')!.value).toBe('0.60x'); // 3000/5000
  });
});
