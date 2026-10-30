/**
 * Engine entry point: `runDeal` turns a Deal into a reconciled Result.
 *
 * This step of the build order implements the monthly pro forma and the senior loan
 * with the interest-reserve / circularity solver. Mezzanine, preferred equity, the
 * balloon takeout, and the waterfall are the next step; the types and the funding
 * order already anticipate them.
 *
 * Every convention referenced below is defined in engine/README.md.
 */
import type {
  Deal,
  Flag,
  Month,
  Money,
  MonthlyRow,
  Result,
  Returns,
  SourcesUses,
  Tranche,
} from "./types.js";
import { monthlyInterest } from "./rates.js";
import { irr } from "./irr.js";
import { computeNonFinanceCosts, totalGrossSf, totalUnits } from "./proforma/costs.js";
import { spendWeights } from "./proforma/spend.js";
import { forward12Noi, monthlyOperating, stabilizedNoiYear1 } from "./proforma/operations.js";
import { sizeSenior } from "./debt/senior.js";
import { NonConvergenceError, solveTotalCost } from "./solve.js";

/** Everything a single monthly simulation produces for a candidate total cost. */
interface Simulation {
  rows: MonthlyRow[];
  capitalizedInterestTotal: Money;
  currentInterestTotal: Money;
  commitment: Money;
  originationFee: Money;
  exitFee: Money;
  equityCommitment: Money;
  equityContributed: Money;
  loanPrincipalDrawn: Money; // cost draws (excludes capitalized interest)
  exitBalanceBeforePayoff: Money;
}

