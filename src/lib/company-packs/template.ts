import { EXCHANGE_RATES, SCENARIOS } from '@/lib/coa-data';
import { toTbLines } from '@/lib/operations/rollup';
import type { OperationalModel, OperationalProduct, SalesMixLine } from '@/lib/operations/types';
import type { CompanyPack, PackTbRecord } from './types';

// ============================================================
// MERIDIAN GROUP — the reference company pack (fictional demo data).
//
// Everything here is INVENTED. No real company, and no confidential data, is
// used. The numbers are deliberately round so the model is easy to follow and
// every figure is defensible from first principles. They are also internally
// consistent: each entity's balance sheet reconciles to the cent
// (assets = liabilities + equity), and the group P&L/EBITDA tie to the sum of
// the standalone entities after the intercompany elimination.
//
// The group is a small multinational manufacturer:
//   MERID  — Meridian Components, S.A.      (PT, EUR) — parent / operating co.
//   MSUB   — Meridian Subcontracting, S.A.  (PT, EUR) — sells subcontracting +
//                                            personnel to the parent (eliminated)
//   MESP   — Meridian España, S.L.          (ES, EUR) — created empty (no 2024 history)
//   MUSA   — Meridian USA, Inc.             (US, USD) — created empty (FX demo)
//
// To add your own company, copy this file, swap the numbers, and register the
// pack in ./index.ts. The app core never changes.
// ============================================================

export const TEMPLATE_PERIOD = '2024-12';

const ENTITIES: CompanyPack['entities'] = [
  { code: 'MERID', legalName: 'Meridian Components, S.A.', countryCode: 'PT', localCurrency: 'EUR', consolidationMethod: 'full', ownershipPercentage: 1.0, sector: 'Manufacturing' },
  { code: 'MSUB', legalName: 'Meridian Subcontracting, S.A.', countryCode: 'PT', localCurrency: 'EUR', consolidationMethod: 'full', ownershipPercentage: 1.0, sector: 'Manufacturing / Subcontracting' },
  { code: 'MESP', legalName: 'Meridian España, S.L.', countryCode: 'ES', localCurrency: 'EUR', consolidationMethod: 'full', ownershipPercentage: 1.0, sector: 'Retail' },
  { code: 'MUSA', legalName: 'Meridian USA, Inc.', countryCode: 'US', localCurrency: 'USD', consolidationMethod: 'full', ownershipPercentage: 1.0, sector: 'Retail' },
];

// ------------------------------------------------------------
// MERID — Meridian Components, S.A. (parent), 2024, full EUR.
// Income statement (costs negative):
//   EBITDA = revenue (REV-*) + COGS + OPEX + payroll = 5,000,000
//   EBT    = EBITDA + D&A + interest = 2,000,000
//   Net    = EBT + tax = 1,500,000
// Balance sheet: assets 44,000,000 = liabilities 27,500,000 + equity 16,500,000
//   (equity includes the 1,500,000 result for the year).
// ------------------------------------------------------------
// NOTE: REV-001 (turnover) and COGS-001/002/003 (cost of sales) are NOT listed
// here — they are computed bottom-up from MERID_OPERATIONS below and appended in
// buildTrialBalance(). The operational catalog is calibrated so they reproduce
// the former hard-coded totals (REV-001 40,000,000; COGS 16,000,000), so EBITDA,
// net income and the balance sheet are unchanged.
const MERID_2024: Array<[string, number]> = [
  // Income statement
  ['REV-008', 1_000_000],    // other operating income
  ['REV-010', 500_000],      // change in production inventories
  ['OPX-004', -8_000_000],   // external supplies & services (FSE)
  ['OPX-010', -500_000],     // other expenses & impairments
  ['PAY-001', -12_000_000],  // personnel costs
  ['DEP-002', -2_500_000],   // depreciation & amortisation
  ['INT-001', -600_000],     // financing costs
  ['INT-003', 100_000],      // financial income
  ['TAX-001', -500_000],     // corporate income tax (IRC + derrama, ~25% effective)

  // Balance sheet
  ['AST-005', 18_000_000],   // property, plant & equipment
  ['AST-006', 200_000],      // intangibles
  ['AST-007', 1_800_000],    // goodwill
  ['AST-003', 13_000_000],   // inventories
  ['AST-002', 9_000_000],    // trade receivables
  ['AST-004', 1_500_000],    // other current assets
  ['AST-001', 500_000],      // cash
  ['LIA-001', 4_000_000],    // trade payables
  ['LIA-007', 6_000_000],    // other current liabilities
  ['LIA-002', 5_500_000],    // current borrowings
  ['LIA-004', 12_000_000],   // non-current borrowings
  ['EQY-001', 5_000_000],    // share capital
  ['EQY-002', 11_500_000],   // reserves + retained earnings (incl. 1,500,000 result for 2024)

  // Cash flow (simplified indirect view; not part of the balance check)
  ['CFA-001', -1_000_000],   // change in working capital
  ['CFA-002', -3_000_000],   // capital expenditure
  ['CFA-003', 4_000_000],    // debt issuance
  ['CFA-004', 3_500_000],    // debt repayment (magnitude)
];

