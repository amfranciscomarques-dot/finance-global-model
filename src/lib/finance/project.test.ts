import { describe, expect, it } from 'vitest';
import {
  createEmptyBS,
  createEmptyCF,
  createEmptyIS,
  deriveBalanceSheet,
  deriveCashFlow,
  deriveIncomeStatement,
  deriveDefaultAssumptions,
  projectPeriod,
  projectMultiPeriod,
  type FinancialStatements,
} from './index';

// ============================================================
// PROJECTION KERNEL (MEDIUM.10) — pure roll-forward tests.
//
// A synthetic, internally-balanced opening period (assets 870 = liabilities 350
// + equity 520) is rolled forward. The invariant under every assumption set is
// that the closing balance sheet reconciles (cash is the plug), so these tests
// pin both the headline driver behaviour and the balance-by-construction.
// ============================================================

/** Build a fully-derived, balanced opening period from detail lines. */
function makeOpening(): FinancialStatements {
  const is = createEmptyIS();
  is.revenue = 1000;
  is.cogs = -600;      // 40% gross margin
  is.opex = -200;
  is.depreciation = -50;
  is.interestExpense = -20;
  deriveIncomeStatement(is);                 // grossProfit 400, ebitda 200, ebit 150, ebt 130
  is.taxExpense = -0.25 * is.ebt;            // -32.5
  is.netIncome = is.ebt + is.taxExpense;     // 97.5

  const bs = createEmptyBS();
  bs.cash = 100;
  bs.accountsReceivable = 150;
  bs.inventory = 120;
  bs.ppe = 500;
  bs.accountsPayable = 90;
  bs.shortTermDebt = 60;
  bs.longTermDebt = 200;
  bs.shareCapital = 300;
  bs.historicalRetainedEarnings = 122.5;     // 300 + 122.5 + 97.5 = 520 equity
  deriveBalanceSheet(bs, is);

  const cf = createEmptyCF();
  cf.changesInWorkingCapital = -10;
  cf.capex = -50;
  cf.debtIssuance = 0;
  cf.debtRepayment = 0;
  cf.dividendsPaid = 50;
  cf.beginningCash = 70;
  deriveCashFlow(cf, is);

  return { incomeStatement: is, balanceSheet: bs, cashFlow: cf };
}

const opening = makeOpening();

describe('projectPeriod — balance by construction', () => {
  it('opening period is itself balanced (test fixture sanity)', () => {
    expect(Math.abs(opening.balanceSheet.balanceCheck)).toBeLessThan(1e-6);
    expect(opening.balanceSheet.totalAssets).toBeCloseTo(870, 6);
    expect(opening.balanceSheet.totalEquity).toBeCloseTo(520, 6);
  });

  it('reconciles under steady-state (zero-growth) assumptions', () => {
    const closing = projectPeriod(opening, deriveDefaultAssumptions(opening));
    expect(Math.abs(closing.balanceSheet.balanceCheck)).toBeLessThan(1e-6);
  });

  it('reconciles under a +10% growth, +15% capex, debt-repayment scenario', () => {
    const a = deriveDefaultAssumptions(opening);
    const closing = projectPeriod(opening, {
      ...a,
      revenueGrowthRate: 0.1,
      opexGrowthRate: 0.04,
      capex: a.capex * 1.15,
      netDebtChange: -30,
    });
    expect(Math.abs(closing.balanceSheet.balanceCheck)).toBeLessThan(1e-6);
  });

  it('grows revenue and preserves gross margin', () => {
    const a = deriveDefaultAssumptions(opening);
    const closing = projectPeriod(opening, { ...a, revenueGrowthRate: 0.2 });
    expect(closing.incomeStatement.revenue).toBeCloseTo(1200, 6);
    // Margin held: grossProfit/revenue stays 0.4.
    expect(closing.incomeStatement.grossProfit / closing.incomeStatement.revenue).toBeCloseTo(0.4, 9);
  });

  it('ties closing cash to opening cash + net change in cash', () => {
    const closing = projectPeriod(opening, { ...deriveDefaultAssumptions(opening), revenueGrowthRate: 0.08 });
    expect(closing.balanceSheet.cash).toBeCloseTo(
      opening.balanceSheet.cash + closing.cashFlow.netChangeInCash,
      6,
    );
    expect(closing.cashFlow.endingCash).toBeCloseTo(closing.balanceSheet.cash, 6);
  });

  it('does not tax a loss-making period', () => {
    // Force a loss by collapsing margin and inflating opex growth.
    const a = deriveDefaultAssumptions(opening);
    const closing = projectPeriod(opening, { ...a, grossMarginRate: 0.05, opexGrowthRate: 2 });
    expect(closing.incomeStatement.ebt).toBeLessThan(0);
    expect(closing.incomeStatement.taxExpense).toBeCloseTo(0, 9); // untaxed loss (may be -0)
    expect(Math.abs(closing.balanceSheet.balanceCheck)).toBeLessThan(1e-6);
  });

  it('higher receivable days reduces operating cash flow (more cash tied up)', () => {
    const a = deriveDefaultAssumptions(opening);
    const grow = { ...a, revenueGrowthRate: 0.1 };
    const base = projectPeriod(opening, grow);
    const slowCollect = projectPeriod(opening, { ...grow, receivableDays: a.receivableDays + 30 });
    expect(slowCollect.cashFlow.operatingCashFlow).toBeLessThan(base.cashFlow.operatingCashFlow);
  });

  it('does not mutate the opening state', () => {
    const before = JSON.stringify(opening);
    projectPeriod(opening, { ...deriveDefaultAssumptions(opening), revenueGrowthRate: 0.5 });
    expect(JSON.stringify(opening)).toBe(before);
  });
});

