// ============================================================
// SHARED NUMBER / CURRENCY FORMATTING
//
// Single source of truth for how money and ratios are rendered across the UI.
// Before this module each view rolled its own `formatNumber` / `formatCurrency`
// with subtly different rules (decimals, locale, 0 → '—'), and some used the
// `en-US` convention (1,234.56) while the rest used `de-DE` (1.234,56). That
// split shows up most visibly on the Reports screen users export.
//
// Convention: NUMBERS use `de-DE` (1.234,56 — the correct EUR/PT grouping).
// DATES are intentionally left to each call site as `en-US`, matching the
// English UI chrome (greetings, weekday names) — this module is numbers only.
//
// All monetary inputs are in FULL EUROS (not thousands) — see the note on
// `trialBalance.amountEUR` in the domain layer.
// ============================================================

export const LOCALE = 'de-DE';

/** Grouped number, e.g. 1234567.8 → "1.234.567,8". No currency symbol. */
export function formatNumber(value: number, decimals = 0): string {
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Full euro amount with the € prefix, e.g. 1234567 → "€1.234.567". */
export function formatCurrency(value: number, decimals = 0): string {
  const sign = value < 0 ? '-' : '';
  return `${sign}€${formatNumber(Math.abs(value), decimals)}`;
}

/**
 * Compact, adaptively-scaled euro amount for cards, chart axes and bar labels.
 * Input is full euros. Localized de-DE like the rest of this module: the mantissa
 * uses a comma decimal (52_240_382 → "€52,2M"), and `decimals` is honored in BOTH
 * the M and K bands (it was previously ignored in the K band and rendered en-US
 * dots — see PLAN A3 / finding L1). The base (<1,000) band shows whole euros.
 */
export function formatCompactEUR(value: number, decimals = 1): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${sign}€${formatNumber(abs / 1_000_000, decimals)}M`;
  if (abs >= 1_000) return `${sign}€${formatNumber(abs / 1_000, decimals)}K`;
  return `${sign}€${formatNumber(abs, 0)}`;
}

/** Percentage with a trailing %, e.g. 33.94 → "33,9%". Value is already a percent. */
export function formatPercent(value: number, decimals = 1): string {
  return `${formatNumber(value, decimals)}%`;
}
