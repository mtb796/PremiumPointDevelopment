/**
 * Circularity solver (engine convention 7).
 *
 * Financing cost depends on loan size, which depends on total cost, which includes
 * financing cost. Iterate until the change is under $1, with a limit of 50 passes. If
 * it does not converge, throw a visible error (callers surface it as a Flag).
 */

export class NonConvergenceError extends Error {
  constructor(
    message: string,
    readonly passes: number,
    readonly lastDelta: number,
  ) {
    super(message);
    this.name = "NonConvergenceError";
  }
}

export const CONVERGENCE_TOLERANCE = 1; // $1 (convention 7)
export const MAX_PASSES = 50;

/**
 * Fixed-point iteration on total cost. `step(tc)` returns the recomputed total cost
 * given a candidate. Converges when |delta| < $1; throws after 50 passes.
 */
export function solveTotalCost(initial: number, step: (tc: number) => number): number {
  let tc = initial;
  let lastDelta = Infinity;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const next = step(tc);
    lastDelta = Math.abs(next - tc);
    tc = next;
    if (lastDelta < CONVERGENCE_TOLERANCE) return tc;
  }
  throw new NonConvergenceError(
    `Interest-reserve / total-cost iteration did not converge within ${MAX_PASSES} passes (last change $${lastDelta.toFixed(2)}).`,
    MAX_PASSES,
    lastDelta,
  );
}
