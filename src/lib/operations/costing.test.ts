import { describe, expect, it } from 'vitest';
import type { OperationalModel } from './types';
import {
  materialUnitCost,
  productUnitCost,
  productCogsBreakdown,
  totalCogs,
  materialCostByMaterial,
} from './costing';

// Small self-contained model: one manufactured + one merchandise product.
const model: OperationalModel = {
  entityCode: 'TEST',
  materials: [
    { code: 'CLAY', name: 'Clay', unit: 'kg', unitCost: 0.5 },
    { code: 'GLAZE', name: 'Glaze', unit: 'kg', unitCost: 2.0 },
  ],
  products: [
    {
      code: 'BOWL', name: 'Bowl', productType: 'manufactured',
      salesPricePerUnit: 5, annualVolume: 1000,
      laborCostPerUnit: 0.55, overheadPerUnit: 0.65, purchaseCostPerUnit: 0,
      bom: [
        { materialCode: 'CLAY', quantityPerUnit: 0.8 },  // 0.40
        { materialCode: 'GLAZE', quantityPerUnit: 0.2 }, // 0.40
      ],
      salesMix: [{ market: 'PT', channel: 'Retalho', weight: 1 }],
    },
    {
      code: 'KNIFE', name: 'Knife (resale)', productType: 'merchandise',
      salesPricePerUnit: 15, annualVolume: 100,
      laborCostPerUnit: 0, overheadPerUnit: 0, purchaseCostPerUnit: 9,
      bom: [],
      salesMix: [{ market: 'PT', channel: 'Retalho', weight: 1 }],
    },
  ],
};

describe('operations / costing', () => {
  const bowl = model.products[0];
  const knife = model.products[1];

  it('materialUnitCost sums BOM quantity × material unit cost', () => {
    expect(materialUnitCost(bowl, model.materials)).toBeCloseTo(0.8, 6);
  });

  it('productUnitCost (CIP) = MP + MOD + GGF for manufactured', () => {
    // 0.80 (MP) + 0.55 (MOD) + 0.65 (GGF) = 2.00
    expect(productUnitCost(bowl, model.materials)).toBeCloseTo(2.0, 6);
  });

  it('merchandise unit cost is the purchase cost (no BOM)', () => {
    expect(materialUnitCost(knife, model.materials)).toBeCloseTo(9, 6);
    expect(productUnitCost(knife, model.materials)).toBeCloseTo(9, 6);
  });

  it('productCogsBreakdown splits volume × unit cost into MP/MOD/GGF', () => {
    const b = productCogsBreakdown(bowl, model.materials);
    expect(b.materials).toBeCloseTo(800, 6);  // 1000 × 0.80
    expect(b.labor).toBeCloseTo(550, 6);      // 1000 × 0.55
    expect(b.overhead).toBeCloseTo(650, 6);   // 1000 × 0.65
    expect(b.total).toBeCloseTo(2000, 6);
  });

  it('merchandise COGS is all materials/CMVMC', () => {
    const b = productCogsBreakdown(knife, model.materials);
    expect(b.materials).toBeCloseTo(900, 6); // 100 × 9
    expect(b.labor).toBe(0);
    expect(b.overhead).toBe(0);
  });

  it('totalCogs aggregates the catalog', () => {
    const t = totalCogs(model);
    expect(t.materials).toBeCloseTo(800 + 900, 6);
    expect(t.labor).toBeCloseTo(550, 6);
    expect(t.overhead).toBeCloseTo(650, 6);
    expect(t.total).toBeCloseTo(2900, 6);
  });

  it('materialCostByMaterial attributes cost to each material (manufactured only)', () => {
    const byMat = materialCostByMaterial(model);
    expect(byMat.find((m) => m.code === 'CLAY')!.cost).toBeCloseTo(400, 6);  // 1000 × 0.8 × 0.5
    expect(byMat.find((m) => m.code === 'GLAZE')!.cost).toBeCloseTo(400, 6); // 1000 × 0.2 × 2.0
  });

  it('throws on a BOM line referencing an unknown material', () => {
    const broken = { ...bowl, bom: [{ materialCode: 'NOPE', quantityPerUnit: 1 }] };
    expect(() => materialUnitCost(broken, model.materials)).toThrow(/unknown material/);
  });
});
