// ============================================================
// FINANCE DOMAIN — transfer pricing (pure)
//
// Intercompany sales must be priced at arm's length (OECD TP guidelines; PT
// art.º 63.º CIRC). This module holds the group's TransferPricingPolicy — a
// cost-plus markup per intercompany relationship — and is consumed in TWO
// places that must agree on the same number:
//
//   1. IC PRICING — the transfer price a seller books = cost × (1 + markup).
//   2. The UNREALIZED-PROFIT ELIMINATION — the gross margin embedded in that
//      transfer price (margin = markup / (1 + markup)) is exactly what sits,
//      unrealised, in the buyer's unsold inventory at period end.
//
// Without a policy the elimination module's `margin`/`fractionInEndingInventory`
// inputs are unset, so the `unrealized_inventory_profit` entry can only fire in
// hand-built tests. `applyTransferPricing` fills those fields on a live ICSaleFlow
// from the policy, so the elimination fires on real intercompany flows.
//
// Markups are DIRECTIONAL (the seller earns the margin), so overrides are keyed
// "SELLER>BUYER". Amounts are unit-agnostic (the caller works in one currency).
// ============================================================

import type { ICSaleFlow } from './eliminations';

export interface TransferPricingPolicy {
  /** Cost-plus markup applied when no relationship-specific override matches. */
  defaultMarkup: number;
  /**
   * Per-relationship markup overrides, keyed on the DIRECTED pair "SELLER>BUYER"
   * (e.g. "MERID>MUSA"). Falls back to defaultMarkup when absent.
   */
  overrides?: Record<string, number>;
  /**
   * Group assumption for the fraction of intercompany-purchased goods still held
   * in the buyer's closing inventory (0..1), used when a flow does not carry its
   * own observed figure. Omit ⇒ 0 (assume fully on-sold; no unrealized profit).
   */
  defaultEndingInventoryFraction?: number;
}

/** Directed-pair key for an override lookup. */
export function tpKey(seller: string, buyer: string): string {
  return `${seller}>${buyer}`;
}

/** Resolve the cost-plus markup for a seller→buyer relationship. */
export function resolveMarkup(policy: TransferPricingPolicy, seller: string, buyer: string): number {
  return policy.overrides?.[tpKey(seller, buyer)] ?? policy.defaultMarkup;
}

/**
 * Gross margin embedded in a cost-plus transfer price, as a fraction of the
 * PRICE: a 30% markup on cost is a 30/130 = 23.08% margin on the sale price.
 * This is the figure the elimination module multiplies by to size unrealized
 * profit, so the two layers stay consistent by construction.
 */
export function marginFromMarkup(markup: number): number {
  return markup / (1 + markup);
}

/** Transfer price a seller books for goods that cost `cost` at the given markup. */
export function priceFromCost(cost: number, markup: number): number {
  return cost * (1 + markup);
}

/** Margin on the transfer price for a seller→buyer relationship under the policy. */
export function resolveMargin(policy: TransferPricingPolicy, seller: string, buyer: string): number {
  return marginFromMarkup(resolveMarkup(policy, seller, buyer));
}

/**
 * Populate a live ICSaleFlow's `margin` (and `fractionInEndingInventory`, if the
 * policy carries a default) from the transfer-pricing policy, so the unrealized
 * inventory-profit elimination fires on real flows. Values already set on the
 * flow win — an observed margin or holding fraction is never overwritten.
 */
export function applyTransferPricing(flow: ICSaleFlow, policy: TransferPricingPolicy): ICSaleFlow {
  return {
    ...flow,
    margin: flow.margin ?? resolveMargin(policy, flow.seller, flow.buyer),
    fractionInEndingInventory:
      flow.fractionInEndingInventory ?? policy.defaultEndingInventoryFraction,
  };
}

/** Apply the policy to every flow in a period. */
export function applyTransferPricingAll(flows: ICSaleFlow[], policy: TransferPricingPolicy): ICSaleFlow[] {
  return flows.map((f) => applyTransferPricing(f, policy));
}
