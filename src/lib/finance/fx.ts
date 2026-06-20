// ============================================================
// FINANCE DOMAIN — currency conversion
// ============================================================

import { db } from '@/lib/db';

const FALLBACK_RATES: Record<string, number> = {
  GBP: 0.8571, USD: 1.0820, CHF: 0.9415, SEK: 11.42, NOK: 11.65,
};

/**
 * Fetch the exchange rate (1 EUR = X currency) for a currency at a period.
 * Falls back to the average rate, then to a static table, then to 1.0.
 */
export async function getExchangeRate(
  currency: string,
  periodDate: Date,
  rateType: string = 'closing',
): Promise<number> {
  if (currency === 'EUR') return 1.0;

  const rate = await db.exchangeRate.findFirst({
    where: { currency, rateType, rateDate: { lte: periodDate } },
    orderBy: { rateDate: 'desc' },
  });
  if (rate) return rate.rate;

  const avgRate = await db.exchangeRate.findFirst({
    where: { currency, rateType: 'average', rateDate: { lte: periodDate } },
    orderBy: { rateDate: 'desc' },
  });
  if (avgRate) return avgRate.rate;

  return FALLBACK_RATES[currency] ?? 1.0;
}

/**
 * Convert an amount from local currency to EUR. ECB rates are expressed as
 * 1 EUR = X currency, so EUR = localAmount / rate.
 */
export function convertToEUR(amountLocal: number, rate: number): number {
  if (rate === 0) return amountLocal;
  return amountLocal / rate;
}
