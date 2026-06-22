// ============================================================
// FINANCE DOMAIN — debt schedule with cash sweep (pure)
//
// A revolving cash sweep ties interest, debt and cash together circularly:
//   - interest is charged on the AVERAGE of the opening and closing balance;
//   - surplus cash (above a minimum buffer) sweeps to repay principal, which
//     lowers the closing balance, which lowers the average, which lowers
//     interest, which frees more cash to sweep…
//
// `solveDebtSchedule` resolves that fixed point by iteration: at each pass it
// charges interest on the current average balance, asks the caller how much cash
// that leaves for principal, sweeps it, and re-derives the closing balance —
// stopping when the interest charge stops moving (tolerance on Δinterest) or a
// pass cap is hit. It is pure: the caller supplies `cashForDebtService(interest)`,
// so the same solver works whether the cash figure depends on interest (via the
// tax shield) or not.
// ============================================================

export interface DebtScheduleConfig {
  /** Interest-bearing debt at the start of the period (≥ 0). */
  openingDebt: number;
  /** Annual interest rate applied to the AVERAGE balance (e.g. 0.05). */
  interestRate: number;
  /** Cash retained and never swept to debt (a liquidity floor). Default 0. */
  minCashBuffer?: number;
  /** Contractual amortization due this period regardless of the sweep. Default 0. */
  mandatoryRepayment?: number;
  /** Maximum solver passes before giving up (the fixed-point cap). Default 20. */
  maxPasses?: number;
  /** Convergence tolerance on the change in the interest charge. Default 1e-6. */
  tolerance?: number;
}

export interface DebtScheduleResult {
  /** Interest charged on the average balance at the converged point (≥ 0). */
  interest: number;
  /** Debt balance at period end (≥ 0). */
  closingDebt: number;
  /** Total principal repaid = mandatory + sweep. */
  repayment: number;
  /** Discretionary principal swept from surplus cash (excludes mandatory). */
  sweep: number;
  /** Number of iterations performed. */
  iterations: number;
  /** Whether Δinterest fell within tolerance before the pass cap. */
  converged: boolean;
}

/**
 * Solve the cash-sweep debt schedule for one period.
 *
 * `cashForDebtService(interest)` returns the cash on hand BEFORE repaying
 * principal, given that `interest` has been charged (i.e. after interest, tax,
 * working capital, capex and dividends). The solver then retains `minCashBuffer`
 * and sweeps the rest to principal, capped so debt never goes negative.
 */
export function solveDebtSchedule(
  config: DebtScheduleConfig,
  cashForDebtService: (interest: number) => number,
): DebtScheduleResult {
  const {
    openingDebt,
    interestRate,
    minCashBuffer = 0,
    mandatoryRepayment = 0,
    maxPasses = 20,
    tolerance = 1e-6,
  } = config;

  const mandatory = Math.min(Math.max(0, mandatoryRepayment), openingDebt);
  const sweepRoom = Math.max(0, openingDebt - mandatory);

  // Initial guess: no sweep yet, interest on the opening balance.
  let closingDebt = openingDebt;
  let interest = interestRate * openingDebt;
  let sweep = 0;
  let iterations = 0;
  let converged = false;

  for (let pass = 0; pass < maxPasses; pass++) {
    iterations++;
    const available = cashForDebtService(interest) - minCashBuffer;
    sweep = Math.min(Math.max(0, available - mandatory), sweepRoom);
    closingDebt = openingDebt - mandatory - sweep;
    const nextInterest = interestRate * ((openingDebt + closingDebt) / 2);
    if (Math.abs(nextInterest - interest) < tolerance) {
      interest = nextInterest;
      converged = true;
      break;
    }
    interest = nextInterest;
  }

  return { interest, closingDebt, repayment: mandatory + sweep, sweep, iterations, converged };
}
