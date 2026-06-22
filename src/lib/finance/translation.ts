// ============================================================
// FINANCE DOMAIN — IAS 21 foreign-currency translation (pure)
//
// Translates a foreign entity's statements from its functional currency into the
// group presentation currency (EUR) using the *current-rate method*:
//
//   - income & expenses ....... AVERAGE rate (a proxy for the rate at the dates
//                               the transactions occurred over the period)
//   - assets & liabilities .... CLOSING rate (the period-end spot rate)
//   - equity (contributed /
//     pre-existing earnings) .. HISTORICAL rate (rate when the equity arose)
//
// Because the three rates differ, translated assets no longer equal translated
// liabilities + equity. IAS 21 does not force-close that gap into the P&L: the
// residual is the CUMULATIVE TRANSLATION ADJUSTMENT (CTA), recognised in OCI as
// a separate component of equity. The CTA is therefore exactly the amount that
// makes the translated sheet balance — a meaningful plug representing the FX
// effect on the parent's net investment, not an error.
//
// Rates follow the ECB convention used across the app: 1 EUR = `rate` currency,
// so EUR = local / rate (see fx.ts). When all three rates are equal (e.g. 1.0
// for a EUR entity) the CTA collapses to 0 and translation is a uniform scaling
// — which is why the EUR demo group and the golden tests are unaffected.
// ============================================================

import {
  createEmptyBS,
  createEmptyCF,
  createEmptyIS,
  type BalanceSheetData,
  type CashFlowData,
  type IncomeStatementData,
} from './account-maps';
import {
  deriveBalanceSheet,
  deriveCashFlow,
  deriveIncomeStatement,
  type FinancialStatements,
} from './statements';

/** The three rates of the current-rate method (each expressed as 1 EUR = rate). */
export interface TranslationRates {
  /** Period-end spot rate — applied to assets & liabilities. */
  closing: number;
  /** Period-average rate — applied to income & expenses. */
  average: number;
  /** Rate when the equity arose — applied to contributed/pre-existing equity. */
  historical: number;
}

export interface TranslatedEntity {
  /** Statements translated into EUR, with the CTA folded into `balanceSheet`. */
  statements: FinancialStatements;
  /** The cumulative translation adjustment (OCI), in EUR. 0 when rates are equal. */
  cta: number;
}

// Income & expense detail lines — translated at the AVERAGE rate. (Subtotals such
// as grossProfit/ebitda and the derived netIncome are recomputed afterwards.)
const IS_FLOW_KEYS: ReadonlyArray<keyof IncomeStatementData> = [
  'revenue',
  'cogs',
  'opex',
  'depreciation',
  'interestExpense',
  'taxExpense',
];

// Monetary & non-monetary asset/liability detail lines — at the CLOSING rate.
const BS_MONETARY_KEYS: ReadonlyArray<keyof BalanceSheetData> = [
  'cash',
  'accountsReceivable',
  'inventory',
  'otherCurrentAssets',
  'ppe',
  'intangibleAssets',
  'goodwill',
  'otherNonCurrentAssets',
  'accountsPayable',
  'shortTermDebt',
  'otherCurrentLiabilities',
  'longTermDebt',
  'otherNonCurrentLiabilities',
];

// Contributed capital and pre-existing reserves — at the HISTORICAL rate. The
// current year's result enters retained earnings via the income statement, so it
// is translated at the average rate instead (handled by deriveBalanceSheet).
const BS_EQUITY_HISTORICAL_KEYS: ReadonlyArray<keyof BalanceSheetData> = [
  'shareCapital',
  'historicalRetainedEarnings',
  'historicalMinorityEquity',
];

// Cash-flow flows — at the AVERAGE rate (simplified: the IAS 7 separate-line
// treatment of FX effects on cash is out of scope; the CF is not balance-gated).
const CF_FLOW_KEYS: ReadonlyArray<keyof CashFlowData> = [
  'changesInWorkingCapital',
  'capex',
  'debtIssuance',
  'debtRepayment',
  'dividendsPaid',
  'beginningCash',
];

function asNumbers(stmt: object): Record<string, number> {
  return stmt as unknown as Record<string, number>;
}

function assertPositiveFinite(rate: number, label: string): void {
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new RangeError(
      `translateForeignEntity: invalid ${label} rate ${rate}; expected a positive, finite number.`,
    );
  }
}

/**
 * Translate a foreign entity's local-currency statements into EUR via the IAS 21
 * current-rate method, returning the translated statements plus the CTA.
 *
 * Only the *detail* lines of `local` are read; all subtotals (and the CTA) are
 * recomputed here, so the caller may pass statements whose subtotals are stale
 * or zero. `minorityInterest` is left at 0 — the engine applies it afterwards,
 * and since it merely shifts amounts between retained earnings and minority
 * equity it is equity-neutral and does not disturb the CTA.
 */
export function translateForeignEntity(
  local: FinancialStatements,
  rates: TranslationRates,
): TranslatedEntity {
  assertPositiveFinite(rates.closing, 'closing');
  assertPositiveFinite(rates.average, 'average');
  assertPositiveFinite(rates.historical, 'historical');

  const is = createEmptyIS();
  const bs = createEmptyBS();
  const cf = createEmptyCF();

  const localIS = asNumbers(local.incomeStatement);
  const localBS = asNumbers(local.balanceSheet);
  const localCF = asNumbers(local.cashFlow);

  for (const key of IS_FLOW_KEYS) asNumbers(is)[key] = localIS[key] / rates.average;
  for (const key of BS_MONETARY_KEYS) asNumbers(bs)[key] = localBS[key] / rates.closing;
  for (const key of BS_EQUITY_HISTORICAL_KEYS) asNumbers(bs)[key] = localBS[key] / rates.historical;
  for (const key of CF_FLOW_KEYS) asNumbers(cf)[key] = localCF[key] / rates.average;

  deriveIncomeStatement(is);

  // First pass with cta = 0: deriveBalanceSheet leaves the FX gap in balanceCheck
  // (assets at closing vs equity at historical/average). That gap *is* the CTA.
  deriveBalanceSheet(bs, is);
  const cta = bs.balanceCheck;

  // Recognise the CTA in equity and re-derive so the sheet reconciles (≈0).
  bs.cta = cta;
  deriveBalanceSheet(bs, is);

  deriveCashFlow(cf, is);

  return { statements: { incomeStatement: is, balanceSheet: bs, cashFlow: cf }, cta };
}
