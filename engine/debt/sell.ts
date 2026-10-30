/**
 * Build-to-sell simulation (handoff one-page flow: "build to sell").
 *
 * Two modes:
 *   - "units": for-sale units (condo / townhome) sold over an absorption period
 *     starting at delivery; debt is repaid from sale proceeds as units close, and the
 *     loan carries (interest accrues) while units are unsold.
 *   - "bulk": a single bulk sale of the finished building at delivery.
 *
 * Shares the construction funding and interest-reserve mechanics with the hold stack
 * (conventions 4-7) and reconciles sources = uses on the development budget. Returns the
 * same StackResult shape so the caller reuses the waterfall and returns logic. Pure.
 */
import type { Deal, Flag, Money, MonthlyRow, TrancheKind, TrancheMonthly, TrancheResult } from "../types.js";
import { monthlyInterest, trendFactor } from "../rates.js";
import { computeNonFinanceCosts, totalUnits, totalNetSf } from "../proforma/costs.js";
import type { StackResult } from "./stack.js";

interface SellTranche {
  kind: TrancheKind;
  label: string;
  rate: number;
  originationFeePct: number;
  exitFeePct: number;
  commitment: number;
  fraction: number;
  originationFee: number;
  exitFee: number;
  balance: number;
  principalDrawn: number;
  constructionCapInt: number; // interest reserve during construction (for sources=uses)
  interestTotal: number; // all interest (construction + carry)
  feePaid: boolean;
  exitBalanceSnapshot: number;
  monthly: TrancheMonthly[];
}

