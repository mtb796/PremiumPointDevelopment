/**
 * Hold vs. sell comparison and verdict (handoff one-page flow).
 *
 * Both cases share the same land, program, costs, schedule, and capital stack — only the
 * business plan differs. The verdict states which option wins under the chosen investor
 * objective and by how much, plus the crossover value at which the answer flips. Pure.
 */
import type { Deal, Result } from "./types.js";
import { runDeal } from "./index.js";
import { flexDeal } from "./scenarios/scenarios.js";

export type Objective = "return-speed" | "total-profit" | "risk-adjusted";

export const objectiveLabels: Record<Objective, string> = {
  "return-speed": "Return speed (highest LP IRR)",
  "total-profit": "Total profit (highest profit & multiple)",
  "risk-adjusted": "Risk-adjusted (highest downside-case profit)",
};

/** The metric a given objective maximizes, computed from a deal. */
function objectiveMetric(deal: Deal, objective: Objective): number {
  if (objective === "risk-adjusted") {
    // Downside case: revenue -10%, cost +10%.
    const downside = flexDeal(flexDeal(deal, "rent", 0.9), "hardCost", 1.1);
    return runDeal(downside).returns.profit;
  }
  const r = runDeal(deal);
  if (objective === "return-speed") return r.returns.lp?.annual ?? r.returns.levered.annual;
  return r.returns.profit; // total-profit
}

export interface HoldSellVerdict {
  hold: Result;
  sell: Result;
  objective: Objective;
  holdMetric: number;
  sellMetric: number;
  winner: "hold" | "sell";
  margin: number; // winner metric - loser metric
  /** For-sale price multiplier at which the winner flips (sell side), if found. */
  crossoverPriceFactor?: number;
  reason: string;
}

function holdVariant(deal: Deal): Deal {
  const d = structuredClone(deal);
  d.businessPlan = "hold";
  return d;
}
function sellVariant(deal: Deal): Deal {
  const d = structuredClone(deal);
  d.businessPlan = "sell";
  return d;
}

/**
 * Compare hold vs. sell for a deal that carries both an `exit` (hold) and `forSale`
 * (sell) configuration. Returns both results, the verdict under `objective`, and the
 * for-sale price crossover where the answer flips.
 */
export function compareHoldSell(deal: Deal, objective: Objective = "total-profit"): HoldSellVerdict {
  if (!deal.forSale) throw new Error("compareHoldSell requires deal.forSale for the sell case");
  const holdDeal = holdVariant(deal);
  const sellDeal = sellVariant(deal);

  const hold = runDeal(holdDeal);
  const sell = runDeal(sellDeal);

  const holdMetric = objectiveMetric(holdDeal, objective);
  const sellMetric = objectiveMetric(sellDeal, objective);
  const winner = sellMetric >= holdMetric ? "sell" : "hold";
  const margin = Math.abs(sellMetric - holdMetric);

  // Crossover: scale the for-sale price until the sell metric meets the hold metric.
  const scaleSellPrice = (factor: number): Deal => {
    const d = sellVariant(deal);
    const f = d.forSale!;
    if (f.pricePerUnit !== undefined) f.pricePerUnit *= factor;
    if (f.pricePerSf !== undefined) f.pricePerSf *= factor;
    if (f.bulkPrice !== undefined) f.bulkPrice *= factor;
    if (f.bulkPricePerSf !== undefined) f.bulkPricePerSf *= factor;
    return d;
  };
  const sellMetricAt = (factor: number) => objectiveMetric(scaleSellPrice(factor), objective);
  const crossoverPriceFactor = bisectCrossover((x) => sellMetricAt(x) - holdMetric, 0.5, 1.8);

  const fmt = (n: number) =>
    objective === "return-speed" ? `${(n * 100).toFixed(2)}%` : `$${Math.round(n).toLocaleString("en-US")}`;
  const crossoverText =
    crossoverPriceFactor !== undefined
      ? ` Selling wins while the for-sale price stays above ${(crossoverPriceFactor * 100).toFixed(0)}% of the current level.`
      : "";
  const reason =
    `Under "${objectiveLabels[objective]}", ${winner === "sell" ? "build-to-sell" : "build-to-hold"} wins: ` +
    `${fmt(winner === "sell" ? sellMetric : holdMetric)} vs ${fmt(winner === "sell" ? holdMetric : sellMetric)}.` +
    (winner === "sell" ? crossoverText : "");

  return {
    hold,
    sell,
    objective,
    holdMetric,
    sellMetric,
    winner,
    margin,
    ...(crossoverPriceFactor !== undefined ? { crossoverPriceFactor } : {}),
    reason,
  };
}

/** Bisection for a sign change of `f` in [lo, hi]; returns undefined if none. */
function bisectCrossover(f: (x: number) => number, lo: number, hi: number): number | undefined {
  let flo = f(lo);
  let fhi = f(hi);
  if (flo === 0) return lo;
  if (fhi === 0) return hi;
  if (flo * fhi > 0) return undefined;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (Math.abs(fm) < 1e-6 || (hi - lo) / 2 < 1e-6) return mid;
    if (flo * fm < 0) {
      hi = mid;
      fhi = fm;
    } else {
      lo = mid;
      flo = fm;
    }
  }
  return (lo + hi) / 2;
}