// ------------------------------------------------------------
// MSUB — Meridian Subcontracting, S.A., 2024, full EUR.
// Sells subcontracting (6,000,000) and personnel (1,500,000) to the parent.
// Both revenue streams are intercompany and eliminate on consolidation.
//   EBITDA 600,000 · EBT 350,000 · Net 250,000
// Minimal balanced placeholder balance sheet (assets 750,000 = equity 750,000).
// ------------------------------------------------------------
const MSUB_2024: Array<[string, number, boolean?]> = [
  ['REV-009', 6_000_000, true],  // subcontracting sold to MERID (IC)
  ['REV-009', 1_500_000, true],  // personnel hired out to MERID (IC, pass-through)
  ['COGS-001', -5_400_000],      // operating costs
  ['PAY-001', -1_500_000],       // personnel cost (pass-through)
  ['DEP-002', -300_000],         // depreciation
  ['INT-003', 50_000],           // financial income
  ['TAX-001', -100_000],         // corporate income tax
  // Minimal balanced placeholder balance sheet
  ['AST-001', 750_000],          // cash
  ['EQY-001', 500_000],          // share capital
  ['EQY-002', 250_000],          // result for the year (250,000)
];

// ------------------------------------------------------------
// MERID operational catalog — bottom-up driver for REV-001 / COGS-*.
//
// Ceramic-tableware maker: five manufactured families + two merchandise
// (resale) families, sold across four markets and four channels. Numbers are
// invented but calibrated so the catalog reproduces MERID's former turnover and
// cost of sales to the cent:
//   Revenue  = Σ volume × PVU                     = 40,000,000  → REV-001
//   COGS     = Σ volume × (MP + MOD + GGF | PCU)  = 16,000,000  → COGS-001/002/003
//     - materials (MP/CMVMC, COGS-001):  8,170,000
//     - direct labor (MOD, COGS-002):    3,610,000
//     - overhead    (GGF, COGS-003):     4,220,000
// To add products/materials, extend these arrays — the roll-up is fully driven
// by the data, not by the five families.
// ------------------------------------------------------------
const MERID_MATERIALS: OperationalModel['materials'] = [
  { code: 'PASTA_GRES', name: 'Pasta cerâmica grés', unit: 'kg', unitCost: 0.50 },
  { code: 'VIDRADOS', name: 'Vidrados e esmaltes', unit: 'kg', unitCost: 2.00 },
  { code: 'EMBALAGEM', name: 'Cartão e embalagens', unit: 'un', unitCost: 0.20 },
  { code: 'GESSO', name: 'Gesso para moldes', unit: 'kg', unitCost: 1.00 },
  { code: 'TINTA_DEC', name: 'Tinta de decoração', unit: 'kg', unitCost: 4.00 },
];

// Shared channel split (fractions, Σ = 1). Per-product market split varies.
const DEFAULT_CHANNELS: Record<string, number> = {
  Private_Label: 0.35,
  Hotelaria: 0.30,
  Retalho: 0.25,
  E_Commerce: 0.10,
};

function expandMix(
  marketMix: Record<string, number>,
  channelMix: Record<string, number> = DEFAULT_CHANNELS,
): SalesMixLine[] {
  const rows: SalesMixLine[] = [];
  for (const [market, mw] of Object.entries(marketMix)) {
    for (const [channel, cw] of Object.entries(channelMix)) {
      rows.push({ market, channel, weight: round4(mw * cw) });
    }
  }
  return rows;
}

