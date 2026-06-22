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
  /**
   * Net operating loss (prejuízo fiscal) carried FORWARD from prior years, as a
   * positive pool. A profit year consumes it (subject to the jurisdiction cap)
   * before tax is assessed; a loss year adds to it. Omit/0 for the first year.
   */
  nolOpening?: number;
  /**
   * RFAI investment credit carried FORWARD from prior years (positive pool). PT
   * caps the RFAI deduction at a fraction of the coleta each year; the excess is
   * not lost but carries forward (up to 10 years under art.º 23.º CFI). Added to
   * this year's `rfaiCredit` to form the available pool. Omit/0 for the first year.
   */
  rfaiOpening?: number;
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
  /**
   * Prior-year losses actually deducted this year (positive; ≤ nolOpening and
   * ≤ the jurisdiction's deductible cap). 0 in loss years or with no pool.
   */
  nolUsed: number;
  /**
   * Loss pool carried FORWARD to next year: nolOpening − nolUsed + (this year's
   * new loss, if any). Feed back as the next year's nolOpening to chain years.
   */
  nolClosing: number;
  /**
   * RFAI credit actually deducted this year (positive; ≤ the available pool and
   * ≤ the jurisdiction cap on coleta). Included in `credits`.
   */
  rfaiUsed: number;
  /**
   * RFAI credit carried FORWARD to next year: (rfaiOpening + this year's
   * rfaiCredit) − rfaiUsed. Feed back as the next year's rfaiOpening to chain.
   */
  rfaiClosing: number;
  breakdown: TaxBreakdownLine[];
}

export interface TaxProvider {
  countryCode: string;
  name: string;
  computeTax(input: TaxInput): TaxResult;
}
