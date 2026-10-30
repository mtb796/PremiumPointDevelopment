/**
 * Multi-tranche capital stack simulation (engine conventions 4, 5, 6, 10).
 *
 * Turns the monthly project spend and operating NOI into per-tranche debt balances,
 * equity contributions, and the cash distributable to the equity class. Supports a
 * senior construction loan, subordinate mezzanine, and preferred equity, each with
 * current-pay or accrued interest, origination and exit fees, and a balloon takeout
 * when a tranche matures before the exit month.
 *
 * Reconciles to the cent: sources = uses, and each tranche balance rolls forward
 * (open + draws + capitalized interest - repayments = close).
 *
 * Pure: no UI, no network. The circularity solve lives in the caller (index.ts),
 * which calls `simulateStack` for a candidate total cost until the reserve converges.
 */
import type {
  Deal,
  Flag,
  Money,
  MonthlyRow,
  Month,
  Tranche,
  TrancheKind,
  TrancheMonthly,
  TrancheResult,
} from "../types.js";
import { monthlyInterest } from "../rates.js";
import { forward12Noi, monthlyOperating } from "../proforma/operations.js";
import { computeNonFinanceCosts } from "../proforma/costs.js";

export interface StackContext {
  deal: Deal;
  nf: ReturnType<typeof computeNonFinanceCosts>;
  hardSoftSpend: number[];
  grossValue: Money;
  sellingCosts: Money;
  stabilizedNoiYear1: Money;
}

export interface StackResult {
  rows: MonthlyRow[];
  tranches: TrancheResult[];
  /** Equity contributions each month (common equity + cash calls), >= 0. */
  equityContributions: number[];
  /** Cash distributable to the equity class each month (operating surplus + exit residual), >= 0. */
  distributable: number[];
  capitalizedInterestTotal: Money;
  originationFeeTotal: Money;
  exitFeeTotal: Money;
  equityContributedTotal: Money;
  /** Equity used to fund development cost only (for the sources=uses identity). */
  equityForCostTotal: Money;
  peakEquity: Money;
  flags: Flag[];
}

interface TrancheState {
  t: Tranche;
  label: string;
  commitment: Money;
  fraction: number; // share of each month's cash cost this provider funds (pro-rata mode)
  originationFee: Money;
  exitFee: Money;
  balance: number;
  principalDrawn: number;
  capInt: number;
  curInt: number;
  monthly: TrancheMonthly[];
  matured: boolean;
  takeout?: { month: Month; size: Money; shortfall: Money };
}

const LOAN_CLOSE_OFFSET = 0; // loan closes at construction start

