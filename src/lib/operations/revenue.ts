// ============================================================
// OPERATIONS DOMAIN — revenue
//
// Revenue is volume × selling price, then allocated across the
// market × channel sales-mix weights. Weights are fractions of a product's
// volume and sum to 1 per product, so allocated revenue/volume reconcile back
// to the product totals.
// ============================================================

import type { OperationalProduct, OperationalModel } from './types';

/** Total revenue of one product = annual volume × selling price (PVU). */
export function productRevenue(product: OperationalProduct): number {
  return product.annualVolume * product.salesPricePerUnit;
}

/** Group revenue across the whole catalog. */
export function totalRevenue(model: OperationalModel): number {
  return model.products.reduce((sum, p) => sum + productRevenue(p), 0);
}

export interface Allocation {
  productCode: string;
  productName: string;
  market: string;
  channel: string;
  revenue: number;
  volume: number;
}

/** Allocate every product's revenue/volume across its market × channel mix. */
export function allocate(model: OperationalModel): Allocation[] {
  const rows: Allocation[] = [];
  for (const product of model.products) {
    const revenue = productRevenue(product);
    for (const mix of product.salesMix) {
      rows.push({
        productCode: product.code,
        productName: product.name,
        market: mix.market,
        channel: mix.channel,
        revenue: revenue * mix.weight,
        volume: product.annualVolume * mix.weight,
      });
    }
  }
  return rows;
}

function sumBy<K extends string>(
  rows: Allocation[],
  key: (a: Allocation) => K,
): Array<{ key: K; revenue: number; volume: number }> {
  const totals = new Map<K, { revenue: number; volume: number }>();
  for (const row of rows) {
    const k = key(row);
    const acc = totals.get(k) ?? { revenue: 0, volume: 0 };
    acc.revenue += row.revenue;
    acc.volume += row.volume;
    totals.set(k, acc);
  }
  return [...totals.entries()].map(([k, v]) => ({ key: k, ...v }));
}

/** Revenue/volume by market (channels summed). */
export function revenueByMarket(model: OperationalModel) {
  return sumBy(allocate(model), (a) => a.market).map((r) => ({
    market: r.key,
    revenue: r.revenue,
    volume: r.volume,
  }));
}

/** Revenue/volume by channel (markets summed). */
export function revenueByChannel(model: OperationalModel) {
  return sumBy(allocate(model), (a) => a.channel).map((r) => ({
    channel: r.key,
    revenue: r.revenue,
    volume: r.volume,
  }));
}
