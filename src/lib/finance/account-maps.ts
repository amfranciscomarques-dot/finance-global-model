// ============================================================
// FINANCE DOMAIN — Group COA → financial-statement mapping
//
// Single source of truth for how Group chart-of-accounts codes roll up into
// income statement / balance sheet / cash-flow line items. Previously this
// mapping was re-implemented (and could drift) across the consolidation engine
// and several API routes. The consolidation engine's semantics are canonical:
//   - map ONLY detail accounts; summary/subtotal accounts are recomputed
//   - never trust stored subtotals (avoids double counting)
// ============================================================

export interface IncomeStatementData {
  revenue: number;
  cogs: number;
  grossProfit: number;
  opex: number;
  ebitda: number;
  depreciation: number;
  ebit: number;
  interestExpense: number;
  ebt: number;
  taxExpense: number;
  netIncome: number;
  minorityInterest: number;
}

export interface BalanceSheetData {
  cash: number;
  accountsReceivable: number;
  inventory: number;
  otherCurrentAssets: number;
  // Intercompany receivable (AST-009): a first-class line so it can be eliminated
  // against the matching IC payable on consolidation, not buried in "other".
  icReceivable: number;
  currentAssets: number;
  ppe: number;
  intangibleAssets: number;
  goodwill: number;
  otherNonCurrentAssets: number;
  nonCurrentAssets: number;
  totalAssets: number;
  accountsPayable: number;
  shortTermDebt: number;
  otherCurrentLiabilities: number;
  // Intercompany payable (LIA-006): the matching leg of icReceivable; the two are
  // netted to zero by the elimination pass on consolidation.
  icPayable: number;
  currentLiabilities: number;
  longTermDebt: number;
  otherNonCurrentLiabilities: number;
  nonCurrentLiabilities: number;
  totalLiabilities: number;
  shareCapital: number;
  historicalRetainedEarnings: number;
  retainedEarnings: number;
  historicalMinorityEquity: number;
  minorityEquity: number;
  // Cumulative translation adjustment (IAS 21): the FX residual from translating
  // a foreign entity's sheet at mixed rates (assets/liabilities at closing,
  // equity at historical), recognised in OCI as a separate equity component.
  // 0 for EUR entities and whenever all translation rates are equal.
  cta: number;
  totalEquity: number;
  balanceCheck: number;
}

export interface CashFlowData {
  netIncome: number;
  depreciation: number;
  changesInWorkingCapital: number;
  operatingCashFlow: number;
  capex: number;
  investingCashFlow: number;
  debtIssuance: number;
  debtRepayment: number;
  dividendsPaid: number;
  financingCashFlow: number;
  netChangeInCash: number;
  beginningCash: number;
  endingCash: number;
}

// COA code mapping - ONLY detail accounts (no summary/subtotal accounts).
// Summary accounts like AST-004, AST-008, AST-009, LIA-003, etc. are
// calculated, not stored.
export const IS_ACCOUNTS: Record<string, keyof IncomeStatementData> = {
  // Revenue (detail accounts only)
  'REV-001': 'revenue', 'REV-002': 'revenue', 'REV-003': 'revenue',
  'REV-004': 'revenue', 'REV-005': 'revenue', 'REV-006': 'revenue',
  'REV-007': 'revenue', 'REV-008': 'revenue', 'REV-009': 'revenue', 'REV-010': 'revenue',
  // COGS
  'COGS-001': 'cogs', 'COGS-002': 'cogs', 'COGS-003': 'cogs',
  'COGS-004': 'cogs', 'COGS-005': 'cogs',
  // OPEX
  'OPX-001': 'opex', 'OPX-002': 'opex', 'OPX-003': 'opex',
  'OPX-004': 'opex', 'OPX-005': 'opex', 'OPX-006': 'opex',
  'OPX-007': 'opex', 'OPX-008': 'opex', 'OPX-009': 'opex', 'OPX-010': 'opex',
  // Payroll (part of OPEX)
  'PAY-001': 'opex', 'PAY-002': 'opex', 'PAY-003': 'opex',
  'PAY-004': 'opex', 'PAY-005': 'opex',
  // Depreciation
  'DEP-001': 'depreciation', 'DEP-002': 'depreciation', 'DEP-003': 'depreciation',
  'DEP-004': 'depreciation', 'DEP-005': 'depreciation',
  // Interest
  'INT-001': 'interestExpense', 'INT-002': 'interestExpense', 'INT-003': 'interestExpense',
  // Tax
  'TAX-001': 'taxExpense', 'TAX-002': 'taxExpense', 'TAX-003': 'taxExpense',
};

