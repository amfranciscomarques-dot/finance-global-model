// ============================================================
// TAX MODULE — types
// Pluggable, multi-jurisdiction corporate income tax engine.
// Each jurisdiction (PT, ES, US, ...) implements TaxProvider.
// Amounts are in the entity's own currency units (no scaling).
// ============================================================

export interface TaxInput {
  /** Taxable income / lucro tributável (RAI adjusted). */
  taxableIncome: number;
  /** Fiscal year, e.g. 2024. Used for year-specific rates. */
  year: number;

  // --- Optional jurisdiction-specific credits / adjustments ---
  /** ICE (research) credit available this year. */
  iceCredit?: number;
  /** SIFIDE II R&D credit available this year. */
  sifideCredit?: number;
  /** RFAI investment credit available this year (pre-cap). */
  rfaiCredit?: number;
  /** Autonomous taxation base (tributação autónoma). */
  autonomousTaxBase?: number;
  /** Extra deductions to taxable income. */
  deductions?: number;
}

export interface TaxBreakdownLine {
  label: string;
  amount: number;
}

export interface TaxResult {
  jurisdiction: string;
  year: number;
  taxableIncome: number;
  /** Headline statutory rate applied. */
  baseRate: number;
  /** Gross tax on taxable income (coleta). */
  grossTax: number;
  /** Municipal + state surcharges (derramas) and similar. */
  surcharges: number;
  /** Sum of credits applied (positive number; reduces tax). */
  credits: number;
  /** Autonomous taxation (tributação autónoma). */
  autonomousTax: number;
  /** Final tax payable. */
  totalTax: number;
  /** totalTax / taxableIncome. */
  effectiveRate: number;
  breakdown: TaxBreakdownLine[];
}

export interface TaxProvider {
  countryCode: string;
  name: string;
  computeTax(input: TaxInput): TaxResult;
}
