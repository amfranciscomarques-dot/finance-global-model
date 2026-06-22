// ============================================================
// OPERATIONS DOMAIN — types
//
// A plain, in-memory mirror of the operational catalog (products, raw
// materials, bill-of-materials, sales mix) for one entity. The pure costing /
// revenue / roll-up functions operate on an `OperationalModel`; the API route
// builds one from the Prisma tables and the company pack builds one from code.
// ============================================================

export type ProductType = 'manufactured' | 'merchandise';

export type Market = 'PT' | 'UE' | 'USA' | 'ROW';
export type Channel = 'Private_Label' | 'Hotelaria' | 'Retalho' | 'E_Commerce';

export interface OperationalMaterial {
  code: string;
  name: string;
  unit: string;
  unitCost: number; // purchase price per material unit
}

export interface BomLine {
  materialCode: string;
  quantityPerUnit: number; // material units consumed per product unit
}

export interface SalesMixLine {
  market: Market | string;
  channel: Channel | string;
  weight: number; // fraction of the product's volume; Σ per product = 1
}

export interface OperationalProduct {
  code: string;
  name: string;
  productType: ProductType;
  salesPricePerUnit: number; // PVU
  annualVolume: number;      // units / year
  laborCostPerUnit: number;  // MOD (manufactured)
  overheadPerUnit: number;   // GGF (manufactured)
  purchaseCostPerUnit: number; // PCU (merchandise)
  bom: BomLine[];            // empty for merchandise
  salesMix: SalesMixLine[];
}

export interface OperationalModel {
  entityCode: string;
  materials: OperationalMaterial[];
  products: OperationalProduct[];
}

// COA codes the operational roll-up drives on the manufacturing entity's
// trial balance. Costs are stored negative (engine convention).
export const OP_COA = {
  revenue: 'REV-001',       // Vendas (VN)
  cogsMaterials: 'COGS-001', // CMVMC — materials + merchandise purchase cost
  cogsLabor: 'COGS-002',     // Direct Labor (MOD)
  cogsOverhead: 'COGS-003',  // Manufacturing Overhead (GGF)
} as const;
