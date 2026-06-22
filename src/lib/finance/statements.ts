// ============================================================
// FINANCE DOMAIN — statement assembly & derivation (pure)
//
// Pure functions (no DB, no I/O) that turn mapped detail-account totals into
// fully derived income statements, balance sheets and cash-flow statements,
// and aggregate them across entities. Shared by the consolidation engine and
// the API routes so the rollup math lives in exactly one place.
// ============================================================

import {
  BS_DETAIL_ACCOUNTS,
  CF_ACCOUNTS,
  IS_ACCOUNTS,
  SUMMARY_ACCOUNTS,
  createEmptyBS,
  createEmptyCF,
  createEmptyIS,
  type BalanceSheetData,
  type CashFlowData,
  type IncomeStatementData,
} from './account-maps';

export interface FinancialStatements {
  incomeStatement: IncomeStatementData;
  balanceSheet: BalanceSheetData;
  cashFlow: CashFlowData;
}

// Every field of the statement data types is a number, so viewing one as a
// string-keyed number record for dynamic-key accumulation is safe. This local
// helper documents that intent in one place (TS can't prove it structurally).
function asNumbers(stmt: object): Record<string, number> {
  return stmt as unknown as Record<string, number>;
}

/**
 * Accumulate a single trial-balance entry into the right statement line item.
 * Summary/subtotal accounts are ignored (they are recomputed from details).
 */
export function addEntry(
  stmts: FinancialStatements,
  groupCOACode: string,
  amountEUR: number,
): void {
  if (SUMMARY_ACCOUNTS.has(groupCOACode)) return;

  if (IS_ACCOUNTS[groupCOACode]) {
    const key = IS_ACCOUNTS[groupCOACode];
    asNumbers(stmts.incomeStatement)[key] += amountEUR;
  } else if (BS_DETAIL_ACCOUNTS[groupCOACode]) {
    const key = BS_DETAIL_ACCOUNTS[groupCOACode];
    asNumbers(stmts.balanceSheet)[key] += amountEUR;
  } else if (CF_ACCOUNTS[groupCOACode]) {
    const key = CF_ACCOUNTS[groupCOACode];
    asNumbers(stmts.cashFlow)[key] += amountEUR;
  }
  // IC accounts (IC-001..IC-005) are handled separately in eliminations.
}

/** Scale every line item by an ownership fraction (proportional consolidation). */
export function applyOwnership(stmts: FinancialStatements, ownership: number): void {
  const { incomeStatement: is, balanceSheet: bs, cashFlow: cf } = stmts;
  for (const key of Object.keys(is) as Array<keyof IncomeStatementData>) {
    asNumbers(is)[key] *= ownership;
  }
  for (const key of Object.keys(bs) as Array<keyof BalanceSheetData>) {
    if (key !== 'balanceCheck') asNumbers(bs)[key] *= ownership;
  }
  for (const key of Object.keys(cf) as Array<keyof CashFlowData>) {
    asNumbers(cf)[key] *= ownership;
  }
}

/** Derive the income-statement subtotal chain (COGS/OPEX/etc. stored negative). */
export function deriveIncomeStatement(is: IncomeStatementData): void {
  is.grossProfit = is.revenue + is.cogs;
  is.ebitda = is.grossProfit + is.opex;
  is.ebit = is.ebitda + is.depreciation;
  is.ebt = is.ebit + is.interestExpense;
  is.netIncome = is.ebt + is.taxExpense;
}

/**
 * Minority (non-controlling) interest.
 *
 * Only the FULL consolidation method produces a minority interest: 100% of the
 * subsidiary is brought in, so the non-controlling share of net income must be
 * carved back out as `-(1 - ownership) * netIncome`.
 *
 * The PROPORTIONAL method has no minority interest by construction: only the
 * parent's share is consolidated in the first place (see `applyOwnership`, which
 * has already scaled `is.netIncome` down to `ownership * netIncome`). The
 * remaining share simply never enters the statements, so returning anything
 * other than 0 here would deduct the minority a second time.
 */
export function computeMinorityInterest(
  is: IncomeStatementData,
  consolidationMethod: string,
  ownershipPercentage: number,
): number {
  if (consolidationMethod === 'full' && ownershipPercentage < 1.0) {
    return -(is.netIncome * (1 - ownershipPercentage));
  }
  return 0;
}

/**
 * MEDIUM.6 — reclassify the non-controlling interest in a subsidiary's OPENING
 * equity. Under full consolidation 100% of the subsidiary is brought in, so the
 * minority's share of its equity must be carved out. This derives that share from
 * `ownership × subsidiary equity` — share capital + pre-existing retained earnings
 * + CTA — rather than trusting a stored `EQY-003`: it scales the parent-attributable
 * equity lines down to the owned fraction and books the remainder as the minority's
 * historical equity. The current year's NCI share of net income is handled
 * separately by {@link computeMinorityInterest}; together they give a balance-sheet
 * minority equity of exactly `(1 − ownership) × subsidiary total equity`.
 *
 * One-shot: mutates `bs` and must be called once per subsidiary, BEFORE
 * `deriveBalanceSheet`. A no-op for wholly-owned or non-full entities, so 100%
 * books (and every golden value) are unchanged.
 */
export function reclassifyMinorityEquity(
  bs: BalanceSheetData,
  consolidationMethod: string,
  ownershipPercentage: number,
): void {
  if (consolidationMethod !== 'full' || ownershipPercentage >= 1.0) return;
  const o = ownershipPercentage;
  const openingSubEquity = bs.shareCapital + bs.historicalRetainedEarnings + bs.cta;
  bs.historicalMinorityEquity = (1 - o) * openingSubEquity;
  bs.shareCapital *= o;
  bs.historicalRetainedEarnings *= o;
  bs.cta *= o;
}

