// ============================================================
// FINANCE DOMAIN — pure projection kernel (MEDIUM.10)
//
// projectPeriod(openingState, assumptions) → closingState, with NO database and
// no I/O. Given a fully-derived opening set of statements and a set of driver
// assumptions, it rolls one period forward into a complete, balanced set of
// projected statements (income statement, balance sheet, cash flow).
//
// This is the single basis for forecasting, scenarios and simulation: the same
// kernel can be chained (closing → next opening) for multi-period projections,
// or fanned out over Monte-Carlo draws, without re-implementing the roll-forward.
//
// BALANCE BY CONSTRUCTION. Cash is the plug: every other balance-sheet line that
// moves (AR, inventory, AP, PPE, debt, retained earnings) is mirrored in the
// cash-flow statement, and closing cash = opening cash + net change in cash. The
// accounting identity ΔAssets = ΔLiabilities + ΔEquity then holds to floating
// point (proven in project.test.ts):
//
//   ΔAssets − ΔLiab − ΔEquity
//     = (netIncome + ΔAP + Δdebt − dividends) − (ΔAP + Δdebt) − (netIncome − dividends)
//     = 0
//
// SCOPE / simplifications (documented, not hidden):
//   - Group/single-stream level: minority interest is not accrued in projection
//     (carried at its opening value); share capital and CTA are held flat.
//   - Net new borrowing is routed to long-term debt; short-term debt is held.
//   - Interest defaults to the OPENING debt balance. Opting into `debtSweep`
//     (MEDIUM.9) instead sweeps surplus cash to principal and charges interest
//     on the AVERAGE balance, resolving the cash↔interest circularity by
//     iteration (see solveDebtSchedule in debt.ts).
// ============================================================

import {
  createEmptyBS,
  createEmptyCF,
  createEmptyIS,
} from './account-maps';
import {
  deriveBalanceSheet,
  deriveCashFlow,
  deriveIncomeStatement,
  type FinancialStatements,
} from './statements';
import { solveDebtSchedule } from './debt';
import { round2 } from './money';

/** Driver assumptions for a single projected period. All rates are fractions. */
export interface ProjectionAssumptions {
  /** Revenue growth, e.g. 0.05 for +5%. */
  revenueGrowthRate: number;
  /** Operating-expense growth (applied to the opex magnitude). */
  opexGrowthRate: number;
  /** Gross margin held for the period: cogs = −(1 − margin) × revenue. */
  grossMarginRate: number;
  /** Depreciation as a fraction of OPENING PPE. */
  depreciationRate: number;
  /** Interest as a fraction of OPENING total debt (short + long term). */
  interestRate: number;
  /** Effective tax rate applied to positive EBT (loss years are untaxed). */
  effectiveTaxRate: number;
  /** Days sales outstanding — drives closing accounts receivable. */
  receivableDays: number;
  /** Days inventory outstanding — drives closing inventory (on COGS). */
  inventoryDays: number;
  /** Days payable outstanding — drives closing accounts payable (on COGS). */
  payableDays: number;
  /** Absolute capital expenditure for the period (positive = spend). */
  capex: number;
  /** Net new borrowing: positive = issuance, negative = repayment (long-term). */
  netDebtChange: number;
  /** Dividend payout as a fraction of positive net income. */
  dividendPayoutRate: number;
  /**
   * Optional cash-sweep debt schedule (MEDIUM.9). When present, debt repayment
   * is solved endogenously — surplus cash above `minCashBuffer` sweeps to
   * principal — and interest is charged on the AVERAGE of the opening and
   * closing balance (resolving the cash↔interest circularity by iteration).
   * This OVERRIDES `netDebtChange` and the opening-balance interest. When
   * omitted, the kernel keeps its simple behaviour (interest on opening debt,
   * `netDebtChange` applied as-is).
   */
  debtSweep?: {
    /** Cash retained and never swept (liquidity floor). */
    minCashBuffer: number;
    /** Contractual amortization due regardless of the sweep. Default 0. */
    mandatoryRepayment?: number;
  };
}

const safeDiv = (a: number, b: number): number => (b !== 0 ? a / b : 0);

/**
 * Derive a steady-state assumption set from an opening period: structural ratios
 * (margin, WC days, depreciation/interest rates, payout) are read off the opening
 * statements so that, with zero growth and capex = depreciation, the next period
 * reproduces the business. Callers override only what they want to flex
 * (typically `revenueGrowthRate`, `capex`, `netDebtChange`).
 */
