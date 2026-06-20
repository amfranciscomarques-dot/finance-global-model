// ============================================================
// PROJECTS — investment appraisal math (NPV / IRR / payback).
// Pure functions, no DB. Used by the Projects module and its API.
// ============================================================

/** Net present value. cashFlows[0] is t=0 (typically the initial outflow). */
export function npv(rate: number, cashFlows: number[]): number {
  return cashFlows.reduce((acc, cf, t) => acc + cf / Math.pow(1 + rate, t), 0);
}

/** Internal rate of return via bisection. Returns null if no sign change. */
export function irr(cashFlows: number[]): number | null {
  const hasPositive = cashFlows.some((c) => c > 0);
  const hasNegative = cashFlows.some((c) => c < 0);
  if (!hasPositive || !hasNegative) return null;

  let lo = -0.9999;
  let hi = 10;
  let fLo = npv(lo, cashFlows);
  let fHi = npv(hi, cashFlows);
  if (fLo * fHi > 0) return null; // no root bracketed

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid, cashFlows);
    if (Math.abs(fMid) < 1e-6) return mid;
    if (fLo * fMid < 0) {
      hi = mid;
      fHi = fMid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}

/** Discounted payback period in years (fractional), or null if never recovered. */
export function paybackYears(rate: number, cashFlows: number[]): number | null {
  let cumulative = 0;
  for (let t = 0; t < cashFlows.length; t++) {
    const discounted = cashFlows[t] / Math.pow(1 + rate, t);
    const prev = cumulative;
    cumulative += discounted;
    if (prev < 0 && cumulative >= 0) {
      // linear interpolation within the year it turns positive
      return t - 1 + Math.abs(prev) / Math.abs(discounted);
    }
  }
  return cumulative >= 0 ? cashFlows.length - 1 : null;
}

export interface ProjectAppraisalInput {
  startYear: number;
  horizonYears: number;
  capexTotal: number;
  discountRate: number;
  terminalGrowth: number;
  taxRate: number;
  /** capex outflow per calendar year (e.g. {2025: 2850000}). */
  capexSchedule?: Record<string, number>;
  /** net pre-tax operating benefit per calendar year. */
  netBenefitByYear?: Record<string, number>;
  /** one-off tax credit (e.g. RFAI), applied in the first operating year. */
  rfaiCredit?: number;
  /** asset book/residual value recovered at horizon end. */
  residualValue?: number;
}

export interface ProjectAppraisalResult {
  years: number[];
  cashFlows: number[]; // free cash flow per period, index 0 = startYear-? aligned to first capex year
  npv: number;
  irr: number | null;
  paybackYears: number | null;
}

/**
 * Build a yearly free-cash-flow series and compute NPV/IRR/payback.
 * Timeline starts at the earliest capex year (or startYear) and runs to
 * startYear + horizonYears - 1. Benefits are taxed at taxRate; a one-off
 * RFAI credit and a terminal value (residual + Gordon growth on last benefit)
 * are added in the final year.
 */
export function appraiseProject(input: ProjectAppraisalInput): ProjectAppraisalResult {
  const capexSchedule = input.capexSchedule ?? {};
  const benefits = input.netBenefitByYear ?? {};

  const capexYears = Object.keys(capexSchedule).map(Number);
  const firstYear = capexYears.length ? Math.min(...capexYears, input.startYear) : input.startYear;
  const lastYear = input.startYear + input.horizonYears - 1;

  const years: number[] = [];
  const cashFlows: number[] = [];
  let firstBenefitApplied = false;

  for (let y = firstYear; y <= lastYear; y++) {
    years.push(y);
    const capex = capexSchedule[String(y)] ?? 0;
    const benefit = benefits[String(y)] ?? 0;
    const afterTaxBenefit = benefit * (1 - input.taxRate);

    let cf = -capex + afterTaxBenefit;

    // Apply one-off RFAI credit in the first year with a positive benefit
    if (!firstBenefitApplied && benefit > 0 && input.rfaiCredit) {
      cf += input.rfaiCredit;
      firstBenefitApplied = true;
    }

    // Terminal value in the final year. Finite-horizon project: recover the
    // residual asset value (base case VR = VLC, no gain on sale). No Gordon
    // perpetuity — the horizon is explicit and the residual is given.
    if (y === lastYear) {
      cf += input.residualValue ?? 0;
    }

    cashFlows.push(Math.round(cf));
  }

  return {
    years,
    cashFlows,
    npv: Math.round(npv(input.discountRate, cashFlows)),
    irr: irr(cashFlows),
    paybackYears: paybackYears(input.discountRate, cashFlows),
  };
}
