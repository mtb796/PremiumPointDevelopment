/**
 * Golden reference deal: the Aprao multifamily development template.
 *
 * Source: the Aprao multifamily development template (overview + full report,
 * opened October 30, 2026), used in the handoff as the first golden test for the
 * engine. The template's own disclaimer says the project is FICTIONAL and
 * ILLUSTRATIVE — it is used here for engine structure and testing only, never as
 * market evidence. Every number below is SAMPLE DATA.
 *
 * A 240-unit garden apartment community on a 16-acre site, ground-up, held five
 * years after completion, then sold. Senior debt only, no waterfall — this is the
 * senior-debt-only path the template can validate. (A second, hand-built deal with
 * mezzanine, preferred equity, a balloon, and a waterfall is a separate fixture,
 * since this template cannot validate those.)
 *
 * Calibrated inputs (Aprao does not publish its per-line method):
 *   - `fixedOpexPerYear` is calibrated so the engine's stabilized NOI reproduces the
 *     template's reported stabilized NOI (~$4,118,952) and, through 3% escalation,
 *     the template's year-6 exit income ($4,774,994) and gross value ($90,952,272).
 *     Aprao does not publish its per-unit payroll/insurance/tax/utility/reserve
 *     lines, so this single floor stands in for them. It is SAMPLE / calibrated, not
 *     sourced market data. See docs/aprao-reconciliation.md for the derivation.
 *
 * Month indexing follows engine convention 1 (month 0 = land close). The template's
 * timeline ("month 1 land; months 4-30 construction; months 31-90 operations; month
 * 91 exit") is used directly as 0-based month offsets.
 */
import type { Deal } from "../../engine/types.js";

export const apraoDeal: Deal = {
  meta: {
    name: "Aprao reference deal (240-unit garden apartments)",
    note: "Fictional/illustrative template. Sample data. Senior debt only, no waterfall.",
    sample: true,
  },

  site: {
    landPrice: 9_600_000, // $40,000 per unit x 240
    landClosingCosts: 313_200,
    landPriceSource: "sample",
  },

  program: {
    components: [
      {
        kind: "residential",
        label: "apartments",
        unitMix: [
          { label: "studio", count: 24, rentPerMonth: 1_600 },
          { label: "1-bed", count: 96, rentPerMonth: 1_900 },
          { label: "2-bed", count: 96, rentPerMonth: 2_425 },
          { label: "3-bed", count: 24, rentPerMonth: 2_925 },
        ],
        netSf: 205_680,
        grossSf: 242_702, // gross-to-net 118%
        ancillaryIncomePerYear: 28_000,
      },
    ],
  },

  budget: {
    hard: {
      verticalPerGrossSf: 168, // $/gross SF x 242,702
      lumpSums: [
        { label: "site work", amount: 4_800_000, source: "sample" },
        { label: "amenities", amount: 2_400_000, source: "sample" },
        { label: "FF&E", amount: 1_200_000, source: "sample" },
        { label: "preliminaries", amount: 2_650_000, source: "sample" },
      ],
      contingencyPct: 0.05,
      contingencyBase: "all-hard",
    },
    soft: {
      pctOfHard: 0.1283, // 12.83% of hard cost, incl. a $7,000/unit permit & impact fee
      base: "hard-incl-contingency",
    },
    // No separate developer fee in the Aprao template.
    spendCurve: { kind: "s-curve", steepness: 2 },
  },

  schedule: {
    landMonth: 1,
    constructionStartMonth: 4,
    constructionEndMonth: 30,
    operationsStartMonth: 31,
    // Stabilized from first operating month (template has no explicit lease-up ramp;
    // "held five years after completion"). Pace >= unit count stabilizes immediately.
    leaseUpUnitsPerMonth: 240,
    stabilizedOccupancy: 0.95,
    exitMonth: 91,
  },

  operations: [
    {
      componentLabel: "apartments",
      vacancy: 0, // the 5% is carried as stabilizedOccupancy to avoid double-counting
      managementPctOfEgi: 0.03, // "Management 3% of income"
      fixedOpexPerYear: 1_755_856, // CALIBRATED — see file header and reconciliation doc
      variableOpexPctOfEgi: 0,
      rentGrowth: 0.03,
      opexGrowth: 0.03,
      growthFrom: "operations-start",
      source: "sample",
    },
  ],

  stack: {
    tranches: [
      {
        kind: "senior",
        maxPctOfCost: 0.62, // 62% of cost
        rate: 0.07, // 7.00%
        paymentMode: "current",
        originationFeePct: 0.01, // 1% arrangement fee
        exitFeePct: 0.01, // 1% exit fee
        termMonths: 91,
        interestOnlyMonths: 91,
        // Capitalize construction-period interest via the reserve; service currently
        // once the asset is operating (convention 6).
        capitalizeUntil: "construction-end",
      },
    ],
    equity: {
      gpCoinvestPct: 0, // single equity class in the template
      // Pro-rata funding: equity and the senior loan fund each cost 38/62, and the
      // interest reserve is 100% loan-funded. This reproduces the template's rolled-up
      // interest (loan draws from the start of construction) and its equity base
      // (~38% of cash cost). See docs/aprao-reconciliation.md.
      proRataFunding: true,
    },
  },

  // No waterfall in the template.

  exit: {
    exitCapRate: 0.0525, // 5.25% on escalated income in the exit year
    sellingCostPct: 0.015, // 1.5% disposition costs
  },
};

/**
 * Expected results exactly as the Aprao template reports them, with the handoff's
 * stated target tolerances. "Their method is not published, so treat the tolerance as
 * a target to investigate, not a guarantee."
 */
export interface ApraoTarget {
  label: string;
  value: number;
  /** Relative tolerance as a fraction (e.g. 0.005 = 0.5%). Mutually exclusive with pts. */
  relTol?: number;
  /** Absolute tolerance in percentage points, for rates (e.g. 0.0025 = 0.25 points). */
  pts?: number;
}

export const apraoTargets: Record<string, ApraoTarget> = {
  grossValue: { label: "Gross sale value", value: 90_952_272, relTol: 0.005 },
  totalCost: { label: "Total cost including finance", value: 76_334_909, relTol: 0.005 },
  financeCost: { label: "Finance cost", value: 5_490_446, relTol: 0.02 },
  profit: { label: "Profit", value: 13_253_078, relTol: 0.02 },
  unleveredIrr: { label: "Unleveraged IRR", value: 0.0878, pts: 0.0025 },
  leveredIrr: { label: "Leveraged IRR", value: 0.1166, pts: 0.0025 },
  returnOnEquity: { label: "Return on equity (profit / equity)", value: 0.4844, pts: 0.01 },
};
