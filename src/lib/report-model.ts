// ============================================================
// REPORT MODEL — shared data + line layout for the Excel/PDF exporters
//
// Both exporters used to re-implement the COA→statement mapping and presented an
// un-eliminated entity *sum* as the "Consolidated" column, so a downloaded report
// disagreed with the dashboard. This module is the single source: it runs the
// consolidation engine (compute-only — no audit row) and exposes per-entity
// statements, the IC-eliminated consolidated statements, and an Eliminations
// column derived as (consolidated − Σ entities) so all three columns reconcile.
// ============================================================

import { db } from '@/lib/db';
import { computeConsolidation } from '@/lib/consolidation-engine';

export interface ReportEntity {
  entityCode: string;
  legalName: string;
  localCurrency: string;
  ownershipPercentage: number;
  consolidationMethod: string;
  is: Record<string, number>;
  bs: Record<string, number>;
  cf: Record<string, number>;
}

export interface StatementTriple {
  is: Record<string, number>;
  bs: Record<string, number>;
  cf: Record<string, number>;
}

export interface ReportData {
  entities: ReportEntity[];
  consolidated: StatementTriple;
  eliminations: StatementTriple;
  kpis: Awaited<ReturnType<typeof computeConsolidation>>['kpis'];
  balanceCheck: number;
  status: string;
}

export type StatementKind = 'is' | 'bs' | 'cf';

export interface ReportLine {
  label: string;
  field?: string; // read a single statement field
  sum?: string[]; // …or sum several fields (e.g. group-share net income)
  isTotal?: boolean; // subtotal/total row (rendered bold)
  section?: string; // section grouping for the balance sheet / cash flow
}

// Line layouts reference statement FIELD NAMES directly. Subtotals read the
// engine's pre-derived field (e.g. `currentAssets`), never a re-summed subset —
// that's what keeps the exported balance sheet tied to the engine and balanced.
export const IS_LINES: ReportLine[] = [
  { label: 'Revenue', field: 'revenue' },
  { label: 'Cost of Goods Sold', field: 'cogs' },
  { label: 'Gross Profit', field: 'grossProfit', isTotal: true },
  { label: 'Operating Expenses', field: 'opex' },
  { label: 'EBITDA', field: 'ebitda', isTotal: true },
  { label: 'Depreciation & Amortization', field: 'depreciation' },
  { label: 'EBIT', field: 'ebit', isTotal: true },
  { label: 'Interest Expense', field: 'interestExpense' },
  { label: 'Earnings Before Tax (EBT)', field: 'ebt', isTotal: true },
  { label: 'Tax Expense', field: 'taxExpense' },
  { label: 'Net Income', field: 'netIncome', isTotal: true },
  { label: 'Minority Interest', field: 'minorityInterest' },
  { label: 'Net Income (Group Share)', sum: ['netIncome', 'minorityInterest'], isTotal: true },
];

export const BS_LINES: ReportLine[] = [
  { label: 'Cash & Cash Equivalents', field: 'cash', section: 'Current Assets' },
  { label: 'Accounts Receivable', field: 'accountsReceivable', section: 'Current Assets' },
  { label: 'Inventory', field: 'inventory', section: 'Current Assets' },
  { label: 'Other Current Assets', field: 'otherCurrentAssets', section: 'Current Assets' },
  { label: 'Total Current Assets', field: 'currentAssets', isTotal: true, section: 'Current Assets' },
  { label: 'Property, Plant & Equipment', field: 'ppe', section: 'Non-Current Assets' },
  { label: 'Intangible Assets', field: 'intangibleAssets', section: 'Non-Current Assets' },
  { label: 'Goodwill', field: 'goodwill', section: 'Non-Current Assets' },
  { label: 'Deferred Tax Assets', field: 'deferredTaxAsset', section: 'Non-Current Assets' },
  { label: 'Other Non-Current Assets', field: 'otherNonCurrentAssets', section: 'Non-Current Assets' },
  { label: 'Total Non-Current Assets', field: 'nonCurrentAssets', isTotal: true, section: 'Non-Current Assets' },
  { label: 'TOTAL ASSETS', field: 'totalAssets', isTotal: true, section: 'Total' },
  { label: 'Accounts Payable', field: 'accountsPayable', section: 'Current Liabilities' },
  { label: 'Short-Term Debt', field: 'shortTermDebt', section: 'Current Liabilities' },
  { label: 'Other Current Liabilities', field: 'otherCurrentLiabilities', section: 'Current Liabilities' },
  { label: 'Total Current Liabilities', field: 'currentLiabilities', isTotal: true, section: 'Current Liabilities' },
  { label: 'Long-Term Debt', field: 'longTermDebt', section: 'Non-Current Liabilities' },
  { label: 'Other Non-Current Liabilities', field: 'otherNonCurrentLiabilities', section: 'Non-Current Liabilities' },
  { label: 'Total Non-Current Liabilities', field: 'nonCurrentLiabilities', isTotal: true, section: 'Non-Current Liabilities' },
  { label: 'TOTAL LIABILITIES', field: 'totalLiabilities', isTotal: true, section: 'Total' },
  { label: 'Share Capital', field: 'shareCapital', section: 'Equity' },
  { label: 'Retained Earnings', field: 'retainedEarnings', section: 'Equity' },
  { label: 'Minority Equity', field: 'minorityEquity', section: 'Equity' },
  { label: 'Translation Reserve (CTA)', field: 'cta', section: 'Equity' },
  { label: 'TOTAL EQUITY', field: 'totalEquity', isTotal: true, section: 'Equity' },
  { label: 'Balance Check (Assets − L − E)', field: 'balanceCheck', section: 'Check' },
];

