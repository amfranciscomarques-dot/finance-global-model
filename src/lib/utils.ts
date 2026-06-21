import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { formatCompactEUR } from "./format"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// API amounts (trialBalance.amountEUR and everything derived from it) are in
// full euros — not thousands. Scale adaptively for compact display.
// Canonical implementation now lives in `./format`; re-exported here for the
// existing call sites that import it from `@/lib/utils`.
export const formatEUR = formatCompactEUR;
