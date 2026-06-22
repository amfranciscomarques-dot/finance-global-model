// ============================================================
// FINANCE DOMAIN — intercompany elimination (pure)
//
// Consolidation removes the effects of trading *within* the group. This module
// turns intercompany flows into explicit, auditable elimination journal entries
// and applies them to the aggregated (pre-elimination) consolidated statements.
//
// Three eliminations are modelled, the standard IFRS-10 set for intra-group
// inventory trade:
//
//   1. Intercompany sale — the seller's internal revenue and the buyer's internal
//      purchase cost both gross up the consolidated P&L. Remove the transfer
//      price from revenue AND from COGS (net-zero on gross profit when the buyer
//      has on-sold everything).
//
//   2. Unrealized profit in closing inventory — for the fraction the buyer still
//      holds at period end, its inventory carries the seller's margin. The group
//      must carry it at original cost, so reduce inventory by that locked-in
//      profit and charge it back through COGS (reduces group net income).
//
//   3. Intercompany receivable/payable — the seller's IC receivable (AST-009) and
//      the buyer's IC payable (LIA-006) are the same debt seen from both sides;
//      net them to zero. When the two legs were translated at different FX rates
//      (a cross-border pair), the EUR amounts differ; the residual is an FX
//      effect on an intra-group monetary item, recognised here in the CTA so the
//      consolidated sheet still balances (a pragmatic IAS 21 simplification —
//      strictly §45 would route it through P&L).
//
// Each entry is keyed on (period, counterpartyPair, account) so it can be listed,
// audited and de-duplicated. Applying the entries is a pure mutation of the
// consolidated statements followed by a re-derive of all subtotals.
// ============================================================

import {
  deriveBalanceSheet,
  deriveIncomeStatement,
  type FinancialStatements,
} from './statements';
import type { BalanceSheetData, IncomeStatementData } from './account-maps';

/**
 * One intercompany sale of inventory between two group entities in a period.
 * All amounts are in the group presentation currency (EUR); the caller is
 * responsible for translating each leg before constructing the flow.
 */
export interface ICSaleFlow {
  /** Selling entity code (recognised the internal revenue). */
  seller: string;
  /** Buying entity code (recorded the internal purchase). */
  buyer: string;
  /** Internal transfer price = seller's internal revenue (EUR, ≥ 0). */
  revenue: number;
  /**
   * Seller's gross margin on the transfer price, as a fraction 0..1
   * (profit ÷ price). Used to size the unrealized profit locked in unsold
   * inventory. Omit/0 ⇒ no inventory-profit elimination.
   */
  margin?: number;
  /**
   * Fraction of the goods the buyer STILL HOLDS in inventory at period end
   * (0..1). The remainder has been on-sold to third parties and its profit is
   * realised. Omit/0 ⇒ everything on-sold, no unrealized profit.
   */
  fractionInEndingInventory?: number;
  /**
   * Outstanding intercompany balance from this trade, unsettled at period end.
   * `receivable` sits on the seller's books (AST-009), `payable` on the buyer's
   * (LIA-006). They are equal for a same-currency pair and differ only by FX
   * translation for a cross-border pair. Omit ⇒ settled in cash, nothing to net.
   */
  openBalance?: { receivable: number; payable: number };
}

/** A single posting of an elimination entry against one statement line. */
export interface EliminationLeg {
  statement: 'incomeStatement' | 'balanceSheet';
  /** Key of the IS/BS data line this posting adjusts. */
  line: keyof IncomeStatementData | keyof BalanceSheetData;
  /** Signed amount added to the consolidated line (costs stored negative). */
  delta: number;
}

export type EliminationKind =
  | 'ic_sale'
  | 'unrealized_inventory_profit'
  | 'ic_balance';

/** An explicit, auditable consolidation elimination, keyed on (period, pair, account). */
export interface EliminationEntry {
  period: string;            // YYYY-MM
  counterpartyPair: string;  // unordered pair, e.g. "MERID~MUSA"
  account: string;           // headline account(s), e.g. "REV/COGS", "AST-009/LIA-006"
  kind: EliminationKind;
  description: string;
  /** Headline magnitude in EUR (positive) for reporting/sorting. */
  amount: number;
  legs: EliminationLeg[];
}

/** Stable, sortable key for an entry: `${period}|${pair}|${account}`. */
export function eliminationKey(e: EliminationEntry): string {
  return `${e.period}|${e.counterpartyPair}|${e.account}`;
}

