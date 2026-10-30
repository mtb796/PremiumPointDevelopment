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
import { simulateStack, type StackContext } from "./debt/stack.js";
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

  const f12 = forward12Noi(deal, exitMonth);
  const noiY1 = computeStabilizedNoi(deal);

  const grossValue = f12 / deal.exit.exitCapRate;
  const sellingCosts = grossValue * deal.exit.sellingCostPct;
  const netProceeds = grossValue - sellingCosts;

  const ctx: StackContext = { deal, nf, hardSoftSpend, grossValue, sellingCosts, stabilizedNoiYear1: noiY1 };

  // ---- Circularity solve (convention 7): total cost includes finance cost. ----
  let totalCost: Money;
  let sim: ReturnType<typeof simulateStack>;
  try {
    totalCost = solveTotalCost(nf.total, (tc) => {
      const s = simulateStack(ctx, tc);
      return nf.total + s.capitalizedInterestTotal + s.originationFeeTotal + s.exitFeeTotal;
    });
    sim = simulateStack(ctx, totalCost);
  } catch (e) {
    if (e instanceof NonConvergenceError) {
      flags.push({ level: "error", code: "non-convergence", message: e.message });
    }
    throw e; // forced non-convergence raises a visible error (convention 7)
  }
  flags.push(...sim.flags);

  const financeCost = sim.capitalizedInterestTotal + sim.originationFeeTotal + sim.exitFeeTotal;

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

  // Exit debt payoff (principal + exit fees across tranches).
  const debtPayoff = sim.tranches.reduce((a, t) => a + t.exitBalance + t.exitFee, 0);

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
