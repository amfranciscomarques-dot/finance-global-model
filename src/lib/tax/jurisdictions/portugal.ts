// ============================================================
// PORTUGAL — corporate income tax provider (IRC)
//
// The parameters live in PT_TAX_CONFIG (public CIRC / OE rates) and the chain
// is computed by computeTax. Override PT_TAX_CONFIG to model policy changes.
//
// IRC chain: coleta → ICE → SIFIDE → RFAI (capped) → + derramas + trib. autónoma
// ============================================================

import { TaxInput, TaxProvider, TaxResult, TaxBreakdownLine } from '../types';

export interface PortugalTaxConfig {
  /** General IRC rate per year; falls back to ircGeneralRate. */
  ircRateByYear: Record<string, number>;
  ircGeneralRate: number;
  ircReducedRate: number;
  applyReducedRate: boolean;
  /** Taxable income threshold below which the reduced rate applies. */
  reducedRateThreshold: number;

  // Surcharges (derramas)
  derramaMunicipal: number;
  derramaEstadualRate: number;
  derramaEstadualThreshold: number;
  derramaEstadual2Rate: number;
  derramaEstadual2Threshold: number;
  derramaEstadual3Rate: number;
  derramaEstadual3Threshold: number;

  // Credits / benefits
  rfaiLimitPctColeta: number;
  autonomousTaxRate: number;

  /**
   * Max fraction of taxable profit (lucro tributável) that carried-forward
   * losses may shelter in a single year. PT statutory rule is 70% (art.º 52.º
   * CIRC), so a profit year with a loss pool always leaves ≥30% taxable. Set to
   * 1 to allow full offset.
   */
  nolDeductionCapPct: number;
}

// Public Portuguese corporate-tax parameters (CIRC + annual State Budget).
export const PT_TAX_CONFIG: PortugalTaxConfig = {
  ircRateByYear: {
    '2024': 0.21,
    '2025': 0.20,
    '2026': 0.19,
    '2027': 0.18,
    '2028': 0.17,
  },
  ircGeneralRate: 0.20,
  // SME (PME) reduced rate on the first €50,000 of taxable income — 2024 statutory
  // rate is 17%. Kept OPT-IN (applyReducedRate: false) because the engine cannot
  // classify an entity as PME/non-PME; callers that know the entity qualifies pass
  // applyReducedRate via a custom config (see createPortugalProvider).
  ircReducedRate: 0.17,
  applyReducedRate: false,
  reducedRateThreshold: 50000,

  derramaMunicipal: 0.015,
  derramaEstadualRate: 0.03,
  derramaEstadualThreshold: 1_500_000,
  derramaEstadual2Rate: 0.05,
  derramaEstadual2Threshold: 7_500_000,
  derramaEstadual3Rate: 0.09,
  derramaEstadual3Threshold: 35_000_000,

  rfaiLimitPctColeta: 0.5,
  autonomousTaxRate: 0.1,

  nolDeductionCapPct: 0.7,
};

/**
 * Resolve the statutory IRC rate for a year by clamping FORWARD to the nearest
 * scheduled year ≤ the requested year. A future year beyond the table (e.g. 2030)
 * uses the last scheduled rate (2028 → 17%) rather than silently dropping to the
 * generic fallback; only years BEFORE the table fall back to ircGeneralRate.
 */
function ircRateForYear(c: PortugalTaxConfig, year: number): number {
  const scheduled = Object.keys(c.ircRateByYear)
    .map(Number)
    .filter((y) => y <= year)
    .sort((a, b) => b - a);
  return scheduled.length > 0 ? c.ircRateByYear[String(scheduled[0])] : c.ircGeneralRate;
}

/** Progressive Derrama Estadual on taxable income above thresholds. */
function derramaEstadual(taxableIncome: number, c: PortugalTaxConfig): number {
  if (taxableIncome <= c.derramaEstadualThreshold) return 0;
  let tax = 0;
  // Tier 1: between threshold and tier-2 threshold
  const tier1Upper = Math.min(taxableIncome, c.derramaEstadual2Threshold);
  tax += (tier1Upper - c.derramaEstadualThreshold) * c.derramaEstadualRate;
  // Tier 2
  if (taxableIncome > c.derramaEstadual2Threshold) {
    const tier2Upper = Math.min(taxableIncome, c.derramaEstadual3Threshold);
    tax += (tier2Upper - c.derramaEstadual2Threshold) * c.derramaEstadual2Rate;
  }
  // Tier 3
  if (taxableIncome > c.derramaEstadual3Threshold) {
    tax += (taxableIncome - c.derramaEstadual3Threshold) * c.derramaEstadual3Rate;
  }
  return tax;
}

