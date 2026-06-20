// ============================================================
// TAX MODULE — jurisdiction registry
//
// getTaxProvider('PT') → Portugal IRC chain
// getTaxProvider('ES') → Spain flat rate
// getTaxProvider('US') → US federal flat rate
// Unknown codes fall back to a 0% provider (no tax modelled yet).
// ============================================================

import { TaxProvider } from './types';
import { portugalProvider } from './jurisdictions/portugal';
import { spainProvider, usaProvider, createFlatRateProvider } from './jurisdictions/flat-rate';

export * from './types';
export { portugalProvider, PT_TAX_CONFIG, createPortugalProvider } from './jurisdictions/portugal';
export { spainProvider, usaProvider, createFlatRateProvider } from './jurisdictions/flat-rate';

const registry = new Map<string, TaxProvider>([
  [portugalProvider.countryCode, portugalProvider],
  [spainProvider.countryCode, spainProvider],
  [usaProvider.countryCode, usaProvider],
]);

/** Register or override a jurisdiction provider at runtime. */
export function registerTaxProvider(provider: TaxProvider): void {
  registry.set(provider.countryCode.toUpperCase(), provider);
}

/** Returns the provider for a country code, or a 0% fallback if unmodelled. */
export function getTaxProvider(countryCode: string): TaxProvider {
  return registry.get(countryCode.toUpperCase())
    ?? createFlatRateProvider(countryCode.toUpperCase(), `${countryCode} — unmodelled`, 0);
}

/** List all registered jurisdictions (for UI/compliance views). */
export function listTaxJurisdictions(): TaxProvider[] {
  return Array.from(registry.values());
}
