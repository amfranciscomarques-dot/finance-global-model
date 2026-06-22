import { describe, expect, it } from 'vitest';
import type { OperationalStatement } from '@/lib/types';
import {
  humanizeChannel,
  costBreakdown,
  productBars,
  materialBars,
  marketMix,
  channelMix,
  summary,
  marginTone,
} from './helpers';

// Small synthetic statement: one manufactured + one merchandise product.
const stmt: OperationalStatement = {
  entityCode: 'TEST',
  revenueTotal: 1000,
  cogs: { materials: 300, labor: 150, overhead: 50, total: 500 },
  grossProfit: 500,
  grossMarginPct: 0.5,
  byProduct: [
    { code: 'A', name: 'Alpha', productType: 'manufactured', volume: 100, pricePerUnit: 6, unitCost: 3, revenue: 600, cogs: 300, grossProfit: 300, grossMarginPct: 0.5 },
    { code: 'B', name: 'Beta', productType: 'merchandise', volume: 50, pricePerUnit: 8, unitCost: 5, revenue: 400, cogs: 200, grossProfit: 200, grossMarginPct: 0.5 },
  ],
  byMaterial: [
    { code: 'CLAY', name: 'Clay', cost: 200 },
    { code: 'GLAZE', name: 'Glaze', cost: 100 },
  ],
  byMarket: [
    { market: 'PT', revenue: 700, volume: 105 },
    { market: 'UE', revenue: 300, volume: 45 },
  ],
  byChannel: [
    { channel: 'Private_Label', revenue: 600, volume: 90 },
    { channel: 'Retalho', revenue: 400, volume: 60 },
  ],
  // Per product × market × channel; revenue reconciles to the product, market
  // and channel totals above (Σ = revenueTotal).
  allocations: [
    { productCode: 'A', productName: 'Alpha', market: 'PT', channel: 'Private_Label', revenue: 600, volume: 100 },
    { productCode: 'B', productName: 'Beta', market: 'PT', channel: 'Retalho', revenue: 100, volume: 5 },
    { productCode: 'B', productName: 'Beta', market: 'UE', channel: 'Retalho', revenue: 300, volume: 45 },
  ],
};

describe('operations view / helpers', () => {
  it('humanizeChannel replaces underscores', () => {
    expect(humanizeChannel('Private_Label')).toBe('Private Label');
    expect(humanizeChannel('Retalho')).toBe('Retalho');
  });

  it('costBreakdown splits COGS into MP/MOD/GGF with shares summing to 1', () => {
    const cb = costBreakdown(stmt);
    expect(cb.map((c) => c.key)).toEqual(['materials', 'labor', 'overhead']);
    expect(cb.map((c) => c.value)).toEqual([300, 150, 50]);
    expect(cb[0].pct).toBeCloseTo(0.6, 6);
    expect(cb.reduce((s, c) => s + c.pct, 0)).toBeCloseTo(1, 6);
  });

  it('productBars sorts by revenue desc', () => {
    const bars = productBars(stmt);
    expect(bars.map((b) => b.code)).toEqual(['A', 'B']);
    expect(bars[0].grossMarginPct).toBeCloseTo(0.5, 6);
  });

  it('materialBars sorts by cost desc with shares of materials total', () => {
    const mb = materialBars(stmt);
    expect(mb.map((m) => m.code)).toEqual(['CLAY', 'GLAZE']);
    expect(mb[0].pct).toBeCloseTo(200 / 300, 6);
  });

  it('marketMix / channelMix compute revenue share of total', () => {
    const mk = marketMix(stmt);
    expect(mk[0].key).toBe('PT');
    expect(mk[0].pct).toBeCloseTo(0.7, 6);
    expect(mk.reduce((s, m) => s + m.pct, 0)).toBeCloseTo(1, 6);

    const ch = channelMix(stmt);
    expect(ch[0].label).toBe('Private Label');
    expect(ch.reduce((s, c) => s + c.pct, 0)).toBeCloseTo(1, 6);
  });

  it('summary counts products by type and materials', () => {
    const sm = summary(stmt);
    expect(sm.productCount).toBe(2);
    expect(sm.manufacturedCount).toBe(1);
    expect(sm.merchandiseCount).toBe(1);
    expect(sm.materialCount).toBe(2);
    expect(sm.grossMarginPct).toBeCloseTo(0.5, 6);
  });

  it('marginTone bands by gross margin', () => {
    expect(marginTone(0.5)).toBe('gain');
    expect(marginTone(0.3)).toBe('neutral');
    expect(marginTone(0.1)).toBe('loss');
  });
});
