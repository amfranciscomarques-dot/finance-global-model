// ============================================================
// FINANCE DOMAIN — money rounding (LOW.3)
//
// A single source of truth for cent-level rounding. Applying round2 at the
// driver-computation seams in the projection kernel prevents float errors from
// compounding across periods in multi-year / Monte-Carlo runs. The public API
// surface (IncomeStatementData etc.) stays as plain `number` (EUR, 2dp).
// ============================================================

/**
 * Round a EUR amount to the nearest cent using half-up-away-from-zero rounding
 * (the financial standard: 0.5 rounds away, not toward +∞).
 *
 * Apply at each period's driver-computed lines (revenue, COGS, WC balances, PPE)
 * so errors cannot accumulate multiplicatively across a multi-period chain. Do NOT
 * apply to derived subtotals or to the cash plug — those must remain algebraically
 * exact to preserve the double-entry identity.
 */
export function round2(n: number): number {
  if (n < 0) return -Math.round(-n * 100) / 100;
  return Math.round(n * 100) / 100;
}
