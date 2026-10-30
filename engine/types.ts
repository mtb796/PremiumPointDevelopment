/**
 * Core engine types, written once and used everywhere.
 *
 * Unit discipline (engine convention 12 — never convert implicitly):
 *   - Money is in whole dollars (number).
 *   - Area is in square feet (number).
 *   - Time is in whole months (integer), month 0 = land closing (convention 1).
 *   - Rates are decimals (0.07 == 7%), expressed per year unless the field name
 *     says otherwise.
 *
 * The engine is pure and deterministic: no UI, no network, no Date.now(), no
 * randomness. Same inputs always give the same outputs.
 */

export type Money = number; // whole dollars
export type Sf = number; // square feet
export type Month = number; // whole months, 0-based, month 0 = land closing
export type Rate = number; // decimal, e.g. 0.07 for 7%
export type Pct = number; // decimal fraction, e.g. 0.05 for 5%

/** Where a value came from. Drives the "sample" / "verified" badges in the UI. */
export type SourceKind = "sample" | "comp" | "verified" | "ai-suggestion" | "user";

// ---------------------------------------------------------------------------
// Program (what gets built)
// ---------------------------------------------------------------------------

/** One residential unit type in the mix. Rent is per unit per month, year-0 dollars. */
export interface UnitType {
  label: string; // "studio", "1-bed", "2-bed", "3-bed"
  count: number; // number of units of this type
  rentPerMonth: Money; // $ per unit per month, in year-0 (untrended) dollars
  avgNetSf?: Sf; // optional net SF per unit, for the by-unit-type report
}

export type ComponentKind = "residential" | "retail" | "office" | "parking";

/**
 * The program: one or more components sharing a site. A residential-only deal
 * (like the Aprao reference) has a single residential component.
 */
export interface Program {
  components: ProgramComponent[];
}

export interface ProgramComponent {
  kind: ComponentKind;
  label: string;
  /** Residential: the unit mix. Commercial: omit and use leasableNetSf + commercial rent. */
  unitMix?: UnitType[];
  /** Total net rentable / leasable area for this component (SF). */
  netSf: Sf;
  /** Total gross building area for this component (SF). grossSf >= netSf. */
  grossSf: Sf;
  /** Other / ancillary income, $ per year, year-0 dollars (e.g. parking, laundry). */
  ancillaryIncomePerYear?: Money;
  /** Commercial rent, $ per leasable SF per year, year-0 dollars (retail/office only). */
  commercialRentPsfPerYear?: Money;
  /** Optional per-component exit cap rate (mixed-use); falls back to the deal exit cap. */
  exitCapRate?: Rate;
  /** Optional commercial leasing terms (retail/office). */
  leasing?: CommercialLeasing;
}

/** Commercial leasing terms (handoff: mixed-use module). */
export interface CommercialLeasing {
  leaseType: "NNN" | "modified-gross" | "gross";
  freeRentMonths?: number;
  tiAllowancePsf?: Money; // tenant improvement allowance, $/leasable SF
  leasingCommissionPct?: Pct; // of lease value
  downtimeMonths?: number; // between leases
  renewalProbability?: Pct;
}

// ---------------------------------------------------------------------------
// Site
// ---------------------------------------------------------------------------

export interface Site {
  /** Land purchase price (SF/geometry live in the buildable module, added later). */
  landPrice: Money;
  /** Land purchase / closing costs (title, legal, transfer), paid at land close. */
  landClosingCosts: Money;
  /** Optional provenance, for the sample/verified badge. */
  landPriceSource?: SourceKind;
}

// ---------------------------------------------------------------------------
// Budget (what it costs to build)
// ---------------------------------------------------------------------------

/** A named lump-sum cost line (site work, amenities, FF&E, preliminaries, ...). */
export interface CostLine {
  label: string;
  amount: Money;
  source?: SourceKind;
}

