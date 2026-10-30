/**
 * Scenarios & sensitivity acceptance tests (handoff "Additional modules"):
 *   - the base case in the tornado equals the main result exactly;
 *   - one engine run completes in under 50 ms;
 *   - plugging a breakeven value back into the engine returns zero profit within tolerance;
 *   - two-way tables centered on the base have the main result in the center cell;
 *   - residual land value plugged back returns the target profit.
 */
import { describe, it, expect } from "vitest";
import { runDeal } from "../engine/index.js";
import { structuredDeal } from "../data/golden-deals/structured.js";
import {
  tornado,
  twoWayTable,
  breakeven,
  residualLandValue,
  standardScenarios,
  flexDeal,
  metrics,
} from "../engine/scenarios/scenarios.js";

const base = runDeal(structuredDeal);

describe("tornado", () => {
  it("the base equals the main result exactly", () => {
    const t = tornado(structuredDeal);
    expect(t.base).toBe(base.returns.levered.annual);
  });

  it("is sorted by range (largest effect first) and every driver appears", () => {
    const t = tornado(structuredDeal);
    for (let i = 1; i < t.bars.length; i++) expect(t.bars[i - 1]!.range).toBeGreaterThanOrEqual(t.bars[i]!.range);
    const drivers = new Set(t.bars.map((b) => b.driver));
    for (const d of ["rent", "hardCost", "exitCap", "interestRate", "vacancy", "scheduleDelay"]) {
      expect(drivers.has(d as never)).toBe(true);
    }
  });
});

describe("performance", () => {
  it("one engine run completes in well under 50 ms", () => {
    // Warm up, then time a batch to average out noise.
    runDeal(structuredDeal);
    const N = 50;
    const start = performance.now();
    for (let i = 0; i < N; i++) runDeal(structuredDeal);
    const perRun = (performance.now() - start) / N;
    expect(perRun).toBeLessThan(50);
  });
});

describe("flexing", () => {
  it("a flex factor of 1 (or 0 delay) leaves the result unchanged", () => {
    expect(runDeal(flexDeal(structuredDeal, "rent", 1)).returns.levered.annual).toBeCloseTo(
      base.returns.levered.annual,
      10,
    );
    expect(runDeal(flexDeal(structuredDeal, "scheduleDelay", 0)).returns.profit).toBeCloseTo(base.returns.profit, 2);
  });

  it("higher rent raises profit; higher hard cost lowers it; a delay lowers levered IRR", () => {
    expect(metrics.profit(runDeal(flexDeal(structuredDeal, "rent", 1.1)))).toBeGreaterThan(base.returns.profit);
    expect(metrics.profit(runDeal(flexDeal(structuredDeal, "hardCost", 1.1)))).toBeLessThan(base.returns.profit);
    expect(metrics.leveredIrr(runDeal(flexDeal(structuredDeal, "scheduleDelay", 6)))).toBeLessThan(
      base.returns.levered.annual,
    );
  });
});

describe("two-way table", () => {
  it("the center cell equals the main result when the grid is centered on the base", () => {
    const t = twoWayTable(structuredDeal, "exitCap", [0.9, 1.0, 1.1], "rent", [0.9, 1.0, 1.1], metrics.leveredIrr);
    expect(t.grid[1]![1]!).toBeCloseTo(base.returns.levered.annual, 10);
  });
});

describe("breakevens", () => {
  it("the breakeven rent factor returns zero profit when plugged back in", () => {
    const be = breakeven(structuredDeal, "rent", { metric: metrics.profit, target: 0 });
    expect(be.solved).toBe(true);
    const check = runDeal(flexDeal(structuredDeal, "rent", be.factor)).returns.profit;
    expect(Math.abs(check)).toBeLessThan(1_000); // within $1k of zero profit
  });

  it("the breakeven exit-cap factor returns zero profit when plugged back in", () => {
    const be = breakeven(structuredDeal, "exitCap", { metric: metrics.profit, target: 0, lo: 0.8, hi: 2.0 });
    expect(be.solved).toBe(true);
    const check = runDeal(flexDeal(structuredDeal, "exitCap", be.factor)).returns.profit;
    expect(Math.abs(check)).toBeLessThan(1_000);
  });
});

describe("residual land value", () => {
  it("the land price that yields zero profit returns zero profit when plugged back in", () => {
    const rlv = residualLandValue(structuredDeal, { target: 0 });
    expect(rlv.solved).toBe(true);
    const d = structuredClone(structuredDeal);
    d.site.landPrice = rlv.landPrice;
    expect(Math.abs(runDeal(d).returns.profit)).toBeLessThan(1_000);
  });

  it("residual land value for a positive target profit is below the break-even land price", () => {
    const breakEven = residualLandValue(structuredDeal, { target: 0 }).landPrice;
    const withMargin = residualLandValue(structuredDeal, { target: 5_000_000 }).landPrice;
    expect(withMargin).toBeLessThan(breakEven);
  });
});

describe("standard scenario set", () => {
  it("base equals the main result; downside is worse than base", () => {
    const rows = standardScenarios(structuredDeal);
    const baseRow = rows.find((r) => r.label === "Base")!;
    const downRow = rows.find((r) => r.label === "Downside")!;
    expect(baseRow.leveredIrr).toBeCloseTo(base.returns.levered.annual, 10);
    expect(baseRow.profit).toBeCloseTo(base.returns.profit, 2);
    expect(downRow.profit).toBeLessThan(baseRow.profit);
  });
});
