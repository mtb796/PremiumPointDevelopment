/**
 * Modular vs. conventional comparison (handoff: pro forma module).
 *
 * One toggle switches a set of overrides. `applyModular` changes ONLY the documented
 * drivers and nothing else:
 *   - Hard cost per gross SF: base plus/minus a percent premium.
 *   - Construction duration: shorter by an editable number of months.
 *   - Time to first rent: earlier by the schedule savings (operations and exit shift
 *     earlier by the same months; the hold length is preserved).
 * The other documented effects — cost escalation over fewer months, and lower
 * construction interest carry — emerge from the shorter schedule, they are not separate
 * inputs. (Acceptance test: "Switching to modular changes only the documented drivers
 * and nothing else.")
 *
 * Pure: no UI, no network.
 */
import type { Deal } from "./types.js";
import { runDeal } from "./index.js";

/** Returns a new Deal with the modular overrides applied; the input is not mutated. */
export function applyModular(deal: Deal): Deal {
  if (!deal.modular) return deal;
  const { hardCostPremiumPct, constructionMonthsSaved } = deal.modular;

  const next: Deal = structuredClone(deal);
  // Driver 1: hard cost per gross SF.
  next.budget.hard.verticalPerGrossSf = deal.budget.hard.verticalPerGrossSf * (1 + hardCostPremiumPct);
  // Drivers 2 & 3: shorter build, earlier delivery (hold length preserved).
  const s = deal.schedule;
  next.schedule.constructionEndMonth = s.constructionEndMonth - constructionMonthsSaved;
  next.schedule.operationsStartMonth = s.operationsStartMonth - constructionMonthsSaved;
  next.schedule.exitMonth = s.exitMonth - constructionMonthsSaved;
  // The modular overrides themselves are consumed (so the result is a plain deal).
  delete next.modular;
  return next;
}

export interface ModularComparison {
  conventional: ReturnType<typeof runDeal>;
  modular: ReturnType<typeof runDeal>;
  deltas: {
    totalCost: number;
    financeCost: number; // the construction interest carry proxy
    leveredIrr: number;
    equityMultiple: number;
  };
  /** One sentence naming which effect dominates. */
  dominantEffect: string;
}

export function modularComparison(deal: Deal): ModularComparison {
  if (!deal.modular) throw new Error("modularComparison requires deal.modular overrides");
  const conventionalDeal: Deal = structuredClone(deal);
  delete conventionalDeal.modular;
  const conventional = runDeal(conventionalDeal);
  const modular = runDeal(applyModular(deal));

  const deltas = {
    totalCost: modular.costSummary.totalCostInclFinance - conventional.costSummary.totalCostInclFinance,
    financeCost: modular.costSummary.financeCost - conventional.costSummary.financeCost,
    leveredIrr: modular.returns.levered.annual - conventional.returns.levered.annual,
    equityMultiple: modular.returns.equityMultiple - conventional.returns.equityMultiple,
  };

  const costEffect = deltas.totalCost; // + if modular costs more
  const carryEffect = deltas.financeCost; // usually - (shorter build, less carry)
  const dominantEffect =
    Math.abs(costEffect) >= Math.abs(carryEffect)
      ? `Hard-cost premium dominates: total cost changes by $${costEffect.toFixed(0)}.`
      : `Schedule compression dominates: finance carry changes by $${carryEffect.toFixed(0)}.`;

  return { conventional, modular, deltas, dominantEffect };
}
