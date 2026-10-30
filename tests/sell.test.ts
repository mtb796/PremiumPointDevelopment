/**
 * Build-to-sell acceptance tests (handoff one-page flow):
 *   - for-sale (units over absorption) and bulk-sale both reconcile sources = uses;
 *   - debt is repaid from sales during the sellout;
 *   - the hold-vs-sell verdict names a winner, margin, and crossover.
 */
import { describe, it, expect } from "vitest";
import { runDeal } from "../engine/index.js";
import { compareHoldSell } from "../engine/verdict.js";
import { structuredDeal } from "../data/golden-deals/structured.js";
import type { Deal } from "../engine/types.js";

/** structuredDeal configured for a for-sale (condo) plan. */
function sellUnitsDeal(): Deal {
  const d: Deal = structuredClone(structuredDeal);
  d.businessPlan = "sell";
  d.forSale = {
    mode: "units",
    pricePerSf: 650, // sample for-sale price, $/net SF
    absorptionUnitsPerMonth: 12,
    sellingCostPct: 0.05,
  };
  return d;
}

function sellBulkDeal(): Deal {
  const d: Deal = structuredClone(structuredDeal);
  d.businessPlan = "sell";
  d.forSale = { mode: "bulk", bulkPricePerSf: 560, sellingCostPct: 0.02 };
  return d;
}

describe("build-to-sell — units (absorption)", () => {
  const r = runDeal(sellUnitsDeal());

  it("reconciles sources = uses to the cent", () => {
    expect(Math.abs(r.sourcesUses.totalSources - r.sourcesUses.totalUses)).toBeLessThan(0.01);
  });

  it("repays the debt from sales (no residual balance) and has no operations NOI", () => {
    const last = r.monthly[r.monthly.length - 1]!;
    expect(Math.abs(last.debtBalanceClose)).toBeLessThan(1);
    expect(r.stabilizedNoiYear1).toBe(0);
    expect(r.flags.map((f) => f.code)).not.toContain("sell-debt-undercovered");
  });

  it("each tranche balance rolls forward every month (close = open + draw + capitalized interest - repaid)", () => {
    for (const tr of r.tranches) {
      for (const row of tr.monthly) {
        // capitalizedInterest is the portion added to the balance (interest not paid in
        // cash from sale proceeds); paid interest is tracked separately in currentInterest.
        const expectedClose = row.open + row.draw + row.capitalizedInterest - row.repaid;
        expect(Math.abs(expectedClose - row.close), `${tr.kind} m${row.month}`).toBeLessThan(0.01);
      }
    }
  });

  it("profit equals net sales minus total cost incl. finance", () => {
    expect(r.returns.profit).toBeCloseTo(r.exit.netProceeds - r.costSummary.totalCostInclFinance, 2);
    expect(r.returns.profit).toBeGreaterThan(0);
    expect(r.returns.project.solved).toBe(true);
    expect(r.returns.levered.solved).toBe(true);
  });
});

describe("build-to-sell — bulk sale at delivery", () => {
  const r = runDeal(sellBulkDeal());

  it("reconciles and sells in a single month at delivery", () => {
    expect(Math.abs(r.sourcesUses.totalSources - r.sourcesUses.totalUses)).toBeLessThan(0.01);
    const saleMonths = r.monthly.filter((row) => row.saleGrossProceeds > 0);
    expect(saleMonths).toHaveLength(1);
  });

  it("finance carry is lower than the slower units absorption (sold sooner)", () => {
    const units = runDeal(sellUnitsDeal());
    const bulk = runDeal(sellBulkDeal());
    expect(bulk.costSummary.financeCost).toBeLessThan(units.costSummary.financeCost);
  });
});

describe("hold stays unchanged when businessPlan is unset or 'hold'", () => {
  it("an explicit hold plan equals the default", () => {
    const explicit = structuredClone(structuredDeal);
    explicit.businessPlan = "hold";
    const a = runDeal(structuredDeal);
    const b = runDeal(explicit);
    expect(b.returns.profit).toBeCloseTo(a.returns.profit, 2);
    expect(b.returns.levered.annual).toBeCloseTo(a.returns.levered.annual, 10);
  });
});

describe("hold vs. sell verdict", () => {
  const dealWithSell = (): Deal => {
    const d = sellUnitsDeal();
    // keep the hold `exit` (already on structuredDeal) so both cases can run.
    return d;
  };

  it("names a winner, margin, and reason under each objective", () => {
    for (const objective of ["total-profit", "return-speed", "risk-adjusted"] as const) {
      const v = compareHoldSell(dealWithSell(), objective);
      expect(v.winner === "hold" || v.winner === "sell").toBe(true);
      expect(v.margin).toBeGreaterThanOrEqual(0);
      expect(v.reason.length).toBeGreaterThan(0);
      expect(v.hold.stabilizedNoiYear1).toBeGreaterThan(0); // hold case operates
      expect(v.sell.stabilizedNoiYear1).toBe(0); // sell case does not
    }
  });

  it("total-profit winner matches the higher profit of the two cases", () => {
    const v = compareHoldSell(dealWithSell(), "total-profit");
    const higher = v.sell.returns.profit >= v.hold.returns.profit ? "sell" : "hold";
    expect(v.winner).toBe(higher);
  });
});