export function deriveDefaultAssumptions(opening: FinancialStatements): ProjectionAssumptions {
  const { incomeStatement: is, balanceSheet: bs, cashFlow: cf } = opening;
  const revenue = is.revenue;
  const cogsMag = Math.abs(is.cogs);
  const debt = bs.shortTermDebt + bs.longTermDebt;

  return {
    revenueGrowthRate: 0,
    opexGrowthRate: 0,
    grossMarginRate: revenue > 0 ? (is.revenue + is.cogs) / revenue : 0, // cogs negative
    depreciationRate: safeDiv(Math.abs(is.depreciation), bs.ppe),
    interestRate: safeDiv(Math.abs(is.interestExpense), debt),
    effectiveTaxRate: is.ebt > 0 ? safeDiv(Math.abs(is.taxExpense), is.ebt) : 0,
    receivableDays: safeDiv(bs.accountsReceivable, revenue) * 365,
    inventoryDays: safeDiv(bs.inventory, cogsMag) * 365,
    payableDays: safeDiv(bs.accountsPayable, cogsMag) * 365,
    capex: Math.abs(cf.capex),
    netDebtChange: 0,
    dividendPayoutRate: is.netIncome > 0 ? safeDiv(cf.dividendsPaid, is.netIncome) : 0,
  };
}

/**
 * Roll one period forward. `opening` must be a fully-derived set of statements
 * (subtotals populated); use the finance-domain derive* functions or the
 * consolidation engine to produce it. Returns a fresh, fully-derived and
 * balanced closing set — `opening` is not mutated.
 */