export function runDeal(deal: Deal): Result {
  const flags: Flag[] = [];

  const senior = deal.stack.tranches.find((t) => t.kind === "senior");
  const otherTranches = deal.stack.tranches.filter((t) => t.kind !== "senior");
  if (otherTranches.length > 0) {
    flags.push({
      level: "warning",
      code: "tranche-not-yet-supported",
      message: `Only the senior tranche is modeled in this build step; ${otherTranches
        .map((t) => t.kind)
        .join(", ")} will be added with the debt/waterfall module.`,
    });
  }

  const nf = computeNonFinanceCosts(deal);
  const grossSf = totalGrossSf(deal);
  const units = totalUnits(deal);

  // Construction spend schedule (hard + soft + developer fee) over the window.
  const { constructionStartMonth: cStart, constructionEndMonth: cEnd, exitMonth, landMonth } =
    deal.schedule;
  const nConstruction = cEnd - cStart + 1;
  const weights = spendWeights(deal.budget.spendCurve, nConstruction);
  const constructionTotal = nf.hard.total + nf.soft + nf.developerFee;
  const hardSoftSpend: number[] = new Array<number>(exitMonth + 1).fill(0);
  for (let i = 0; i < nConstruction; i++) {
    hardSoftSpend[cStart + i] = constructionTotal * weights[i]!;
  }

  // Operations: precompute the forward-12 exit NOI and first-year stabilized NOI (both
  // independent of financing).
  const f12 = forward12Noi(deal, exitMonth);
  const noiY1 = stabilizedNoiYear1(deal);

  const grossValue = f12 / deal.exit.exitCapRate;
  const sellingCosts = grossValue * deal.exit.sellingCostPct;
  const netProceeds = grossValue - sellingCosts;

  // ---- Circularity solve (convention 7): total cost includes finance cost, which
  // depends on loan size, which depends on total cost. Iterate on total cost. ----
  const runSimulation = (totalCost: Money): Simulation => {
    if (!senior) {
      // No debt: everything is equity-funded.
      return simulateAllEquity(deal, nf, hardSoftSpend, netProceeds, sellingCosts, grossValue);
    }
    const sizing = sizeSenior(senior, totalCost, noiY1);
    // Equity funds first (convention 4); exit fee is paid at disposition, not drawn.
    const equityCommitment = totalCost - sizing.exitFee - sizing.commitment;
    return simulateWithSenior(
      deal,
      senior,
      nf,
      hardSoftSpend,
      sizing,
      equityCommitment,
      grossValue,
      sellingCosts,
    );
  };

  let sim: Simulation;
  let totalCost: Money;
  try {
    totalCost = solveTotalCost(nf.total, (tc) => {
      const s = runSimulation(tc);
      return nf.total + s.capitalizedInterestTotal + s.originationFee + s.exitFee;
    });
    sim = runSimulation(totalCost);
  } catch (e) {
    if (e instanceof NonConvergenceError) {
      flags.push({ level: "error", code: "non-convergence", message: e.message });
      throw e; // a forced non-convergence raises a visible error (convention 7 / acceptance test)
    }
    throw e;
  }

  const financeCost = sim.capitalizedInterestTotal + sim.originationFee + sim.exitFee;

  // ---- Cash-flow series for IRR ----
  const unlevered: number[] = [];
  const levered: number[] = [];
  for (const row of sim.rows) {
    unlevered.push(row.unleveredCashFlow);
    levered.push(row.leveredCashFlow);
  }
  const projectIrr = irr(unlevered);
  const leveredIrr = irr(levered);
  if (!projectIrr.solved)
    flags.push({ level: "warning", code: "irr-unsolved", message: "Unlevered IRR could not be bracketed." });
  if (!leveredIrr.solved)
    flags.push({ level: "warning", code: "irr-unsolved", message: "Levered IRR could not be bracketed." });

  // ---- Returns ----
  const profit = netProceeds - totalCost;
  const equity = sim.equityContributed;
  const distributions = levered.reduce((a, f) => (f > 0 ? a + f : a), 0);
  const contributions = levered.reduce((a, f) => (f < 0 ? a - f : a), 0);
  const equityMultiple = contributions > 0 ? distributions / contributions : NaN;

  const annualDebtService = sim.commitment * (senior?.rate ?? 0); // interest-only stabilized service
  const returns: Returns = {
    project: projectIrr,
    levered: leveredIrr,
    equityMultiple,
    peakEquity: equity,
    yieldOnCost: noiY1 / totalCost,
    profitOnCost: profit / totalCost,
    profit,
    returnOnEquity: equity > 0 ? profit / equity : NaN,
    ...(annualDebtService > 0 ? { stabilizedDscr: noiY1 / annualDebtService } : {}),
    ...(sim.commitment > 0 ? { debtYield: noiY1 / sim.commitment } : {}),
  };

  // ---- Sources & uses (development period; convention 11, to the cent) ----
  const uses = [
    { label: "Land (incl. closing costs)", amount: nf.land },
    { label: "Hard cost", amount: nf.hard.total },
    { label: "Soft cost", amount: nf.soft + nf.developerFee },
    { label: "Senior origination fee", amount: sim.originationFee },
    { label: "Capitalized interest (reserve)", amount: sim.capitalizedInterestTotal },
  ];
  const sources = [
    { label: "Common equity", amount: sim.equityContributed },
    { label: "Senior loan", amount: sim.loanPrincipalDrawn + sim.capitalizedInterestTotal },
  ];
  const sourcesUses: SourcesUses = {
    uses,
    sources,
    totalUses: uses.reduce((a, u) => a + u.amount, 0),
    totalSources: sources.reduce((a, s) => a + s.amount, 0),
  };

  return {
    monthly: sim.rows,
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
      debtPayoff: sim.exitBalanceBeforePayoff + sim.exitFee,
    },
    stabilizedNoiYear1: noiY1,
    returns,
    flags,
  };
}

// ---------------------------------------------------------------------------
// Monthly simulation with a senior loan
// ---------------------------------------------------------------------------

