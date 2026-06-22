// ============================================================
// CASH-FLOW-FORECAST — pure helpers (golden-tested)
//
// Co-located pure logic for the Cash Flow Forecast view, following the same
// split as dashboard/entities/settings: testable functions live here; the
// component keeps JSX + data wiring.
// ============================================================

/**
 * Render a forecast period label as a short "MMM YY".
 *
 * Most periods are `YYYY-MM`, but the first period returned by `/api/forecast`
 * is a full-year actual anchor labelled e.g. "2024 (FY)", which is NOT a
 * parseable date. `new Date('2024 (FY)-01')` produces an Invalid Date and does
 * NOT throw — its `toLocaleDateString` returns the literal string
 * "Invalid Date" — so we guard with `Number.isNaN(getTime())` and pass any
 * non-month label straight through instead of rendering "Invalid Date".
 */
export function formatMonth(month: string, locale = 'en-US'): string {
  const d = new Date(month + '-01');
  if (Number.isNaN(d.getTime())) return month;
  return d.toLocaleDateString(locale, { month: 'short', year: '2-digit' });
}
