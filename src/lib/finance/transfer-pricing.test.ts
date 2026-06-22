// ============================================================
// Transfer pricing — arm's-length cost-plus markup per IC relationship, and the
// proof that it makes the unrealized-profit elimination fire on policy-driven
// flows (not just hand-built test flows).
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  applyTransferPricing,
  applyTransferPricingAll,
  marginFromMarkup,
  priceFromCost,
  resolveMargin,
  resolveMarkup,
  tpKey,
  type TransferPricingPolicy,
} from './transfer-pricing';
import { buildSaleEliminationEntries, type ICSaleFlow } from './eliminations';

const policy: TransferPricingPolicy = {
  defaultMarkup: 0.15,
  overrides: { 'MERID>MUSA': 0.3 },
  defaultEndingInventoryFraction: 0.5,
};

describe('markup / margin conversions', () => {
  it('a 30% markup on cost is a 30/130 margin on price', () => {
    expect(marginFromMarkup(0.3)).toBeCloseTo(0.3 / 1.3, 10);
    expect(priceFromCost(1_000_000, 0.3)).toBe(1_300_000);
    // price × margin-on-price = the profit = cost × markup.
    expect(1_300_000 * marginFromMarkup(0.3)).toBeCloseTo(300_000, 4);
  });
});

describe('policy resolution', () => {
  it('uses the directed override when present, else the default', () => {
    expect(tpKey('MERID', 'MUSA')).toBe('MERID>MUSA');
    expect(resolveMarkup(policy, 'MERID', 'MUSA')).toBe(0.3);
    expect(resolveMarkup(policy, 'MUSA', 'MERID')).toBe(0.15); // reverse direction → default
    expect(resolveMargin(policy, 'MERID', 'MUSA')).toBeCloseTo(0.3 / 1.3, 10);
  });
});

describe('applyTransferPricing populates a live flow', () => {
  it('fills margin and ending-inventory fraction from the policy', () => {
    const raw: ICSaleFlow = { seller: 'MERID', buyer: 'MUSA', revenue: 1_300_000 };
    const priced = applyTransferPricing(raw, policy);
    expect(priced.margin).toBeCloseTo(0.3 / 1.3, 10);
    expect(priced.fractionInEndingInventory).toBe(0.5);
  });

  it('never overwrites an observed margin or holding fraction on the flow', () => {
    const observed: ICSaleFlow = {
      seller: 'MERID', buyer: 'MUSA', revenue: 1_300_000, margin: 0.2, fractionInEndingInventory: 0.1,
    };
    const priced = applyTransferPricing(observed, policy);
    expect(priced.margin).toBe(0.2);
    expect(priced.fractionInEndingInventory).toBe(0.1);
  });

  it('leaves the fraction undefined when the policy carries no default', () => {
    const noFrac: TransferPricingPolicy = { defaultMarkup: 0.15 };
    const priced = applyTransferPricing({ seller: 'A', buyer: 'B', revenue: 100 }, noFrac);
    expect(priced.margin).toBeCloseTo(0.15 / 1.15, 10);
    expect(priced.fractionInEndingInventory).toBeUndefined();
  });
});

describe('policy makes the unrealized-profit elimination fire on a live flow', () => {
  it('a bare flow yields no inventory-profit entry; the priced flow does', () => {
    const raw: ICSaleFlow = { seller: 'MERID', buyer: 'MUSA', revenue: 1_300_000 };

    // Before pricing: only the ic_sale entry exists (no margin/fraction).
    const bare = buildSaleEliminationEntries('2024-12', raw);
    expect(bare.map((e) => e.kind)).toEqual(['ic_sale']);

    // After pricing: the unrealized-profit entry now fires from policy data.
    const priced = applyTransferPricing(raw, policy);
    const entries = buildSaleEliminationEntries('2024-12', priced);
    const profit = entries.find((e) => e.kind === 'unrealized_inventory_profit')!;
    expect(profit).toBeDefined();
    // 1,300,000 × 0.5 (held) × (0.3/1.3) margin = 150,000 locked-in profit.
    expect(profit.amount).toBeCloseTo(150_000, 2);
  });

  it('applies across a batch of flows', () => {
    const flows: ICSaleFlow[] = [
      { seller: 'MERID', buyer: 'MUSA', revenue: 1_300_000 },
      { seller: 'A', buyer: 'B', revenue: 1_150_000 }, // default 15% markup
    ];
    const priced = applyTransferPricingAll(flows, policy);
    expect(priced[0].margin).toBeCloseTo(0.3 / 1.3, 10);
    expect(priced[1].margin).toBeCloseTo(0.15 / 1.15, 10);
    expect(priced.every((f) => f.fractionInEndingInventory === 0.5)).toBe(true);
  });
});
