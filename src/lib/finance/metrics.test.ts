import { describe, expect, it } from 'vitest';
import { buildStatements, resolveMetric } from './metrics';
import { categorizeCoaCode } from '../coa-data';

// Pure-math tests for the shared metric resolver — the helper that trends,
// budget and exports now route through instead of hand-maintained code subsets.

describe('buildStatements', () => {
  it('includes every revenue/COGS/OPEX detail account, not just *-001..003', () => {
    // Regression: the trends route used to sum only REV-001..003 of the ten
    // revenue accounts (and COGS-001..002, OPX-001 only), silently dropping the
    // rest. buildStatements maps the full Group COA.
    const entries = [
      { groupCOACode: 'REV-001', amountEUR: 100 },
      { groupCOACode: 'REV-004', amountEUR: 40 },  // Support & Maintenance — previously dropped
      { groupCOACode: 'REV-007', amountEUR: 10 },  // Training — previously dropped
      { groupCOACode: 'COGS-001', amountEUR: -30 },
      { groupCOACode: 'COGS-004', amountEUR: -20 }, // Subcontracted — previously dropped
      { groupCOACode: 'OPX-001', amountEUR: -15 },
      { groupCOACode: 'OPX-009', amountEUR: -5 },   // R&D — previously dropped
      { groupCOACode: 'PAY-001', amountEUR: -10 },
    ];
    const s = buildStatements(entries);
    expect(s.incomeStatement.revenue).toBe(150);     // 100 + 40 + 10
    expect(s.incomeStatement.cogs).toBe(-50);        // -30 - 20
    expect(s.incomeStatement.opex).toBe(-30);        // -15 - 5 - 10 (PAY folds into OPEX)
    expect(s.incomeStatement.grossProfit).toBe(100); // 150 - 50
    expect(s.incomeStatement.ebitda).toBe(70);       // 100 - 30
  });
});

describe('resolveMetric', () => {
  const entries = [
    { groupCOACode: 'REV-001', amountEUR: 1000 },
    { groupCOACode: 'COGS-001', amountEUR: -400 },
    { groupCOACode: 'OPX-001', amountEUR: -200 },
    { groupCOACode: 'DEP-001', amountEUR: -50 },
    { groupCOACode: 'INT-001', amountEUR: -30 },
    { groupCOACode: 'TAX-001', amountEUR: -20 },
    { groupCOACode: 'AST-001', amountEUR: 500 },   // cash
    { groupCOACode: 'LIA-002', amountEUR: 300 },   // short-term debt
    { groupCOACode: 'EQY-001', amountEUR: 200 },   // share capital
  ];
  const s = buildStatements(entries);

  it('resolves the income-statement chain with correct signs', () => {
    expect(resolveMetric(s, 'revenue')).toBe(1000);
    expect(resolveMetric(s, 'ebitda')).toBe(400);    // 600 GP - 200 opex
    expect(resolveMetric(s, 'netIncome')).toBe(300); // 400 - 50 - 30 - 20
    expect(resolveMetric(s, 'ebitdaMargin')).toBe(40); // 400/1000 * 100
  });

  it('resolves balance-sheet totals and leverage', () => {
    expect(resolveMetric(s, 'assets')).toBe(500);
    expect(resolveMetric(s, 'liabilities')).toBe(300);
    expect(resolveMetric(s, 'equity')).toBe(500);
    expect(resolveMetric(s, 'leverage')).toBeCloseTo(0.6, 6); // 300 / 500
  });

  it('returns 0 for ebitdaMargin when revenue is zero (no divide-by-zero)', () => {
    expect(resolveMetric(buildStatements([]), 'ebitdaMargin')).toBe(0);
    expect(resolveMetric(buildStatements([]), 'leverage')).toBe(0);
  });
});

describe('categorizeCoaCode', () => {
  it('buckets equity under EQY- (regression: old code checked EQ- and missed it)', () => {
    expect(categorizeCoaCode('EQY-001')).toBe('Equity');
    expect(categorizeCoaCode('EQY-003')).toBe('Equity');
  });

  it('buckets the other statement sections by prefix', () => {
    expect(categorizeCoaCode('REV-010')).toBe('Revenue');
    expect(categorizeCoaCode('COGS-005')).toBe('COGS');
    expect(categorizeCoaCode('OPX-002')).toBe('OPEX');
    expect(categorizeCoaCode('PAY-003')).toBe('OPEX');
    expect(categorizeCoaCode('DEP-001')).toBe('D&A');
    expect(categorizeCoaCode('INT-001')).toBe('Interest');
    expect(categorizeCoaCode('TAX-001')).toBe('Tax');
    expect(categorizeCoaCode('AST-009')).toBe('Assets');
    expect(categorizeCoaCode('LIA-006')).toBe('Liabilities');
    expect(categorizeCoaCode('CFA-001')).toBe('Other');
  });
});
