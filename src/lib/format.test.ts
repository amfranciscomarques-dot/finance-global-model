import { describe, expect, it } from 'vitest';
import { formatCompactEUR, formatCurrency, formatNumber, formatPercent } from './format';

// ============================================================
// FORMAT — de-DE money/number formatting (C4 / finding L1).
//
// Everything in format.ts renders de-DE (comma decimal, dot grouping). The
// compact formatter used to emit en-US dots ("€52.2M") and ignored `decimals`
// in the K band; these tests pin the localized, decimals-honoring behaviour.
// ============================================================

describe('formatCompactEUR — localized (de-DE), decimals honored in M and K', () => {
  it('renders millions with a comma decimal', () => {
    expect(formatCompactEUR(52_240_382)).toBe('€52,2M');
    expect(formatCompactEUR(1_500_000)).toBe('€1,5M');
  });

  it('renders thousands honoring the decimals argument (was ignored)', () => {
    expect(formatCompactEUR(85_000)).toBe('€85,0K');
    expect(formatCompactEUR(85_000, 0)).toBe('€85K');
    expect(formatCompactEUR(2_500)).toBe('€2,5K');
  });

  it('renders sub-thousand amounts as whole euros', () => {
    expect(formatCompactEUR(420)).toBe('€420');
    expect(formatCompactEUR(0)).toBe('€0');
  });

  it('preserves the sign', () => {
    expect(formatCompactEUR(-1_500_000)).toBe('-€1,5M');
    expect(formatCompactEUR(-85_000, 0)).toBe('-€85K');
  });

  it('respects an explicit decimals override in the millions band', () => {
    expect(formatCompactEUR(52_240_382, 0)).toBe('€52M');
    expect(formatCompactEUR(52_240_382, 2)).toBe('€52,24M');
  });
});

describe('format.ts siblings stay de-DE', () => {
  it('formatNumber / formatCurrency / formatPercent use comma decimals + dot grouping', () => {
    expect(formatNumber(1_234_567.8, 1)).toBe('1.234.567,8');
    expect(formatCurrency(1_234_567)).toBe('€1.234.567');
    expect(formatCurrency(-1_000)).toBe('-€1.000');
    expect(formatPercent(33.94)).toBe('33,9%');
  });
});