export interface HardCost {
  /** Vertical construction, $ per gross SF of the whole building. */
  verticalPerGrossSf: Money;
  /** Lump-sum hard-cost lines beyond vertical (site work, amenities, FF&E, preliminaries). */
  lumpSums: CostLine[];
  /**
   * Contingency as a fraction of the hard-cost subtotal.
   * `base` selects what the contingency applies to.
   */
  contingencyPct: Pct;
  contingencyBase?: "all-hard" | "vertical-only"; // default "all-hard"
}

export interface SoftCost {
  /** Soft costs as a fraction of hard cost. */
  pctOfHard: Pct;
  /** What the percentage applies to. Default "hard-incl-contingency". */
  base?: "hard-incl-contingency" | "hard-excl-contingency";
}

/** How hard+soft construction spend is distributed over the construction months. */
export type SpendCurve =
  | { kind: "linear" }
  | { kind: "s-curve"; /** beta-distribution-like front/back weighting, see proforma */ steepness?: number }
  | { kind: "custom"; weights: number[] }; // weights[i] for construction month i; normalized

export interface Budget {
  hard: HardCost;
  soft: SoftCost;
  /** Optional developer fee. Absent in the Aprao reference. */
  developerFee?: { pctOfCost: Pct } | { amount: Money };
  /** Spend curve for hard+soft over the construction window. */
  spendCurve: SpendCurve;
}

// ---------------------------------------------------------------------------
// Schedule (when things happen) — all month indices are 0-based, month 0 = land close
// ---------------------------------------------------------------------------

export interface Schedule {
  landMonth: Month; // month land closes and land cost is paid
  constructionStartMonth: Month; // first month of hard/soft construction spend
  constructionEndMonth: Month; // last month of construction spend (completion)
  operationsStartMonth: Month; // first month rent is collected (lease-up begins)
  /** Lease-up pace, units per month. Occupancy ramps linearly from delivery. */
  leaseUpUnitsPerMonth: number;
  /** Stabilized physical occupancy (e.g. 0.95). */
  stabilizedOccupancy: Pct;
  exitMonth: Month; // month of sale; horizon runs through here (convention 1)
}

// ---------------------------------------------------------------------------
// Operations (how it runs once open)
// ---------------------------------------------------------------------------

export interface Operations {
  /** Component this applies to (matches Program component label). */
  componentLabel: string;
  /** Economic vacancy / credit loss as a fraction of gross potential rent. */
  vacancy: Pct;
  /** Management fee as a fraction of effective gross income. */
  managementPctOfEgi: Pct;
  /**
   * Fixed operating-expense floor, $ per year, year-0 dollars (taxes, insurance,
   * staffing, utilities, reserves — everything that is not the % management fee).
   * Convention 8: opex = fixed floor + variable share of revenue.
   */
  fixedOpexPerYear: Money;
  /** Variable opex as a fraction of effective gross income, on top of management. */
  variableOpexPctOfEgi?: Pct;
  /** Annual growth applied to rents. Compounds monthly (convention 2). */
  rentGrowth: Rate;
  /** Annual growth applied to operating costs. Compounds monthly. */
  opexGrowth: Rate;
  /**
   * Point from which growth is applied to year-0 rents/opex. Default
   * "operations-start" (year-0 dollars are the first operating year's dollars).
   */
  growthFrom?: "operations-start" | "land-close";
  source?: SourceKind;
}

// ---------------------------------------------------------------------------
// Capital stack
// ---------------------------------------------------------------------------

export type TrancheKind = "senior" | "mezz" | "pref";

