/**
 * Component-level reporting for mixed-use deals (handoff: mixed-use module).
 *
 * "Report NOI, value, and yield on cost by component and in total, so a founder can see
 * which part of the project carries the returns." Component NOI sums to total NOI
 * (acceptance test). Pure.
 */
import type { ComponentSummary, Deal, Money } from "../types.js";
import { componentOperating } from "./operations.js";

export interface ComponentBreakdown {
  components: ComponentSummary[];
  totalStabilizedNoi: Money;
  totalValue: Money;
}

/** Stabilized (first operating year) NOI and value for each component and the total. */
export function componentBreakdown(deal: Deal): ComponentBreakdown {
  const start = deal.schedule.operationsStartMonth;
  const components: ComponentSummary[] = [];

  for (const c of deal.program.components) {
    const ops = deal.operations.find((o) => o.componentLabel === c.label);
    let noi = 0;
    if (ops) {
      for (let m = start; m < start + 12; m++) noi += componentOperating(deal, c, ops, m, false).noi;
    }
    const capRate = c.exitCapRate ?? deal.exit.exitCapRate;
    components.push({
      label: c.label,
      kind: c.kind,
      netSf: c.netSf,
      grossSf: c.grossSf,
      stabilizedNoi: noi,
      value: capRate > 0 ? noi / capRate : 0,
    });
  }

  return {
    components,
    totalStabilizedNoi: components.reduce((a, c) => a + c.stabilizedNoi, 0),
    totalValue: components.reduce((a, c) => a + c.value, 0),
  };
}
