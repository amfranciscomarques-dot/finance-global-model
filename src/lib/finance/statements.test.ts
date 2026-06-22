import { describe, expect, it } from 'vitest';
import {
  addEntry,
  aggregateFinancials,
  applyOwnership,
  assertBalanced,
  computeMinorityInterest,
  DEFAULT_BALANCE_TOLERANCE_EUR,
  deriveBalanceSheet,
  deriveCashFlow,
  deriveIncomeStatement,
  type FinancialStatements,
} from './statements';
import { createEmptyBS, createEmptyCF, createEmptyIS } from './account-maps';

// Pure-math unit tests for the finance domain — no DB, fast. These complement
// the end-to-end golden tests in consolidation-engine.test.ts.

function emptyStatements(): FinancialStatements {
  return { incomeStatement: createEmptyIS(), balanceSheet: createEmptyBS(), cashFlow: createEmptyCF() };
}

describe('addEntry', () => {
  it('maps detail accounts into the right statement lines', () => {
    const s = emptyStatements();
    addEntry(s, 'REV-001', 1000);
    addEntry(s, 'REV-008', 200);
    addEntry(s, 'COGS-001', -400);
    addEntry(s, 'AST-001', 500);
    addEntry(s, 'CFA-002', -300);

    expect(s.incomeStatement.revenue).toBe(1200);
    expect(s.incomeStatement.cogs).toBe(-400);
    expect(s.balanceSheet.cash).toBe(500);
    expect(s.balanceSheet.currentAssets).toBe(0); // not stored, recomputed later
    expect(s.cashFlow.capex).toBe(-300);
  });

  it('maps every BS detail account — none silently dropped (regression)', () => {
    // These codes used to be wrongly listed as computed subtotals, so any
    // amount posted to them vanished from the balance sheet.
    const s = emptyStatements();
    addEntry(s, 'AST-004', 100); // Outros Ativos Correntes
    addEntry(s, 'AST-008', 200); // Outros Ativos Não Correntes
    addEntry(s, 'AST-009', 50);  // IC Receivable
    addEntry(s, 'AST-010', 30);  // Deferred Tax Asset
    addEntry(s, 'LIA-003', 40);  // Other Current Liabilities
    addEntry(s, 'LIA-005', 60);  // Other Non-Current Liabilities
    addEntry(s, 'LIA-008', 25);  // Tax Payable
    addEntry(s, 'LIA-009', 35);  // Pension Obligations
    addEntry(s, 'LIA-010', 15);  // Deferred Revenue
    addEntry(s, 'EQY-004', 70);  // Other Reserves
    addEntry(s, 'EQY-005', 95);  // Current Year Earnings

    const bs = s.balanceSheet;
    expect(bs.otherCurrentAssets).toBe(150);     // AST-004 + AST-009
    expect(bs.otherNonCurrentAssets).toBe(230);  // AST-008 + AST-010
    expect(bs.otherCurrentLiabilities).toBe(80); // LIA-003 + LIA-008 + LIA-010
    expect(bs.otherNonCurrentLiabilities).toBe(95); // LIA-005 + LIA-009
    expect(bs.historicalRetainedEarnings).toBe(165);       // EQY-004 + EQY-005

    deriveBalanceSheet(bs);
    expect(bs.retainedEarnings).toBe(165);
    expect(bs.currentAssets).toBe(150);
    expect(bs.nonCurrentAssets).toBe(230);
    expect(bs.totalAssets).toBe(380);
    expect(bs.totalLiabilities).toBe(175);
    expect(bs.totalEquity).toBe(165);
  });
});

describe('income statement derivation', () => {
  it('builds the gross-profit → net-income chain (costs stored negative)', () => {
    const is = createEmptyIS();
    is.revenue = 1000;
    is.cogs = -400;
    is.opex = -200;
    is.depreciation = -50;
    is.interestExpense = -30;
    is.taxExpense = -20;
    deriveIncomeStatement(is);

    expect(is.grossProfit).toBe(600);
    expect(is.ebitda).toBe(400);
    expect(is.ebit).toBe(350);
    expect(is.ebt).toBe(320);
    expect(is.netIncome).toBe(300);
  });
});

describe('computeMinorityInterest', () => {
  it('is zero for wholly-owned full consolidation', () => {
    const is = createEmptyIS();
    is.netIncome = 1000;
    expect(computeMinorityInterest(is, 'full', 1.0)).toBe(0);
  });
  it('is the minority share (negative) for <100% full consolidation', () => {
    const is = createEmptyIS();
    is.netIncome = 1000;
    expect(computeMinorityInterest(is, 'full', 0.8)).toBeCloseTo(-200, 6);
  });
  it('is zero for proportional consolidation — ownership already applied (regression)', () => {
    // Proportional brings in only the parent's share via applyOwnership, so
    // is.netIncome is ALREADY the owned share. A non-zero minority here would
    // deduct the non-controlling percentage a second time.
    const full = createEmptyIS();
    full.netIncome = 1000;
    const own = 0.8;
    // Simulate the engine: scale net income by ownership, then compute MI.
    const owned = createEmptyIS();
    owned.netIncome = full.netIncome * own; // 800, as applyOwnership would leave it
    expect(computeMinorityInterest(owned, 'proportional', own)).toBe(0);
    // Net income attributable to the group is the owned share, undiminished.
    expect(owned.netIncome + computeMinorityInterest(owned, 'proportional', own)).toBeCloseTo(800, 6);
  });
});