export function simulateStack(ctx: StackContext, totalCost: Money): StackResult {
  const { deal, nf, hardSoftSpend, grossValue, sellingCosts } = ctx;
  const { landMonth, constructionStartMonth, constructionEndMonth, operationsStartMonth, exitMonth } =
    deal.schedule;
  const flags: Flag[] = [];
  const proRata = deal.stack.equity.proRataFunding === true;

  const senior = deal.stack.tranches.find((t) => t.kind === "senior");
  const mezz = deal.stack.tranches.find((t) => t.kind === "mezz");
  const pref = deal.stack.tranches.find((t) => t.kind === "pref");

  // ---- Sizing (convention 5). ----
  const fSenior = senior ? seniorFraction(senior, totalCost, ctx.stabilizedNoiYear1) : 0;
  // mezz.maxPctOfCost is the COMBINED senior+mezz loan-to-cost target.
  const fMezz = mezz ? Math.max(0, mezz.maxPctOfCost - fSenior) : 0;
  const fPref = pref ? pref.maxPctOfCost : 0;
  const fEquity = 1 - fSenior - fMezz - fPref;
  if (fEquity < -1e-9) {
    flags.push({ level: "error", code: "oversized-stack", message: "Debt + preferred exceed 100% of cost." });
  }

  const states: TrancheState[] = [];
  const mkState = (t: Tranche | undefined, frac: number, label: string): TrancheState | undefined => {
    if (!t) return undefined;
    const commitment = frac * totalCost;
    return {
      t,
      label,
      commitment,
      fraction: frac,
      originationFee: t.originationFeePct * commitment,
      exitFee: t.exitFeePct * commitment,
      balance: 0,
      principalDrawn: 0,
      capInt: 0,
      curInt: 0,
      monthly: [],
      matured: false,
    };
  };
  const sSenior = mkState(senior, fSenior, "senior");
  const sMezz = mkState(mezz, fMezz, "mezzanine");
  const sPref = mkState(pref, fPref, "preferred equity");
  for (const s of [sSenior, sMezz, sPref]) if (s) states.push(s);

  // Funding order for equity-first mode: equity, then pref, then mezz, then senior.
  const fundingOrder: TrancheState[] = [sPref, sMezz, sSenior].filter((s): s is TrancheState => !!s);

  const rows: MonthlyRow[] = [];
  const equityContributions: number[] = [];
  const distributable: number[] = [];

  let equityRemaining = fEquity * totalCost; // equity-first budget
  let equityContributedTotal = 0;
  let equityForCostTotal = 0;
  let peakEquity = 0;
  let cumEquityOutstanding = 0;

  const netSale = grossValue - sellingCosts;

  for (let m = 0; m <= exitMonth; m++) {
    const op = monthlyOperating(deal, m, false);
    const land = m === landMonth ? nf.land : 0;
    const hs = hardSoftSpend[m] ?? 0;
    const loanCloseMonth = constructionStartMonth + LOAN_CLOSE_OFFSET;
    const origFeeThisMonth = m === loanCloseMonth ? states.reduce((a, s) => a + s.originationFee, 0) : 0;
    const cashCost = land + hs + origFeeThisMonth;

    // ---- Fund this month's cash cost (convention 4). ----
    let equityDraw = 0;
    const costDraw: Map<TrancheState, number> = new Map();
    if (proRata) {
      equityDraw = fEquity * cashCost;
      for (const s of states) costDraw.set(s, s.fraction * cashCost);
    } else {
      // Equity first, then pref, then mezz, then senior.
      let remaining = cashCost;
      const eq = Math.min(equityRemaining, remaining);
      equityRemaining -= eq;
      equityDraw = eq;
      remaining -= eq;
      for (const s of fundingOrder) {
        const capacity = Math.max(0, s.commitment - s.balance);
        const d = Math.min(capacity, remaining);
        costDraw.set(s, d);
        remaining -= d;
      }
      if (remaining > 0.01) equityDraw += remaining; // overflow back to equity
    }
    const equityCostDraw = equityDraw; // cost-funding portion (before cash calls/cures)

    // ---- Interest + draws per tranche. ----
    const inConstruction = m <= constructionEndMonth;
    const inOps = m >= operationsStartMonth && m < exitMonth;
    let currentInterestThisMonth = 0;
    const trancheRowDraft: Map<TrancheState, Partial<TrancheMonthly>> = new Map();

    for (const s of states) {
      const open = s.balance;
      const draw = costDraw.get(s) ?? 0;
      const interest = monthlyInterest(open, s.t.rate);
      const capitalize =
        open > 0 &&
        (inConstruction || (s.t.paymentMode === "accrued" && m < exitMonth) || (!inConstruction && !inOps && m < exitMonth));
      const capInt = capitalize ? interest : 0;
      const curInt = !capitalize && inOps && open > 0 ? interest : 0;
      s.capInt += capInt;
      s.curInt += curInt;
      s.principalDrawn += draw;
      currentInterestThisMonth += curInt;
      s.balance = open + draw + capInt;
      trancheRowDraft.set(s, { month: m, open, draw, capitalizedInterest: capInt, currentInterest: curInt, repaid: 0 });
    }

    // ---- Balloon takeout at maturity (convention 10). ----
    for (const s of states) {
      if (s.t.kind === "pref") continue; // pref isn't a maturing loan
      const maturity = constructionStartMonth + LOAN_CLOSE_OFFSET + s.t.termMonths;
      if (!s.matured && maturity === m && m < exitMonth && s.balance > 0) {
        const { size, shortfall } = sizeTakeout(ctx, deal, s, m);
        // Repay the maturing balance; the takeout becomes the new balance.
        const draft = trancheRowDraft.get(s)!;
        draft.repaid = s.balance;
        s.exitFee += 0; // original exit fee realized at final payoff of the takeout
        if (shortfall > 0) {
          equityDraw += shortfall; // forced equity cure — never a silent plug
          flags.push({
            level: "warning",
            code: "balloon-shortfall",
            message: `${s.label} takeout at month ${m} fell $${shortfall.toFixed(0)} short of the maturing balance; cured with equity.`,
          });
        }
        s.balance = size; // new takeout loan balance carried to exit
        s.takeout = { month: m, size, shortfall };
      }
    }

    // ---- Operating surplus / cash call. ----
    let dist = 0;
    if (inOps) {
      const surplus = op.noi - currentInterestThisMonth;
      if (surplus >= 0) {
        dist = surplus;
      } else {
        equityDraw += -surplus; // cash call to service debt
        flags.push({
          level: "warning",
          code: "operating-shortfall",
          message: `Month ${m}: NOI did not cover current interest; $${(-surplus).toFixed(0)} equity cash call.`,
        });
      }
    }

    // ---- Exit: sell and repay in priority senior -> mezz -> pref. ----
    let exitResidual = 0;
    if (m === exitMonth) {
      let proceeds = netSale;
      for (const s of [sSenior, sMezz, sPref]) {
        if (!s) continue;
        const draft = trancheRowDraft.get(s)!;
        const payoff = s.balance + s.exitFee + prefFloorTopUp(s);
        const pay = Math.min(proceeds, payoff);
        draft.repaid = (draft.repaid ?? 0) + s.balance; // principal/accrued portion
        proceeds -= pay;
        s.exitBalanceSnapshot = s.balance;
        s.balance = 0;
        if (pay < payoff - 0.01) {
          flags.push({
            level: "warning",
            code: "exit-debt-undercovered",
            message: `${s.label} payoff not fully covered by sale proceeds at exit.`,
          });
        }
      }
      exitResidual = Math.max(0, proceeds);
      dist += exitResidual;
    }

    // ---- Record equity + distributable. ----
    equityForCostTotal += equityCostDraw;
    equityContributedTotal += equityDraw;
    cumEquityOutstanding += equityDraw - dist;
    peakEquity = Math.max(peakEquity, cumEquityOutstanding);
    equityContributions.push(equityDraw);
    distributable.push(dist);

    // ---- Aggregate monthly row (across tranches) + flows. ----
    const aggOpen = states.reduce((a, s) => a + (trancheRowDraft.get(s)!.open ?? 0), 0);
    const aggDraw = states.reduce((a, s) => a + (trancheRowDraft.get(s)!.draw ?? 0), 0);
    const aggCap = states.reduce((a, s) => a + (trancheRowDraft.get(s)!.capitalizedInterest ?? 0), 0);
    const aggCur = states.reduce((a, s) => a + (trancheRowDraft.get(s)!.currentInterest ?? 0), 0);
    const aggRepaid = states.reduce((a, s) => a + (trancheRowDraft.get(s)!.repaid ?? 0), 0);
    const aggClose = states.reduce((a, s) => a + s.balance, 0);
    const aggExitFee = m === exitMonth ? states.reduce((a, s) => a + s.exitFee, 0) : 0;

    for (const s of states) {
      const d = trancheRowDraft.get(s)!;
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

    const isExit = m === exitMonth;
    const unleveredCashFlow = -(land + hs) + (inOps ? op.noi : 0) + (isExit ? netSale : 0);
    const leveredCashFlow = dist - equityDraw;

    rows.push({
      month: m,
      landSpend: land,
      hardSoftSpend: hs,
      originationFees: origFeeThisMonth,
      grossPotentialRent: op.grossPotentialRent,
      vacancyLoss: op.grossPotentialRent - (op.effectiveGrossIncome - op.otherIncome),
      otherIncome: op.otherIncome,
      effectiveGrossIncome: op.effectiveGrossIncome,
      operatingExpense: op.operatingExpense,
      noi: inOps ? op.noi : 0,
      debtDraw: aggDraw,
      capitalizedInterest: aggCap,
      currentInterest: aggCur,
      debtRepayment: aggRepaid,
      debtBalanceOpen: aggOpen,
      debtBalanceClose: aggClose,
      equityDraw,
      saleGrossProceeds: isExit ? grossValue : 0,
      sellingCosts: isExit ? sellingCosts : 0,
      unleveredCashFlow,
      leveredCashFlow,
    });

    void aggExitFee;
  }

  const trancheResults: TrancheResult[] = states.map((s) => ({
    kind: s.t.kind as TrancheKind,
    label: s.label,
    commitment: s.commitment,
    rate: s.t.rate,
    originationFee: s.originationFee,
    exitFee: s.exitFee,
    capitalizedInterestTotal: s.capInt,
    currentInterestTotal: s.curInt,
    principalDrawn: s.principalDrawn,
    exitBalance: s.exitBalanceSnapshot ?? 0,
    monthly: s.monthly,
    ...(s.takeout ? { takeout: s.takeout } : {}),
  }));

  return {
    rows,
    tranches: trancheResults,
    equityContributions,
    distributable,
    capitalizedInterestTotal: states.reduce((a, s) => a + s.capInt, 0),
    originationFeeTotal: states.reduce((a, s) => a + s.originationFee, 0),
    exitFeeTotal: states.reduce((a, s) => a + s.exitFee, 0),
    equityContributedTotal,
    equityForCostTotal,
    peakEquity,
    flags,
  };
}

// Augment TrancheState with an exit snapshot (declared here to keep the interface tidy).
interface TrancheState {
  exitBalanceSnapshot?: number;
}

function seniorFraction(senior: Tranche, totalCost: Money, stabilizedNoi: Money): number {
  let frac = senior.maxPctOfCost;
  if (senior.minDebtYield && senior.minDebtYield > 0) {
    const dyLimit = stabilizedNoi / senior.minDebtYield; // loan <= NOI / minDebtYield
    frac = Math.min(frac, dyLimit / totalCost);
  }
  return frac;
}

/** Preferred equity may carry a minimum-multiple floor realized at exit (simple form). */
function prefFloorTopUp(s: TrancheState): number {
  if (s.t.kind !== "pref" || !s.t.minMultiple) return 0;
  const floor = s.t.minMultiple * s.principalDrawn;
  const accruedPayoff = s.balance; // principal + accrued pref
  return Math.max(0, floor - accruedPayoff);
}

/** Size a takeout loan by the lowest of LTV, debt-yield, and DSCR limits (convention 10). */
function sizeTakeout(
  ctx: StackContext,
  deal: Deal,
  s: TrancheState,
  month: Month,
): { size: Money; shortfall: Money } {
  const to = s.t.takeout ?? {};
  const capRate = to.capRate ?? deal.exit.exitCapRate;
  const value = forward12Noi(deal, month) / capRate;
  const noi = ctx.stabilizedNoiYear1; // stabilized annual NOI for the coverage tests
  const rate = to.rate ?? s.t.rate;

  const limits: number[] = [];
  if (to.ltv && to.ltv > 0) limits.push(to.ltv * value);
  if (to.minDebtYield && to.minDebtYield > 0) limits.push(noi / to.minDebtYield);
  if (to.minDscr && to.minDscr > 0) limits.push(noi / (to.minDscr * rate)); // interest-only coverage
  const size = limits.length > 0 ? Math.min(...limits) : s.balance;
  const shortfall = Math.max(0, s.balance - size);
  return { size, shortfall };
}
