// ============================================================
// COMPANY PACKS — pluggable company data sets
//
// A company pack is everything needed to load one company group into the
// model: entities, opening trial balance (mapped onto the group COA),
// intercompany transactions, FX rates, scenarios and investment projects.
// The app core (engine, finance domain, routes, UI) is company-agnostic;
// packs are the only place company-specific data lives.
// ============================================================

import type { OperationalModel } from '@/lib/operations/types';

// Optional operational catalog for a manufacturing/trading entity. When
// present, the pack's buildTrialBalance drives the entity's REV-001/COGS-*
// lines bottom-up from this catalog (see src/lib/operations).
export type PackOperations = OperationalModel;

export interface PackEntity {
  code: string;
  legalName: string;
  countryCode: string;     // ISO-3166 alpha-2; selects the tax jurisdiction
  localCurrency: string;   // ISO-4217
  consolidationMethod: 'full' | 'proportional' | 'equity' | string;
  ownershipPercentage: number; // 0..1
  sector: string;
}

export interface PackTbRecord {
  entityCode: string;
  groupCOACode: string;
  amountLocal: number;     // full units of entity local currency
  currency: string;
  amountEUR?: number;      // optional override; otherwise converted via pack rates
  isIntercompany?: boolean;
  icPartnerCode?: string;  // partner entity code (resolved to id at seed time)
}

export interface PackICTransaction {
  from: string;            // entity code
  to: string;              // entity code
  type: 'sale' | 'purchase' | 'service' | 'loan' | 'dividend';
  amount: number;          // EUR
  ref: string;
}

export interface PackExchangeRate {
  currency: string;
  rateDate: string;        // YYYY-MM-DD
  rateType: 'closing' | 'average' | 'historical';
  rate: number;            // 1 EUR = X currency
  source: string;
}

export interface PackScenario {
  name: string;
  scenarioType: string;
  inflationRate: number;
  interestRate: number;
  fxVolatility: number;
  revenueGrowthFactor: number;
  opexGrowthFactor: number;
  capexGrowthFactor: number;
  description: string;
}

export interface PackProject {
  code: string;
  name: string;
  entityCode: string;
  countryCode: string;
  projectType: string;
  currency: string;
  status: string;
  startYear: number;
  horizonYears: number;
  capexTotal: number;
  debtAmount: number;
  debtRate: number;
  equityAmount: number;
  discountRate: number;
  terminalGrowth: number;
  taxRate: number;
  description: string;
  assumptions: {
    capexSchedule: Record<string, number>;
    netBenefitByYear: Record<string, number>;
    rfaiCredit?: number;
    residualValue?: number;
  };
}

export interface CompanyPack {
  id: string;              // registry key, e.g. 'template'
  name: string;
  description: string;
  period: string;          // YYYY-MM snapshot the trial balance represents
  sourceSystem: string;    // tag stored on trial-balance rows
  entities: PackEntity[];
  exchangeRates: PackExchangeRate[];
  scenarios: PackScenario[];
  buildTrialBalance: () => PackTbRecord[];
  icTransactions: PackICTransaction[];
  projects: PackProject[];
  // Operational catalogs keyed by owning entity code. The generic seeder loads
  // these into the Product/RawMaterial/BillOfMaterial/SalesMix tables.
  operations?: PackOperations[];
}
