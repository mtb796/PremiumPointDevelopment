/**
 * Engine entry point: `runDeal` turns a Deal into a reconciled Result.
 *
 * Pipeline: non-finance cost buildup -> construction spend schedule -> operations /
 * exit value -> the circularity solve over the multi-tranche capital stack (senior,
 * mezzanine, preferred equity, with the interest-reserve iteration) -> the optional
 * distribution waterfall -> returns. Every convention referenced is in engine/README.md.
 *
 * Pure and deterministic: no UI, no network.
 */
import type { Deal, Flag, Money, Result, Returns, SourcesUses } from "./types.js";
import { irr } from "./irr.js";
import { computeNonFinanceCosts } from "./proforma/costs.js";
import { spendWeights } from "./proforma/spend.js";
import { forward12Noi, stabilizedNoiYear1 as computeStabilizedNoi } from "./proforma/operations.js";
import { NonConvergenceError, solveTotalCost } from "./solve.js";
import { simulateStack, type StackContext, type StackResult } from "./debt/stack.js";
import { simulateSell } from "./debt/sell.js";
import { runWaterfall } from "./waterfall/waterfall.js";
import { componentBreakdown } from "./proforma/components.js";

export function runDeal(deal: Deal): Result {
  const flags: Flag[] = [];

  const nf = computeNonFinanceCosts(deal);

  const { constructionStartMonth: cStart, constructionEndMonth: cEnd, exitMonth } = deal.schedule;
  const nConstruction = cEnd - cStart + 1;
  const weights = spendWeights(deal.budget.spendCurve, nConstruction);
  const constructionTotal = nf.hard.total + nf.soft + nf.developerFee;
  const hardSoftSpend: number[] = new Array<number>(exitMonth + 1).fill(0);
  for (let i = 0; i < nConstruction; i++) hardSoftSpend[cStart + i] = constructionTotal * weights[i]!;

  const isSell = deal.businessPlan === "sell";

  // Hold exit value (convention 9). Unused for the sell path.
  const f12 = isSell ? 0 : forward12Noi(deal, exitMonth);
  const noiY1 = isSell ? 0 : computeStabilizedNoi(deal);
  const holdGrossValue = isSell ? 0 : f12 / deal.exit.exitCapRate;
  const holdSellingCosts = holdGrossValue * deal.exit.sellingCostPct;

  const ctx: StackContext = {
    deal,
    nf,
    hardSoftSpend,
    grossValue: holdGrossValue,
    sellingCosts: holdSellingCosts,
    stabilizedNoiYear1: noiY1,
  };
  const simulate = (tc: number): StackResult =>
    isSell ? simulateSell(deal, hardSoftSpend, tc) : simulateStack(ctx, tc);

  // ---- Circularity solve (convention 7): total cost includes finance cost. ----
  let totalCost: Money;
  let sim: StackResult;
  try {
    totalCost = solveTotalCost(nf.total, (tc) => nf.total + simulate(tc).financeCost);
    sim = simulate(totalCost);
  } catch (e) {
    if (e instanceof NonConvergenceError) {
      flags.push({ level: "error", code: "non-convergence", message: e.message });
    }
    throw e; // forced non-convergence raises a visible error (convention 7)
  }
  flags.push(...sim.flags);

  const financeCost = sim.financeCost;

  // ---- Exit / disposition summary (hold: cap-rate sale; sell: aggregated sales). ----
  const grossValue = isSell ? sim.rows.reduce((a, r) => a + r.saleGrossProceeds, 0) : holdGrossValue;
  const sellingCosts = isSell ? sim.rows.reduce((a, r) => a + r.sellingCosts, 0) : holdSellingCosts;
  const netProceeds = grossValue - sellingCosts;

  // ---- Cash-flow series. ----
  const unlevered = sim.rows.map((r) => r.unleveredCashFlow);
  const levered = sim.rows.map((r) => r.leveredCashFlow); // total equity (= distributable - contributions)
  const projectIrr = irr(unlevered);
  const leveredIrr = irr(levered);
  if (!projectIrr.solved) flags.push({ level: "warning", code: "irr-unsolved", message: "Unlevered IRR could not be bracketed." });
  if (!leveredIrr.solved) flags.push({ level: "warning", code: "irr-unsolved", message: "Levered IRR could not be bracketed." });

  // ---- Waterfall (optional). LP/GP split the equity cash flows. ----
  let lpIrr: Returns["lp"];
  let gpIrr: Returns["gp"];
  let promote: Money | undefined;
  if (deal.waterfall) {
    const wf = runWaterfall({
      contributions: sim.equityContributions,
      distributable: sim.distributable,
      terms: deal.waterfall,
      gpCoinvestPct: deal.stack.equity.gpCoinvestPct,
    });
    lpIrr = irr(wf.lp);
    gpIrr = irr(wf.gp);
    promote = wf.totalPromote;
    if (wf.maxPeriodReconError > 0.01) {
      flags.push({ level: "error", code: "waterfall-recon", message: `Waterfall period reconciliation error $${wf.maxPeriodReconError.toFixed(2)}.` });
    }
  }

  // ---- Returns. ----
  const profit = netProceeds - totalCost;
  const equity = sim.equityForCostTotal;
  const distributions = levered.reduce((a, f) => (f > 0 ? a + f : a), 0);
  const contributions = levered.reduce((a, f) => (f < 0 ? a - f : a), 0);
  const equityMultiple = contributions > 0 ? distributions / contributions : NaN;

  // Stabilized debt service: interest-only on current-pay tranches.
  const currentPayCommitment = sim.tranches
    .filter((t) => (t.kind === "senior" || t.kind === "mezz"))
    .reduce((a, t) => a + t.commitment, 0);
  const annualDebtService = sim.tranches
    .filter((t) => t.kind === "senior" || t.kind === "mezz")
    .reduce((a, t) => a + t.commitment * t.rate, 0);

  const returns: Returns = {
    project: projectIrr,
    levered: leveredIrr,
    equityMultiple,
    peakEquity: sim.peakEquity,
    yieldOnCost: noiY1 / totalCost,
    profitOnCost: profit / totalCost,
    profit,
    returnOnEquity: equity > 0 ? profit / equity : NaN,
    ...(lpIrr ? { lp: lpIrr } : {}),
    ...(gpIrr ? { gp: gpIrr } : {}),
    ...(promote !== undefined ? { promote } : {}),
    ...(annualDebtService > 0 ? { stabilizedDscr: noiY1 / annualDebtService } : {}),
    ...(currentPayCommitment > 0 ? { debtYield: noiY1 / currentPayCommitment } : {}),
  };

  // ---- Sources & uses (development capital; convention 11, to the cent). ----
  const uses = [
    { label: "Land (incl. closing costs)", amount: nf.land },
    { label: "Hard cost", amount: nf.hard.total },
    { label: "Soft cost", amount: nf.soft + nf.developerFee },
    { label: "Origination fees", amount: sim.originationFeeTotal },
    { label: "Capitalized interest (reserve)", amount: sim.capitalizedInterestTotal },
  ];
  const sources = [
    { label: "Common equity", amount: sim.equityForCostTotal },
    ...sim.tranches.map((t) => ({ label: t.label, amount: t.principalDrawn + t.capitalizedInterestTotal })),
  ];
  const sourcesUses: SourcesUses = {
    uses,
    sources,
    totalUses: uses.reduce((a, u) => a + u.amount, 0),
    totalSources: sources.reduce((a, s) => a + s.amount, 0),
  };

  // Exit debt payoff. Hold: principal + exit fees repaid at the cap-rate sale. Sell:
  // debt is repaid from sales during the sellout, so only any residual balance remains.
  const debtPayoff = isSell
    ? sim.tranches.reduce((a, t) => a + t.exitBalance, 0)
    : sim.tranches.reduce((a, t) => a + t.exitBalance + t.exitFee, 0);

  return {
    monthly: sim.rows,
    tranches: sim.tranches,
    components: componentBreakdown(deal).components,
    sourcesUses,
    costSummary: {
      land: nf.land,
      hard: nf.hard.total,
      soft: nf.soft + nf.developerFee,
      financeCost,
      totalCostInclFinance: totalCost,
    },
    exit: {
      forward12Noi: f12,
      grossValue,
      sellingCosts,
      netProceeds,
      debtPayoff,
    },
    stabilizedNoiYear1: noiY1,
    returns,
    flags,
  };
}
