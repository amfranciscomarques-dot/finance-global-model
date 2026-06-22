import { describe, expect, it } from 'vitest';
import { solveDebtSchedule } from './debt';

// Pure unit tests for the cash-sweep debt schedule (MEDIUM.9).

describe('solveDebtSchedule', () => {
  it('charges no interest and repays nothing when there is no debt', () => {
    const r = solveDebtSchedule({ openingDebt: 0, interestRate: 0.1 }, () => 1000);
    expect(r.interest).toBe(0);
    expect(r.closingDebt).toBe(0);
    expect(r.repayment).toBe(0);
    expect(r.converged).toBe(true);
  });

  it('sweeps surplus cash above the buffer and charges interest on the AVERAGE balance', () => {
    // Cash independent of interest: available = 600 - 100 buffer = 500 swept.
    const r = solveDebtSchedule(
      { openingDebt: 1000, interestRate: 0.1, minCashBuffer: 100 },
      () => 600,
    );
    expect(r.sweep).toBeCloseTo(500, 6);
    expect(r.closingDebt).toBeCloseTo(500, 6);
    // Interest on the average of opening 1000 and closing 500 = 0.1 * 750 = 75
    // (NOT 0.1 * 1000 = 100 on the opening balance).
    expect(r.interest).toBeCloseTo(75, 6);
    expect(r.converged).toBe(true);
  });

  it('does not sweep when cash is at or below the buffer', () => {
    const r = solveDebtSchedule(
      { openingDebt: 1000, interestRate: 0.1, minCashBuffer: 600 },
      () => 600,
    );
    expect(r.sweep).toBe(0);
    expect(r.closingDebt).toBe(1000);
    expect(r.interest).toBeCloseTo(100, 6); // average == opening when nothing repaid
  });

  it('never repays more than the outstanding debt (sweep capped)', () => {
    const r = solveDebtSchedule(
      { openingDebt: 300, interestRate: 0.1, minCashBuffer: 0 },
      () => 100_000, // far more cash than debt
    );
    expect(r.repayment).toBeCloseTo(300, 6);
    expect(r.closingDebt).toBeCloseTo(0, 6);
    expect(r.interest).toBeCloseTo(0.1 * 150, 6); // average of 300 and 0
  });

  it('honours mandatory amortization even with no surplus to sweep', () => {
    const r = solveDebtSchedule(
      { openingDebt: 1000, interestRate: 0.1, minCashBuffer: 1000, mandatoryRepayment: 200 },
      () => 500, // below buffer → no discretionary sweep
    );
    expect(r.sweep).toBe(0);
    expect(r.repayment).toBeCloseTo(200, 6);
    expect(r.closingDebt).toBeCloseTo(800, 6);
  });

  it('converges within the pass cap when cash depends on interest (the tax-shield circularity)', () => {
    // Higher interest leaves less cash to sweep: cash(interest) = 800 - interest.
    const r = solveDebtSchedule(
      { openingDebt: 1000, interestRate: 0.1, minCashBuffer: 100, maxPasses: 20, tolerance: 1e-9 },
      (interest) => 800 - interest,
    );
    expect(r.converged).toBe(true);
    expect(r.iterations).toBeLessThanOrEqual(20);
    // Fixed point: interest = 0.1 * (1000 + closing)/2, closing = 1000 - sweep,
    // sweep = (800 - interest) - 100. Solving gives interest ≈ 68.42.
    expect(r.interest).toBeCloseTo(68.42, 1);
    // And the average-balance identity holds at the solution.
    expect(r.interest).toBeCloseTo(0.1 * ((1000 + r.closingDebt) / 2), 6);
  });
});