describe('deriveBalanceSheet', () => {
  it('recomputes subtotals and balanceCheck from details', () => {
    const bs = createEmptyBS();
    bs.cash = 100; bs.accountsReceivable = 200; bs.inventory = 300;
    bs.ppe = 400;
    bs.accountsPayable = 150; bs.shortTermDebt = 50; bs.longTermDebt = 200;
    bs.shareCapital = 100; bs.historicalRetainedEarnings = 500;
    deriveBalanceSheet(bs);

    expect(bs.currentAssets).toBe(600);
    expect(bs.totalAssets).toBe(1000);
    expect(bs.totalLiabilities).toBe(400);
    expect(bs.totalEquity).toBe(600);
    expect(bs.balanceCheck).toBe(0);
  });
});

describe('assertBalanced', () => {
  it('passes a reconciling sheet within the default cent-level tolerance', () => {
    const bs = createEmptyBS();
    bs.cash = 1000; bs.shareCapital = 1000;
    deriveBalanceSheet(bs);
    const r = assertBalanced(bs);
    expect(r.balanced).toBe(true);
    expect(r.imbalance).toBe(0);
    expect(r.tolerance).toBe(DEFAULT_BALANCE_TOLERANCE_EUR);
  });

  it('fails — and reports the signed imbalance — when assets ≠ liabilities + equity', () => {
    const bs = createEmptyBS();
    bs.cash = 1000; bs.shareCapital = 600; // 400 short on the equity/liability side
    deriveBalanceSheet(bs);
    const r = assertBalanced(bs);
    expect(r.balanced).toBe(false);
    expect(r.imbalance).toBeCloseTo(400, 6); // assets − (liab + equity), recorded not hidden
  });

  it('treats sub-tolerance float noise as balanced but honours a tighter tolerance', () => {
    const bs = createEmptyBS();
    bs.cash = 1000; bs.shareCapital = 1000;
    deriveBalanceSheet(bs);
    bs.balanceCheck = 0.4; // within the 1 EUR default, outside a 0.01 tolerance
    expect(assertBalanced(bs).balanced).toBe(true);
    expect(assertBalanced(bs, 0.01).balanced).toBe(false);
  });
});

describe('applyOwnership', () => {
  it('scales all line items except balanceCheck', () => {
    const s = emptyStatements();
    s.incomeStatement.revenue = 1000;
    s.balanceSheet.cash = 500;
    s.balanceSheet.balanceCheck = 7;
    s.cashFlow.capex = -200;
    applyOwnership(s, 0.5);

    expect(s.incomeStatement.revenue).toBe(500);
    expect(s.balanceSheet.cash).toBe(250);
    expect(s.balanceSheet.balanceCheck).toBe(7); // untouched
    expect(s.cashFlow.capex).toBe(-100);
  });
});

describe('deriveCashFlow', () => {
  it('links net income, flips depreciation positive and rolls up subtotals', () => {
    const is = createEmptyIS();
    is.netIncome = 300;
    is.depreciation = -50;
    const cf = createEmptyCF();
    cf.changesInWorkingCapital = 20;
    cf.capex = -100;
    cf.debtIssuance = 200; cf.debtRepayment = 80; cf.dividendsPaid = 40;
    deriveCashFlow(cf, is);

    expect(cf.netIncome).toBe(300);
    expect(cf.depreciation).toBe(50);
    expect(cf.operatingCashFlow).toBe(370);
    expect(cf.investingCashFlow).toBe(-100);
    expect(cf.financingCashFlow).toBe(80);
    expect(cf.netChangeInCash).toBe(350);
  });
});

describe('aggregateFinancials', () => {
  it('sums entity statements and re-derives consolidated subtotals', () => {
    const a = emptyStatements();
    a.incomeStatement.revenue = 1000; a.incomeStatement.cogs = -400;
    a.balanceSheet.cash = 100;
    const b = emptyStatements();
    b.incomeStatement.revenue = 500; b.incomeStatement.cogs = -100;
    b.balanceSheet.cash = 50;

    const agg = aggregateFinancials([a, b]);
    expect(agg.incomeStatement.revenue).toBe(1500);
    expect(agg.incomeStatement.grossProfit).toBe(1000);
    expect(agg.balanceSheet.cash).toBe(150);
    expect(agg.balanceSheet.currentAssets).toBe(150);
  });
});
