/**
 * Non-finance cost buildup: land, hard, soft (engine convention 12 — no implicit
 * unit conversion; dollars and square feet stay explicit).
 *
 * This is the deterministic part of the budget. Finance cost (capitalized interest +
 * fees) is computed by the debt module and the circularity solver, not here.
 */
import type { Deal, Money, Sf } from "../types.js";

export interface HardCostBreakdown {
  grossSf: Sf;
  vertical: Money;
  lumpSums: Money;
  subtotal: Money; // vertical + lumpSums
  contingency: Money;
  total: Money; // subtotal + contingency
}

export interface NonFinanceCosts {
  land: Money;
  hard: HardCostBreakdown;
  soft: Money;
  developerFee: Money;
  /** land + hard.total + soft + developerFee */
  total: Money;
}

export function totalGrossSf(deal: Deal): Sf {
  return deal.program.components.reduce((a, c) => a + c.grossSf, 0);
}

export function totalNetSf(deal: Deal): Sf {
  return deal.program.components.reduce((a, c) => a + c.netSf, 0);
}

export function totalUnits(deal: Deal): number {
  return deal.program.components.reduce(
    (a, c) => a + (c.unitMix?.reduce((s, u) => s + u.count, 0) ?? 0),
    0,
  );
}

export function computeHardCost(deal: Deal): HardCostBreakdown {
  const grossSf = totalGrossSf(deal);
  const vertical = deal.budget.hard.verticalPerGrossSf * grossSf;
  const lumpSums = deal.budget.hard.lumpSums.reduce((a, l) => a + l.amount, 0);
  const subtotal = vertical + lumpSums;
  const base = deal.budget.hard.contingencyBase === "vertical-only" ? vertical : subtotal;
  const contingency = base * deal.budget.hard.contingencyPct;
  return { grossSf, vertical, lumpSums, subtotal, contingency, total: subtotal + contingency };
}

export function computeNonFinanceCosts(deal: Deal): NonFinanceCosts {
  const land = deal.site.landPrice + deal.site.landClosingCosts;
  const hard = computeHardCost(deal);
  const softBase = deal.budget.soft.base === "hard-excl-contingency" ? hard.subtotal : hard.total;
  const soft = deal.budget.soft.pctOfHard * softBase;

  let developerFee = 0;
  const feeTerms = deal.budget.developerFee;
  if (feeTerms) {
    if ("amount" in feeTerms) developerFee = feeTerms.amount;
    else developerFee = feeTerms.pctOfCost * (land + hard.total + soft);
  }

  return { land, hard, soft, developerFee, total: land + hard.total + soft + developerFee };
}