/** Recompute all balance-sheet subtotals (and the balance check) from details. */
export function deriveBalanceSheet(bs: BalanceSheetData, is?: IncomeStatementData): void {
  bs.currentAssets = bs.cash + bs.accountsReceivable + bs.inventory + bs.otherCurrentAssets + bs.icReceivable;
  bs.nonCurrentAssets = bs.ppe + bs.intangibleAssets + bs.goodwill + bs.deferredTaxAsset + bs.otherNonCurrentAssets;
  bs.totalAssets = bs.currentAssets + bs.nonCurrentAssets;
  bs.currentLiabilities = bs.accountsPayable + bs.shortTermDebt + bs.otherCurrentLiabilities + bs.icPayable;
  bs.nonCurrentLiabilities = bs.longTermDebt + bs.otherNonCurrentLiabilities;
  bs.totalLiabilities = bs.currentLiabilities + bs.nonCurrentLiabilities;

  if (is) {
    bs.retainedEarnings = bs.historicalRetainedEarnings + is.netIncome + (is.minorityInterest || 0);
    bs.minorityEquity = bs.historicalMinorityEquity - (is.minorityInterest || 0);
  } else {
    bs.retainedEarnings = bs.historicalRetainedEarnings;
    bs.minorityEquity = bs.historicalMinorityEquity;
  }

  // The CTA (IAS 21 translation reserve) is a component of equity. It is 0 for
  // EUR books, so this term is inert for the demo group and the golden tests; it
  // only carries weight once a foreign entity has been translated at mixed rates.
  bs.totalEquity = bs.shareCapital + bs.retainedEarnings + bs.minorityEquity + bs.cta;
  bs.balanceCheck = bs.totalAssets - bs.totalLiabilities - bs.totalEquity;
}

/**
 * Default tolerance (EUR) for the balance-sheet integrity gate. The demo book
 * reconciles to the cent, so anything above a euro is a genuine accounting
 * break, not floating-point noise.
 */
export const DEFAULT_BALANCE_TOLERANCE_EUR = 1.0;

export interface BalanceCheckResult {
  /** Whether |imbalance| is within tolerance. */
  balanced: boolean;
  /** Signed assets − (liabilities + equity); 0 when the sheet reconciles. */
  imbalance: number;
  /** Tolerance applied to reach the `balanced` verdict. */
  tolerance: number;
}

/**
 * Double-entry integrity check (IFRS: assets must equal liabilities + equity).
 * Pure and non-throwing: returns the signed imbalance and a within-tolerance
 * verdict so callers can both *gate* (mark a run failed) and *record* the break.
 * Operates on `bs.balanceCheck`, which {@link deriveBalanceSheet} populates.
 */
export function assertBalanced(
  bs: BalanceSheetData,
  tolerance: number = DEFAULT_BALANCE_TOLERANCE_EUR,
): BalanceCheckResult {
  const imbalance = bs.balanceCheck;
  return { imbalance, tolerance, balanced: Math.abs(imbalance) <= tolerance };
}

/**
 * Derive the indirect cash-flow subtotals. `netIncome` and `depreciation` are
 * linked from the income statement (depreciation flipped positive) before the
 * operating/investing/financing rollups.
 */
export function deriveCashFlow(cf: CashFlowData, is: IncomeStatementData): void {
  cf.netIncome = is.netIncome;
  cf.depreciation = Math.abs(is.depreciation);
  cf.operatingCashFlow = cf.netIncome + cf.depreciation + cf.changesInWorkingCapital;
  cf.investingCashFlow = cf.capex;
  cf.financingCashFlow = cf.debtIssuance - cf.debtRepayment - cf.dividendsPaid;
  cf.netChangeInCash = cf.operatingCashFlow + cf.investingCashFlow + cf.financingCashFlow;
  cf.endingCash = cf.beginningCash + cf.netChangeInCash;
}

/**
 * Sum a set of entity statements into a consolidated set and re-derive all
 * subtotals from the aggregated detail lines.
 */
export function aggregateFinancials(entityStatements: FinancialStatements[]): FinancialStatements {
  const is = createEmptyIS();
  const bs = createEmptyBS();
  const cf = createEmptyCF();

  for (const ef of entityStatements) {
    for (const key of Object.keys(ef.incomeStatement) as Array<keyof IncomeStatementData>) {
      asNumbers(is)[key] += ef.incomeStatement[key];
    }
    for (const key of Object.keys(ef.balanceSheet) as Array<keyof BalanceSheetData>) {
      if (key !== 'balanceCheck') asNumbers(bs)[key] += ef.balanceSheet[key];
    }
    for (const key of Object.keys(ef.cashFlow) as Array<keyof CashFlowData>) {
      asNumbers(cf)[key] += ef.cashFlow[key];
    }
  }

  deriveIncomeStatement(is);
  deriveBalanceSheet(bs, is);
  // Cash-flow subtotals from aggregated detail lines (netIncome/depreciation
  // were summed directly above, so recompute the rollups without re-linking).
  cf.operatingCashFlow = cf.netIncome + cf.depreciation + cf.changesInWorkingCapital;
  cf.investingCashFlow = cf.capex;
  cf.financingCashFlow = cf.debtIssuance - cf.debtRepayment - cf.dividendsPaid;
  cf.netChangeInCash = cf.operatingCashFlow + cf.investingCashFlow + cf.financingCashFlow;
  cf.endingCash = cf.beginningCash + cf.netChangeInCash;

  return { incomeStatement: is, balanceSheet: bs, cashFlow: cf };
}
