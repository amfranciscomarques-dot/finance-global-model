// ============================================================
// RFAI credit carryforward — excess RFAI (above the 50%-of-coleta cap or
// beyond the available coleta) is NOT lost; it carries forward and is consumed
// in a later year when there is more coleta. Covers PT (capped) and the
// flat-rate stubs (uncapped, but still carried when gross tax can't absorb it).
// ============================================================

import { describe, it, expect } from 'vitest';
import { createPortugalProvider, PT_TAX_CONFIG } from './jurisdictions/portugal';
import { usaProvider } from './jurisdictions/flat-rate';

const pt = createPortugalProvider();

describe('Portugal RFAI carryforward', () => {
  it('caps RFAI at 50% of coleta and carries the excess forward', () => {
    // Profit 1,000,000 @ 2024 21% → coleta 210,000. RFAI cap = 50% = 105,000.
    // A 300,000 RFAI credit can only use 105,000 this year; 195,000 carries forward.
    const r = pt.computeTax({ taxableIncome: 1_000_000, year: 2024, rfaiCredit: 300_000 });
    expect(r.grossTax).toBeCloseTo(210_000, 4);
    expect(r.rfaiUsed).toBeCloseTo(105_000, 4);
    expect(r.rfaiClosing).toBeCloseTo(195_000, 4);
    expect(r.credits).toBeCloseTo(105_000, 4);
  });

  it('adds the carried-forward pool to the current-year credit', () => {
    // Carry 195,000 forward into a year with coleta 210,000 (cap 105,000) and a
    // fresh 20,000 credit → available 215,000, only 105,000 usable, 110,000 carried.
    const r = pt.computeTax({
      taxableIncome: 1_000_000,
      year: 2024,
      rfaiCredit: 20_000,
      rfaiOpening: 195_000,
    });
    expect(r.rfaiUsed).toBeCloseTo(105_000, 4);
    expect(r.rfaiClosing).toBeCloseTo(110_000, 4); // 215,000 − 105,000
  });

  it('a loss year keeps the whole RFAI pool (no coleta to absorb it)', () => {
    const r = pt.computeTax({ taxableIncome: -100_000, year: 2024, rfaiCredit: 50_000, rfaiOpening: 30_000 });
    expect(r.grossTax).toBe(0);
    expect(r.rfaiUsed).toBe(0);
    expect(r.rfaiClosing).toBe(80_000); // 50,000 + 30,000 carried intact
  });

  it('chains across years: excess one year is consumed the next', () => {
    const y1 = pt.computeTax({ taxableIncome: 500_000, year: 2024, rfaiCredit: 100_000 });
    // coleta 105,000; cap 52,500 → 47,500 carried forward.
    expect(y1.rfaiUsed).toBeCloseTo(52_500, 4);
    expect(y1.rfaiClosing).toBeCloseTo(47_500, 4);

    const y2 = pt.computeTax({ taxableIncome: 2_000_000, year: 2025, rfaiOpening: y1.rfaiClosing });
    // coleta 400,000 @ 20%; cap 200,000 ≥ pool 47,500 → fully consumed, nothing left.
    expect(y2.rfaiUsed).toBeCloseTo(47_500, 4);
    expect(y2.rfaiClosing).toBe(0);
  });
});

describe('flat-rate RFAI carryforward (uncapped)', () => {
  it('carries RFAI the gross tax cannot absorb', () => {
    // Profit 100,000 @ 21% → tax 21,000. RFAI 50,000 → 21,000 used, 29,000 carried.
    const r = usaProvider.computeTax({ taxableIncome: 100_000, year: 2024, rfaiCredit: 50_000 });
    expect(r.rfaiUsed).toBe(21_000);
    expect(r.rfaiClosing).toBe(29_000);
    expect(r.totalTax).toBe(0);
  });

  it('other credits apply before RFAI and are not carried forward', () => {
    // Tax 21,000; SIFIDE 10,000 applies first → 11,000 left; RFAI 50,000 uses
    // 11,000, carries 39,000.
    const r = usaProvider.computeTax({
      taxableIncome: 100_000,
      year: 2024,
      sifideCredit: 10_000,
      rfaiCredit: 50_000,
    });
    expect(r.rfaiUsed).toBe(11_000);
    expect(r.rfaiClosing).toBe(39_000);
    expect(r.totalTax).toBe(0);
  });
});

describe('RFAI cap config is independent of the 50% default', () => {
  it('a higher cap lets more RFAI through in one year', () => {
    const full = createPortugalProvider({ ...PT_TAX_CONFIG, rfaiLimitPctColeta: 1 });
    const r = full.computeTax({ taxableIncome: 1_000_000, year: 2024, rfaiCredit: 300_000 });
    // coleta 210,000; cap now 100% → all 210,000 absorbed, 90,000 carried.
    expect(r.rfaiUsed).toBeCloseTo(210_000, 4);
    expect(r.rfaiClosing).toBeCloseTo(90_000, 4);
    expect(r.totalTax).toBeCloseTo(1_000_000 * PT_TAX_CONFIG.derramaMunicipal, 4);
  });
});