export function simulateSell(deal: Deal, hardSoftSpend: number[], totalCost: Money): StackResult {
  const fs = deal.forSale;
  if (!fs) throw new Error("businessPlan 'sell' requires deal.forSale");
  const nf = computeNonFinanceCosts(deal);
  const flags: Flag[] = [];
  const proRata = deal.stack.equity.proRataFunding === true;
  const { landMonth, constructionStartMonth, constructionEndMonth } = deal.schedule;

  const units = totalUnits(deal);
  const netSf = totalNetSf(deal);
  const salesStart = fs.salesStart ?? constructionEndMonth;

  // Sales proceeds (net of selling costs) per month.
  const netSales: number[] = [];
  let horizon: number;
  if (fs.mode === "bulk") {
    const gross = fs.bulkPrice ?? (fs.bulkPricePerSf ?? 0) * netSf;
    horizon = Math.max(salesStart, constructionEndMonth);
    for (let m = 0; m <= horizon; m++) netSales[m] = m === salesStart ? gross : 0;
  } else {
    const perUnit = fs.pricePerUnit ?? (fs.pricePerSf ?? 0) * (units > 0 ? netSf / units : 0);
    const absorption = Math.max(1, fs.absorptionUnitsPerMonth ?? units);
    const monthsToSell = Math.ceil(units / absorption);
    horizon = Math.max(salesStart + monthsToSell - 1, constructionEndMonth);
    let remaining = units;
    for (let m = 0; m <= horizon; m++) {
      if (m >= salesStart && remaining > 0) {
        const sold = Math.min(remaining, absorption);
        remaining -= sold;
        const price = perUnit * trendFactor(fs.priceGrowth ?? 0, m - salesStart);
        netSales[m] = sold * price;
      } else {
        netSales[m] = 0;
      }
    }
  }
  const grossSalesTotal = netSales.reduce((a, x) => a + x, 0);
  const sellingCostTotal = grossSalesTotal * fs.sellingCostPct;
  // netSales above are gross; apply selling cost now.
  for (let m = 0; m < netSales.length; m++) netSales[m] = (netSales[m] ?? 0) * (1 - fs.sellingCostPct);

  // Sizing (convention 5).
  const senior = deal.stack.tranches.find((t) => t.kind === "senior");
  const mezz = deal.stack.tranches.find((t) => t.kind === "mezz");
  const pref = deal.stack.tranches.find((t) => t.kind === "pref");
  const fSenior = senior ? senior.maxPctOfCost : 0;
  const fMezz = mezz ? Math.max(0, mezz.maxPctOfCost - fSenior) : 0;
  const fPref = pref ? pref.maxPctOfCost : 0;
  const fEquity = 1 - fSenior - fMezz - fPref;

  const mk = (t: typeof senior, frac: number, label: string): SellTranche | undefined => {
    if (!t) return undefined;
    const commitment = frac * totalCost;
    return {
      kind: t.kind,
      label,
      rate: t.rate,
      originationFeePct: t.originationFeePct,
      exitFeePct: t.exitFeePct,
      commitment,
      fraction: frac,
      originationFee: t.originationFeePct * commitment,
      exitFee: t.exitFeePct * commitment,
      balance: 0,
      principalDrawn: 0,
      constructionCapInt: 0,
      interestTotal: 0,
      feePaid: false,
      exitBalanceSnapshot: 0,
      monthly: [],
    };
  };
  const sSenior = mk(senior, fSenior, "senior");
  const sMezz = mk(mezz, fMezz, "mezzanine");
  const sPref = mk(pref, fPref, "preferred equity");
  const states = [sSenior, sMezz, sPref].filter((s): s is SellTranche => !!s);
  const priority = [sSenior, sMezz, sPref].filter((s): s is SellTranche => !!s); // senior first

  const rows: MonthlyRow[] = [];
  const equityContributions: number[] = [];
  const distributable: number[] = [];
  let equityRemaining = fEquity * totalCost;
  let equityForCostTotal = 0;
  let equityContributedTotal = 0;
  let peakEquity = 0;
  let cumEquity = 0;

  for (let m = 0; m <= horizon; m++) {
    const land = m === landMonth ? nf.land : 0;
    const hs = hardSoftSpend[m] ?? 0;
    const origFee = m === constructionStartMonth ? states.reduce((a, s) => a + s.originationFee, 0) : 0;
    const cashCost = land + hs + origFee;

    // Fund construction cost.
    let equityCostDraw = 0;
    const costDraw = new Map<SellTranche, number>();
    if (proRata) {
      equityCostDraw = fEquity * cashCost;
      for (const s of states) costDraw.set(s, s.fraction * cashCost);
    } else {
      let rem = cashCost;
      const eq = Math.min(equityRemaining, rem);
      equityRemaining -= eq;
      equityCostDraw = eq;
      rem -= eq;
      for (const s of priority.slice().reverse()) {
        // equity-first => pref, mezz, senior order
        const cap = Math.max(0, s.commitment - s.balance);
        const d = Math.min(cap, rem);
        costDraw.set(s, d);
        rem -= d;
      }
      if (rem > 0.01) equityCostDraw += rem;
    }

    const inConstruction = m <= constructionEndMonth;
    const drafts = new Map<SellTranche, Partial<TrancheMonthly>>();
    let equityDraw = equityCostDraw;
    let dist = 0;
    let aggCur = 0;

    for (const s of states) {
      const open = s.balance;
      const draw = costDraw.get(s) ?? 0;
      const interest = monthlyInterest(open, s.rate);
      s.interestTotal += interest;
      s.principalDrawn += draw;
      drafts.set(s, { month: m, open, draw, capitalizedInterest: 0, currentInterest: 0, repaid: 0 });
      if (inConstruction) {
        // Capitalize construction interest into the reserve.
        s.constructionCapInt += interest;
        s.balance = open + draw + interest;
        drafts.get(s)!.capitalizedInterest = interest;
      } else {
        // Carry: interest accrues; paid from proceeds below, unpaid capitalizes.
        s.balance = open + draw + interest; // provisionally capitalized; reduced as paid
        drafts.get(s)!.capitalizedInterest = interest;
      }
    }

    // During sellout, apply net sale proceeds: pay interest-then-principal in priority,
    // and each tranche's exit fee when its principal is retired. Residual -> equity.
    if (!inConstruction) {
      let available = netSales[m] ?? 0;
      // Interest first (reduce the just-capitalized interest), then principal, then exit fee.
      for (const s of priority) {
        const draft = drafts.get(s)!;
        const interestThis = draft.capitalizedInterest ?? 0;
        const payInt = Math.min(available, interestThis);
        available -= payInt;
        s.balance -= payInt; // un-capitalize the paid interest
        draft.capitalizedInterest = interestThis - payInt;
        draft.currentInterest = payInt;
        aggCur += payInt;
      }
      for (const s of priority) {
        const draft = drafts.get(s)!;
        const principalOutstanding = s.balance - (draft.capitalizedInterest ?? 0);
        const payPrin = Math.min(available, Math.max(0, principalOutstanding));
        available -= payPrin;
        s.balance -= payPrin;
        draft.repaid = (draft.repaid ?? 0) + payPrin;
        if (s.balance <= 0.01 && !s.feePaid && s.exitFee > 0) {
          const payFee = Math.min(available, s.exitFee);
          available -= payFee;
          if (payFee >= s.exitFee - 0.01) s.feePaid = true;
        }
      }
      dist = Math.max(0, available);
    }

    // Record.
    equityForCostTotal += equityCostDraw;
    equityContributedTotal += equityDraw;
    cumEquity += equityDraw - dist;
    peakEquity = Math.max(peakEquity, cumEquity);
    equityContributions.push(equityDraw);
    distributable.push(dist);

    for (const s of states) {
      const d = drafts.get(s)!;
      s.monthly.push({
        month: m,
        open: d.open ?? 0,
        draw: d.draw ?? 0,
        capitalizedInterest: d.capitalizedInterest ?? 0,
        currentInterest: d.currentInterest ?? 0,
        repaid: d.repaid ?? 0,
        close: s.balance,
      });
    }

    const aggOpen = states.reduce((a, s) => a + (drafts.get(s)!.open ?? 0), 0);
    const aggDraw = states.reduce((a, s) => a + (drafts.get(s)!.draw ?? 0), 0);
    const aggCap = states.reduce((a, s) => a + (drafts.get(s)!.capitalizedInterest ?? 0), 0);
    const aggRepaid = states.reduce((a, s) => a + (drafts.get(s)!.repaid ?? 0), 0);
    const aggClose = states.reduce((a, s) => a + s.balance, 0);
    const grossThisMonth = (netSales[m] ?? 0) / (1 - fs.sellingCostPct) || 0;

    rows.push({
      month: m,
      landSpend: land,
      hardSoftSpend: hs,
      originationFees: origFee,
      grossPotentialRent: 0,
      vacancyLoss: 0,
      otherIncome: 0,
      effectiveGrossIncome: 0,
      operatingExpense: 0,
      noi: 0,
      debtDraw: aggDraw,
      capitalizedInterest: aggCap,
      currentInterest: aggCur,
      debtRepayment: aggRepaid,
      debtBalanceOpen: aggOpen,
      debtBalanceClose: aggClose,
      equityDraw,
      saleGrossProceeds: grossThisMonth,
      sellingCosts: grossThisMonth * fs.sellingCostPct,
      unleveredCashFlow: -(land + hs) + (netSales[m] ?? 0),
      leveredCashFlow: dist - equityDraw,
    });
  }

  for (const s of states) s.exitBalanceSnapshot = s.balance;
  const anyUnpaid = states.some((s) => s.balance > 0.01);
  if (anyUnpaid) {
    flags.push({
      level: "warning",
      code: "sell-debt-undercovered",
      message: "Sale proceeds did not fully repay the debt; a residual balance remains at the end of the sellout.",
    });
  }

  const constructionCapInt = states.reduce((a, s) => a + s.constructionCapInt, 0);
  const interestTotal = states.reduce((a, s) => a + s.interestTotal, 0);
  const originationFeeTotal = states.reduce((a, s) => a + s.originationFee, 0);
  const exitFeeTotal = states.reduce((a, s) => a + s.exitFee, 0);

  const tranches: TrancheResult[] = states.map((s) => ({
    kind: s.kind,
    label: s.label,
    commitment: s.commitment,
    rate: s.rate,
    originationFee: s.originationFee,
    exitFee: s.exitFee,
    capitalizedInterestTotal: s.constructionCapInt,
    currentInterestTotal: s.interestTotal - s.constructionCapInt,
    principalDrawn: s.principalDrawn,
    exitBalance: s.exitBalanceSnapshot,
    monthly: s.monthly,
  }));

  void grossSalesTotal;
  void sellingCostTotal;

  return {
    rows,
    tranches,
    equityContributions,
    distributable,
    capitalizedInterestTotal: constructionCapInt, // dev reserve, for sources=uses
    originationFeeTotal,
    exitFeeTotal,
    financeCost: interestTotal + originationFeeTotal + exitFeeTotal, // incl. carry while unsold
    equityContributedTotal,
    equityForCostTotal,
    peakEquity,
    flags,
  };
}
