/**
 * Scenarios and sensitivity (handoff: scenarios module; ARGUS-class what-if analysis).
 *
 * Every function here wraps `runDeal` by flexing input drivers and re-running the pure
 * engine. The base case always equals the main result exactly (flexing by a factor of 1
 * / a delay of 0 returns the original deal). All functions are pure.
 *
 *   - Tornado: flex each driver +/-10% (and schedule delays) and rank by effect on
 *     levered IRR.
 *   - Scenario set: base / downside / upside with LP IRR, equity multiple, min DSCR,
 *     peak equity.
 *   - Two-way tables: a metric over a grid of two drivers.
 *   - Breakevens: solve for the driver level at which profit (or loan coverage) hits a
 *     target; plugging the breakeven back into the engine returns that target.
 *   - Residual land value: the land price at which the deal hits a target return
 *     (an ARGUS hallmark).
 */
import type { Deal, Result } from "../types.js";
import { runDeal } from "../index.js";

export type Driver = "rent" | "hardCost" | "exitCap" | "interestRate" | "vacancy" | "scheduleDelay";

/** Metric extractors over a Result. */
export const metrics = {
  leveredIrr: (r: Result) => r.returns.levered.annual,
  projectIrr: (r: Result) => r.returns.project.annual,
  lpIrr: (r: Result) => r.returns.lp?.annual ?? r.returns.levered.annual,
  profit: (r: Result) => r.returns.profit,
  equityMultiple: (r: Result) => r.returns.equityMultiple,
  yieldOnCost: (r: Result) => r.returns.yieldOnCost,
  minDscr: (r: Result) => minDscr(r),
} as const;

export type Metric = (r: Result) => number;

/**
 * Return a new Deal with one driver flexed. `amount` is a multiplicative factor for
 * value drivers (1.1 = +10%) and a month count for `scheduleDelay`. The input is not
 * mutated; an amount of 1 (or 0 delay) returns an unchanged deal.
 */
export function flexDeal(deal: Deal, driver: Driver, amount: number): Deal {
  const d: Deal = structuredClone(deal);
  switch (driver) {
    case "rent":
      for (const c of d.program.components) {
        if (c.unitMix) for (const u of c.unitMix) u.rentPerMonth *= amount;
        if (c.commercialRentPsfPerYear !== undefined) c.commercialRentPsfPerYear *= amount;
        if (c.ancillaryIncomePerYear !== undefined) c.ancillaryIncomePerYear *= amount;
      }
      break;
    case "hardCost":
      d.budget.hard.verticalPerGrossSf *= amount;
      for (const l of d.budget.hard.lumpSums) l.amount *= amount;
      break;
    case "exitCap":
      d.exit.exitCapRate *= amount;
      break;
    case "interestRate":
      for (const t of d.stack.tranches) t.rate *= amount;
      break;
    case "vacancy": {
      // Scale economic vacancy (1 - occupancy) by the factor; occupancy falls as vacancy rises.
      const occ = d.schedule.stabilizedOccupancy;
      d.schedule.stabilizedOccupancy = Math.max(0, Math.min(1, 1 - (1 - occ) * amount));
      break;
    }
    case "scheduleDelay": {
      const n = Math.round(amount);
      d.schedule.constructionEndMonth += n;
      d.schedule.operationsStartMonth += n;
      d.schedule.exitMonth += n;
      break;
    }
  }
  return d;
}

/** Minimum stabilized DSCR over the operating months (NOI / current interest). */
export function minDscr(r: Result): number {
  let min = Infinity;
  for (const row of r.monthly) {
    if (row.currentInterest > 0 && row.noi > 0) {
      const dscr = row.noi / row.currentInterest;
      if (dscr < min) min = dscr;
    }
  }
  return Number.isFinite(min) ? min : NaN;
}

export interface TornadoBar {
  driver: Driver;
  low: number; // metric at the downside flex
  high: number; // metric at the upside flex
  base: number;
  range: number; // |high - low|
}

export interface TornadoResult {
  base: number;
  bars: TornadoBar[]; // sorted by range, largest first
}

/**
 * Tornado chart: flex each driver +/-10% (rent, hard cost, exit cap, interest rate,
 * vacancy) and by schedule delays of 3 and 6 months, ranked by effect on the metric
 * (default: levered IRR). The base equals the main result exactly.
 */
export function tornado(deal: Deal, metric: Metric = metrics.leveredIrr): TornadoResult {
  const base = metric(runDeal(deal));
  const pctDrivers: Driver[] = ["rent", "hardCost", "exitCap", "interestRate", "vacancy"];
  const bars: TornadoBar[] = [];

  for (const driver of pctDrivers) {
    const down = metric(runDeal(flexDeal(deal, driver, 0.9)));
    const up = metric(runDeal(flexDeal(deal, driver, 1.1)));
    bars.push({ driver, low: Math.min(down, up), high: Math.max(down, up), base, range: Math.abs(up - down) });
  }
  // Schedule delays (3 and 6 months) are one-sided (delay only worsens).
  for (const months of [3, 6]) {
    const delayed = metric(runDeal(flexDeal(deal, "scheduleDelay", months)));
    bars.push({
      driver: "scheduleDelay",
      low: Math.min(base, delayed),
      high: Math.max(base, delayed),
      base,
      range: Math.abs(delayed - base),
    });
  }
  bars.sort((a, b) => b.range - a.range);
  return { base, bars };
}

export interface ScenarioCase {
  label: string;
  flexes: Array<{ driver: Driver; amount: number }>;
}

