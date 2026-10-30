/**
 * Phasing: shared-cost allocation across phases (handoff: mixed-use module).
 *
 * "Shared costs such as site work, utilities, and podium structure are allocated to
 * phases by gross floor area, or by a user-set percentage." Allocations sum to the
 * total shared cost (acceptance test). Pure.
 */
import type { Deal, Money, Phase } from "../types.js";

export interface PhaseAllocation {
  label: string;
  share: number; // fraction of the shared cost
  amount: Money;
}

export interface SharedCostAllocation {
  method: "gfa" | "custom";
  total: Money;
  phases: PhaseAllocation[];
}

/** Gross floor area delivered in a phase (sum of its components' gross SF). */
function phaseGfa(deal: Deal, phase: Phase): number {
  return phase.componentLabels.reduce((a, label) => {
    const c = deal.program.components.find((x) => x.label === label);
    return a + (c?.grossSf ?? 0);
  }, 0);
}

/**
 * Allocate a total shared cost across the deal's phases. By default, by gross floor
 * area; pass `customShares` (summing to 1) to override. The result always sums to the
 * total exactly.
 */
export function allocateSharedCost(
  deal: Deal,
  total: Money,
  customShares?: number[],
): SharedCostAllocation {
  const phases = deal.phases ?? [];
  if (phases.length === 0) {
    return { method: "gfa", total, phases: [] };
  }
  if (phases.length === 1) {
    return { method: customShares ? "custom" : "gfa", total, phases: [{ label: phases[0]!.label, share: 1, amount: total }] };
  }

  let shares: number[];
  if (customShares) {
    if (customShares.length !== phases.length) throw new Error("customShares length must match phase count");
    const sum = customShares.reduce((a, s) => a + s, 0);
    if (sum <= 0) throw new Error("customShares must sum to a positive number");
    shares = customShares.map((s) => s / sum);
  } else {
    const gfas = phases.map((p) => phaseGfa(deal, p));
    const totalGfa = gfas.reduce((a, g) => a + g, 0);
    shares = totalGfa > 0 ? gfas.map((g) => g / totalGfa) : phases.map(() => 1 / phases.length);
  }

  // Allocate, putting any rounding remainder on the last phase so the sum is exact.
  const amounts = shares.map((s) => s * total);
  const allocated = amounts.slice(0, -1).reduce((a, x) => a + x, 0);
  amounts[amounts.length - 1] = total - allocated;

  return {
    method: customShares ? "custom" : "gfa",
    total,
    phases: phases.map((p, i) => ({ label: p.label, share: shares[i]!, amount: amounts[i]! })),
  };
}
