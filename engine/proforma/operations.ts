/**
 * Monthly operations: gross potential rent, occupancy ramp, effective gross income,
 * operating expenses, and NOI (engine convention 8).
 *
 * - Occupied units ramp linearly from delivery at the lease-up pace until stabilized
 *   occupancy. Revenue is occupied units times rent times growth.
 * - Operating expenses have a fixed floor plus a variable share of revenue; a
 *   management fee is a percent of effective gross income.
 *
 * Residential rent is per unit per month; commercial rent is per leasable SF per year.
 * All year-0 figures are trended by monthly-compounded growth (convention 2).
 */
import type { Deal, Month, Money, Operations, ProgramComponent } from "../types.js";
import { trendFactor } from "../rates.js";

export interface MonthlyOperating {
  grossPotentialRent: Money;
  otherIncome: Money;
  effectiveGrossIncome: Money;
  operatingExpense: Money;
  noi: Money;
  occupiedFraction: number;
}

const ZERO: MonthlyOperating = {
  grossPotentialRent: 0,
  otherIncome: 0,
  effectiveGrossIncome: 0,
  operatingExpense: 0,
  noi: 0,
  occupiedFraction: 0,
};

function componentUnits(c: ProgramComponent): number {
  return c.unitMix?.reduce((s, u) => s + u.count, 0) ?? 0;
}

/** Year-0 gross potential rent per month for one component (untrended). */
function componentYear0MonthlyGpr(c: ProgramComponent): Money {
  if (c.unitMix && c.unitMix.length > 0) {
    return c.unitMix.reduce((s, u) => s + u.count * u.rentPerMonth, 0);
  }
  if (c.commercialRentPsfPerYear !== undefined) {
    return (c.commercialRentPsfPerYear * c.netSf) / 12;
  }
  return 0;
}

/**
 * Occupied fraction for a component in a given month. For `forecast`, occupancy is held
 * at the stabilized level regardless of month (used for the exit forward-12-month NOI,
 * convention 9).
 */
function occupiedFraction(deal: Deal, c: ProgramComponent, month: Month, forecast: boolean): number {
  const { operationsStartMonth, leaseUpUnitsPerMonth, stabilizedOccupancy } = deal.schedule;
  if (forecast) return stabilizedOccupancy;
  if (month < operationsStartMonth) return 0;
  const units = componentUnits(c);
  if (units === 0) return stabilizedOccupancy; // commercial / SF-driven: treat as stabilized ramp below
  const monthsOpen = month - operationsStartMonth + 1;
  const leased = Math.min(units * stabilizedOccupancy, leaseUpUnitsPerMonth * monthsOpen);
  return leased / units;
}

/**
 * Operating result for one component in one month. `forecast=true` ignores the lease-up
 * ramp and uses stabilized occupancy (for the exit valuation's forward NOI).
 */
export function componentOperating(
  deal: Deal,
  c: ProgramComponent,
  ops: Operations,
  month: Month,
  forecast = false,
): MonthlyOperating {
  const { operationsStartMonth } = deal.schedule;
  if (!forecast && month < operationsStartMonth) return ZERO;

  const growthStart = (ops.growthFrom ?? "operations-start") === "land-close" ? 0 : operationsStartMonth;
  const monthsElapsed = month - growthStart;
  const rentTrend = trendFactor(ops.rentGrowth, monthsElapsed);
  const opexTrend = trendFactor(ops.opexGrowth, monthsElapsed);

  const gprYear0 = componentYear0MonthlyGpr(c);
  const grossPotentialRent = gprYear0 * rentTrend;
  const occ = occupiedFraction(deal, c, month, forecast);
  const collectedRent = grossPotentialRent * occ * (1 - ops.vacancy);

  const otherIncome = ((c.ancillaryIncomePerYear ?? 0) / 12) * rentTrend;
  const effectiveGrossIncome = collectedRent + otherIncome;

  const management = ops.managementPctOfEgi * effectiveGrossIncome;
  const fixed = (ops.fixedOpexPerYear / 12) * opexTrend;
  const variable = (ops.variableOpexPctOfEgi ?? 0) * effectiveGrossIncome;
  const operatingExpense = management + fixed + variable;

  return {
    grossPotentialRent,
    otherIncome,
    effectiveGrossIncome,
    operatingExpense,
    noi: effectiveGrossIncome - operatingExpense,
    occupiedFraction: occ,
  };
}

/** Sum of all components' operating results for a month. */
export function monthlyOperating(deal: Deal, month: Month, forecast = false): MonthlyOperating {
  let out: MonthlyOperating = { ...ZERO };
  for (const c of deal.program.components) {
    const ops = deal.operations.find((o) => o.componentLabel === c.label);
    if (!ops) continue;
    const r = componentOperating(deal, c, ops, month, forecast);
    out = {
      grossPotentialRent: out.grossPotentialRent + r.grossPotentialRent,
      otherIncome: out.otherIncome + r.otherIncome,
      effectiveGrossIncome: out.effectiveGrossIncome + r.effectiveGrossIncome,
      operatingExpense: out.operatingExpense + r.operatingExpense,
      noi: out.noi + r.noi,
      occupiedFraction: r.occupiedFraction, // representative; per-component detail available separately
    };
  }
  return out;
}

/** Forward 12-month stabilized NOI starting at `startMonth` (convention 9, exit value). */
export function forward12Noi(deal: Deal, startMonth: Month): Money {
  let sum = 0;
  for (let m = startMonth; m < startMonth + 12; m++) {
    sum += monthlyOperating(deal, m, true).noi;
  }
  return sum;
}

/** First stabilized operating year's NOI (for yield on cost). */
export function stabilizedNoiYear1(deal: Deal): Money {
  let sum = 0;
  const start = deal.schedule.operationsStartMonth;
  for (let m = start; m < start + 12; m++) {
    sum += monthlyOperating(deal, m, false).noi;
  }
  return sum;
}
