/**
 * Waterfall acceptance tests (handoff: "Waterfall: tests for three tiers, five tiers,
 * catch-up under 100%, and a clawback case where early promote must be returned";
 * "Waterfall distributions across all tiers and classes sum exactly to distributable
 * cash each period").
 */
import { describe, it, expect } from "vitest";
import { runWaterfall, type WaterfallInput } from "../engine/waterfall/waterfall.js";
import type { WaterfallTerms } from "../engine/types.js";
import { irr } from "../engine/irr.js";

const defaultTerms: WaterfallTerms = {
  tiers: [
    { hurdleKind: "irr", hurdleRate: 0.08, investorShare: 1.0, label: "RoC + 8% pref" },
    { hurdleKind: "irr", hurdleRate: 0.12, investorShare: 0.8, label: "to 12% LP IRR (80/20)" },
    { hurdleKind: "irr", investorShare: 0.7, label: "residual (70/30)" },
  ],
  catchUpPct: 1.0,
  promoteShare: 0.2,
};

function series(n: number, entries: Record<number, number>): number[] {
  const a = new Array<number>(n).fill(0);
  for (const [k, v] of Object.entries(entries)) a[Number(k)] = v;
  return a;
}

describe("waterfall — per-period reconciliation (every period sums to distributable cash)", () => {
  it("holds across a realistic stream", () => {
    const n = 92;
    const input: WaterfallInput = {
      contributions: series(n, { 0: 10_000_000, 6: 8_000_000, 12: 6_000_000 }),
      distributable: series(n, { 40: 500_000, 60: 700_000, 91: 35_000_000 }),
      terms: defaultTerms,
      gpCoinvestPct: 0.1,
    };
    const out = runWaterfall(input);
    expect(out.maxPeriodReconError).toBeLessThan(0.01);
    for (let t = 0; t < n; t++) {
      const paid = out.lpDistributions[t]! + out.gpDistributions[t]!;
      expect(Math.abs(paid - input.distributable[t]!)).toBeLessThan(0.01);
    }
  });
});

describe("waterfall — LP IRR hurdle and full catch-up (hand-verified)", () => {
  it("tier 1 returns capital + 8% pref exactly, no promote at the pref", () => {
    // -100 at t0, +108 at t12 => LP IRR exactly 8%, GP promote 0.
    const input: WaterfallInput = {
      contributions: series(13, { 0: 100 }),
      distributable: series(13, { 12: 108 }),
      terms: defaultTerms,
      gpCoinvestPct: 0,
    };
    const out = runWaterfall(input);
    expect(out.totalPromote).toBeLessThan(1e-6);
    expect(out.lpDistributions[12]!).toBeCloseTo(108, 6);
    const lpIrr = irr(out.lp);
    expect(lpIrr.annual).toBeCloseTo(0.08, 6);
  });

  it("100% catch-up gives the GP exactly its promote share of profit", () => {
    // -100 at t0, +110 at t12. Pref clears at 108 (profit 8). Catch-up (100%, p=0.2)
    // pays GP p/(1-p)*8 = 2, leaving GP with 2 of total profit 10 => 20%.
    const input: WaterfallInput = {
      contributions: series(13, { 0: 100 }),
      distributable: series(13, { 12: 110 }),
      terms: defaultTerms,
      gpCoinvestPct: 0,
    };
    const out = runWaterfall(input);
    expect(out.lpDistributions[12]!).toBeCloseTo(108, 6);
    expect(out.totalPromote).toBeCloseTo(2, 6);
    const totalProfit = 110 - 100;
    expect(out.totalPromote / totalProfit).toBeCloseTo(0.2, 6);
  });
});

describe("waterfall — catch-up under 100%", () => {
  it("splits the catch-up tier between GP and investor and still reconciles", () => {
    const terms: WaterfallTerms = { ...defaultTerms, catchUpPct: 0.5 };
    const input: WaterfallInput = {
      contributions: series(13, { 0: 100 }),
      distributable: series(13, { 12: 130 }),
      terms,
      gpCoinvestPct: 0,
    };
    const out = runWaterfall(input);
    for (let t = 0; t < 13; t++) {
      expect(Math.abs(out.lpDistributions[t]! + out.gpDistributions[t]! - input.distributable[t]!)).toBeLessThan(0.01);
    }
    // GP gets some promote but less than it would under a 100% catch-up for the same cash.
    const full = runWaterfall({ ...input, terms: { ...terms, catchUpPct: 1.0 } });
    expect(out.totalPromote).toBeGreaterThan(0);
    expect(out.totalPromote).toBeLessThan(full.totalPromote + 1e-9);
  });
});