function capitalizeThisMonth(deal: Deal, tranche: Tranche, month: Month): boolean {
  const mode = tranche.capitalizeUntil ?? "construction-end";
  if (mode === "never") return false;
  if (mode === "construction-end") return month <= deal.schedule.constructionEndMonth;
  // "stabilization": capitalize through the month stabilized occupancy is reached.
  const { operationsStartMonth, leaseUpUnitsPerMonth, stabilizedOccupancy } = deal.schedule;
  const stabilizedUnits = totalUnits(deal) * stabilizedOccupancy;
  const monthsToStabilize = leaseUpUnitsPerMonth > 0 ? Math.ceil(stabilizedUnits / leaseUpUnitsPerMonth) : 0;
  const stabilizationMonth = operationsStartMonth + Math.max(0, monthsToStabilize - 1);
  return month <= stabilizationMonth;
}

function simulateWithSenior(
  deal: Deal,
  senior: Tranche,
  nf: ReturnType<typeof computeNonFinanceCosts>,
  hardSoftSpend: number[],
  sizing: { commitment: Money; originationFee: Money; exitFee: Money },
  equityCommitment: Money,
  grossValue: Money,
  sellingCosts: Money,
): Simulation {
  const { landMonth, constructionStartMonth, exitMonth } = deal.schedule;
  const rows: MonthlyRow[] = [];

  let balance = 0;
  let equityRemaining = Math.max(0, equityCommitment);
  let equityContributed = 0;
  let capitalizedInterestTotal = 0;
  let currentInterestTotal = 0;
  let loanPrincipalDrawn = 0;
  let exitBalanceBeforePayoff = 0;

  const netSale = grossValue - sellingCosts;

  for (let m = 0; m <= exitMonth; m++) {
    const op = monthlyOperating(deal, m, false);
    const landSpend = m === landMonth ? nf.land : 0;
    const hs = hardSoftSpend[m] ?? 0;
    const origFee = m === constructionStartMonth ? sizing.originationFee : 0;

    // --- Fund this month's cash cost (convention 4). Equity funds first by default;
    // with the pro-rata toggle, each cost is split by the senior loan-to-cost fraction.
    // The interest reserve is funded 100% by the loan in either mode.
    const cashCost = landSpend + hs + origFee;
    let equityDraw: number;
    let loanCostDraw: number;
    if (deal.stack.equity.proRataFunding) {
      loanCostDraw = senior.maxPctOfCost * cashCost;
      equityDraw = cashCost - loanCostDraw;
    } else {
      equityDraw = Math.min(equityRemaining, cashCost);
      equityRemaining -= equityDraw;
      loanCostDraw = cashCost - equityDraw;
    }
    equityContributed += equityDraw;
    loanPrincipalDrawn += loanCostDraw;

    const balanceOpen = balance;

    // --- Interest on the opening balance (convention 2).
    const interest = monthlyInterest(balanceOpen, senior.rate);
    const inConstruction = m <= deal.schedule.constructionEndMonth;
    const capitalize = balanceOpen > 0 && capitalizeThisMonth(deal, senior, m) && inConstruction;
    const capitalizedInterest = capitalize ? interest : 0;
    let currentInterest = !capitalize && balanceOpen > 0 && m >= deal.schedule.operationsStartMonth ? interest : 0;
    // Any interest before operations that is not capitalized is paid currently from equity.
    if (!capitalize && balanceOpen > 0 && m < deal.schedule.operationsStartMonth) {
      currentInterest = interest;
    }
    capitalizedInterestTotal += capitalizedInterest;
    currentInterestTotal += currentInterest;

    // --- Repayment at exit (balloon from sale). Principal + capitalized interest is
    // repaid (driving the balance to 0); the exit fee is a separate cash outflow, not
    // part of the balance roll (convention 6).
    let principalRepaid = 0;
    let exitFeePaid = 0;
    if (m === exitMonth) {
      exitBalanceBeforePayoff = balanceOpen + loanCostDraw + capitalizedInterest;
      principalRepaid = exitBalanceBeforePayoff;
      exitFeePaid = sizing.exitFee;
    }

    balance = balanceOpen + loanCostDraw + capitalizedInterest - principalRepaid;

    // --- Cash flows.
    const isExit = m === exitMonth;
    const unleveredCashFlow =
      -(landSpend + hs) + (m >= deal.schedule.operationsStartMonth && !isExit ? op.noi : 0) + (isExit ? netSale : 0);

    let leveredCashFlow = -equityDraw;
    if (m >= deal.schedule.operationsStartMonth && !isExit) {
      leveredCashFlow += op.noi - currentInterest;
    }
    if (isExit) {
      leveredCashFlow += netSale - principalRepaid - exitFeePaid;
    }

    rows.push({
      month: m,
      landSpend,
      hardSoftSpend: hs,
      originationFees: origFee,
      grossPotentialRent: op.grossPotentialRent,
      vacancyLoss: op.grossPotentialRent - (op.effectiveGrossIncome - op.otherIncome),
      otherIncome: op.otherIncome,
      effectiveGrossIncome: op.effectiveGrossIncome,
      operatingExpense: op.operatingExpense,
      noi: m >= deal.schedule.operationsStartMonth && !isExit ? op.noi : 0,
      debtDraw: loanCostDraw,
      capitalizedInterest,
      currentInterest,
      debtRepayment: principalRepaid,
      debtBalanceOpen: balanceOpen,
      debtBalanceClose: balance,
      equityDraw,
      saleGrossProceeds: isExit ? grossValue : 0,
      sellingCosts: isExit ? sellingCosts : 0,
      unleveredCashFlow,
      leveredCashFlow,
    });
  }

  return {
    rows,
    capitalizedInterestTotal,
    currentInterestTotal,
    commitment: sizing.commitment,
    originationFee: sizing.originationFee,
    exitFee: sizing.exitFee,
    equityCommitment,
    equityContributed,
    loanPrincipalDrawn,
    exitBalanceBeforePayoff,
  };
}

