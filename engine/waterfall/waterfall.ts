/**
 * Configurable distribution waterfall (engine convention 13 / engine README).
 *
 * Treats all contributed capital as the investor class, split pro rata between LP and
 * GP co-invest; the GP's promote is paid on top. For each non-residual tier, a hurdle
 * balance compounds monthly at the tier's rate, grows with contributions, and shrinks
 * with investor distributions:
 *
 *   B_i(t) = B_i(t-1) * (1 + r_i)^(1/12) + C(t) - (investor distributions)(t)
 *
 * Each month, distributable cash is paid tier by tier (lowest hurdle first). In a
 * non-residual tier i with investor share s_i, pay min(remaining cash, B_i / s_i): the
 * investor share s_i goes pro rata to LP and GP co-invest, the rest is promote to the
 * GP. The last tier is residual (pays all remaining at its investor share). An optional
 * GP catch-up runs after tier 1, and an optional clawback runs at the final period.
 *
 * Invariant (asserted in tests): every period's payments sum to distributable cash
 * exactly.
 *
 * Pure: no UI, no network.
 */
import type { WaterfallTerms } from "../types.js";

export interface WaterfallInput {
  /** Equity contributed each month (>= 0). */
  contributions: number[];
  /** Cash available to the equity class each month (>= 0), after all debt service/payoff. */
  distributable: number[];
  terms: WaterfallTerms;
  /** GP co-invest as a fraction of the common-equity (investor) class. */
  gpCoinvestPct: number;
}

export interface WaterfallOutput {
  /** LP net cash flow per month (negative = contribution, positive = distribution). */
  lp: number[];
  /** GP net cash flow per month (co-invest contribution/distribution + promote). */
  gp: number[];
  lpDistributions: number[];
  gpDistributions: number[];
  /** Promote paid to the GP each month (subset of gpDistributions). */
  promote: number[];
  totalPromote: number;
  /** Max |sum of a period's payments - distributable| across all periods. */
  maxPeriodReconError: number;
}

const HURDLE_TOL = 1e-6;

function monthlyRate(annual: number): number {
  return Math.pow(1 + annual, 1 / 12) - 1;
}