describe('deriveDefaultAssumptions', () => {
  it('reads structural ratios off the opening period', () => {
    const a = deriveDefaultAssumptions(opening);
    expect(a.grossMarginRate).toBeCloseTo(0.4, 9);
    expect(a.effectiveTaxRate).toBeCloseTo(0.25, 9);
    expect(a.receivableDays).toBeCloseTo((150 / 1000) * 365, 6);
    expect(a.inventoryDays).toBeCloseTo((120 / 600) * 365, 6);
    expect(a.payableDays).toBeCloseTo((90 / 600) * 365, 6);
    expect(a.depreciationRate).toBeCloseTo(50 / 500, 9);
    expect(a.interestRate).toBeCloseTo(20 / 260, 9);
    expect(a.capex).toBeCloseTo(50, 6);
    expect(a.dividendPayoutRate).toBeCloseTo(50 / 97.5, 9);
  });
});

describe('projectPeriod — cash-sweep debt schedule (MEDIUM.9)', () => {
  it('sweeps surplus cash to debt, charges interest on the average balance, stays balanced', () => {
    const a = deriveDefaultAssumptions(opening);
    const buffer = 50;
    const openingDebt = opening.balanceSheet.shortTermDebt + opening.balanceSheet.longTermDebt; // 260
    const closing = projectPeriod(opening, { ...a, debtSweep: { minCashBuffer: buffer } });

    // Surplus cash was swept, so debt fell…
    const closingDebt = closing.balanceSheet.shortTermDebt + closing.balanceSheet.longTermDebt;
    expect(closingDebt).toBeLessThan(openingDebt);
    // …leaving cash at the buffer (a partial sweep, not debt-exhausting)…
    expect(closing.balanceSheet.cash).toBeCloseTo(buffer, 4);
    // …interest is on the AVERAGE balance, hence below interest on the opening balance…
    expect(Math.abs(closing.incomeStatement.interestExpense)).toBeLessThan(a.interestRate * openingDebt);
    expect(Math.abs(closing.incomeStatement.interestExpense)).toBeGreaterThan(a.interestRate * closingDebt);
    // …and the sheet still reconciles by construction.
    expect(Math.abs(closing.balanceSheet.balanceCheck)).toBeLessThan(1e-6);
  });

  it('overrides netDebtChange when a sweep is configured', () => {
    const a = deriveDefaultAssumptions(opening);
    // A large issuance would normally raise debt; the sweep ignores it.
    const swept = projectPeriod(opening, { ...a, netDebtChange: 5000, debtSweep: { minCashBuffer: 50 } });
    const sweptDebt = swept.balanceSheet.shortTermDebt + swept.balanceSheet.longTermDebt;
    expect(sweptDebt).toBeLessThan(opening.balanceSheet.shortTermDebt + opening.balanceSheet.longTermDebt);
    expect(swept.cashFlow.debtIssuance).toBe(0);
  });

  it('matches the simple path exactly when no sweep is configured (regression)', () => {
    const a = deriveDefaultAssumptions(opening);
    const grow = { ...a, revenueGrowthRate: 0.08 };
    const base = projectPeriod(opening, grow);
    // Interest is on the opening balance and netDebtChange is applied verbatim.
    expect(base.incomeStatement.interestExpense).toBeCloseTo(-a.interestRate * 260, 6);
  });
});

describe('projectMultiPeriod — chained roll-forward', () => {
  it('projects a multi-year path where every period balances and revenue compounds', () => {
    const a = deriveDefaultAssumptions(opening);
    const years = projectMultiPeriod(opening, 3, () => ({ ...a, revenueGrowthRate: 0.1 }));
    expect(years).toHaveLength(3);
    for (const y of years) expect(Math.abs(y.balanceSheet.balanceCheck)).toBeLessThan(1e-6);
    expect(years[0].incomeStatement.revenue).toBeCloseTo(1100, 6);
    expect(years[1].incomeStatement.revenue).toBeCloseTo(1210, 6);
    expect(years[2].incomeStatement.revenue).toBeCloseTo(1331, 6);
    // Retained earnings accumulate across the chain.
    expect(years[2].balanceSheet.retainedEarnings).toBeGreaterThan(years[0].balanceSheet.retainedEarnings);
  });
});
