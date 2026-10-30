/**
 * Monthly spend curve for hard + soft construction cost.
 *
 * Returns a weight per construction month that sums to exactly 1, so the engine can
 * distribute the hard+soft total across the construction window (convention 8's
 * neighbour: cost spend drives draws).
 */
import type { SpendCurve } from "../types.js";

/**
 * Logit-power cumulative S-curve: cum(x) = x^s / (x^s + (1-x)^s), for x in [0,1].
 * cum(0)=0, cum(1)=1, cum(0.5)=0.5; S-shaped (slow-fast-slow) for s > 1.
 */
function sCurveCumulative(x: number, steepness: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const a = Math.pow(x, steepness);
  const b = Math.pow(1 - x, steepness);
  return a / (a + b);
}

/**
 * Weights for `nMonths` construction months. weights[i] is the fraction of total
 * hard+soft spent in construction month i (0-based within the window).
 */
export function spendWeights(curve: SpendCurve, nMonths: number): number[] {
  if (nMonths <= 0) return [];
  if (nMonths === 1) return [1];

  if (curve.kind === "linear") {
    return Array.from({ length: nMonths }, () => 1 / nMonths);
  }

  if (curve.kind === "custom") {
    const sum = curve.weights.reduce((a, w) => a + w, 0);
    if (curve.weights.length !== nMonths) {
      throw new Error(`custom spend curve has ${curve.weights.length} weights but ${nMonths} construction months`);
    }
    if (sum <= 0) throw new Error("custom spend curve weights must sum to a positive number");
    return curve.weights.map((w) => w / sum);
  }

  // s-curve: difference of the cumulative at evenly spaced points.
  const steepness = curve.steepness ?? 2;
  const weights: number[] = [];
  for (let i = 0; i < nMonths; i++) {
    const xPrev = i / nMonths;
    const xNext = (i + 1) / nMonths;
    weights.push(sCurveCumulative(xNext, steepness) - sCurveCumulative(xPrev, steepness));
  }
  // Already sums to cum(1)-cum(0)=1, but normalize defensively against FP drift.
  const total = weights.reduce((a, w) => a + w, 0);
  return weights.map((w) => w / total);
}