export interface Tranche {
  kind: TrancheKind;
  /** Sizing cap as a fraction of total cost (loan-to-cost). */
  maxPctOfCost: Pct;
  /** Optional debt-yield floor used in sizing (senior): loan limited so stabilized NOI/loan >= this. */
  minDebtYield?: Rate;
  rate: Rate; // annual
  paymentMode: "current" | "accrued"; // current-pay vs PIK/rolled-up
  originationFeePct: Pct; // of commitment, a use at closing
  exitFeePct: Pct; // of commitment (or balance), paid at repayment
  termMonths: number; // maturity; a balloon is required if term < hold (convention 10)
  interestOnlyMonths: number;
  /**
   * During construction + lease-up, senior interest is capitalized via the reserve
   * (convention 6). After stabilization a current-pay tranche services interest
   * from cash flow. "accrued" tranches roll up the whole time.
   */
  capitalizeUntil?: "stabilization" | "construction-end" | "never";
  /** Takeout loan sizing used when this tranche matures before exit (convention 10). */
  takeout?: {
    ltv?: Pct; // loan-to-value cap on the refinance appraisal (value = fwd-12 NOI / cap)
    minDebtYield?: Rate; // NOI / takeout loan >= this
    minDscr?: number; // NOI / annual debt service >= this
    rate?: Rate; // takeout coupon; defaults to this tranche's rate
    capRate?: Rate; // appraisal cap rate for the value; defaults to the deal exit cap
  };
  /** Preferred-equity-only: accrued pref return floor as a minimum equity multiple at exit. */
  minMultiple?: number;
}

export interface EquityTerms {
  /** GP co-invest as a fraction of total common equity. */
  gpCoinvestPct: Pct;
  /** If true, equity and debt fund pro rata; else equity funds first (convention 4, default). */
  proRataFunding?: boolean;
}

export interface Stack {
  tranches: Tranche[]; // senior, then mezz, then pref (repayment priority order)
  equity: EquityTerms;
}

// ---------------------------------------------------------------------------
// Waterfall
// ---------------------------------------------------------------------------

export type HurdleKind = "irr" | "equity-multiple";

export interface WaterfallTier {
  /** The hurdle this tier carries the investor class up to. Tier 1 is return of capital + pref. */
  hurdleKind: HurdleKind;
  hurdleRate?: Rate; // for irr hurdles (annual), or
  hurdleMultiple?: number; // for equity-multiple hurdles
  /** Investor-class share of cash in this tier (LP+GP co-invest together). Rest is promote to GP. */
  investorShare: Pct;
  label?: string;
}

export interface WaterfallTerms {
  tiers: WaterfallTier[];
  /** GP catch-up percentage (1.0 == full 100% catch-up). Optional toggle. */
  catchUpPct?: Pct;
  /** Promote share used by the catch-up and clawback logic. */
  promoteShare: Pct;
  /** If true, apply a GP clawback at final distribution. */
  clawback?: boolean;
}

// ---------------------------------------------------------------------------
// Exit
// ---------------------------------------------------------------------------

export interface Exit {
  exitCapRate: Rate;
  sellingCostPct: Pct; // disposition costs as a fraction of gross value
}

// ---------------------------------------------------------------------------
// Phasing & modular (used by later modules; optional for the reference deal)
// ---------------------------------------------------------------------------

export interface Phase {
  label: string;
  componentLabels: string[]; // components delivered in this phase
  constructionStartMonth: Month;
  constructionEndMonth: Month;
  operationsStartMonth: Month;
}

export interface ModularOverrides {
  hardCostPremiumPct: Pct; // + or - on vertical $/SF
  constructionMonthsSaved: number;
  // other drivers are derived (interest carry, time to first rent)
}

// ---------------------------------------------------------------------------
// Deal (the whole input)
// ---------------------------------------------------------------------------

