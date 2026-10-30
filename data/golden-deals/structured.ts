/**
 * Second reference deal — hand-built, structured capital stack.
 *
 * The Aprao template validates only the senior-debt-only path. The handoff calls for a
 * second, hand-built deal that adds mezzanine, preferred equity, and a distribution
 * waterfall, "since this template cannot validate those." Its cash flows are known
 * because we build them, so the engine's project and equity IRRs can be checked against
 * an independent reconstruction (tests/structured.test.ts).
 *
 * Every number is SAMPLE DATA. 200-unit multifamily, 5-year hold, senior + mezzanine +
 * preferred equity + an 8%/14% LP-IRR waterfall with a 20% promote and 100% catch-up.
 * Sized so stabilized NOI covers current debt service (no operating cash calls).
 */
import type { Deal } from "../../engine/types.js";

export const structuredDeal: Deal = {
  meta: {
    name: "Structured reference deal (200-unit, mezz + pref + waterfall)",
    note: "Hand-built. Sample data. Validates the debt/waterfall module.",
    sample: true,
  },

  site: { landPrice: 12_000_000, landClosingCosts: 400_000, landPriceSource: "sample" },

  program: {
    components: [
      {
        kind: "residential",
        label: "apartments",
        unitMix: [
          { label: "studio", count: 40, rentPerMonth: 1_800 },
          { label: "1-bed", count: 80, rentPerMonth: 2_150 },
          { label: "2-bed", count: 60, rentPerMonth: 2_750 },
          { label: "3-bed", count: 20, rentPerMonth: 3_400 },
        ],
        netSf: 160_000,
        grossSf: 190_000,
        ancillaryIncomePerYear: 24_000,
      },
    ],
  },

  budget: {
    hard: {
      verticalPerGrossSf: 200,
      lumpSums: [
        { label: "site work", amount: 3_000_000, source: "sample" },
        { label: "amenities", amount: 1_500_000, source: "sample" },
        { label: "FF&E", amount: 900_000, source: "sample" },
        { label: "preliminaries", amount: 2_000_000, source: "sample" },
      ],
      contingencyPct: 0.05,
      contingencyBase: "all-hard",
    },
    soft: { pctOfHard: 0.15, base: "hard-incl-contingency" },
    spendCurve: { kind: "s-curve", steepness: 2 },
  },

  schedule: {
    landMonth: 0,
    constructionStartMonth: 3,
    constructionEndMonth: 27,
    operationsStartMonth: 28,
    leaseUpUnitsPerMonth: 200, // stabilized from first operating month (sample)
    stabilizedOccupancy: 0.95,
    exitMonth: 88, // ~5-year hold after stabilization
  },

  operations: [
    {
      componentLabel: "apartments",
      vacancy: 0,
      managementPctOfEgi: 0.035,
      fixedOpexPerYear: 1_200_000, // sample
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
        maxPctOfCost: 0.5, // 50% LTC
        rate: 0.065,
        paymentMode: "current",
        originationFeePct: 0.01,
        exitFeePct: 0.005,
        termMonths: 120,
        interestOnlyMonths: 120,
        capitalizeUntil: "construction-end",
      },
      {
        kind: "mezz",
        maxPctOfCost: 0.62, // combined senior+mezz LTC target (=> 12% mezz)
        rate: 0.11,
        paymentMode: "current",
        originationFeePct: 0.015,
        exitFeePct: 0.01,
        termMonths: 120,
        interestOnlyMonths: 120,
        capitalizeUntil: "construction-end",
      },
      {
        kind: "pref",
        maxPctOfCost: 0.05, // 5% of cost
        rate: 0.1,
        paymentMode: "accrued", // PIK preferred return
        originationFeePct: 0,
        exitFeePct: 0,
        termMonths: 120,
        interestOnlyMonths: 120,
      },
    ],
    equity: {
      gpCoinvestPct: 0.1, // GP co-invests 10% of common equity
      proRataFunding: true,
    },
  },

  waterfall: {
    tiers: [
      { hurdleKind: "irr", hurdleRate: 0.08, investorShare: 1.0, label: "RoC + 8% pref" },
      { hurdleKind: "irr", hurdleRate: 0.14, investorShare: 0.8, label: "to 14% LP IRR (80/20)" },
      { hurdleKind: "irr", investorShare: 0.7, label: "residual (70/30)" },
    ],
    catchUpPct: 1.0,
    promoteShare: 0.2,
  },

  exit: { exitCapRate: 0.055, sellingCostPct: 0.02 },

  modular: { hardCostPremiumPct: 0.05, constructionMonthsSaved: 5 },
};
