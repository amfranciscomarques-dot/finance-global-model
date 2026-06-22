// ============================================================
// Flat-rate corporate tax providers (stubs for ES, US, ...)
//
// Placeholder jurisdictions modelled as a single effective rate.
// Replace with full chains (like portugal.ts) when those markets
// need detailed modelling. Rates are easy to override per call site.
// ============================================================

import { TaxInput, TaxProvider, TaxResult } from '../types';

export function createFlatRateProvider(
  countryCode: string,
  name: string,
  rate: number,
): TaxProvider {
  return {
    countryCode,
    name,
    computeTax(input: TaxInput): TaxResult {
      const taxable = Math.max(0, input.taxableIncome - (input.deductions ?? 0));
      const newLoss = Math.max(0, (input.deductions ?? 0) - input.taxableIncome);

      // Carried-forward losses fully offset the profit (no jurisdiction cap
      // modelled in this stub); a loss year adds to the pool instead of vanishing.
      const nolOpening = input.nolOpening ?? 0;
      const nolUsed = Math.min(nolOpening, taxable);
      const taxBase = taxable - nolUsed;
      const nolClosing = nolOpening - nolUsed + newLoss;

      const grossTax = taxBase * rate;

      // Non-RFAI credits apply first (no carryforward modelled in this stub),
      // then RFAI from its available pool (this year + carried forward). Any RFAI
      // the gross tax cannot absorb carries forward rather than being lost.
      const otherCredits = (input.iceCredit ?? 0) + (input.sifideCredit ?? 0);
      const taxAfterOther = Math.max(0, grossTax - otherCredits);
      const rfaiAvailable = (input.rfaiCredit ?? 0) + (input.rfaiOpening ?? 0);
      const rfaiUsed = Math.min(rfaiAvailable, taxAfterOther);
      const rfaiClosing = rfaiAvailable - rfaiUsed;
      const credits = Math.min(otherCredits, grossTax) + rfaiUsed;
      const totalTax = taxAfterOther - rfaiUsed;
      return {
        jurisdiction: countryCode,
        year: input.year,
        taxableIncome: taxable,
        baseRate: rate,
        grossTax,
        surcharges: 0,
        credits,
        autonomousTax: 0,
        totalTax,
        effectiveRate: taxable > 0 ? totalTax / taxable : 0,
        nolUsed,
        nolClosing,
        rfaiUsed,
        rfaiClosing,
        breakdown: [
          { label: `Corporate tax (${(rate * 100).toFixed(1)}%)`, amount: grossTax },
          ...(credits ? [{ label: 'Credits', amount: -credits }] : []),
        ],
      };
    },
  };
}

// Spain — Impuesto sobre Sociedades (general 25%).
export const spainProvider = createFlatRateProvider('ES', 'Spain - Impuesto sobre Sociedades', 0.25);

// United States - federal corporate income tax 21% (state taxes excluded in this stub).
export const usaProvider = createFlatRateProvider('US', 'United States - Federal CIT', 0.21);
