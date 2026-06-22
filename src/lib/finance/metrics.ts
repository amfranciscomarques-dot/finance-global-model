// ============================================================
// FINANCE DOMAIN — metric resolver (pure)
//
// Single source of truth for turning raw COA→amount rows into a named
// financial metric. API routes (trends, budget, variance, exports) used to
// re-implement this with hand-maintained prefix subsets (e.g. only REV-001..003
// of the ten revenue accounts), which silently dropped real amounts and drifted
// from the consolidation engine. They should all go through buildStatements +
// resolveMetric instead, so the COA→statement mapping lives in exactly one place.
// ============================================================

import {
  addEntry,
  deriveBalanceSheet,
  deriveCashFlow,
  deriveIncomeStatement,
  type FinancialStatements,
} from './statements';
import { createEmptyBS, createEmptyCF, createEmptyIS } from './account-maps';

export interface CoaAmount {
  groupCOACode: string;
  amountEUR: number;
}

/**
 * Build a fully-derived set of statements from raw COA→amount rows, using the
 * same addEntry + derive pipeline as the consolidation engine. Every mapped
 * detail account (all REV-*, COGS-*, OPX-*, PAY-*, …) is included — no prefix
 * subsets. Note: this does NOT perform intercompany eliminations; for a true
 * group consolidation use runConsolidation. It is intended for single-entity or
 * pre-elimination analytical views (trends, budget vs. actual).
 */
export function buildStatements(entries: CoaAmount[]): FinancialStatements {
  const stmts: FinancialStatements = {
    incomeStatement: createEmptyIS(),
    balanceSheet: createEmptyBS(),
    cashFlow: createEmptyCF(),
  };
  for (const e of entries) addEntry(stmts, e.groupCOACode, e.amountEUR);
  deriveIncomeStatement(stmts.incomeStatement);
  deriveBalanceSheet(stmts.balanceSheet, stmts.incomeStatement);
  deriveCashFlow(stmts.cashFlow, stmts.incomeStatement);
  return stmts;
}

export type StatementMetric =
  | 'revenue' | 'cogs' | 'grossProfit' | 'opex' | 'ebitda'
  | 'depreciation' | 'ebit' | 'interestExpense' | 'ebt' | 'taxExpense'
  | 'netIncome' | 'ebitdaMargin'
  | 'assets' | 'liabilities' | 'equity' | 'leverage'
  | 'operatingCashFlow' | 'capex';

/**
 * Resolve a named metric from derived statements. Costs are stored negative, so
 * subtotals (grossProfit, ebitda, …) are already signed correctly by the derive
 * chain. Ratios (ebitdaMargin, leverage) must be resolved on aggregated
 * statements, never summed across entities.
 */
export function resolveMetric(stmts: FinancialStatements, metric: StatementMetric): number {
  const is = stmts.incomeStatement;
  const bs = stmts.balanceSheet;
  const cf = stmts.cashFlow;
  switch (metric) {
    case 'revenue': return is.revenue;
    case 'cogs': return is.cogs;
    case 'grossProfit': return is.grossProfit;
    case 'opex': return is.opex;
    case 'ebitda': return is.ebitda;
    case 'depreciation': return is.depreciation;
    case 'ebit': return is.ebit;
    case 'interestExpense': return is.interestExpense;
    case 'ebt': return is.ebt;
    case 'taxExpense': return is.taxExpense;
    case 'netIncome': return is.netIncome + is.minorityInterest;
    case 'ebitdaMargin': return is.revenue !== 0 ? (is.ebitda / is.revenue) * 100 : 0;
    case 'assets': return bs.totalAssets;
    case 'liabilities': return bs.totalLiabilities;
    case 'equity': return bs.totalEquity;
    case 'leverage': return bs.totalEquity > 0 ? bs.totalLiabilities / bs.totalEquity : 0;
    case 'operatingCashFlow': return cf.operatingCashFlow;
    case 'capex': return cf.capex;
    default: return 0;
  }
}
