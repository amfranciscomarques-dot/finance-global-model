// ============================================================
// FINANCE DOMAIN — currency conversion
//
// Rates come from the ExchangeRate table (ECB-sourced in the demo). There is
// deliberately NO silent fallback: an unknown currency or a missing rate is a
// data-integrity problem that must surface, not be papered over with 1.0.
// Returning 1.0 for an unknown currency would silently treat a foreign balance
// as if it were already in EUR — letting a broken book still appear to
// reconcile. Callers either supply the rate explicitly or fail loudly.
// ============================================================

import { db } from '@/lib/db';

/**
 * Thrown when no exchange rate can be resolved for a (currency, period). Typed
 * so callers can distinguish a fixable data gap (HTTP 422 / skip the row) from
 * a genuine server fault, rather than swallowing it as a phantom 1.0 rate.
 */
export class FxRateUnavailableError extends Error {
  constructor(
    public readonly currency: string,
    public readonly periodDate: Date,
    public readonly rateType: string,
  ) {
    super(
      `No ${rateType} exchange rate for ${currency} at or before ` +
        `${periodDate.toISOString().slice(0, 10)}. Import an ECB rate for this ` +
        `currency/period before consolidating — refusing to assume 1.0.`,
    );
    this.name = 'FxRateUnavailableError';
  }
}

/**
 * Last instant of the month containing `periodDate`. Periods are identified by
 * their first day (e.g. 2024-12-01), but ECB closing/average rates are dated at
 * period END (e.g. 2024-12-31). Looking up `rateDate <= periodStart` would miss
 * the very rate that belongs to the period, so we resolve against month-end.
 */
function periodCeiling(periodDate: Date): Date {
  return new Date(
    Date.UTC(periodDate.getUTCFullYear(), periodDate.getUTCMonth() + 1, 0, 23, 59, 59, 999),
  );
}

/**
 * Fetch the exchange rate (1 EUR = X currency) for a currency at a period.
 * Resolves the latest rate dated on or before the END of the period month,
 * trying the requested type, then the average rate as a same-source
 * approximation. Throws {@link FxRateUnavailableError} if neither exists —
 * it never silently returns 1.0 for a non-EUR currency.
 */
export async function getExchangeRate(
  currency: string,
  periodDate: Date,
  rateType: string = 'closing',
): Promise<number> {
  if (currency === 'EUR') return 1.0;

  const ceiling = periodCeiling(periodDate);

  const rate = await db.exchangeRate.findFirst({
    where: { currency, rateType, rateDate: { lte: ceiling } },
    orderBy: { rateDate: 'desc' },
  });
  if (rate) return rate.rate;

  // Same-source soft fallback: if the requested type is missing, an average
  // rate for the period is a defensible substitute (documented, not hidden).
  const avgRate = await db.exchangeRate.findFirst({
    where: { currency, rateType: 'average', rateDate: { lte: ceiling } },
    orderBy: { rateDate: 'desc' },
  });
  if (avgRate) return avgRate.rate;

  throw new FxRateUnavailableError(currency, periodDate, rateType);
}

/**
 * Convert an amount from local currency to EUR. ECB rates are expressed as
 * 1 EUR = X currency, so EUR = localAmount / rate. A non-positive or
 * non-finite rate is rejected rather than silently returned as-is — returning
 * the unconverted amount would smuggle a raw foreign balance into the EUR book.
 */
export function convertToEUR(amountLocal: number, rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new RangeError(
      `convertToEUR: invalid exchange rate ${rate}; expected a positive, finite number.`,
    );
  }
  return amountLocal / rate;
}
