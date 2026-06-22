// ============================================================
// OPERATIONS DOMAIN — roll-up
//
// Assembles the operational statement consumed by the API/UI, and projects the
// catalog onto the manufacturing entity's trial-balance REV/COGS lines
// (`toTbLines`). The latter is what makes this a bottom-up *driver*: the seeder
// concatenates these lines so the entity's revenue and cost of sales are
// computed from the catalog rather than hard-coded.
// ============================================================

import type { OperationalModel, OperationalProduct } from './types';
import { OP_COA } from './types';
import {
  materialUnitCost,
  productUnitCost,
  productCogsBreakdown,
  totalCogs,
  materialCostByMaterial,
} from './costing';
import {
  productRevenue,
  totalRevenue,
  revenueByMarket,
  revenueByChannel,
  allocate,
} from './revenue';

export interface ProductLine {
  code: string;
  name: string;
  productType: OperationalProduct['productType'];
  volume: number;
  pricePerUnit: number;
  unitCost: number;       // CIP
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMarginPct: number; // 0..1
}

export interface OperationalStatement {
  entityCode: string;
  revenueTotal: number;
  cogs: { materials: number; labor: number; overhead: number; total: number };
  grossProfit: number;
  grossMarginPct: number;
  byProduct: ProductLine[];
  byMaterial: Array<{ code: string; name: string; cost: number; unit?: string; unitCost?: number }>;
  byMarket: Array<{ market: string; revenue: number; volume: number }>;
  byChannel: Array<{ channel: string; revenue: number; volume: number }>;
  allocations: Array<{ productCode: string; productName: string; market: string; channel: string; revenue: number; volume: number }>;
}

export function buildOperationalStatement(model: OperationalModel): OperationalStatement {
  const revenueTotal = totalRevenue(model);
  const cogs = totalCogs(model);
  const grossProfit = revenueTotal - cogs.total;

  const byProduct: ProductLine[] = model.products.map((p) => {
    const revenue = productRevenue(p);
    const unitCost = productUnitCost(p, model.materials);
    const cogsTotal = productCogsBreakdown(p, model.materials).total;
    const gp = revenue - cogsTotal;
    return {
      code: p.code,
      name: p.name,
      productType: p.productType,
      volume: p.annualVolume,
      pricePerUnit: p.salesPricePerUnit,
      unitCost,
      revenue,
      cogs: cogsTotal,
      grossProfit: gp,
      grossMarginPct: revenue !== 0 ? gp / revenue : 0,
    };
  });

  return {
    entityCode: model.entityCode,
    revenueTotal,
    cogs,
    grossProfit,
    grossMarginPct: revenueTotal !== 0 ? grossProfit / revenueTotal : 0,
    byProduct,
    byMaterial: materialCostByMaterial(model),
    byMarket: revenueByMarket(model),
    byChannel: revenueByChannel(model),
    allocations: allocate(model),
  };
}

export interface TbLine {
  groupCOACode: string;
  amount: number; // revenue positive, costs negative
}

/**
 * Project the catalog onto trial-balance lines for the manufacturing entity.
 * Revenue (REV-001) positive; the three COGS buckets negative.
 */
export function toTbLines(model: OperationalModel): TbLine[] {
  const revenue = totalRevenue(model);
  const cogs = totalCogs(model);
  return [
    { groupCOACode: OP_COA.revenue, amount: round2(revenue) },
    { groupCOACode: OP_COA.cogsMaterials, amount: round2(-cogs.materials) },
    { groupCOACode: OP_COA.cogsLabor, amount: round2(-cogs.labor) },
    { groupCOACode: OP_COA.cogsOverhead, amount: round2(-cogs.overhead) },
  ];
}

// Surface the unit material cost helper for callers that want a per-unit MP.
export { materialUnitCost };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