const MERID_PRODUCTS: OperationalProduct[] = [
  {
    code: 'PRATOS', name: 'Pratos', productType: 'manufactured',
    salesPricePerUnit: 7.00, annualVolume: 2_000_000,
    laborCostPerUnit: 0.80, overheadPerUnit: 0.90, purchaseCostPerUnit: 0,
    bom: [
      { materialCode: 'PASTA_GRES', quantityPerUnit: 1.00 },
      { materialCode: 'VIDRADOS', quantityPerUnit: 0.20 },
      { materialCode: 'EMBALAGEM', quantityPerUnit: 0.50 },
      { materialCode: 'GESSO', quantityPerUnit: 0.10 },
    ],
    salesMix: expandMix({ PT: 0.20, UE: 0.35, USA: 0.35, ROW: 0.10 }),
  },
  {
    code: 'TIGELAS', name: 'Tigelas', productType: 'manufactured',
    salesPricePerUnit: 5.00, annualVolume: 1_600_000,
    laborCostPerUnit: 0.55, overheadPerUnit: 0.65, purchaseCostPerUnit: 0,
    bom: [
      { materialCode: 'PASTA_GRES', quantityPerUnit: 0.80 },
      { materialCode: 'VIDRADOS', quantityPerUnit: 0.10 },
      { materialCode: 'EMBALAGEM', quantityPerUnit: 0.50 },
      { materialCode: 'GESSO', quantityPerUnit: 0.10 },
    ],
    salesMix: expandMix({ PT: 0.25, UE: 0.35, USA: 0.30, ROW: 0.10 }),
  },
  {
    code: 'CANECAS', name: 'Canecas', productType: 'manufactured',
    salesPricePerUnit: 4.50, annualVolume: 1_000_000,
    laborCostPerUnit: 0.50, overheadPerUnit: 0.65, purchaseCostPerUnit: 0,
    bom: [
      { materialCode: 'PASTA_GRES', quantityPerUnit: 0.70 },
      { materialCode: 'VIDRADOS', quantityPerUnit: 0.10 },
      { materialCode: 'EMBALAGEM', quantityPerUnit: 0.50 },
      { materialCode: 'TINTA_DEC', quantityPerUnit: 0.025 },
    ],
    salesMix: expandMix({ PT: 0.30, UE: 0.30, USA: 0.30, ROW: 0.10 }),
  },
  {
    code: 'PECAS_SERVIR', name: 'Peças de Servir', productType: 'manufactured',
    salesPricePerUnit: 7.00, annualVolume: 700_000,
    laborCostPerUnit: 0.60, overheadPerUnit: 0.70, purchaseCostPerUnit: 0,
    bom: [
      { materialCode: 'PASTA_GRES', quantityPerUnit: 0.60 },
      { materialCode: 'VIDRADOS', quantityPerUnit: 0.10 },
      { materialCode: 'EMBALAGEM', quantityPerUnit: 0.50 },
      { materialCode: 'GESSO', quantityPerUnit: 0.10 },
    ],
    salesMix: expandMix({ PT: 0.20, UE: 0.40, USA: 0.30, ROW: 0.10 }),
  },
  {
    code: 'FORNO_COZINHA', name: 'Forno & Cozinha', productType: 'manufactured',
    salesPricePerUnit: 5.50, annualVolume: 600_000,
    laborCostPerUnit: 0.35, overheadPerUnit: 0.40, purchaseCostPerUnit: 0,
    bom: [
      { materialCode: 'PASTA_GRES', quantityPerUnit: 0.40 },
      { materialCode: 'VIDRADOS', quantityPerUnit: 0.05 },
      { materialCode: 'EMBALAGEM', quantityPerUnit: 0.50 },
      { materialCode: 'GESSO', quantityPerUnit: 0.05 },
    ],
    salesMix: expandMix({ PT: 0.30, UE: 0.30, USA: 0.30, ROW: 0.10 }),
  },
  {
    code: 'CUTELARIA', name: 'Cutelaria (revenda)', productType: 'merchandise',
    salesPricePerUnit: 15.00, annualVolume: 220_000,
    laborCostPerUnit: 0, overheadPerUnit: 0, purchaseCostPerUnit: 9.00,
    bom: [],
    salesMix: expandMix({ PT: 0.40, UE: 0.30, USA: 0.20, ROW: 0.10 }),
  },
  {
    code: 'VIDROS_CRISTAIS', name: 'Vidros & Cristais (revenda)', productType: 'merchandise',
    salesPricePerUnit: 5.00, annualVolume: 400_000,
    laborCostPerUnit: 0, overheadPerUnit: 0, purchaseCostPerUnit: 3.00,
    bom: [],
    salesMix: expandMix({ PT: 0.35, UE: 0.35, USA: 0.20, ROW: 0.10 }),
  },
];

