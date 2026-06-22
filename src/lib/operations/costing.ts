// ============================================================
// OPERATIONS DOMAIN — costing
//
// Per-unit and per-product cost math. Manufactured cost (CIP) = materials (MP,
// from the bill-of-materials) + direct labor (MOD) + manufacturing overhead
// (GGF). Merchandise has no BOM: its cost is the purchase cost per unit (PCU),
// classified entirely as materials/CMVMC.
// ============================================================

import type { OperationalMaterial, OperationalProduct, OperationalModel } from './types';

export interface CogsBreakdown {
  materials: number; // MP (manufactured) or PCU total (merchandise)
  labor: number;     // MOD
  overhead: number;  // GGF
  total: number;
}

function materialCostIndex(materials: OperationalMaterial[]): Map<string, number> {
  return new Map(materials.map((m) => [m.code, m.unitCost]));
}

/** Material (MP) cost of one product unit = Σ (quantityPerUnit × material unitCost). */
export function materialUnitCost(
  product: OperationalProduct,
  materials: OperationalMaterial[],
): number {
  if (product.productType === 'merchandise') return product.purchaseCostPerUnit;
  const costOf = materialCostIndex(materials);
  return product.bom.reduce((sum, line) => {
    const unitCost = costOf.get(line.materialCode);
    if (unitCost === undefined) {
      throw new Error(`BOM of '${product.code}' references unknown material '${line.materialCode}'`);
    }
    return sum + line.quantityPerUnit * unitCost;
  }, 0);
}

/** Full unit cost (CIP) = MP + MOD + GGF for manufactured; PCU for merchandise. */
export function productUnitCost(
  product: OperationalProduct,
  materials: OperationalMaterial[],
): number {
  if (product.productType === 'merchandise') return product.purchaseCostPerUnit;
  return materialUnitCost(product, materials) + product.laborCostPerUnit + product.overheadPerUnit;
}

/** Total COGS of a product (volume × unit cost), split into MP / MOD / GGF. */
export function productCogsBreakdown(
  product: OperationalProduct,
  materials: OperationalMaterial[],
): CogsBreakdown {
  const volume = product.annualVolume;
  if (product.productType === 'merchandise') {
    const materialsCost = volume * product.purchaseCostPerUnit;
    return { materials: materialsCost, labor: 0, overhead: 0, total: materialsCost };
  }
  const materialsCost = volume * materialUnitCost(product, materials);
  const labor = volume * product.laborCostPerUnit;
  const overhead = volume * product.overheadPerUnit;
  return { materials: materialsCost, labor, overhead, total: materialsCost + labor + overhead };
}

/** Group COGS across the whole catalog, split into MP / MOD / GGF. */
export function totalCogs(model: OperationalModel): CogsBreakdown {
  return model.products.reduce<CogsBreakdown>(
    (acc, p) => {
      const b = productCogsBreakdown(p, model.materials);
      acc.materials += b.materials;
      acc.labor += b.labor;
      acc.overhead += b.overhead;
      acc.total += b.total;
      return acc;
    },
    { materials: 0, labor: 0, overhead: 0, total: 0 },
  );
}

/** Cost contribution of each raw material across the whole catalog. */
export function materialCostByMaterial(
  model: OperationalModel,
): Array<{ code: string; name: string; cost: number; unit?: string; unitCost?: number }> {
  const totals = new Map<string, number>();
  const costOf = materialCostIndex(model.materials);
  for (const product of model.products) {
    if (product.productType !== 'manufactured') continue;
    for (const line of product.bom) {
      const unitCost = costOf.get(line.materialCode) ?? 0;
      const cost = product.annualVolume * line.quantityPerUnit * unitCost;
      totals.set(line.materialCode, (totals.get(line.materialCode) ?? 0) + cost);
    }
  }
  return model.materials.map((m) => ({
    code: m.code,
    name: m.name,
    cost: totals.get(m.code) ?? 0,
    unit: m.unit,
    unitCost: m.unitCost
  }));
}