export function createPortugalProvider(config: PortugalTaxConfig = PT_TAX_CONFIG): TaxProvider {
  return {
    countryCode: 'PT',
    name: 'Portugal - IRC (SNC)',
    computeTax(input: TaxInput): TaxResult {
      const c = config;
      const breakdown: TaxBreakdownLine[] = [];

      // Lucro tributável (taxable profit before loss deduction). A negative
      // result is a fiscal loss: it carries forward instead of vanishing.
      const lucroTributavel = Math.max(0, input.taxableIncome - (input.deductions ?? 0));
      const newLoss = Math.max(0, (input.deductions ?? 0) - input.taxableIncome);

      // Deduct carried-forward losses, capped at nolDeductionCapPct of the profit
      // (PT art.º 52.º: 70%). The remainder is the matéria coletável that IRC
      // actually taxes; derramas below stay on the full lucro tributável.
      const nolOpening = input.nolOpening ?? 0;
      const nolUsed = Math.min(nolOpening, lucroTributavel * c.nolDeductionCapPct);
      const materiaColetavel = lucroTributavel - nolUsed;
      const nolClosing = nolOpening - nolUsed + newLoss;

      // 1) Statutory rate for the year (clamped forward to the schedule)
      const baseRate = ircRateForYear(c, input.year);

      // 2) Coleta (gross IRC) on matéria coletável. Optional reduced rate on first tranche.
      let grossTax: number;
      if (c.applyReducedRate && materiaColetavel > 0) {
        const reducedPart = Math.min(materiaColetavel, c.reducedRateThreshold);
        const generalPart = Math.max(0, materiaColetavel - c.reducedRateThreshold);
        grossTax = reducedPart * c.ircReducedRate + generalPart * baseRate;
      } else {
        grossTax = materiaColetavel * baseRate;
      }
      breakdown.push({ label: `Coleta IRC (${(baseRate * 100).toFixed(0)}%)`, amount: grossTax });

      // 3) Credits applied against coleta: ICE, SIFIDE, then RFAI (capped at 50% of coleta).
      const ice = input.iceCredit ?? 0;
      const sifide = input.sifideCredit ?? 0;
      let coletaAfter = Math.max(0, grossTax - ice - sifide);
      if (ice) breakdown.push({ label: 'Crédito ICE', amount: -ice });
      if (sifide) breakdown.push({ label: 'Crédito SIFIDE II', amount: -sifide });

      // RFAI is capped at a fraction of the coleta each year. The pool is this
      // year's new credit PLUS any unused RFAI carried forward; whatever the cap
      // (or the remaining coleta) cannot absorb is NOT lost — it carries forward
      // again (art.º 23.º CFI, up to 10 years).
      const rfaiAvailable = (input.rfaiCredit ?? 0) + (input.rfaiOpening ?? 0);
      const rfaiCap = grossTax * c.rfaiLimitPctColeta;
      const rfaiApplied = Math.min(rfaiAvailable, rfaiCap, coletaAfter);
      const rfaiClosing = rfaiAvailable - rfaiApplied;
      coletaAfter = Math.max(0, coletaAfter - rfaiApplied);
      if (rfaiApplied) breakdown.push({ label: `Crédito RFAI (≤${(c.rfaiLimitPctColeta * 100).toFixed(0)}% coleta)`, amount: -rfaiApplied });

      const credits = ice + sifide + rfaiApplied;

      // 4) Surcharges (derramas) — levied on lucro tributável (before loss
      // deduction and credits, hence not reduced by the NOL above).
      const derramaMun = lucroTributavel * c.derramaMunicipal;
      const derramaEst = derramaEstadual(lucroTributavel, c);
      const surcharges = derramaMun + derramaEst;
      breakdown.push({ label: `Derrama Municipal (${(c.derramaMunicipal * 100).toFixed(1)}%)`, amount: derramaMun });
      if (derramaEst > 0) breakdown.push({ label: 'Derrama Estadual (escalões)', amount: derramaEst });

      // 5) Autonomous taxation (tributação autónoma)
      const autonomousTax = (input.autonomousTaxBase ?? 0) * c.autonomousTaxRate;
      if (autonomousTax) breakdown.push({ label: `Tributação Autónoma (${(c.autonomousTaxRate * 100).toFixed(0)}%)`, amount: autonomousTax });

      const totalTax = coletaAfter + surcharges + autonomousTax;
      const effectiveRate = lucroTributavel > 0 ? totalTax / lucroTributavel : 0;

      return {
        jurisdiction: 'PT',
        year: input.year,
        taxableIncome: lucroTributavel,
        baseRate,
        grossTax,
        surcharges,
        credits,
        autonomousTax,
        totalTax,
        effectiveRate,
        nolUsed,
        nolClosing,
        rfaiUsed: rfaiApplied,
        rfaiClosing,
        breakdown,
      };
    },
  };
}

export const portugalProvider = createPortugalProvider();