export const CF_LINES: ReportLine[] = [
  { label: 'Net Income', field: 'netIncome', section: 'Operating Activities' },
  { label: 'Depreciation & Amortization', field: 'depreciation', section: 'Operating Activities' },
  { label: 'Changes in Working Capital', field: 'changesInWorkingCapital', section: 'Operating Activities' },
  { label: 'Net Operating Cash Flow', field: 'operatingCashFlow', isTotal: true, section: 'Operating Activities' },
  { label: 'Capital Expenditure', field: 'capex', section: 'Investing Activities' },
  { label: 'Net Investing Cash Flow', field: 'investingCashFlow', isTotal: true, section: 'Investing Activities' },
  { label: 'Debt Issuance', field: 'debtIssuance', section: 'Financing Activities' },
  { label: 'Debt Repayment', field: 'debtRepayment', section: 'Financing Activities' },
  { label: 'Dividends Paid', field: 'dividendsPaid', section: 'Financing Activities' },
  { label: 'Net Financing Cash Flow', field: 'financingCashFlow', isTotal: true, section: 'Financing Activities' },
  { label: 'Net Change in Cash', field: 'netChangeInCash', isTotal: true, section: 'Summary' },
];

export const LINES: Record<StatementKind, ReportLine[]> = { is: IS_LINES, bs: BS_LINES, cf: CF_LINES };

/** Resolve a line's value against a statement object. */
export function lineValue(line: ReportLine, stmt: Record<string, number>): number {
  if (line.sum) return line.sum.reduce((t, f) => t + (stmt[f] ?? 0), 0);
  if (line.field) return stmt[line.field] ?? 0;
  return 0;
}

function sumStatements(list: Record<string, number>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of list) for (const [k, v] of Object.entries(s)) out[k] = (out[k] ?? 0) + v;
  return out;
}

function diff(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of Object.keys(a)) out[k] = (a[k] ?? 0) - (b[k] ?? 0);
  return out;
}

const asNumbers = (o: object): Record<string, number> => o as unknown as Record<string, number>;

/**
 * Build the full report dataset for a period/scenario. When no entity codes are
 * given, all active entities are consolidated. Uses the compute-only engine path
 * (no ConsolidationRun audit row is written).
 */
export async function buildReportData(
  period: string,
  scenarioType: string,
  entityCodes?: string[],
): Promise<ReportData> {
  let codes = entityCodes;
  if (!codes || codes.length === 0) {
    const all = await db.entity.findMany({ where: { isActive: true }, select: { code: true } });
    codes = all.map((e) => e.code);
  }

  const result = await computeConsolidation({ period, entityCodes: codes, scenarioType });

  const entities: ReportEntity[] = result.entityBreakdown.map((e) => ({
    entityCode: e.entityCode,
    legalName: e.legalName,
    localCurrency: e.localCurrency,
    ownershipPercentage: e.ownershipPercentage,
    consolidationMethod: e.consolidationMethod,
    is: asNumbers(e.incomeStatement),
    bs: asNumbers(e.balanceSheet),
    cf: asNumbers(e.cashFlow),
  }));

  const consolidated: StatementTriple = {
    is: asNumbers(result.incomeStatement),
    bs: asNumbers(result.balanceSheet),
    cf: asNumbers(result.cashFlow),
  };

  // Eliminations column = consolidated − Σ entities, so entity + elimination =
  // consolidated holds for every line by construction.
  const eliminations: StatementTriple = {
    is: diff(consolidated.is, sumStatements(entities.map((e) => e.is))),
    bs: diff(consolidated.bs, sumStatements(entities.map((e) => e.bs))),
    cf: diff(consolidated.cf, sumStatements(entities.map((e) => e.cf))),
  };

  return {
    entities,
    consolidated,
    eliminations,
    kpis: result.kpis,
    balanceCheck: result.balanceCheck,
    status: result.status,
  };
}
