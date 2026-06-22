import { describe, expect, it } from 'vitest';
import { templatePack } from '@/lib/company-packs/template';
import { buildOperationalStatement, toTbLines } from './rollup';
import type { OperationalModel } from './types';

// ============================================================
// GOLDEN / CALIBRATION GUARD — the MERID operational catalog in the template
// pack MUST reproduce the entity's former hard-coded turnover and cost of sales,
// so EBITDA / net income / the balance sheet are unchanged after the bottom-up
// switch. If you edit the catalog, keep these totals (or update the literals in
// template.ts MERID_2024 to match).
// ============================================================

const merid: OperationalModel = templatePack.operations![0];

describe('operations / rollup — MERID calibration', () => {
  const stmt = buildOperationalStatement(merid);

  it('total revenue ties to REV-001 = 40,000,000', () => {
    expect(stmt.revenueTotal).toBeCloseTo(40_000_000, 2);
  });

  it('COGS ties to 16,000,000 split 8,170,000 / 3,610,000 / 4,220,000', () => {
    expect(stmt.cogs.materials).toBeCloseTo(8_170_000, 2);
    expect(stmt.cogs.labor).toBeCloseTo(3_610_000, 2);
    expect(stmt.cogs.overhead).toBeCloseTo(4_220_000, 2);
    expect(stmt.cogs.total).toBeCloseTo(16_000_000, 2);
  });

  it('gross profit = revenue − COGS', () => {
    expect(stmt.grossProfit).toBeCloseTo(24_000_000, 2);
  });

  it('toTbLines emits REV-001 positive and three negative COGS buckets', () => {
    const lines = toTbLines(merid);
    const byCode = Object.fromEntries(lines.map((l) => [l.groupCOACode, l.amount]));
    expect(byCode['REV-001']).toBeCloseTo(40_000_000, 2);
    expect(byCode['COGS-001']).toBeCloseTo(-8_170_000, 2);
    expect(byCode['COGS-002']).toBeCloseTo(-3_610_000, 2);
    expect(byCode['COGS-003']).toBeCloseTo(-4_220_000, 2);
    // Net P&L impact equals EBITDA contribution of revenue + cost of sales.
    const net = lines.reduce((s, l) => s + l.amount, 0);
    expect(net).toBeCloseTo(24_000_000, 2);
  });

  it('market and channel allocations both reconcile to total revenue', () => {
    const marketSum = stmt.byMarket.reduce((s, r) => s + r.revenue, 0);
    const channelSum = stmt.byChannel.reduce((s, r) => s + r.revenue, 0);
    expect(marketSum).toBeCloseTo(40_000_000, 2);
    expect(channelSum).toBeCloseTo(40_000_000, 2);
  });

  it('every product sales-mix weights sum to 1', () => {
    for (const p of merid.products) {
      const w = p.salesMix.reduce((s, m) => s + m.weight, 0);
      expect(w).toBeCloseTo(1, 6);
    }
  });

  it('byMaterial cost sum equals manufactured materials cost', () => {
    const matSum = stmt.byMaterial.reduce((s, m) => s + m.cost, 0);
    // Manufactured MP = total materials − merchandise purchase cost (3,180,000).
    expect(matSum).toBeCloseTo(8_170_000 - 3_180_000, 2);
  });
});