// ---------------------------------------------------------------------------
// All-equity fallback (no senior tranche)
// ---------------------------------------------------------------------------

function simulateAllEquity(
  deal: Deal,
  nf: ReturnType<typeof computeNonFinanceCosts>,
  hardSoftSpend: number[],
  netProceeds: Money,
  sellingCosts: Money,
  grossValue: Money,
): Simulation {
  const { landMonth, exitMonth } = deal.schedule;
  const rows: MonthlyRow[] = [];
  let equityContributed = 0;

  for (let m = 0; m <= exitMonth; m++) {
    const op = monthlyOperating(deal, m, false);
    const landSpend = m === landMonth ? nf.land : 0;
    const hs = hardSoftSpend[m] ?? 0;
    const isExit = m === exitMonth;
    const equityDraw = landSpend + hs;
    equityContributed += equityDraw;

    const opNoi = m >= deal.schedule.operationsStartMonth && !isExit ? op.noi : 0;
    const cf = -equityDraw + opNoi + (isExit ? netProceeds : 0);

    rows.push({
      month: m,
      landSpend,
      hardSoftSpend: hs,
      originationFees: 0,
      grossPotentialRent: op.grossPotentialRent,
      vacancyLoss: op.grossPotentialRent - (op.effectiveGrossIncome - op.otherIncome),
      otherIncome: op.otherIncome,
      effectiveGrossIncome: op.effectiveGrossIncome,
      operatingExpense: op.operatingExpense,
      noi: opNoi,
      debtDraw: 0,
      capitalizedInterest: 0,
      currentInterest: 0,
      debtRepayment: 0,
      debtBalanceOpen: 0,
      debtBalanceClose: 0,
      equityDraw,
      saleGrossProceeds: isExit ? grossValue : 0,
      sellingCosts: isExit ? sellingCosts : 0,
      unleveredCashFlow: cf,
      leveredCashFlow: cf,
    });
  }

  return {
    rows,
    capitalizedInterestTotal: 0,
    currentInterestTotal: 0,
    commitment: 0,
    originationFee: 0,
    exitFee: 0,
    equityCommitment: equityContributed,
    equityContributed,
    loanPrincipalDrawn: 0,
    exitBalanceBeforePayoff: 0,
  };
}