export function projectPeriod(
  opening: FinancialStatements,
  assumptions: ProjectionAssumptions,
): FinancialStatements {
  const a = assumptions;
  const o = opening;
  const is = createEmptyIS();
  const bs = createEmptyBS();
  const cf = createEmptyCF();

  // --- Income statement down to EBIT (interest-independent) ---
  // Round each driver-computed line to the nearest cent. This prevents float
  // errors from compounding multiplicatively across a multi-period chain
  // (LOW.3). The cash plug and income-statement finalization are intentionally
  // left unrounded to preserve the double-entry identity exactly.
  is.revenue = round2(o.incomeStatement.revenue * (1 + a.revenueGrowthRate));
  is.cogs = round2(-(1 - a.grossMarginRate) * is.revenue);            // stored negative
  is.opex = round2(o.incomeStatement.opex * (1 + a.opexGrowthRate));  // stored negative
  is.depreciation = round2(-a.depreciationRate * o.balanceSheet.ppe); // stored negative
  const ebit = is.revenue + is.cogs + is.opex + is.depreciation; // grossProfit + opex + dep
  const depMag = Math.abs(is.depreciation);
  const openingDebt = o.balanceSheet.shortTermDebt + o.balanceSheet.longTermDebt;

  // --- Working-capital drivers (closing balances from days) ---
  const cogsMag = Math.abs(is.cogs);
  bs.accountsReceivable = round2((a.receivableDays / 365) * is.revenue);
  bs.inventory = round2((a.inventoryDays / 365) * cogsMag);
  bs.accountsPayable = round2((a.payableDays / 365) * cogsMag);
  const deltaWC =
    (bs.accountsReceivable - o.balanceSheet.accountsReceivable) +
    (bs.inventory - o.balanceSheet.inventory) -
    (bs.accountsPayable - o.balanceSheet.accountsPayable); // ↑ net WC consumes cash

  // --- PPE roll-forward: opening + capex − depreciation ---
  bs.ppe = round2(o.balanceSheet.ppe + a.capex - depMag);

  // Cash available to service debt at a given interest charge: the full period's
  // cash from operations + investing, less dividends, before repaying principal.
  // Used by the cash-sweep solver to resolve the cash↔interest circularity.
  const cashForDebtService = (interestMag: number): number => {
    const ebt = ebit - interestMag;
    const tax = a.effectiveTaxRate * Math.max(0, ebt);
    const netIncome = ebt - tax;
    const dividends = a.dividendPayoutRate * Math.max(0, netIncome);
    const operating = netIncome + depMag - deltaWC;
    const investing = -a.capex;
    return o.balanceSheet.cash + operating + investing - dividends;
  };

  // --- Debt & interest ---
  let interestMag: number;
  let debtIssuance = 0;
  let debtRepayment = 0;
  if (a.debtSweep) {
    // MEDIUM.9: sweep surplus cash to principal; interest on the AVERAGE balance.
    const sched = solveDebtSchedule(
      {
        openingDebt,
        interestRate: a.interestRate,
        minCashBuffer: a.debtSweep.minCashBuffer,
        mandatoryRepayment: a.debtSweep.mandatoryRepayment,
      },
      cashForDebtService,
    );
    interestMag = sched.interest;
    debtRepayment = sched.repayment;
    // Repay long-term first, then short-term (repayment ≤ openingDebt by construction).
    const payLong = Math.min(sched.repayment, o.balanceSheet.longTermDebt);
    bs.longTermDebt = o.balanceSheet.longTermDebt - payLong;
    bs.shortTermDebt = o.balanceSheet.shortTermDebt - (sched.repayment - payLong);
  } else {
    // Simple roll-forward: interest on the OPENING balance; net change → long-term.
    interestMag = a.interestRate * openingDebt;
    bs.shortTermDebt = o.balanceSheet.shortTermDebt;
    // Floor closing debt at 0: a netDebtChange more negative than the outstanding
    // long-term principal would otherwise drive the entity into a net-creditor
    // position. The sweep path already caps repayment at openingDebt (S2-08).
    bs.longTermDebt = Math.max(0, o.balanceSheet.longTermDebt + a.netDebtChange);
    // Derive the financing cash flows from the ACTUAL change in debt, not the
    // raw netDebtChange. When the floor above caps a large repayment, the cash
    // outflow must shrink to match — otherwise the cash plug over-decreases and
    // the sheet no longer balances. Uncapped, actualDelta === netDebtChange.
    const actualDelta = bs.longTermDebt - o.balanceSheet.longTermDebt;
    debtIssuance = actualDelta > 0 ? actualDelta : 0;
    debtRepayment = actualDelta < 0 ? -actualDelta : 0;
  }

  // --- Finalise the income statement with the resolved interest ---
  is.interestExpense = -interestMag;                          // stored negative
  deriveIncomeStatement(is);                                  // grossProfit → ebt (tax still 0)
  is.taxExpense = -a.effectiveTaxRate * Math.max(0, is.ebt);  // stored negative; loss years untaxed
  is.netIncome = is.ebt + is.taxExpense;

  // --- Dividends from positive net income ---
  const dividends = a.dividendPayoutRate * Math.max(0, is.netIncome);

  // --- Lines carried forward unchanged ---
  bs.otherCurrentAssets = o.balanceSheet.otherCurrentAssets;
  bs.icReceivable = o.balanceSheet.icReceivable;
  bs.intangibleAssets = o.balanceSheet.intangibleAssets;
  bs.goodwill = o.balanceSheet.goodwill;
  bs.otherNonCurrentAssets = o.balanceSheet.otherNonCurrentAssets;
  bs.otherCurrentLiabilities = o.balanceSheet.otherCurrentLiabilities;
  bs.icPayable = o.balanceSheet.icPayable;
  bs.otherNonCurrentLiabilities = o.balanceSheet.otherNonCurrentLiabilities;
  bs.shareCapital = o.balanceSheet.shareCapital;
  bs.historicalMinorityEquity = o.balanceSheet.historicalMinorityEquity;
  bs.cta = o.balanceSheet.cta;

  // Retained-earnings roll-forward: the prior CLOSING retained earnings becomes
  // this period's opening base (less dividends); deriveBalanceSheet then folds in
  // this period's net income.
  bs.historicalRetainedEarnings = o.balanceSheet.retainedEarnings - dividends;

  // --- Cash-flow statement (indirect) ---
  cf.changesInWorkingCapital = -deltaWC;
  cf.capex = -a.capex;                                         // investing outflow
  cf.debtIssuance = debtIssuance;
  cf.debtRepayment = debtRepayment;
  cf.dividendsPaid = dividends;
  cf.beginningCash = o.balanceSheet.cash;
  deriveCashFlow(cf, is); // links NI/dep, rolls operating/investing/financing → netChange, endingCash

  // --- Cash is the plug that closes the sheet ---
  bs.cash = o.balanceSheet.cash + cf.netChangeInCash; // == cf.endingCash

  deriveBalanceSheet(bs, is);
  return { incomeStatement: is, balanceSheet: bs, cashFlow: cf };
}

/**
 * Chain the kernel over several periods, threading each closing state into the
 * next opening state. Returns one entry per projected period (length = periods).
 * `assumptionsFor(i, opening)` lets the caller vary drivers by period (e.g. a
 * growth ramp); omit it to reuse one assumption set every period.
 */
export function projectMultiPeriod(
  opening: FinancialStatements,
  periods: number,
  assumptionsFor: (periodIndex: number, openingForPeriod: FinancialStatements) => ProjectionAssumptions,
): FinancialStatements[] {
  const out: FinancialStatements[] = [];
  let state = opening;
  for (let i = 0; i < periods; i++) {
    state = projectPeriod(state, assumptionsFor(i, state));
    out.push(state);
  }
  return out;
}