export interface ScenarioRow {
  label: string;
  lpIrr: number;
  leveredIrr: number;
  equityMultiple: number;
  minDscr: number;
  peakEquity: number;
  profit: number;
}

/** Apply a set of flexes and run; the base case (no flexes) equals the main result. */
export function scenarioSet(deal: Deal, cases: ScenarioCase[]): ScenarioRow[] {
  return cases.map((c) => {
    let d = deal;
    for (const f of c.flexes) d = flexDeal(d, f.driver, f.amount);
    const r = runDeal(d);
    return {
      label: c.label,
      lpIrr: metrics.lpIrr(r),
      leveredIrr: r.returns.levered.annual,
      equityMultiple: r.returns.equityMultiple,
      minDscr: minDscr(r),
      peakEquity: r.returns.peakEquity,
      profit: r.returns.profit,
    };
  });
}

/** Standard base / downside / upside set (downside: rev -10%, cost +10%, 6-mo delay). */
export function standardScenarios(deal: Deal): ScenarioRow[] {
  return scenarioSet(deal, [
    { label: "Base", flexes: [] },
    {
      label: "Downside",
      flexes: [
        { driver: "rent", amount: 0.9 },
        { driver: "hardCost", amount: 1.1 },
        { driver: "scheduleDelay", amount: 6 },
      ],
    },
    {
      label: "Upside",
      flexes: [
        { driver: "rent", amount: 1.1 },
        { driver: "hardCost", amount: 0.95 },
      ],
    },
  ]);
}

export interface TwoWayTable {
  driverX: Driver;
  driverY: Driver;
  valuesX: number[];
  valuesY: number[];
  grid: number[][]; // grid[yi][xi]
}

/** A metric over a grid of two drivers' flex factors. */
export function twoWayTable(
  deal: Deal,
  driverX: Driver,
  valuesX: number[],
  driverY: Driver,
  valuesY: number[],
  metric: Metric = metrics.leveredIrr,
): TwoWayTable {
  const grid: number[][] = [];
  for (const vy of valuesY) {
    const row: number[] = [];
    for (const vx of valuesX) {
      const d = flexDeal(flexDeal(deal, driverX, vx), driverY, vy);
      row.push(metric(runDeal(d)));
    }
    grid.push(row);
  }
  return { driverX, driverY, valuesX, valuesY, grid };
}

/**
 * Solve for the flex factor on `driver` at which `metric` equals `target` (default:
 * profit = 0), by bisection. Returns the factor and the resulting deal/result so the
 * caller can confirm the breakeven round-trips.
 */
export function breakeven(
  deal: Deal,
  driver: Driver,
  opts: { metric?: Metric; target?: number; lo?: number; hi?: number; tol?: number } = {},
): { factor: number; value: number; solved: boolean } {
  const metric = opts.metric ?? metrics.profit;
  const target = opts.target ?? 0;
  let lo = opts.lo ?? 0.5;
  let hi = opts.hi ?? 1.5;
  const tol = opts.tol ?? 1e-4;

  const f = (x: number) => metric(runDeal(flexDeal(deal, driver, x))) - target;
  let flo = f(lo);
  let fhi = f(hi);
  // Expand the bracket a few times if needed.
  let tries = 0;
  while (flo * fhi > 0 && tries < 8) {
    lo *= 0.75;
    hi *= 1.25;
    flo = f(lo);
    fhi = f(hi);
    tries++;
  }
  if (flo * fhi > 0) return { factor: NaN, value: NaN, solved: false };

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (Math.abs(fm) < tol || (hi - lo) / 2 < 1e-9) {
      return { factor: mid, value: metric(runDeal(flexDeal(deal, driver, mid))), solved: true };
    }
    if (flo * fm < 0) {
      hi = mid;
      fhi = fm;
    } else {
      lo = mid;
      flo = fm;
    }
  }
  const mid = (lo + hi) / 2;
  return { factor: mid, value: metric(runDeal(flexDeal(deal, driver, mid))), solved: true };
}

/**
 * Residual land value: the land price at which the deal hits a target return (ARGUS
 * hallmark). Default target: development profit = 0 (the most a developer could pay for
 * the land and still break even). Solve by bisection on land price.
 */
export function residualLandValue(
  deal: Deal,
  opts: { metric?: Metric; target?: number; lo?: number; hi?: number } = {},
): { landPrice: number; value: number; solved: boolean } {
  const metric = opts.metric ?? metrics.profit;
  const target = opts.target ?? 0;
  let lo = opts.lo ?? 0;
  let hi = opts.hi ?? Math.max(1, deal.site.landPrice * 10);

  const withLand = (price: number): Deal => {
    const d = structuredClone(deal);
    d.site.landPrice = price;
    return d;
  };
  const f = (price: number) => metric(runDeal(withLand(price))) - target;

  let flo = f(lo);
  let fhi = f(hi);
  if (flo * fhi > 0) return { landPrice: NaN, value: NaN, solved: false };

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (Math.abs(fm) < 1 || (hi - lo) / 2 < 1e-4) {
      return { landPrice: mid, value: metric(runDeal(withLand(mid))), solved: true };
    }
    // profit decreases as land price rises => f is decreasing.
    if (flo * fm < 0) {
      hi = mid;
      fhi = fm;
    } else {
      lo = mid;
      flo = fm;
    }
  }
  const mid = (lo + hi) / 2;
  return { landPrice: mid, value: metric(runDeal(withLand(mid))), solved: true };
}