export interface Deal {
  meta?: {
    name?: string;
    note?: string;
    /** When true, the UI/exports must show a prominent "sample data" label. */
    sample?: boolean;
  };
  site: Site;
  program: Program;
  budget: Budget;
  schedule: Schedule;
  operations: Operations[]; // one per component
  phases?: Phase[];
  stack: Stack;
  waterfall?: WaterfallTerms;
  exit: Exit;
  modular?: ModularOverrides;
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export interface MonthlyRow {
  month: Month;
  // Development
  landSpend: Money;
  hardSoftSpend: Money;
  originationFees: Money;
  // Operations
  grossPotentialRent: Money;
  vacancyLoss: Money;
  otherIncome: Money;
  effectiveGrossIncome: Money;
  operatingExpense: Money;
  noi: Money;
  // Financing (per the senior tranche; extended for mezz/pref later)
  debtDraw: Money; // principal drawn this month
  capitalizedInterest: Money; // interest rolled into balance this month
  currentInterest: Money; // interest paid in cash this month
  debtRepayment: Money; // principal + fees repaid this month
  debtBalanceOpen: Money;
  debtBalanceClose: Money;
  // Equity
  equityDraw: Money; // equity contributed this month (a use)
  // Exit
  saleGrossProceeds: Money;
  sellingCosts: Money;
  // Reconciled flows
  unleveredCashFlow: Money; // project-level, no financing
  leveredCashFlow: Money; // to equity after financing
}

export interface SourcesUses {
  uses: { label: string; amount: Money }[];
  sources: { label: string; amount: Money }[];
  totalUses: Money;
  totalSources: Money;
}

export interface Irr {
  /** Annualized IRR (convention 3): (1+monthlyIrr)^12 - 1. */
  annual: Rate;
  monthly: Rate;
  /** True if a sign change existed and bisection converged. */
  solved: boolean;
}

export type FlagLevel = "info" | "warning" | "error";

export interface Flag {
  level: FlagLevel;
  code: string;
  message: string;
}

export interface Returns {
  project: Irr; // unlevered
  levered: Irr; // levered project / equity IRR
  lp?: Irr;
  gp?: Irr;
  equityMultiple: number;
  peakEquity: Money;
  monthsToFullCapitalReturn?: number;
  promote?: Money;
  /** Standard definition: stabilized (year-1) NOI / total cost. */
  yieldOnCost: Rate;
  /** Reported separately and labeled: development profit / total cost. */
  profitOnCost: Rate;
  /** Development margin: net sale proceeds - total cost incl. finance. */
  profit: Money;
  /** profit / equity. */
  returnOnEquity: Rate;
  stabilizedDscr?: number;
  debtYield?: Rate;
}

export interface TrancheMonthly {
  month: Month;
  open: Money;
  draw: Money; // principal drawn for cost this month
  capitalizedInterest: Money;
  currentInterest: Money;
  repaid: Money; // principal repaid this month (excludes fees)
  close: Money;
}

export interface TrancheResult {
  kind: TrancheKind;
  label: string;
  commitment: Money;
  rate: Rate;
  originationFee: Money;
  exitFee: Money;
  capitalizedInterestTotal: Money;
  currentInterestTotal: Money;
  principalDrawn: Money; // cost draws (excludes capitalized interest)
  exitBalance: Money; // balance repaid at exit
  monthly: TrancheMonthly[];
  /** Set when this tranche matured before exit and was taken out (convention 10). */
  takeout?: { month: Month; size: Money; shortfall: Money };
}

export interface ComponentSummary {
  label: string;
  kind: string;
  netSf: Sf;
  grossSf: Sf;
  stabilizedNoi: Money;
  value: Money;
}

export interface Result {
  monthly: MonthlyRow[];
  tranches: TrancheResult[];
  /** Per-component stabilized NOI and value (mixed-use). Sums to the total. */
  components: ComponentSummary[];
  sourcesUses: SourcesUses;
  costSummary: {
    land: Money;
    hard: Money;
    soft: Money;
    financeCost: Money; // capitalized interest + fees
    totalCostInclFinance: Money;
  };
  exit: {
    forward12Noi: Money; // the NOI the cap rate is applied to (convention 9)
    grossValue: Money;
    sellingCosts: Money;
    netProceeds: Money;
    debtPayoff: Money;
  };
  stabilizedNoiYear1: Money;
  returns: Returns;
  flags: Flag[];
}
