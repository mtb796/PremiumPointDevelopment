/**
 * IRR by bisection (engine convention 3).
 *
 * Solve the monthly IRR with bisection (tolerance 1e-10), then annualize as
 * (1 + m)^12 - 1. This equals Excel's =(1+IRR(range))^12-1. Do NOT compare against
 * XIRR, which uses actual dates and differs slightly.
 *
 * `flows[t]` is the net cash flow at month end t (t = 0..n). NPV discounts flow t by
 * (1 + r)^t, so flow at t=0 is undiscounted.
 */
import type { Irr } from "./types.js";

const TOL = 1e-10;
const MAX_ITER = 500;

export function npv(flows: readonly number[], monthlyRate: number): number {
  let acc = 0;
  const d = 1 + monthlyRate;
  let disc = 1;
  for (let t = 0; t < flows.length; t++) {
    acc += flows[t]! / disc;
    disc *= d;
  }
  return acc;
}

/**
 * Monthly IRR via bisection. Returns solved=false if no sign change can be bracketed
 * in (-1, hi]; callers treat an unsolved IRR as a flag, never as a silent zero.
 */
export function monthlyIrr(flows: readonly number[], lo = -0.9999, hi = 1.0): { monthly: number; solved: boolean } {
  let flo = npv(flows, lo);
  let fhi = npv(flows, hi);

  // Expand the upper bound a few times if both ends share a sign (very high returns).
  let expand = 0;
  while (flo * fhi > 0 && expand < 10) {
    hi *= 2;
    fhi = npv(flows, hi);
    expand++;
  }
  if (flo === 0) return { monthly: lo, solved: true };
  if (fhi === 0) return { monthly: hi, solved: true };
  if (flo * fhi > 0) return { monthly: NaN, solved: false };

  let a = lo;
  let b = hi;
  for (let i = 0; i < MAX_ITER; i++) {
    const mid = (a + b) / 2;
    const fm = npv(flows, mid);
    if (Math.abs(fm) < TOL || (b - a) / 2 < 1e-14) {
      return { monthly: mid, solved: true };
    }
    if (flo * fm < 0) {
      b = mid;
      fhi = fm;
    } else {
      a = mid;
      flo = fm;
    }
  }
  return { monthly: (a + b) / 2, solved: true };
}

/** Annualize a monthly IRR (convention 3). */
export function annualizeIrr(monthly: number): number {
  return Math.pow(1 + monthly, 12) - 1;
}

/** Solve and annualize in one step, producing the `Irr` result shape. */
export function irr(flows: readonly number[]): Irr {
  const { monthly, solved } = monthlyIrr(flows);
  return { monthly, annual: solved ? annualizeIrr(monthly) : NaN, solved };
}