export function runWaterfall(input: WaterfallInput): WaterfallOutput {
  const { contributions, distributable, terms, gpCoinvestPct } = input;
  const n = Math.max(contributions.length, distributable.length);
  const tiers = terms.tiers;
  if (tiers.length === 0) throw new Error("waterfall needs at least one tier");

  const lastIndex = tiers.length - 1;
  // Hurdle balance per non-residual tier (the residual/last tier has none).
  const balances = tiers.map(() => 0);
  const rates = tiers.map((t) => (t.hurdleRate !== undefined ? monthlyRate(t.hurdleRate) : 0));

  const p = terms.promoteShare;
  const catchUpPct = terms.catchUpPct ?? 0;

  const lp = new Array<number>(n).fill(0);
  const gp = new Array<number>(n).fill(0);
  const lpDistributions = new Array<number>(n).fill(0);
  const gpDistributions = new Array<number>(n).fill(0);
  const promote = new Array<number>(n).fill(0);

  let cumContrib = 0;
  let cumInvestorDist = 0;
  let cumPromote = 0;
  let prefMet = false;

  let maxPeriodReconError = 0;

  const lpShare = 1 - gpCoinvestPct;

  for (let t = 0; t < n; t++) {
    const C = contributions[t] ?? 0;
    let cash = distributable[t] ?? 0;

    // Contributions: LP and GP co-invest fund pro rata.
    if (C > 0) {
      lp[t] = (lp[t] ?? 0) - lpShare * C;
      gp[t] = (gp[t] ?? 0) - gpCoinvestPct * C;
      cumContrib += C;
    }

    // Accrue hurdle balances and add this month's contribution to each.
    for (let i = 0; i < tiers.length; i++) {
      if (i === lastIndex && tiers[i]!.hurdleRate === undefined) continue; // residual: no balance
      balances[i] = balances[i]! * (1 + rates[i]!) + C;
    }

    let investorThisPeriod = 0;
    let promoteThisPeriod = 0;

    const payInvestor = (amount: number) => {
      investorThisPeriod += amount;
      cumInvestorDist += amount;
      // Every investor distribution reduces all hurdle balances (counts toward every IRR).
      for (let j = 0; j < tiers.length; j++) {
        if (j === lastIndex && tiers[j]!.hurdleRate === undefined) continue;
        balances[j] = balances[j]! - amount;
      }
    };
    const payPromote = (amount: number) => {
      promoteThisPeriod += amount;
      cumPromote += amount;
    };

    for (let i = 0; i < tiers.length && cash > HURDLE_TOL; i++) {
      const tier = tiers[i]!;
      const s = tier.investorShare;
      const isResidual = i === lastIndex;

      if (isResidual) {
        // Pay all remaining: investor share s, promote (1-s).
        payInvestor(s * cash);
        payPromote((1 - s) * cash);
        cash = 0;
        break;
      }

      // Non-residual tier gated by its hurdle balance.
      const cap = balances[i]! / s; // total payment that clears this tier's balance
      const pay = Math.max(0, Math.min(cash, cap));
      if (pay > 0) {
        payInvestor(s * pay);
        payPromote((1 - s) * pay);
        cash -= pay;
      }

      // GP catch-up immediately after tier 1 (index 0) once the pref is met.
      if (i === 0) {
        if (!prefMet && balances[0]! <= HURDLE_TOL) prefMet = true;
        if (prefMet && catchUpPct > 0 && cash > HURDLE_TOL) {
          cash = runCatchUp(cash, catchUpPct, p, cumInvestorDist, cumContrib, cumPromote, payInvestor, payPromote);
        }
      }
    }

    // Record period distributions.
    const lpDist = lpShare * investorThisPeriod;
    const gpDist = gpCoinvestPct * investorThisPeriod + promoteThisPeriod;
    lpDistributions[t] = lpDist;
    gpDistributions[t] = gpDist;
    promote[t] = promoteThisPeriod;
    lp[t] = (lp[t] ?? 0) + lpDist;
    gp[t] = (gp[t] ?? 0) + gpDist;

    // The residual (last) tier consumes all remaining cash, so each period's payments
    // sum to the distributable cash (within the hurdle tolerance for a stub < 1e-6).
    const paid = investorThisPeriod + promoteThisPeriod;
    maxPeriodReconError = Math.max(maxPeriodReconError, Math.abs(paid - (distributable[t] ?? 0)));
  }

  // Clawback at the final period: if the GP's promote exceeds its promote share of
  // total profit, return the excess to LPs (never a silent plug).
  if (terms.clawback) {
    const totalProfit = cumInvestorDist + cumPromote - cumContrib;
    const target = p * totalProfit;
    const excess = cumPromote - target;
    if (excess > HURDLE_TOL && n > 0) {
      const last = n - 1;
      gp[last] = (gp[last] ?? 0) - excess;
      lp[last] = (lp[last] ?? 0) + excess;
      gpDistributions[last] = (gpDistributions[last] ?? 0) - excess;
      lpDistributions[last] = (lpDistributions[last] ?? 0) + excess;
      promote[last] = (promote[last] ?? 0) - excess;
      cumPromote -= excess;
    }
  }

  return { lp, gp, lpDistributions, gpDistributions, promote, totalPromote: cumPromote, maxPeriodReconError };
}

/**
 * GP catch-up within a single month. Pays the GP a `catchUpPct` share (investor gets the
 * rest) until the GP's cumulative promote equals the promote share of cumulative profit.
 * Returns the cash remaining after the catch-up.
 */
function runCatchUp(
  cash: number,
  catchUpPct: number,
  p: number,
  cumInvestorDist: number,
  cumContrib: number,
  cumPromote: number,
  payInvestor: (amt: number) => void,
  payPromote: (amt: number) => void,
): number {
  // Investor profit so far (above returned capital) and promote so far.
  const IP = cumInvestorDist - cumContrib;
  const PR = cumPromote;
  // Solve x where, after paying GP catchUpPct*x and investor (1-catchUpPct)*x,
  // GP promote == p * total profit:  PR + cu*x = p*(IP + (1-cu)*x + PR + cu*x).
  const cu = catchUpPct;
  let x: number;
  if (Math.abs(cu - p) < 1e-12) {
    x = Infinity; // degenerate; just pay out all cash in catch-up
  } else {
    x = (p * (IP + PR) - PR) / (cu - p);
  }
  if (!(x > 0)) return cash; // already caught up
  const spend = Math.min(cash, x);
  payPromote(cu * spend);
  payInvestor((1 - cu) * spend);
  return cash - spend;
}
