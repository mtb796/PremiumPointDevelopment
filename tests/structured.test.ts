/**
 * Structured reference deal acceptance tests (handoff "Engine" + "Additional modules").
 *
 * - Sources equal uses to the cent.
 * - Each loan balance rolls forward correctly and is repaid by exit.
 * - Waterfall distributions across all tiers/classes sum to distributable cash each period.
 * - Project IRR matches an INDEPENDENT reconstruction (costs + operations + sale, a path
 *   that never touches the debt/waterfall code) within 0.01 percentage points.
 * - The equity cash flows split into LP + GP exactly each period.
 */
import { describe, it, expect } from "vitest";
import { runDeal } from "../engine/index.js";
import { structuredDeal } from "../data/golden-deals/structured.js";
import { irr } from "../engine/irr.js";
import { runWaterfall } from "../engine/waterfall/waterfall.js";
import { computeNonFinanceCosts } from "../engine/proforma/costs.js";
import { spendWeights } from "../engine/proforma/spend.js";
import { monthlyOperating, forward12Noi } from "../engine/proforma/operations.js";

const result = runDeal(structuredDeal);

describe("structured deal — reconciliation", () => {
  it("sources equal uses to the cent", () => {
    expect(Math.abs(result.sourcesUses.totalSources - result.sourcesUses.totalUses)).toBeLessThan(0.01);
  });

  it("runs clean (no operating cash calls or coverage flags)", () => {
    expect(result.flags.filter((f) => f.level === "error")).toHaveLength(0);
    expect(result.flags.map((f) => f.code)).not.toContain("operating-shortfall");
  });

  it("each tranche balance rolls forward every month", () => {
    for (const tr of result.tranches) {
      for (const row of tr.monthly) {
        const expectedClose = row.open + row.draw + row.capitalizedInterest - row.repaid;
        expect(Math.abs(expectedClose - row.close), `${tr.kind} m${row.month}`).toBeLessThan(0.01);
      }
      const last = tr.monthly[tr.monthly.length - 1]!;
      expect(Math.abs(last.close), `${tr.kind} not repaid`).toBeLessThan(0.01);
    }
  });

  it("the aggregate debt balance is fully repaid by exit", () => {
    const last = result.monthly[result.monthly.length - 1]!;
    expect(Math.abs(last.debtBalanceClose)).toBeLessThan(0.01);
  });
});

describe("structured deal — waterfall integration", () => {
  // Reconstruct the equity contribution / distributable series from the monthly rows
  // (distributable = leveredCashFlow + equityDraw) and re-run the waterfall.
  const contributions = result.monthly.map((r) => r.equityDraw);
  const distributable = result.monthly.map((r) => r.leveredCashFlow + r.equityDraw);
  const wf = runWaterfall({
    contributions,
    distributable,
    terms: structuredDeal.waterfall!,
    gpCoinvestPct: structuredDeal.stack.equity.gpCoinvestPct,
  });

  it("every period's LP + GP payments sum to distributable cash", () => {
    expect(wf.maxPeriodReconError).toBeLessThan(0.01);
    for (let t = 0; t < distributable.length; t++) {
      expect(Math.abs(wf.lpDistributions[t]! + wf.gpDistributions[t]! - distributable[t]!)).toBeLessThan(0.01);
    }
  });

  it("LP + GP net cash flows reconstruct the total equity cash flow each period", () => {
    for (let t = 0; t < result.monthly.length; t++) {
      const lpGp = wf.lp[t]! + wf.gp[t]!;
      expect(Math.abs(lpGp - result.monthly[t]!.leveredCashFlow)).toBeLessThan(0.01);
    }
  });

  it("the engine's LP and GP IRRs match the re-run waterfall", () => {
    expect(result.returns.lp!.annual).toBeCloseTo(irr(wf.lp).annual, 8);
    expect(result.returns.gp!.annual).toBeCloseTo(irr(wf.gp).annual, 8);
    expect(result.returns.promote).toBeCloseTo(wf.totalPromote, 2);
  });
});

describe("structured deal — project IRR vs independent reconstruction (within 0.01 pt)", () => {
  it("matches a costs+operations+sale path that never touches the debt/waterfall code", () => {
    const deal = structuredDeal;
    const nf = computeNonFinanceCosts(deal);
    const { constructionStartMonth: cS, constructionEndMonth: cE, operationsStartMonth: oS, exitMonth: xM, landMonth: lM } =
      deal.schedule;
    const n = cE - cS + 1;
    const w = spendWeights(deal.budget.spendCurve, n);
    const constructionTotal = nf.hard.total + nf.soft + nf.developerFee;

    const grossValue = forward12Noi(deal, xM) / deal.exit.exitCapRate;
    const netSale = grossValue * (1 - deal.exit.sellingCostPct);

    const flows: number[] = [];
    for (let m = 0; m <= xM; m++) {
      let cf = 0;
      if (m === lM) cf -= nf.land;
      if (m >= cS && m <= cE) cf -= constructionTotal * w[m - cS]!;
      if (m >= oS && m < xM) cf += monthlyOperating(deal, m, false).noi;
      if (m === xM) cf += netSale;
      flows.push(cf);
    }
    const independent = irr(flows);
    expect(independent.solved).toBe(true);
    expect(Math.abs(independent.annual - result.returns.project.annual)).toBeLessThan(0.0001);
  });
});