/** Unordered counterparty pair label, e.g. ("MUSA","MERID") → "MERID~MUSA". */
export function counterpartyPair(a: string, b: string): string {
  return [a, b].sort().join('~');
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Build the elimination entries for one intercompany sale flow. Returns 1–3
 * entries (sale; unrealized inventory profit; IC balance) depending on which
 * effects the flow carries.
 */
export function buildSaleEliminationEntries(period: string, flow: ICSaleFlow): EliminationEntry[] {
  const pair = counterpartyPair(flow.seller, flow.buyer);
  const entries: EliminationEntry[] = [];

  // (1) Eliminate the internal sale: de-gross revenue and COGS by the transfer
  // price. COGS is stored negative, so adding `revenue` reduces its magnitude.
  const sale = round2(flow.revenue);
  if (sale !== 0) {
    entries.push({
      period,
      counterpartyPair: pair,
      account: 'REV/COGS',
      kind: 'ic_sale',
      description: `Eliminate internal sale ${flow.seller}→${flow.buyer}`,
      amount: sale,
      legs: [
        { statement: 'incomeStatement', line: 'revenue', delta: -sale },
        { statement: 'incomeStatement', line: 'cogs', delta: +sale },
      ],
    });
  }

  // (2) Eliminate unrealized profit locked in the buyer's unsold inventory.
  const frac = flow.fractionInEndingInventory ?? 0;
  const margin = flow.margin ?? 0;
  const unrealized = round2(sale * frac * margin);
  if (unrealized !== 0) {
    entries.push({
      period,
      counterpartyPair: pair,
      account: 'AST-003',
      kind: 'unrealized_inventory_profit',
      description: `Eliminate unrealized profit in ${flow.buyer} inventory (${flow.seller} sale)`,
      amount: unrealized,
      legs: [
        // Reduce inventory and charge the locked-in profit back through COGS,
        // which lowers group net income → retained earnings (sheet stays balanced).
        { statement: 'balanceSheet', line: 'inventory', delta: -unrealized },
        { statement: 'incomeStatement', line: 'cogs', delta: -unrealized },
      ],
    });
  }

  // (3) Net the intercompany receivable against the matching payable.
  if (flow.openBalance) {
    const recv = round2(flow.openBalance.receivable);
    const pay = round2(flow.openBalance.payable);
    if (recv !== 0 || pay !== 0) {
      const fxResidual = round2(pay - recv); // 0 for a same-currency pair
      const legs: EliminationLeg[] = [
        { statement: 'balanceSheet', line: 'icReceivable', delta: -recv },
        { statement: 'balanceSheet', line: 'icPayable', delta: -pay },
      ];
      // Keep assets − liabilities − equity at 0: any FX gap between the two legs
      // is absorbed by the translation reserve (see module header).
      if (fxResidual !== 0) {
        legs.push({ statement: 'balanceSheet', line: 'cta', delta: fxResidual });
      }
      entries.push({
        period,
        counterpartyPair: pair,
        account: 'AST-009/LIA-006',
        kind: 'ic_balance',
        description:
          `Eliminate IC receivable/payable ${flow.seller}↔${flow.buyer}` +
          (fxResidual !== 0 ? ` (FX residual ${fxResidual} → CTA)` : ''),
        amount: recv,
        legs,
      });
    }
  }

  return entries;
}

/** Build elimination entries for every intercompany sale flow in a period. */
export function buildEliminationEntries(period: string, flows: ICSaleFlow[]): EliminationEntry[] {
  return flows.flatMap((flow) => buildSaleEliminationEntries(period, flow));
}

function asNumbers(stmt: object): Record<string, number> {
  return stmt as unknown as Record<string, number>;
}

/**
 * Apply elimination entries to the aggregated consolidated statements (mutates
 * in place), then re-derive all subtotals. Income-statement legs flow through
 * net income into retained earnings; balance-sheet legs (inventory, IC balances,
 * CTA) adjust the sheet directly. Each entry is internally balanced, so the
 * balance check is preserved.
 */
export function applyEliminations(
  consolidated: FinancialStatements,
  entries: EliminationEntry[],
): void {
  const is = asNumbers(consolidated.incomeStatement);
  const bs = asNumbers(consolidated.balanceSheet);

  for (const entry of entries) {
    for (const leg of entry.legs) {
      if (leg.statement === 'incomeStatement') is[leg.line] += leg.delta;
      else bs[leg.line] += leg.delta;
    }
  }

  deriveIncomeStatement(consolidated.incomeStatement);
  deriveBalanceSheet(consolidated.balanceSheet, consolidated.incomeStatement);
}

/** Aggregate totals across a set of elimination entries, for reporting. */
export interface EliminationSummary {
  /** Internal sales volume removed from consolidated revenue (EUR). */
  internalSales: number;
  /** Unrealized profit removed from inventory/net income (EUR). */
  unrealizedProfit: number;
  /** Intercompany receivable/payable netted out (EUR). */
  icBalances: number;
  /** Number of elimination entries. */
  count: number;
}

export function summarizeEliminations(entries: EliminationEntry[]): EliminationSummary {
  const s: EliminationSummary = { internalSales: 0, unrealizedProfit: 0, icBalances: 0, count: entries.length };
  for (const e of entries) {
    if (e.kind === 'ic_sale') s.internalSales += e.amount;
    else if (e.kind === 'unrealized_inventory_profit') s.unrealizedProfit += e.amount;
    else if (e.kind === 'ic_balance') s.icBalances += e.amount;
  }
  return s;
}
