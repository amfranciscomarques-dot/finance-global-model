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
      const grossTax = taxable * rate;
      const credits = (input.iceCredit ?? 0) + (input.sifideCredit ?? 0) + (input.rfaiCredit ?? 0);
      const totalTax = Math.max(0, grossTax - credits);
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
