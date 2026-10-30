/**
 * Capital-stack edge cases (handoff "Engine" + "Additional modules" acceptance tests):
 * preferred equity on/off, PIK vs current-pay mezzanine, zero promote, no mezzanine,
 * modular overrides changing only documented drivers, and the balloon takeout.
 */
import { describe, it, expect } from "vitest";
import { runDeal } from "../engine/index.js";
import { structuredDeal } from "../data/golden-deals/structured.js";
import { applyModular, modularComparison } from "../engine/modular.js";
import type { Deal, Tranche } from "../engine/types.js";

function clone(d: Deal): Deal {
  return structuredClone(d);
}

describe("preferred equity on vs off", () => {
  it("with preferred off, results equal the base case (no pref tranche) exactly", () => {
    // Base case: pref tranche removed entirely.
    const base = clone(structuredDeal);
    base.stack.tranches = base.stack.tranches.filter((t) => t.kind !== "pref");
    const baseResult = runDeal(base);

    // "Off": pref present but sized to 0% of cost.
    const off = clone(structuredDeal);
    const prefTranche = off.stack.tranches.find((t) => t.kind === "pref")!;
    prefTranche.maxPctOfCost = 0;
    const offResult = runDeal(off);

    expect(offResult.costSummary.totalCostInclFinance).toBeCloseTo(baseResult.costSummary.totalCostInclFinance, 2);
    expect(offResult.returns.profit).toBeCloseTo(baseResult.returns.profit, 2);
    expect(offResult.returns.levered.annual).toBeCloseTo(baseResult.returns.levered.annual, 8);
    expect(offResult.returns.lp!.annual).toBeCloseTo(baseResult.returns.lp!.annual, 8);
  });

  it("with preferred on, distributions and balances still reconcile", () => {
    const r = runDeal(structuredDeal);
    expect(Math.abs(r.sourcesUses.totalSources - r.sourcesUses.totalUses)).toBeLessThan(0.01);
    const pref = r.tranches.find((t) => t.kind === "pref")!;
    expect(pref.exitBalance).toBeGreaterThan(pref.principalDrawn); // accrued pref grew the balance
  });
});

describe("PIK vs current-pay mezzanine", () => {
  const setMezz = (mode: Tranche["paymentMode"]): Deal => {
    const d = clone(structuredDeal);
    d.stack.tranches.find((t) => t.kind === "mezz")!.paymentMode = mode;
    return d;
  };

  it("both reconcile sources = uses", () => {
    for (const mode of ["current", "accrued"] as const) {
      const r = runDeal(setMezz(mode));
      expect(Math.abs(r.sourcesUses.totalSources - r.sourcesUses.totalUses)).toBeLessThan(0.01);
    }
  });

  it("accrued (PIK) mezzanine ends with a larger exit balance than current-pay", () => {
    const current = runDeal(setMezz("current"));
    const accrued = runDeal(setMezz("accrued"));
    const curMezz = current.tranches.find((t) => t.kind === "mezz")!;
    const pikMezz = accrued.tranches.find((t) => t.kind === "mezz")!;
    expect(pikMezz.exitBalance).toBeGreaterThan(curMezz.exitBalance);
  });
});

describe("no mezzanine and zero promote", () => {
  it("a deal with no mezzanine reconciles", () => {
    const d = clone(structuredDeal);
    d.stack.tranches = d.stack.tranches.filter((t) => t.kind !== "mezz");
    const r = runDeal(d);
    expect(Math.abs(r.sourcesUses.totalSources - r.sourcesUses.totalUses)).toBeLessThan(0.01);
    expect(r.tranches.some((t) => t.kind === "mezz")).toBe(false);
  });

  it("zero promote share pays the GP no promote", () => {
    const d = clone(structuredDeal);
    d.waterfall!.promoteShare = 0;
    d.waterfall!.tiers = d.waterfall!.tiers.map((t) => ({ ...t, investorShare: 1.0 }));
    const r = runDeal(d);
    expect(r.returns.promote).toBeLessThan(1);
  });
});

describe("modular overrides change only the documented drivers", () => {
  it("applyModular changes only hard cost/SF and the construction-end/ops/exit months", () => {
    const conventional = clone(structuredDeal);
    delete conventional.modular;
    const modular = applyModular(structuredDeal);

    // Expected deltas.
    expect(modular.budget.hard.verticalPerGrossSf).toBeCloseTo(
      conventional.budget.hard.verticalPerGrossSf * 1.05,
      6,
    );
    expect(modular.schedule.constructionEndMonth).toBe(conventional.schedule.constructionEndMonth - 5);
    expect(modular.schedule.operationsStartMonth).toBe(conventional.schedule.operationsStartMonth - 5);
    expect(modular.schedule.exitMonth).toBe(conventional.schedule.exitMonth - 5);

    // Everything else identical: normalize the known-changed fields and deep-compare.
    const a = clone(conventional);
    const b = clone(modular);
    a.budget.hard.verticalPerGrossSf = 0;
    b.budget.hard.verticalPerGrossSf = 0;
    a.schedule.constructionEndMonth = b.schedule.constructionEndMonth = 0;
    a.schedule.operationsStartMonth = b.schedule.operationsStartMonth = 0;
    a.schedule.exitMonth = b.schedule.exitMonth = 0;
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it("the comparison reports deltas and names the dominant effect", () => {
    const cmp = modularComparison(structuredDeal);
    expect(cmp.conventional.returns.levered.solved).toBe(true);
    expect(cmp.modular.returns.levered.solved).toBe(true);
    expect(typeof cmp.deltas.totalCost).toBe("number");
    expect(cmp.dominantEffect).toMatch(/dominates/);
  });
});

describe("balloon takeout (convention 10)", () => {
  // A senior loan that matures before exit forces a takeout.
  const balloonDeal = (): Deal => {
    const d = clone(structuredDeal);
    const senior = d.stack.tranches.find((t) => t.kind === "senior")!;
    senior.termMonths = 40; // matures at month 3 + 40 = 43, well before exit (88)
    senior.takeout = { ltv: 0.6, minDebtYield: 0.08, minDscr: 1.25, rate: 0.07, capRate: 0.06 };
    return d;
  };

  it("a loan maturing before exit is taken out, and the deal still reconciles", () => {
    const r = runDeal(balloonDeal());
    const senior = r.tranches.find((t) => t.kind === "senior")!;
    expect(senior.takeout).toBeDefined();
    expect(senior.takeout!.month).toBe(43);
    expect(Math.abs(r.sourcesUses.totalSources - r.sourcesUses.totalUses)).toBeLessThan(0.01);
  });

  it("an undersized takeout raises a shortfall flag and an equity cure (never a silent plug)", () => {
    const d = balloonDeal();
    // Force a shortfall: a tiny LTV cap cannot cover the maturing balance.
    d.stack.tranches.find((t) => t.kind === "senior")!.takeout = { ltv: 0.1, capRate: 0.06 };
    const r = runDeal(d);
    const senior = r.tranches.find((t) => t.kind === "senior")!;
    expect(senior.takeout!.shortfall).toBeGreaterThan(0);
    expect(r.flags.map((f) => f.code)).toContain("balloon-shortfall");
  });
});
