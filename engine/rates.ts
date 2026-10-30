/**
 * Rate and growth helpers (engine convention 2).
 *
 * - Monthly interest is opening balance times annual rate divided by 12.
 * - Growth rates compound monthly at (1 + g)^(1/12) - 1.
 */

/** Interest for one month on an opening balance (convention 2). */
export function monthlyInterest(openingBalance: number, annualRate: number): number {
  return (openingBalance * annualRate) / 12;
}

/** The monthly growth rate equivalent to an annual growth rate (convention 2). */
export function monthlyGrowthRate(annualGrowth: number): number {
  return Math.pow(1 + annualGrowth, 1 / 12) - 1;
}

/**
 * Multiplicative trend factor after `monthsElapsed` months of monthly-compounded
 * growth. Equals (1 + annualGrowth)^(monthsElapsed / 12).
 */
export function trendFactor(annualGrowth: number, monthsElapsed: number): number {
  return Math.pow(1 + monthlyGrowthRate(annualGrowth), monthsElapsed);
}
