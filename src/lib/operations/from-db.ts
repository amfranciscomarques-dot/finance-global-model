// ============================================================
// OPERATIONS DOMAIN — load an OperationalModel from Prisma
//
// Reconstructs the in-memory catalog (the same shape the company pack builds in
// code) from the Product / RawMaterial / BillOfMaterial / SalesMix tables, so
// the pure costing / revenue / roll-up functions can run over live data.
// ============================================================

import type { PrismaClient } from '@prisma/client';
import type { OperationalModel, ProductType } from './types';

export async function loadOperationalModel(
  db: PrismaClient,
  entityCode: string,
): Promise<OperationalModel | null> {
  const [materials, products] = await Promise.all([
    db.rawMaterial.findMany({ where: { entityCode }, orderBy: { sortOrder: 'asc' } }),
    db.product.findMany({
      where: { entityCode },
      orderBy: { sortOrder: 'asc' },
      include: { bom: { include: { rawMaterial: true } }, salesMix: true },
    }),
  ]);

  if (materials.length === 0 && products.length === 0) return null;

  return {
    entityCode,
    materials: materials.map((m) => ({
      code: m.code,
      name: m.name,
      unit: m.unit,
      unitCost: m.unitCost,
    })),
    products: products.map((p) => ({
      code: p.code,
      name: p.name,
      productType: p.productType as ProductType,
      salesPricePerUnit: p.salesPricePerUnit,
      annualVolume: p.annualVolume,
      laborCostPerUnit: p.laborCostPerUnit,
      overheadPerUnit: p.overheadPerUnit,
      purchaseCostPerUnit: p.purchaseCostPerUnit,
      bom: p.bom.map((b) => ({
        materialCode: b.rawMaterial.code,
        quantityPerUnit: b.quantityPerUnit,
      })),
      salesMix: p.salesMix.map((s) => ({
        market: s.market,
        channel: s.channel,
        weight: s.weight,
      })),
    })),
  };
}

/** Entity codes that own an operational catalog (have any product rows). */
export async function listOperationalEntityCodes(db: PrismaClient): Promise<string[]> {
  const rows = await db.product.findMany({
    distinct: ['entityCode'],
    select: { entityCode: true },
    orderBy: { entityCode: 'asc' },
  });
  return rows.map((r) => r.entityCode);
}