// Balance sheet - ONLY detail accounts (summary subtotals like currentAssets,
// totalAssets, totalEquity are always recomputed in deriveBalanceSheet).
// Every level-2 detail code in the group COA must be mapped here, otherwise
// amounts posted to it silently vanish from the balance sheet.
export const BS_DETAIL_ACCOUNTS: Record<string, keyof Pick<BalanceSheetData,
  'cash' | 'accountsReceivable' | 'inventory' | 'otherCurrentAssets' | 'icReceivable' |
  'ppe' | 'intangibleAssets' | 'goodwill' | 'otherNonCurrentAssets' |
  'accountsPayable' | 'shortTermDebt' | 'otherCurrentLiabilities' | 'icPayable' |
  'longTermDebt' | 'otherNonCurrentLiabilities' |
  'shareCapital' | 'retainedEarnings' | 'minorityEquity' |
  'historicalRetainedEarnings' | 'historicalMinorityEquity'
>> = {
  'AST-001': 'cash',
  'AST-002': 'accountsReceivable',
  'AST-003': 'inventory',
  'AST-004': 'otherCurrentAssets',        // Outros Ativos Correntes
  'AST-005': 'ppe',
  'AST-006': 'intangibleAssets',
  'AST-007': 'goodwill',
  'AST-008': 'otherNonCurrentAssets',     // Outros Ativos Não Correntes
  'AST-009': 'icReceivable',              // IC Receivable — eliminated against LIA-006 on consolidation
  'AST-010': 'otherNonCurrentAssets',     // Deferred Tax Asset
  'LIA-001': 'accountsPayable',
  'LIA-002': 'shortTermDebt',
  'LIA-003': 'otherCurrentLiabilities',
  'LIA-004': 'longTermDebt',
  'LIA-005': 'otherNonCurrentLiabilities',
  'LIA-006': 'icPayable',                 // IC Payable — eliminated against AST-009 on consolidation
  'LIA-007': 'accountsPayable',           // Additional payables
  'LIA-008': 'otherCurrentLiabilities',   // Tax Payable
  'LIA-009': 'otherNonCurrentLiabilities',// Pension Obligations
  'LIA-010': 'otherCurrentLiabilities',   // Deferred Revenue
  'EQY-001': 'shareCapital',
  'EQY-002': 'historicalRetainedEarnings',
  'EQY-004': 'historicalRetainedEarnings',          // Other Reserves → folded into reserves
  'EQY-005': 'historicalRetainedEarnings',          // Current Year Earnings → folded into reserves
  'EQY-003': 'historicalMinorityEquity',
};

// Cash flow adjustments
export const CF_ACCOUNTS: Record<string, keyof CashFlowData> = {
  'CFA-001': 'changesInWorkingCapital',
  'CFA-002': 'capex',
  'CFA-003': 'debtIssuance',
  'CFA-004': 'debtRepayment',
  'CFA-005': 'dividendsPaid',
};

// Codes EXCLUDED from direct mapping because they hold computed subtotals.
// The current group COA has none (every AST/LIA/EQY code is a level-2 detail
// account — the previous list here wrongly dropped real detail accounts).
// Company packs whose source data stores subtotal rows should add them here.
export const SUMMARY_ACCOUNTS = new Set<string>([]);

export function createEmptyIS(): IncomeStatementData {
  return { revenue: 0, cogs: 0, grossProfit: 0, opex: 0, ebitda: 0, depreciation: 0, ebit: 0, interestExpense: 0, ebt: 0, taxExpense: 0, netIncome: 0, minorityInterest: 0 };
}

export function createEmptyBS(): BalanceSheetData {
  return { cash: 0, accountsReceivable: 0, inventory: 0, otherCurrentAssets: 0, icReceivable: 0, currentAssets: 0, ppe: 0, intangibleAssets: 0, goodwill: 0, otherNonCurrentAssets: 0, nonCurrentAssets: 0, totalAssets: 0, accountsPayable: 0, shortTermDebt: 0, otherCurrentLiabilities: 0, icPayable: 0, currentLiabilities: 0, longTermDebt: 0, otherNonCurrentLiabilities: 0, nonCurrentLiabilities: 0, totalLiabilities: 0, shareCapital: 0, historicalRetainedEarnings: 0, retainedEarnings: 0, historicalMinorityEquity: 0, minorityEquity: 0, cta: 0, totalEquity: 0, balanceCheck: 0 };
}

export function createEmptyCF(): CashFlowData {
  return { netIncome: 0, depreciation: 0, changesInWorkingCapital: 0, operatingCashFlow: 0, capex: 0, investingCashFlow: 0, debtIssuance: 0, debtRepayment: 0, dividendsPaid: 0, financingCashFlow: 0, netChangeInCash: 0, beginningCash: 0, endingCash: 0 };
}