const MERID_OPERATIONS: OperationalModel = {
  entityCode: 'MERID',
  materials: MERID_MATERIALS,
  products: MERID_PRODUCTS,
};

function buildTrialBalance(): PackTbRecord[] {
  const records: PackTbRecord[] = [];

  for (const [code, amount] of MERID_2024) {
    records.push({ entityCode: 'MERID', groupCOACode: code, amountLocal: round2(amount), currency: 'EUR' });
  }

  // REV-001 / COGS-001/002/003 for MERID, computed bottom-up from the catalog.
  for (const line of toTbLines(MERID_OPERATIONS)) {
    records.push({ entityCode: 'MERID', groupCOACode: line.groupCOACode, amountLocal: line.amount, currency: 'EUR' });
  }

  for (const [code, amount, ic] of MSUB_2024) {
    records.push({
      entityCode: 'MSUB',
      groupCOACode: code,
      amountLocal: round2(amount),
      currency: 'EUR',
      isIntercompany: ic ?? false,
      icPartnerCode: ic ? 'MERID' : undefined,
    });
  }

  // MESP (Spain) and MUSA (USA) are created empty — no 2024 history.
  return records;
}

// ------------------------------------------------------------
// Intercompany transactions: MSUB → MERID (subcontracting + personnel).
// Removed from group revenue and matching cost on consolidation (net-zero EBITDA).
// ------------------------------------------------------------
const IC_TRANSACTIONS: CompanyPack['icTransactions'] = [
  { from: 'MSUB', to: 'MERID', type: 'service', amount: 6_000_000, ref: 'IC-MSUB-MERID-SUBCONTRACT-2024' },
  { from: 'MSUB', to: 'MERID', type: 'service', amount: 1_500_000, ref: 'IC-MSUB-MERID-PERSONNEL-2024' },
];

// ------------------------------------------------------------
// Automation & Logistics Hub — an investment project for the appraisal module
// (NPV / IRR / discounted payback). Showcases the PT RFAI tax incentive.
// CAPEX 6,000,000 over 2025–2027, 67% debt-financed, 10-year horizon.
// ------------------------------------------------------------
const HUB_PROJECT: CompanyPack['projects'][number] = {
  code: 'PRJ-HUB',
  name: 'Automation & Logistics Hub',
  entityCode: 'MERID',
  countryCode: 'PT',
  projectType: 'logistics_hub',
  currency: 'EUR',
  status: 'appraisal',
  startYear: 2026,
  horizonYears: 10, // 2026–2035
  capexTotal: 6_000_000,
  debtAmount: 4_000_000,
  debtRate: 0.04,
  equityAmount: 2_000_000,
  discountRate: 0.065, // nominal WACC
  terminalGrowth: 0.02,
  taxRate: 0.235, // 20% IRC + 2% derrama estadual + 1.5% derrama municipal
  description:
    'Warehouse automation (AS/RS, AMRs, WMS) plus a 200 kWp rooftop solar plant. CAPEX 6,000,000 over 2025–2027, 4,000,000 debt-financed (67%), RFAI tax credit ~1,200,000. Horizon 2026–2035, residual value 1,500,000.',
  assumptions: {
    capexSchedule: { '2025': 2_500_000, '2026': 3_000_000, '2027': 500_000 },
    // Net annual benefit (savings + commercial margin − incremental opex), full EUR
    netBenefitByYear: {
      '2026': 500_000,
      '2027': 650_000,
      '2028': 800_000,
      '2029': 900_000,
      '2030': 950_000,
      '2031': 1_000_000,
      '2032': 1_000_000,
      '2033': 1_050_000,
      '2034': 1_050_000,
      '2035': 1_100_000,
    },
    rfaiCredit: 1_200_000,
    residualValue: 1_500_000,
  },
};

export const templatePack: CompanyPack = {
  id: 'template',
  name: 'Meridian Group',
  description:
    'Meridian Group — fictional demo: Meridian Components (PT) with Meridian Subcontracting (PT), Meridian España (ES, empty) and Meridian USA (US/USD, empty). All data is invented; balance sheets reconcile exactly and group totals tie to the standalone entities.',
  period: TEMPLATE_PERIOD,
  sourceSystem: 'demo',
  entities: ENTITIES,
  exchangeRates: EXCHANGE_RATES as CompanyPack['exchangeRates'],
  scenarios: SCENARIOS,
  buildTrialBalance,
  icTransactions: IC_TRANSACTIONS,
  projects: [HUB_PROJECT],
  operations: [MERID_OPERATIONS],
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
