/**
 * Mixed-use & phasing acceptance tests (handoff "Additional modules"):
 *   - component NOI sums to total NOI;
 *   - phase cost allocations sum to total shared cost;
 *   - a one-phase deal equals the same deal without phasing.
 */
import { describe, it, expect } from "vitest";
import { runDeal } from "../engine/index.js";
import { componentBreakdown } from "../engine/proforma/components.js";
import { allocateSharedCost } from "../engine/proforma/phasing.js";
import { structuredDeal } from "../data/golden-deals/structured.js";
import type { Deal } from "../engine/types.js";

/** structuredDeal plus a ground-floor retail component (mixed-use). */
function mixedUseDeal(): Deal {
  const d: Deal = structuredClone(structuredDeal);
  d.program.components.push({
    kind: "retail",
    label: "ground-floor retail",
    netSf: 12_000,
    grossSf: 13_000,
    commercialRentPsfPerYear: 34, // $/leasable SF/yr, sample
    exitCapRate: 0.065,
    leasing: { leaseType: "NNN", freeRentMonths: 3, tiAllowancePsf: 45, leasingCommissionPct: 0.05 },
  });
  d.operations.push({
    componentLabel: "ground-floor retail",
    vacancy: 0,
    managementPctOfEgi: 0.03,
    fixedOpexPerYear: 40_000,
    variableOpexPctOfEgi: 0,
    rentGrowth: 0.03,
    opexGrowth: 0.03,
    growthFrom: "operations-start",
    source: "sample",
  });
  return d;
}

describe("mixed-use — component NOI sums to total NOI", () => {
  it("per-component stabilized NOI sums to the engine's total stabilized NOI", () => {
    const d = mixedUseDeal();
    const result = runDeal(d);
    const bd = componentBreakdown(d);
    const sum = bd.components.reduce((a, c) => a + c.stabilizedNoi, 0);
    expect(sum).toBeCloseTo(result.stabilizedNoiYear1, 2);
    expect(bd.totalStabilizedNoi).toBeCloseTo(result.stabilizedNoiYear1, 2);
    // Two components, both contributing positive NOI.
    expect(bd.components).toHaveLength(2);
    for (const c of bd.components) expect(c.stabilizedNoi).toBeGreaterThan(0);
  });

  it("the retail component is valued at its own cap rate", () => {
    const d = mixedUseDeal();
    const bd = componentBreakdown(d);
    const retail = bd.components.find((c) => c.kind === "retail")!;
    expect(retail.value).toBeCloseTo(retail.stabilizedNoi / 0.065, 2);
  });

  it("the mixed-use deal still reconciles sources = uses", () => {
    const r = runDeal(mixedUseDeal());
    expect(Math.abs(r.sourcesUses.totalSources - r.sourcesUses.totalUses)).toBeLessThan(0.01);
  });
});

describe("phasing — shared-cost allocation", () => {
  const twoPhase = (): Deal => {
    const d = mixedUseDeal();
    d.phases = [
      { label: "Phase 1 (apartments)", componentLabels: ["apartments"], constructionStartMonth: 3, constructionEndMonth: 27, operationsStartMonth: 28 },
      { label: "Phase 2 (retail)", componentLabels: ["ground-floor retail"], constructionStartMonth: 10, constructionEndMonth: 20, operationsStartMonth: 21 },
    ];
    return d;
  };

  it("allocations sum to the total shared cost (by GFA)", () => {
    const d = twoPhase();
    const total = 6_000_000;
    const alloc = allocateSharedCost(d, total);
    const sum = alloc.phases.reduce((a, p) => a + p.amount, 0);
    expect(sum).toBeCloseTo(total, 6);
    expect(alloc.phases).toHaveLength(2);
    // Apartments have far more GFA, so they carry the larger share.
    expect(alloc.phases[0]!.amount).toBeGreaterThan(alloc.phases[1]!.amount);
  });

  it("custom shares sum to the total", () => {
    const d = twoPhase();
    const alloc = allocateSharedCost(d, 1_000_000, [0.7, 0.3]);
    expect(alloc.phases.reduce((a, p) => a + p.amount, 0)).toBeCloseTo(1_000_000, 6);
    expect(alloc.phases[0]!.amount).toBeCloseTo(700_000, 2);
  });

  it("a single phase receives the whole shared cost", () => {
    const d = mixedUseDeal();
    d.phases = [{ label: "Single", componentLabels: ["apartments", "ground-floor retail"], constructionStartMonth: 3, constructionEndMonth: 27, operationsStartMonth: 28 }];
    const alloc = allocateSharedCost(d, 5_000_000);
    expect(alloc.phases).toHaveLength(1);
    expect(alloc.phases[0]!.amount).toBeCloseTo(5_000_000, 6);
  });
});

describe("phasing — a one-phase deal equals the same deal without phasing", () => {
  it("adding a single all-encompassing phase does not change the engine result", () => {
    const base = runDeal(mixedUseDeal());
    const d = mixedUseDeal();
    d.phases = [{ label: "All", componentLabels: ["apartments", "ground-floor retail"], constructionStartMonth: 3, constructionEndMonth: 27, operationsStartMonth: 28 }];
    const phased = runDeal(d);
    expect(phased.returns.profit).toBeCloseTo(base.returns.profit, 2);
    expect(phased.returns.levered.annual).toBeCloseTo(base.returns.levered.annual, 10);
    expect(phased.costSummary.totalCostInclFinance).toBeCloseTo(base.costSummary.totalCostInclFinance, 2);
  });
});
