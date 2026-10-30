/**
 * Unit tests for the engine primitives the reference deal is built on.
 * These pin the conventions so a later change that breaks them fails loudly.
 */
import { describe, it, expect } from "vitest";
import { monthlyInterest, monthlyGrowthRate, trendFactor } from "../engine/rates.js";
import { irr, npv, annualizeIrr, monthlyIrr } from "../engine/irr.js";
import { spendWeights } from "../engine/proforma/spend.js";
import { computeNonFinanceCosts } from "../engine/proforma/costs.js";
import { apraoDeal } from "../data/golden-deals/aprao.js";

describe("rates (convention 2)", () => {
  it("monthly interest is opening balance * annual rate / 12", () => {
    expect(monthlyInterest(1_000_000, 0.07)).toBeCloseTo(5833.3333, 3);
  });

  it("growth compounds monthly to the annual rate", () => {
    const g = monthlyGrowthRate(0.03);
    expect(Math.pow(1 + g, 12)).toBeCloseTo(1.03, 10);
  });

  it("trend factor over 12 months equals (1 + annual)", () => {
    expect(trendFactor(0.03, 12)).toBeCloseTo(1.03, 10);
    expect(trendFactor(0.03, 60)).toBeCloseTo(Math.pow(1.03, 5), 10);
  });
});

describe("irr (convention 3)", () => {
  it("annualizes a monthly IRR as (1+m)^12 - 1", () => {
    expect(annualizeIrr(0.01)).toBeCloseTo(Math.pow(1.01, 12) - 1, 12);
  });

  it("solves a simple two-flow IRR", () => {
    // -100 at t0, +100*(1.01)^12 at t12 => monthly IRR 1%, annual ~12.68%
    const flows = [-100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100 * Math.pow(1.01, 12)];
    const r = irr(flows);
    expect(r.solved).toBe(true);
    expect(r.monthly).toBeCloseTo(0.01, 8);
    expect(r.annual).toBeCloseTo(Math.pow(1.01, 12) - 1, 8);
  });

  it("npv at the solved rate is ~0", () => {
    const flows = [-500, 50, 50, 50, 50, 50, 600];
    const { monthly } = monthlyIrr(flows);
    expect(Math.abs(npv(flows, monthly))).toBeLessThan(1e-6);
  });

  it("reports unsolved when there is no sign change", () => {
    const r = irr([100, 100, 100]);
    expect(r.solved).toBe(false);
  });
});

describe("spend curve", () => {
  it("weights always sum to 1", () => {
    for (const curve of [
      { kind: "linear" } as const,
      { kind: "s-curve", steepness: 2 } as const,
      { kind: "s-curve", steepness: 3 } as const,
    ]) {
      const w = spendWeights(curve, 27);
      expect(w.reduce((a, x) => a + x, 0)).toBeCloseTo(1, 10);
      expect(w.length).toBe(27);
    }
  });

  it("the S-curve is symmetric and front/back light", () => {
    const w = spendWeights({ kind: "s-curve", steepness: 2 }, 10);
    expect(w[0]!).toBeLessThan(w[4]!); // ramps up
    expect(w[9]!).toBeLessThan(w[5]!); // ramps down
    expect(w[0]!).toBeCloseTo(w[9]!, 10); // symmetric
  });
});

describe("cost buildup (Aprao lines)", () => {
  it("hard cost = vertical ($168 x gross) + lump sums + 5% contingency", () => {
    const nf = computeNonFinanceCosts(apraoDeal);
    expect(nf.hard.vertical).toBeCloseTo(168 * 242_702, 6);
    expect(nf.hard.lumpSums).toBeCloseTo(4_800_000 + 2_400_000 + 1_200_000 + 2_650_000, 6);
    expect(nf.hard.contingency).toBeCloseTo(nf.hard.subtotal * 0.05, 6);
    expect(nf.hard.total).toBeCloseTo(nf.hard.subtotal * 1.05, 6);
  });

  it("soft cost = 12.83% of total hard; land includes closing costs", () => {
    const nf = computeNonFinanceCosts(apraoDeal);
    expect(nf.soft).toBeCloseTo(nf.hard.total * 0.1283, 6);
    expect(nf.land).toBeCloseTo(9_600_000 + 313_200, 6);
  });
});