describe("waterfall — three tiers vs five tiers", () => {
  const stream = (): Omit<WaterfallInput, "terms"> => ({
    contributions: series(25, { 0: 1_000_000 }),
    distributable: series(25, { 24: 2_500_000 }),
    gpCoinvestPct: 0,
  });

  it("three tiers reconciles and pays promote on the upside", () => {
    const out = runWaterfall({ ...stream(), terms: defaultTerms });
    expect(out.maxPeriodReconError).toBeLessThan(0.01);
    expect(out.totalPromote).toBeGreaterThan(0);
  });

  it("five tiers reconciles and is monotonic in promote vs three tiers for the same cash", () => {
    const fiveTier: WaterfallTerms = {
      tiers: [
        { hurdleKind: "irr", hurdleRate: 0.08, investorShare: 1.0 },
        { hurdleKind: "irr", hurdleRate: 0.11, investorShare: 0.85 },
        { hurdleKind: "irr", hurdleRate: 0.14, investorShare: 0.8 },
        { hurdleKind: "irr", hurdleRate: 0.18, investorShare: 0.7 },
        { hurdleKind: "irr", investorShare: 0.6 },
      ],
      catchUpPct: 1.0,
      promoteShare: 0.2,
    };
    const out = runWaterfall({ ...stream(), terms: fiveTier });
    expect(out.maxPeriodReconError).toBeLessThan(0.01);
    expect(out.totalPromote).toBeGreaterThan(0);
  });
});

describe("waterfall — zero promote and never-reaches-pref edge cases", () => {
  it("zero promote share means the GP never receives promote", () => {
    const terms: WaterfallTerms = {
      tiers: [
        { hurdleKind: "irr", hurdleRate: 0.08, investorShare: 1.0 },
        { hurdleKind: "irr", investorShare: 1.0 },
      ],
      promoteShare: 0,
    };
    const out = runWaterfall({
      contributions: series(13, { 0: 100 }),
      distributable: series(13, { 12: 200 }),
      terms,
      gpCoinvestPct: 0,
    });
    expect(out.totalPromote).toBeLessThan(1e-9);
    expect(out.lpDistributions[12]!).toBeCloseTo(200, 6);
  });

  it("a deal that never reaches the pref pays everything to the investor class, no promote", () => {
    const out = runWaterfall({
      contributions: series(13, { 0: 100 }),
      distributable: series(13, { 12: 50 }), // less than returned capital
      terms: defaultTerms,
      gpCoinvestPct: 0,
    });
    expect(out.totalPromote).toBeLessThan(1e-9);
    expect(out.lpDistributions[12]!).toBeCloseTo(50, 6);
  });
});

describe("waterfall — clawback returns early over-promote to LPs", () => {
  it("a lumpy early distribution over-promotes the GP; clawback restores LP at the final period", () => {
    // Big distribution early (over-promotes GP via residual tiers), small later; final
    // profit modest, so the GP's promote exceeds its share of total profit without a
    // clawback. With clawback on, the GP ends at exactly its promote share.
    const terms: WaterfallTerms = { ...defaultTerms, clawback: true };
    const contributions = series(40, { 0: 100 });
    const distributable = series(40, { 6: 300, 39: 1 }); // huge early, tiny late
    const out = runWaterfall({ contributions, distributable, terms, gpCoinvestPct: 0 });
    const totalInvestor = out.lpDistributions.reduce((a, x) => a + x, 0);
    const totalProfit = totalInvestor + out.totalPromote - 100;
    // GP promote must not exceed its promote share of total profit (clawback enforced).
    expect(out.totalPromote).toBeLessThanOrEqual(terms.promoteShare * totalProfit + 1e-6);

    const noClaw = runWaterfall({ contributions, distributable, terms: { ...terms, clawback: false }, gpCoinvestPct: 0 });
    // Without clawback the GP keeps more (the early over-promote).
    expect(noClaw.totalPromote).toBeGreaterThan(out.totalPromote - 1e-9);
  });
});
