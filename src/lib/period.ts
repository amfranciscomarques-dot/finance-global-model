// Shared period-parameter parsing for route handlers.
//
// Several GET routes accept a `?period=YYYY-MM` query param and build a
// `new Date(period + '-01')` from it. A malformed value (e.g. `2024-13`, an
// empty string, or free text) silently produces an `Invalid Date`; Prisma then
// returns zero rows and the response shows all-zero figures with no error
// signal (BUG-09). This helper validates the format up front so callers can
// return a 400 instead of misleading zeros.

/**
 * Strict `YYYY-MM` matcher. The month group rejects `00` and `13`–`99`, so it
 * is tighter than a bare `\d{2}` and catches the canonical `2024-13` bad input.
 */
export const PERIOD_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

export type ParsedPeriod =
  | { ok: true; period: string; periodDate: Date }
  | { ok: false; error: string };

/**
 * Validate a raw `period` query param and resolve it to a `Date`.
 *
 * `raw` is typically `searchParams.get('period')`. When it is `null` (param
 * omitted) the `fallback` is used; when it is present but malformed the result
 * carries `ok: false` and a message suitable for a 400 response.
 */
export function parsePeriodParam(raw: string | null, fallback = '2024-12'): ParsedPeriod {
  const period = raw ?? fallback;
  if (!PERIOD_REGEX.test(period)) {
    return { ok: false, error: `Invalid period "${period}". Expected YYYY-MM (e.g. 2024-12).` };
  }
  return { ok: true, period, periodDate: new Date(period + '-01') };
}
