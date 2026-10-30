# Premium Point Development App — Claude Code Handoff

Oct 30, 2026 · @Malik

> This file is a faithful transcription of the source handoff document
> (`Premium Point Development App — Claude Code Handoff.docx`). It is the
> specification the whole build references. Do not change its substance when
> editing; record decisions elsewhere.

## Purpose and context

This is a weekend build of a development-underwriting app that shows Malik can do
the Premium Point Development Real Estate Development Analyst role: financial
modeling, market research, and project management on large multifamily and
mixed-use deals, with AI doing the heavy lifting.

- **Audience:** Premium Point's founders. It ships alongside a resume and cover
  letter as a portfolio piece, not a production product.
- **Core idea:** go from an address to a maximum-yield building program, a full
  capital stack with returns, and an investor-ready one-pager, in minutes.
- **Why it stands out:** most candidates can model. Few can connect zoning and
  site constraints to units, units to a mezzanine and waterfall structure, and
  that structure to an investor package in one flow.
- **Repo:** its own repo, separate from GroundUp. GroundUp is a reference for
  ideas only; no code or data is imported.
- **Honesty rule:** it is not affiliated with Premium Point. Use no Premium Point
  logos or branding, and label every sample number as sample data.
- **Unverified assumption:** that Premium Point's past deals used mezzanine debt,
  waterfalls, and balloon loans. Confirm from their own materials before the
  interview.

## One-page flow: address to decision

The whole product is one page that recalculates live as the user types, in six
stacked steps, with no separate screens and no Excel. The first example market is
the DMV (Arlington and Fairfax), where Malik sources commercial lots.

1. **Address.** Type an address; the map shows the parcel, dimensions, flood,
   Resource Protection Area, and slope overlays, and the zoning district.
2. **Maximum program.** The engine computes the most residential or mixed-use
   units the lot can hold, in two cases side by side: by-right (the written
   district standards) and plan-based (what a site plan or rezoning could allow,
   using a density the user confirms from the comprehensive plan or a comparable
   approved project). A toggle switches between residential-only and mixed-use.
3. **Deal inputs.** One compact panel (below). The site, program, and costs flow
   in automatically.
4. **Hold vs. sell.** The same site, program, and costs run two ways, build to
   rent and hold and build to sell, shown in one comparison table.
5. **Verdict.** A plain-language answer to which option works better for
   investors, with the rule behind it and the point at which the answer flips.
6. **Winning pro forma.** A full professional pro forma and sensitivity analysis
   for the winner only, laid out as in the case study, with export to the investor
   package.

**Assumption to confirm.** "Build to sell" is modeled two ways: for-sale units
(condo or townhome) sold over an absorption period starting at delivery, or a bulk
sale of the finished building at delivery. "Build to hold" follows the case study:
lease up, stabilize, hold for a set number of years, then sell at an exit cap rate.
If Malik means something different by either, change this before building.

## Fast deal inputs

Inputs must be quick enough to use on a call and complete enough for professional
developers. The rule is complete but compact: every input exists, and nothing is
asked for twice.

- **Headline panel (about 20 fields, always visible).** Land price; unit mix and
  rent per unit; commercial SF and rent; hard cost per gross SF; soft cost percent;
  contingency percent; construction months; lease-up pace; operating expense per
  unit; exit cap rate; hold years; for-sale price per SF or per unit; absorption in
  units per month; selling cost percent; senior loan-to-cost and rate; mezzanine
  loan-to-cost and rate; LP/GP split, preferred return, and promote.
- **Detail blocks (collapsed, pre-filled).** Itemized cost lines, unit-mix table,
  commercial leasing terms, draw curve, fees, preferred equity, extra waterfall
  tiers. Opening one never changes a number until the user edits it.
- **Smart defaults.** Every default shows where it came from (sample data, comp, or
  AI suggestion) and can be overwritten inline. The AI layer proposes, the user
  confirms.
- **Entry shortcuts.** Accept "1.9k", "$1,900", and "4%"; switch per-unit and
  per-SF with one click; paste a unit mix straight from a spreadsheet or clipboard.
- **Optional import.** Upload a CSV of unit mix, rents, or comps and map columns
  once. Never required.
- **Save.** Autosave the deal as JSON, with named scenarios the user can duplicate
  and compare.

## Hold vs. sell comparison and verdict

Both cases share the same land, program, hard and soft costs, schedule to
completion, and capital stack terms, so the only differences are the business
plans.

| Measure | Build to rent and hold | Build to sell |
| --- | --- | --- |
| Profit and profit on cost | From exit sale after the hold | From unit or bulk sales |
| Project IRR and LP IRR | Computed | Computed |
| Equity multiple | Computed | Computed |
| Peak equity and months to full capital return | Computed | Computed |
| Downside profit (revenue down 10%, cost up 10%) | Computed | Computed |
| Debt risk | Minimum DSCR, balloon coverage | Loan repaid from sales; months of sales needed to retire the loan |
| Main risk | Lease-up pace, exit cap, refinance | Absorption pace, price per SF, carry cost while unsold |

- **Verdict rule.** The user picks the investor objective, and the verdict states
  which option wins under it and by how much. Three presets: return speed (highest
  LP IRR), total profit (highest profit and multiple), and risk-adjusted (highest
  downside-case profit). The default is shown on screen and can be changed.
- **Crossover.** Beside the verdict, show the value at which the answer flips, for
  example "Selling wins unless the sale price falls below $X per SF" or "Holding
  wins if the exit cap rate stays under Y%". Always show the verdict with its reason
  and never as a bare label.

## Scope: everything ships

Every module below is in scope for this build, and nothing is deferred. The app
takes a parcel from address to max-buildable program, a phased multifamily or
mixed-use pro forma, a full capital stack and waterfall, stress tests, a project
schedule, and a complete investor package.

| Module | Included | Depends on |
| --- | --- | --- |
| Site and land view | Map, parcel, dimensions, FEMA flood, zoning and constraint layers; pilot plus additional verified jurisdictions | Geocoder, parcel and zoning layers |
| Max-buildable engine | All dimensional constraints, binding constraint, bonus and incentive provisions | Site view, rule tables |
| Development pro forma | Multifamily and mixed-use, phased delivery, monthly | Max-buildable |
| Capital stack | Senior construction loan, mezzanine, preferred equity, LP/GP common equity, balloon takeout | Pro forma |
| Waterfall | Configurable tiers, GP catch-up, clawback | Capital stack |
| Modular comparison | Side-by-side cost, schedule, carry, IRR | Pro forma |
| Market research and flags | Comp import, submarket summary, assumption flags | Pro forma inputs |
| Scenarios and sensitivity | Tornado, scenario grid, two-way tables, breakevens | Engine |
| Project tracker | Milestones, dependencies, Gantt, critical path; drives the schedule | Pro forma schedule |
| Investor package | Teaser, full deck, diligence checklist, data room index | All of the above |

Because nothing is cut, the build order (below) follows dependencies, so each
module sits on tested foundations and a late module never undermines an earlier
one. The same acceptance tests apply to all of it.

## Architecture principles

The calculation engine is pure, deterministic, and tested; the AI layer only
proposes and explains inputs and never computes a number that appears in the
output.

- **Engine separation.** Put all math in an `engine/` module with no UI or network
  imports: pro forma, debt, waterfall, max-buildable. Same inputs always give the
  same outputs.
- **AI proposes, human confirms.** Agents may draft pro forma assumptions and flag
  weak inputs, always shown as editable and marked with their source. **Agents never
  supply, infer, or fill in a zoning value.**
- **Rule tables are data, not code.** Zoning standards live in a versioned JSON file
  per jurisdiction, each rule carrying a citation and a verified flag. Every value is
  copied from the source PDF with its page number and quoted text; a value that
  cannot be read is stored as "not found" and never estimated.
- **Label everything sample.** Any comp, rent, or cost that is not sourced carries a
  visible "sample" badge.
- **One engine per concern.** One envelope calculator, one cost model, one
  definition each of DSCR and yield on cost. GroundUp's duplicated engines are the
  cautionary example.

**Suggested stack (change freely):** TypeScript, Vite and React, Vitest for engine
tests, MapLibre GL for the map, Turf.js for geometry, a thin serverless function
for model calls (API key kept server-side), no database for the MVP (deal state
saved as JSON), deployed on Vercel.

**Free data sources to check first:** a geocoder (Census), the county's public
ArcGIS parcel and zoning layers, and FEMA's National Flood Hazard Layer for flood
zones. Confirm each is reachable and licensed for this use before relying on it.

## Repo layout and data model

```
premium-point-development-app/
  engine/       pure TypeScript, no UI or network imports
    proforma/   monthly cash flows, operations, mixed-use, phasing
    debt/       senior, mezzanine, preferred equity, reserve solver, takeout
    waterfall/  tiers, catch-up, clawback
    buildable/  geometry and constraint minimum
    scenarios/  sensitivity, grids, breakevens
  rules/        one JSON file per jurisdiction, plus registry.json
  data/         sample comps (CSV), golden deals, golden parcels
  app/          React UI
  api/          serverless: /model (AI), /geocode, /gis proxies
  export/       teaser, deck and checklist templates, print CSS
  tests/        engine, rules, golden cases
  docs/         this handoff, reference-deal spreadsheet
```

Core types, written once in `engine/types.ts` and used everywhere. Money is in
dollars, area in square feet, time in whole months, rates as decimals.

```ts
type Deal = {
  site: Site; program: Program; budget: Budget; schedule: Schedule;
  operations: Operations[];      // one per component: residential, retail, office
  phases: Phase[];               // delivery timing per component
  stack: Stack; waterfall: WaterfallTerms; exit: Exit;
  modular?: ModularOverrides;
};
type Tranche = {
  kind: 'senior' | 'mezz' | 'pref';
  maxPctOfCost: number; rate: number; paymentMode: 'current' | 'accrued';
  originationFeePct: number; exitFeePct: number; termMonths: number;
  interestOnlyMonths: number;
};
type Result = {
  monthly: MonthlyRow[];         // every row reconciles
  sourcesUses: SourcesUses;
  returns: { project: Irr; lp: Irr; gp: Irr; multiple: number; promote: number; yieldOnCost: number; dscr: number; debtYield: number };
  flags: Flag[];                 // balloon shortfall, non-convergence, covenant breaches
};
```

## Engine conventions (read before coding)

These rules remove the ambiguity that makes two correct-looking models disagree.
Put them in the engine's README and reference them in tests.

1. **Time.** Month 0 is land closing. All flows occur at month end. The horizon
   runs through the exit month.
2. **Rates.** Monthly interest is opening balance times annual rate divided by 12.
   Growth rates compound monthly at `(1 + g)^(1/12) - 1`.
3. **IRR.** Solve the monthly IRR with bisection (tolerance 1e-10), then annualize
   as `(1 + m)^12 - 1`. This equals Excel's `=(1+IRR(range))^12-1`. Do not compare
   against XIRR, which uses actual dates and differs slightly.
4. **Funding order.** Equity funds first until its commitment is spent, then
   preferred equity, then mezzanine, then senior debt. Provide a toggle for pro rata
   funding. Debt is sized at closing as a commitment; draws follow cost spend.
5. **Sizing.** Senior = the lower of loan-to-cost and debt-yield limits. Mezzanine
   fills to the combined loan-to-cost target. Preferred equity fills to its own cap.
   Common equity is the remainder.
6. **Interest and fees.** Senior interest during construction and lease-up is
   capitalized through the interest reserve. Mezzanine and preferred are current-pay
   or accrued by setting. Origination fees are uses at closing; exit fees are paid at
   repayment.
7. **Circularity.** Financing cost depends on loan size, which depends on total
   cost, which includes financing cost. Iterate until the change is under $1, with a
   limit of 50 passes. If it does not converge, throw a visible error.
8. **Operations.** Occupied units ramp linearly from delivery at the lease-up pace
   until stabilized occupancy. Revenue is occupied units times rent times growth.
   Operating expenses have a fixed floor (taxes, insurance, staffing) plus a variable
   share of revenue.
9. **Exit.** Gross value = forward 12-month stabilized NOI divided by the exit cap
   rate. Net proceeds = value times `(1 - selling cost %)` minus all debt payoffs.
10. **Balloon.** If a loan matures before the exit month, a takeout is required.
    Size the takeout loan by the lowest of loan-to-value, DSCR, and debt-yield
    limits. Any shortfall becomes a forced equity contribution and raises a visible
    flag.
11. **Rounding.** Keep full precision internally. Round only for display.
    Reconciliation tolerance is $0.01 in total.
12. **Units.** Never convert units implicitly. Dollars, square feet, months,
    decimals.
13. **Waterfall algorithm.** Treat all contributed capital as the investor class,
    split pro rata between LP and GP co-invest. The GP's promote is paid on top. For
    each hurdle `h` with annual rate `r_h`, track a balance that compounds monthly,
    grows with contributions, and shrinks with distributions to the investor class:

    `B_h(t) = B_h(t-1) · (1 + r_h)^(1/12) + C(t) - D_h(t)`

    In each month, distributable cash is paid tier by tier. In tier `k` with investor
    share `s_k`, pay the smaller of the remaining cash and `B_k / s_k`. The investor
    share goes pro rata to LP and GP co-invest, and the rest is promote to the GP. A
    catch-up of `c%` pays the GP until cumulative promote equals its promote share of
    cumulative profit; at `c = 100%` the catch-up amount is `p / (1 - p)` times the
    investor profit paid so far, where `p` is the promote share. Check that every
    month's payments sum to distributable cash exactly.

## External services and configuration

- **Model access.** Call the Anthropic API only from the serverless `/model`
  function, with the key in an environment variable. Make the model name a setting;
  `claude-sonnet-5-5` is a sensible default. Never expose the key to the browser.
- **Geocoding.** U.S. Census geocoder, one-line address endpoint
  (`geocoding.geo.census.gov/geocoder/locations/onelineaddress`). Proxy it from the
  server to avoid browser cross-origin errors.
- **Flood zones.** FEMA's National Flood Hazard Layer ArcGIS REST service
  (`hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer`). Confirm the flood
  hazard zones layer index when you wire it, since layer numbers can change.
- **Parcels and zoning.** Each jurisdiction's public ArcGIS REST endpoints, listed in
  `rules/registry.json` with the layer URL, the field names, and the date last
  checked.
- **Map tiles.** MapLibre with a tile provider whose terms permit this use. Do not
  hotlink the public OpenStreetMap tile server for a deployed app.
- **Secrets and CORS.** All third-party calls that need a key or fail cross-origin go
  through `api/`. Document every environment variable in `.env.example` from the
  first commit.
- **Failure handling.** Every external call has a timeout, one retry, and a visible
  "not available" result. Never fall back silently to a default.

## Module: capital stack and waterfall engine

This is the correctness-critical module: it turns monthly project cash flows into
debt balances, equity contributions, and distributions by investor class, and it
must reconcile to the penny.

### Capital stack, in repayment priority

- **Senior construction loan.** Sized by loan-to-cost cap and, optionally, debt
  yield. Interest-only during construction and lease-up, funded by monthly draws that
  follow cost spend, with an interest reserve. Repaid at maturity by a balloon, either
  from a permanent takeout loan or a sale.
- **Mezzanine debt.** Subordinate to senior, with a fixed coupon that is paid
  currently or accrued (PIK) by toggle, an origination fee, and repayment from the
  same takeout event.
- **Equity.** LP and GP common equity, with GP co-invest as a percent of total
  equity. Equity goes in first, then debt draws.
- **Preferred equity,** between mezzanine and common: a fixed preferred return
  (current-pay or accrued, default 12%), optional minimum multiple or IRR floor,
  optional participation in upside, repaid after mezzanine and before common at the
  takeout event. It is a toggle, off by default, with its own sizing as a percent of
  total cost.

**Circularity.** The interest reserve depends on loan size, loan size depends on
total cost, and total cost includes the reserve. Solve by iterating until the reserve
changes by less than $1, with a maximum of 50 iterations and an error if it does not
converge.

### Waterfall (default sample terms, all editable)

| Tier | Distribution rule | LP / GP split |
| --- | --- | --- |
| 1 | Return of capital and 8% preferred return, pro rata to contributed equity | Pro rata |
| 2 | GP catch-up until GP has promote share of profits (optional toggle) | 0 / 100 |
| 3 | Residual until LP reaches a 12% IRR | 80 / 20 |
| 4 | Residual above a 12% LP IRR | 70 / 30 |

Hurdles are measured on IRR, so track each class's running balance with compounding,
not simple interest. GP receives its co-invest share through the pro rata tiers plus
the promote.

**Configuration beyond the default.** The waterfall accepts any number of tiers, each
defined by an IRR hurdle (or an equity-multiple hurdle) and an LP/GP split. It also
supports a GP catch-up percentage other than 100%, and a GP clawback: at final
distribution, if the GP's total promote exceeds its promote share of total profit, the
excess is returned to LPs. Test each of these.

**Outputs:** project-level unlevered and levered IRR, equity multiple, peak equity, LP
IRR and multiple, GP IRR and multiple, total promote, yield on cost, stabilized DSCR,
debt yield, and a sources and uses table.

## Module: development pro forma and modular comparison

The pro forma is a monthly model from land closing to sale or refinance, and its
headline feature is a side-by-side of prefab modular against conventional
construction that shows schedule compression in dollars.

### Inputs

- **Site and program:** land price and closing costs, unit count and mix from the
  max-buildable engine, average unit size, efficiency (net to gross).
- **Costs:** hard cost per gross square foot, soft costs as a percent of hard,
  contingency, developer fee, and a monthly spend curve (S-curve default).
- **Schedule:** months to entitlement, to construction start, to completion, and to
  stabilization, plus lease-up pace in units per month.
- **Operations:** rent per unit, other income, vacancy, operating expense ratio,
  annual growth rates, real estate taxes.
- **Exit:** exit cap rate, selling costs, hold period after stabilization.

### Modular vs. conventional

One toggle switches a set of overrides, and the app shows both cases next to each
other.

| Driver | Conventional | Modular |
| --- | --- | --- |
| Hard cost per gross SF | Base input | Base plus or minus a percent premium (sample value, editable) |
| Construction duration | Base input | Shorter by an editable number of months |
| Cost escalation during build | Applied per month | Applied over fewer months |
| Construction interest carry | Computed from draws | Computed from draws, lower from the shorter build |
| Time to first rent | Base input | Earlier by the schedule savings |

The output is the change in total cost, interest carry, levered IRR, and equity
multiple, with one sentence stating which effect dominates. Every modular premium and
schedule figure is a labeled sample until sourced.

**Assumption flags.** For each key input (rent growth, cost per SF, exit cap rate,
lease-up pace) the AI layer compares it with a small set of labeled sample comps and
returns a plain-language flag such as "rent growth is above the comp range". The flag
explains; it never changes the value.

## Case study: reference deal and report layout

The Aprao multifamily development template (overview, full report, opened October 30,
2026) is the layout reference for the pro forma and the first test deal for the
engine. Its own disclaimer says the project is fictional and illustrative, so use it
for structure and testing, never as market evidence.

**The deal.** A 240-unit garden apartment community on a 16-acre site, ground-up,
held five years after completion, then sold.

| Input | Value |
| --- | --- |
| Land | $9,600,000 ($40,000 per unit), plus $313,200 in purchase costs |
| Net rentable / gross area | 205,680 SF / 242,702 SF (gross-to-net 118%) |
| Unit mix and rent per month | 24 studios at $1,600; 96 one-bed at $1,900; 96 two-bed at $2,425; 24 three-bed at $2,925; ancillary income $28,000 per year |
| Hard cost | $168 per gross SF vertical, plus $4.8M site work, $2.4M amenities, $1.2M FF&E, $2.65M preliminaries, 5% contingency |
| Soft costs | 12.83% of hard cost, including a $7,000 per unit permit and impact fee |
| Growth | 3% a year on rents and on operating costs |
| Operating costs | Management 3% of income plus per-unit payroll, insurance, taxes, utilities, reserves |
| Timeline | Month 1 land; months 4 to 30 construction on an S-curve; months 31 to 90 operations; month 91 exit |
| Debt | One senior loan at 62% of cost, 7.00% rolled-up interest, 1% arrangement fee, 1% exit fee |
| Exit | 5.25% cap rate on escalated income in the exit year; 1.5% disposition costs |

**Expected results** (as the template reports them; their method is not published, so
treat the tolerance as a target to investigate, not a guarantee).

| Output | Template value | Target tolerance |
| --- | --- | --- |
| Gross sale value | $90,952,272 | within 0.5% |
| Total cost including finance | $76,334,909 | within 0.5% |
| Finance cost | $5,490,446 | within 2% |
| Profit | $13,253,078 | within 2% |
| Unleveraged IRR | 8.78% | within 0.25 points |
| Leveraged IRR | 11.66% | within 0.25 points |
| Return on equity (profit / equity) | 48.44% | within 1 point |

Two checks on the template's own numbers are useful. First, its exit value equals
year-6 income of $4,774,994 divided by 5.25%, which confirms exit on forward income,
matching engine convention 9. Second, the template labels profit divided by cost
(17.36%) as "yield on cost". The standard definition is stabilized net operating
income divided by total cost, which here is about 5.4% ($4,118,952 on $76.3M). The app
uses the standard definition for yield on cost and reports the other as profit on cost,
so the two are never confused.

**Report layout to copy.** The template reads in this order, and the app's output
report should follow it:

1. Summary and scenario, with a plain statement of purpose and a fictional or sample
   label
2. Programme with month numbers: land, construction, operations, exit
3. Summary table: revenue, site purchase, hard costs, soft costs, finance, total
   cost, then IRRs, return on equity, yield, and profit
4. Revenue breakdown by unit type: count, SF, rent per unit, rent per SF, annual
   rent, growth
5. Operating expenses per unit, per SF, and as a percent of income, untrended and
   trended
6. Exit: gross value from cap rate, disposition costs, net proceeds
7. Cost detail: site purchase lines, hard costs per SF, soft costs as a percent of
   hard cost and of revenue
8. Finance: facility, rolled-up interest, fees, equity
9. Sensitivity grids, nine by nine, on profit and yield: revenue against hard cost,
   rent against hard cost, cap rate against rent, cap rate against hard cost, each
   also showing residual land value

**What the app adds.** The template has a single senior loan, one equity class, and no
distribution waterfall. It shows no mezzanine, preferred equity, balloon takeout, DSCR,
debt yield, equity multiple, LP or GP returns, mixed-use phasing, site or zoning
analysis, modular comparison, or investor package. Those are the app's differences, and
the template's layout is the baseline they sit on top of.

**Use as the first golden test.** Configure the engine with senior debt only, the
inputs above, and no waterfall, and require it to land within the tolerances. Then
build a second hand-made reference deal that adds mezzanine, preferred equity, a
balloon, and a waterfall, since this template cannot validate those.

## Module: site and land view

The site view lets a user enter an address and immediately see the parcel, its
dimensions, its flood exposure, and its zoning, for one verified pilot jurisdiction.

- **Search:** address to coordinates through a public geocoder.
- **Map:** parcel boundary drawn on a base map, with the lot's area in square feet and
  acres, each edge length, and the street frontage.
- **Layers:** FEMA flood zone (national dataset), the jurisdiction's zoning district
  layer, and a per-jurisdiction constraint layer. In the DMV this means Chesapeake Bay
  Resource Protection Areas, floodplain, and steep slope. In the Southwest it means
  washes and floodways, steep slope, and drainage or riparian setbacks. Each
  jurisdiction lists its own layers.
- **Zoning panel:** the district name, permitted uses, and the dimensional standards
  from the rule table, each with its code citation.
- **Failure behavior:** if a layer will not load, show "not available" for that layer
  and keep going. Never show a blank result as if it were a clean result.

**Pilot jurisdiction.** Decided: Arlington County and Fairfax County, Virginia, as the
DMV example market. Verify each rule table by hand against the current code and against
two or three real parcels. Southwestern markets, where Premium Point builds, follow
later using the jurisdiction checklist.

Rule table format, one file per jurisdiction:

```json
{
  "jurisdiction": "Example City, ST",
  "verified": true,
  "verified_on": "YYYY-MM-DD",
  "districts": {
    "R-5": {
      "permitted_uses": ["multifamily"],
      "min_lot_sf": 6000,
      "setbacks_ft": { "front": 20, "side": 10, "rear": 15 },
      "max_height_ft": 48,
      "max_stories": 4,
      "max_far": 1.5,
      "max_lot_coverage": 0.5,
      "max_density_du_ac": 36,
      "parking": { "per_unit": 1.5, "stall_sf": 325 },
      "min_open_space_pct": 0.15,
      "citations": { "setbacks_ft": "Sec. X-Y", "max_far": "Sec. X-Z" }
    }
  }
}
```

The values above are placeholders showing the shape, not real zoning data.

**Adding jurisdictions.** After the pilot, add more using the same repeatable
checklist, one jurisdiction at a time. A jurisdiction appears in the app only when
every step is done.

1. Confirm public parcel and zoning endpoints, and record their URLs, field names, and
   the date checked in `rules/registry.json`.
2. Load the ordinance PDF into the app's source reader (see the ordinance source reader
   module). The reader copies each value from the district tables with its page number
   and quoted text.
3. Verify each value by hand against the published code. Record the verifier's initials
   and date.
4. Add at least three golden parcels with hand-calculated max-buildable results.
5. Mark the jurisdiction `verified: true`. Until then, results carry a visible
   "unreviewed rules" badge listing which values were not yet reviewed, and a value
   marked "not found" blocks any result that depends on it.

Flood and constraint layers for each jurisdiction are listed in the registry. A
jurisdiction without a verified constraint layer states which constraints were not
checked.

### DMV pilot: Arlington and Fairfax

The DMV example starts from what could be confirmed from public sources on October 30,
2026; everything marked unconfirmed must be checked against the current code before the
app shows a number for it.

| Item | Finding | Status |
| --- | --- | --- |
| Fairfax parcels and zoning (GIS) | Layer 0 Parcels (fields PIN, PARCEL_TYPE) and layer 1 Zoning (fields ZONECODE, ZONETYPE, PROFFER, JURISDICTION) on the county's OpenData service. The zoning layer also covers the Towns of Vienna and Herndon. | Confirmed readable; not yet queried by address |
| Fairfax Resource Protection Areas | Polygon layer 7 on the PLUS SiteMap service, with an effective date field. The county says the ordinance text controls if the map conflicts. | Confirmed readable |
| Fairfax residential multifamily districts | R-20: 20 units per acre, 30% open space. R-30: 30 units per acre, 40% open space, height 150 ft subject to Board increase, setbacks scaled by height. Read from the adopted zMOD ordinance, an annotated March 2021 version effective July 1, 2021. | Unconfirmed against current code; the ordinance has been amended since |
| Fairfax commercial and planned districts | Read from the supplied adopted ordinance. Multifamily is not allowed by right in any C district (C-1 to C-8); it needs rezoning to a residential or planned district. Standards are in the extracted tables below. | Extracted; needs hand verification |
| Fairfax floodplain | Not in the OpenData service; use FEMA's national layer, and look for a county floodplain layer. | Needed |
| Arlington ordinance text | Read from the supplied ordinance effective January 28, 2025. Standards are in the extracted tables below. | Extracted; needs hand verification |
| Arlington C-O Rosslyn | One adopted amendment (ZOA-2024-04) says the County Board may approve density up to 10.0 FAR with site plan approval (section 7.15.4.A.1), height follows the Rosslyn Sector Plan, and by-right FAR is not in that text. | Confirmed in the 2025 text (section 7.15.4) |
| Arlington GIS | The county's ArcGIS server (arlgis.arlingtonva.us) hosts Open_Data and Public_Maps services, and search results point to Resource Protection Area layers in a public map service. The exact parcel, zoning, and RPA layers were not identified. | Needed |

**What this means for design.** For large commercial and mixed-use sites, both counties
decide density mostly through a discretionary approval, not through the dimensional
table alone. Arlington uses site plan approval, and its C-O Rosslyn text shows a 10.0
FAR ceiling set by the County Board. Fairfax allows height increases by the Board in its
multifamily districts and relies on planned districts for larger projects; confirm the
current rules. This is why the max-buildable engine reports a by-right case and a
plan-based case.

**What Malik needs to provide.** Both ordinances are supplied: Arlington effective
January 28, 2025, and Fairfax's adopted zMOD text (annotated March 2021, effective July
1, 2021). Save both in the repo's `docs/sources/` folder. The app's source reader then
reads them directly. Do not hand-type zoning values from memory, and do not let a model
supply any.

**Check before relying on these.** Fairfax's text predates later amendments, so confirm
each value against the county's current ordinance. Arlington's text is the January 2025
consolidation; confirm no later amendment applies.

### DMV rule tables (extracted, unverified)

These values were read from the two supplied ordinances on October 30, 2026. Every
value is a draft for the rule table until a person checks it against the source page and
marks it verified. **This section is the ordinance-source-reader answer key.**

**Arlington County** (Zoning Ordinance effective January 28, 2025; page numbers are the
ordinance's own)

| District and section | By right | Special exception or site plan | Pages |
| --- | --- | --- | --- |
| RA14-26 (§6.2) | Multifamily: lot of 7,500 sq ft minimum, 1,800 sq ft of lot per unit (about 24 units per acre), 35 ft, 3½ stories | Large-scale housing on 5+ acres: up to 6 stories or 60 ft, set back 150 ft from site boundary | 6-6, 6-7 |
| RA8-18 (§6.3) | Multifamily: 7,500 sq ft lot, 1,200 sq ft of lot per unit (about 36 units per acre), 40 ft, 4 stories | Site plan: up to 8 stories or 75 ft; sites of 20+ acres up to 10 stories or 95 ft with coverage under 25% | 6-9, 6-10 |
| C-O-1.0 (§7.10) | All other uses: 35 ft; FAR 0.4, 0.5, or 0.6 by site area (under 10,000, 10,000 to 19,999, 20,000+ sq ft); lot 20,000 sq ft minimum | Apartments: 40 units per acre, 6 stories | 7-32, 7-33 |
| C-O-1.5 (§7.11) | Same as C-O-1.0 | Apartments: 72 units per acre, 10 stories on sites under 20 acres; office FAR 1.5 | 7-34 |
| C-O-2.5 (§7.12) | Same as C-O-1.0 | Apartments: 115 units per acre, 16 stories; office FAR 2.5 | 7-36 |
| C-O (§7.13) | Same as C-O-1.0 | Multifamily FAR 4.8, 180 ft; office FAR 3.8, 153 ft; lot 30,000 sq ft and 125 ft wide minimum; site plan may allow parking as low as 1 space per unit | 7-38 to 7-40 |
| C-O Rosslyn (§7.15) | Same as C-O-1.0 | Multifamily and hotel FAR 4.8, 180 ft; office FAR 3.8, 153 ft; more density and height by site plan under the Rosslyn Sector Plan, never above 10.0 FAR | 7-45, 7-46 |
| C-R (§7.20) | Residential FAR 4.0 (3.0 plus 1.0 for residential), 55 ft base height with tapering allowances up to 110 ft, lot 20,000 sq ft minimum | Not read | 7-67, 7-68 |
| C-2 (§7.17) | FAR 1.5 for other uses, 45 ft; a building with dwellings and commercial uses must meet RA8-18 lot area | Not read | 7-60 |
| C-3 (§7.19) | 75 ft; floor area limited to what the standards allow; extra height by site plan in Clarendon | Not read | 7-65 |

Bulk rules in §3.2: lot coverage for non-one-family uses in R, RA, and C-1-O districts
is capped at 56% unless the district says otherwise or a site plan modifies it, and
buildings must sit no closer to a street centerline than 50% of their height (50 ft in
C-O and RA4.8, 40 ft in most other C districts). Not yet extracted: parking requirements
(§14.3), RA7-16, RA6-15, RA4.8, R-C, RA-H-3.2, MU-VS, C-O-A, C-O Crystal City, the
Columbia Pike form-based code, and the site plan bonus provisions (§15.5).

**Fairfax County** (adopted zMOD ordinance, annotated March 2021; page numbers are the
ordinance's own)

| District | Multifamily | Standards | Pages |
| --- | --- | --- | --- |
| R-12, R-16, R-20, R-30 | Allowed by right | R-20: 20 units per acre, 30% open space. R-30: 30 units per acre, 40% open space, 150 ft height subject to Board increase, setbacks scaled by height. R-12 and R-16 standards not extracted. | 180 (use table), Article 2 |
| C-1 through C-8 | Not allowed | Lot 20,000 to 40,000 sq ft minimum. FAR and height: C-1 0.25 and 35 ft; C-2 0.50 and 40 ft; C-3 1.0 and 90 ft; C-4 1.65 and 120 ft; C-5 0.30 and 40 ft; C-6 0.40 and 40 ft; C-7 0.80 and 90 ft; C-8 0.50 and 40 ft. Landscaped open space 15% to 50% of gross area by district. | 81 to 85, Article 2103 |
| PDC (planned commercial) | Only as a secondary use in an approved development plan | FAR 2.5; the Board may approve up to 3.0 in McLean and up to 5.0 in other Commercial Revitalization Districts, Community Business Centers, or Transit Station Areas if the plan implements the Comprehensive Plan. Dwellings limited to 50% of principal-use floor area unless the Board modifies. Open space 15%. | 121 to 124 |
| PRM (planned residential mixed-use) | Principal use | FAR 3.0; up to 5.0 in Commercial Revitalization Districts, Community Business Center Areas, or Transit Station Areas if the plan implements the Comprehensive Plan (not in the McLean areas). At least 50% of floor area must be multifamily to allow secondary uses. Open space 20%. Two-acre minimum. | 125 to 128 |
| PDH (planned housing) | Allowed through plan | Density by subdistrict, from 1 to 40 units per acre (PDH-30: 30; PDH-40: 40); open space 20% to 45% of gross area | 112 to 114 |

Multifamily parking default is 1.6 spaces per unit (Article 6); confirm reductions for
transit areas. Floor area for affordable and workforce units is excluded from the FAR
caps in PDC and PRM.

**The conclusion for commercial lots.** A Fairfax commercial lot cannot be built as
multifamily by right in any C district. It needs a rezoning to a residential district or
a planned district (PDC for commercial-led, PRM for housing-led), and the achievable
density comes from the Comprehensive Plan, with FAR up to 5.0 in designated areas.
Arlington is similar in effect: by-right FAR in the C-O family is 0.4 to 0.6, while
special exception or site plan opens 4.8 FAR and up to 180 ft in C-O and Rosslyn, and up
to 10.0 FAR in Rosslyn. For these lots the plan-based case drives the answer, and the app
must make approval risk and time visible.

## Module: ordinance source reader

The app never generates a zoning rule. It reads the ordinance PDFs and copies values out
of them, each with its page number and the exact source text, and anything it cannot read
is shown as not found.

### Rules the reader follows

1. **No model-generated values.** An AI model may not produce, infer, round, or fill in
   any value in a rule table. The reader is a deterministic parser.
2. **Every value has a source.** Each stored value carries the ordinance name and
   effective date, the section number, the page, and the exact source line it came from.
3. **Quote check.** A value is accepted only if its number appears in its quoted source
   text on that page. Any value that fails the check is rejected.
4. **Not found stays not found.** If a value is missing or unreadable, it is stored as
   "not found". No default is used, and any result that depends on it shows "cannot
   calculate: value not found in source".
5. **Computed values are shown as computed.** A figure the ordinance does not state
   directly, such as units per acre from "1,800 sq ft of lot per unit", is calculated by a
   visible formula from the stated inputs, and the formula is displayed. The ordinance's
   own wording is always shown beside it.
6. **Prose is quoted, never interpreted.** Conditions such as "may be increased by the
   Board" are shown as the ordinance's sentence with its citation, as a note on the
   district. The reader does not turn them into numbers.

### Pipeline

1. Extract text page by page with layout preserved, and render each page as an image.
   Keep the page numbers of both the PDF and the ordinance's own page labels.
2. Build a district index from the ordinance's table of contents: district name, section
   number, and page range.
3. Parse each district's standards tables into fields: lot area, lot area per unit, lot
   width, height in feet and stories, floor area ratio, density, open space, setbacks,
   coverage, and parking where the district states it.
4. Run the quote check on every field. Mark each field parsed, or needs reading when the
   table is garbled, split across pages, or its columns cannot be matched reliably to
   headings.
5. Show a review screen: the field, the value, the quoted text, and the page image with
   the source area highlighted.
6. For a needs reading field, the person reads the page image and types the value; it is
   saved as person-entered with the page cited. A person may also correct a parsed value,
   which is recorded as a correction with who and when.
7. Save the rule table with the ordinance version. When a newer PDF is loaded, show which
   values changed.

**Known hard spots, found in the two ordinances.** Footnote markers attached to table
words (for example, "167F" next to "Apartment"), tables that continue across pages, a
Fairfax use table whose permitted-use cells line up with column headings by position, and
a Fairfax height cell that extracts as garbled text. The reader must mark these as needs
reading when it cannot match them with certainty, never pick a likely value.

**Answer key.** The draft tables extracted by hand in the DMV rule tables section are the
test answer key. The reader passes when every value in the key is either reproduced
exactly or marked needs reading, and no value is ever wrong without being flagged.

**Speed and demo.** Parsing runs in seconds and uses no model, so it can run live on a
district during a demo. Process both counties ahead of time and cache the results.

**Scope limits.** Large ordinances run to hundreds of pages. The reader indexes the whole
document but parses only the districts a user selects, so a new district takes seconds,
not minutes.

## Module: max-buildable engine

Given a parcel and a zoning district, the engine returns the largest unit count the rules
allow and names the single constraint that sets that limit.

### Method

1. Compute the buildable area: the lot polygon, inset by the setbacks, minus any area
   excluded by the constraint layers (floodway, wash, steep slope).
2. Apply each constraint independently and convert it to a unit count:
   - **Lot coverage:** footprint area times the allowed stories, capped by height.
   - **Height and stories:** maximum stories times the footprint.
   - **FAR:** lot area times FAR gives maximum gross floor area.
   - **Density:** acres times maximum dwelling units per acre.
   - **Parking:** the units that fit once stall area, at the ratio per unit, is taken out
     of the buildable area (surface parking) or the structured option the user selects.
   - **Open space:** buildable area reduced by the required open space percent.
3. Convert gross floor area to units using efficiency and average unit size.
4. Take the minimum across constraints. That minimum is the answer, and the constraint
   that produced it is the binding constraint.

`units_max = min(U_coverage, U_height, U_FAR, U_density, U_parking, U_open_space)`

**Output.** Units, gross and net square feet, footprint, parking count, and one sentence
naming the binding constraint, for example "Parking caps this lot at 212 units; relief
would add about 40." Also show the runner-up constraint, so the user sees how much
headroom exists. The result feeds the pro forma's unit count and land basis directly.

**Guardrails.** The engine reports what the written rules allow. It does not predict
approvals, variances, or entitlement timelines, and the UI says so.

**Bonus and incentive provisions.** Rule tables may include optional density or height
bonuses (for example for affordability or transit proximity), each with its trigger, its
effect, and its citation. The engine runs the base case and each bonus case and reports
both, so the user sees what a bonus is worth.

**By-right vs. plan-based.** The engine always reports two cases. By-right uses only the
written dimensional standards in the rule table. Plan-based uses only the maximums the
ordinance itself states for special exception, site plan, or planned-district approval
(for example, Arlington's 4.8 FAR and 180 ft in C-O, or its 10.0 FAR ceiling in C-O
Rosslyn), each with its citation. It does not predict what a board will approve. A user
may type a different density, which is labeled as user-entered and not from the ordinance.
The plan-based case is clearly marked as dependent on discretionary approval and adds an
entitlement time input that feeds the schedule and the sensitivity analysis.

## Module: mixed-use and phasing

A mixed-use deal is several components with different economics, delivered on different
dates, sharing one site and one capital stack.

- **Components.** Residential, retail, office, and structured parking. Each has its own
  gross and net area, efficiency, rent (per unit per month for residential, per square
  foot per year for commercial), vacancy, operating expense structure, and exit cap rate.
- **Commercial leasing terms.** Lease type (NNN, modified gross, gross), free rent months,
  tenant improvement allowance, leasing commissions, downtime between leases, and renewal
  probability.
- **Phasing.** Each phase has its own construction start, duration, delivery date, and
  lease-up. Shared costs such as site work, utilities, and podium structure are allocated
  to phases by gross floor area, or by a user-set percentage.
- **Single stack across phases.** One senior and mezzanine commitment draws against the
  combined spend curve. Phase delivery dates drive when interest reserve and lease-up
  begin.
- **Blending.** Report NOI, value, and yield on cost by component and in total, so a
  founder can see which part of the project carries the returns.

## Module: market research and assumption flags

This layer grounds the pro forma in evidence, and it stays honest about which numbers are
sourced.

- **Comp import.** Upload a CSV of rent, sale, and cost comps with these columns: type,
  name, address, submarket, date, units_or_sf, rent_psf_or_per_unit, sale_price, cap_rate,
  hard_cost_psf, source_url, verified. The repo ships a small sample file marked
  `verified: false`.
- **Submarket summary.** The AI layer drafts a plain-language summary of the submarket
  from the imported comps and, when web search is enabled, from cited public sources.
  Every claim shows its source; anything uncited is marked as an unverified draft.
- **Assumption flags.** For rent, rent growth, hard cost per square foot, exit cap rate,
  lease-up pace, and operating expense ratio, compare the input to the comp range. Return
  a flag when it falls outside the interquartile range, in plain words, with the range
  shown. A flag explains and never changes the value.
- **Labels.** Every comp-derived figure shows its source and a verified or sample badge.

## Module: scenarios and sensitivity

Founders want to know how a deal breaks, so every run can be stress-tested. The engine
must run in well under 50 ms so hundreds of runs stay interactive.

- **Tornado chart.** Flex each key driver by plus and minus 10% (rent, hard cost, exit
  cap, interest rate, vacancy) and by schedule delay of three and six months. Rank by
  effect on levered IRR.
- **Scenario set.** Base, downside, and upside cases with editable driver sets, shown
  side by side with LP IRR, multiple, minimum DSCR, and peak equity.
- **Two-way tables.** Exit cap rate against rent growth on IRR, and hard cost against
  construction duration on equity multiple.
- **Breakevens.** Solve for the occupancy, rent, and exit cap at which the deal returns
  zero profit and at which the senior loan stops being covered.
- **Rate and refinance risk.** For balloon loans, show the exit-cap and interest-rate
  combination at which the takeout falls short.

## Module: project tracker

The tracker holds the milestones that move a deal from site to stabilization, and its
dates feed the pro forma so schedule risk shows up in returns.

- **Milestone fields.** Name, phase, owner, start, due, status, blocker, and depends-on.
  Statuses are Not started, In progress, Blocked, and Done.
- **Standard sets.** Entitlement (pre-application, site plan, zoning approval, appeals),
  financing (term sheets, loan closing, rate lock), design and permitting, construction,
  and lease-up.
- **Views.** A table and a Gantt chart. Compute the critical path from dependencies and
  highlight it.
- **Link to the model.** The pro forma's month offsets (entitlement, construction start,
  completion, stabilization) read from the tracker. Moving a milestone changes returns,
  and the UI shows the IRR change that results.
- **Slip alerts.** A milestone that passes its due date unfinished, or a blocked item on
  the critical path, raises a flag on the deal summary.

## Module: investor package export

The package has four parts, all generated from the deal: a one-page teaser, a full
investor deck, a diligence checklist, and a data room index.

### Teaser contents

- Property name, address, and a map image showing parcel and lot dimensions
- Zoning summary: district, max units, binding constraint
- Program: unit count, gross and net square feet, construction type
- Sources and uses table and the capital stack as percentages
- Headline returns as an LP would see them: IRR, equity multiple, hold period, plus a
  downside case beside the base case
- Footer on every page: "Illustrative only. Sample assumptions. Not an offer to sell or a
  solicitation of an offer to buy any security."

### Diligence checklist

Checkbox list, generated from the deal: survey, title, flood determination, zoning
verification letter, geotechnical and environmental reports, utility availability,
entitlement status, construction budget review.

**Compliance note.** A real capital raise carries securities-law obligations, including
who may be solicited and what projections may be shown. The app organizes materials but
does not provide legal review. Any real offering needs a securities attorney. State this
in the README and in the footer.

### Full investor deck

Generated from the deal, in this order: cover; investment summary; location and site
(map, lot, dimensions, flood); zoning and entitlement status; program and unit mix;
market and comps; development budget (sources and uses); schedule, including modular vs.
conventional; capital structure; returns and the waterfall as an LP sees it;
sensitivities and downside cases; key risks; sponsor and team; disclosures. Build it as
an HTML template with a print stylesheet that exports to PDF, one slide per page, and
every number pulled from the engine result so none is typed by hand.

### Data room index

A structured list of the documents a diligent investor expects, grouped by folder
(Sponsor, Site, Entitlements, Financial model, Legal, Construction, Third-party reports).
Each item has a status (Requested, Received, Reviewed, N/A), a date, and a note. Export it
as CSV and as a printable checklist. The app indexes documents and does not host them.

## Weekend build order

Build the engine first and the screens last, because a wrong number undermines everything
else and a plain screen does not.

- **Friday evening: foundations.** Repo, TypeScript and test setup, `engine/types.ts`,
  the conventions README. Build the reference-deal spreadsheet by hand first, then the
  monthly pro forma and the senior loan with the reserve solver. Write the reference tests
  before the code that must pass them.
- **Friday night into Saturday morning: debt and waterfall.** Mezzanine, preferred equity,
  balloon takeout and refinance logic, then the configurable waterfall with catch-up and
  clawback. Reconcile sources and uses and every distribution. Add the modular override
  set.
- **Saturday morning: mixed-use, phasing, scenarios.** Components, commercial leasing
  terms, phase allocation, then the tornado, scenario set, two-way tables, and breakevens.
- **Saturday midday: first screens.** Inputs form, outputs dashboard, modular side-by-side,
  scenario charts. Plain styling is fine.
- **Saturday afternoon: site view.** Map, geocoder, parcel for the pilot jurisdiction, edge
  dimensions, FEMA layer, zoning and constraint layers. Hand-verify the pilot rule table
  against the code.
- **Saturday evening: max-buildable.** Constraint minimum, binding-constraint sentence,
  bonus cases, handoff into the pro forma. Test golden parcels by hand.
- **Sunday morning: market layer and tracker.** Comp import, assumption flags, submarket
  summary; then milestones, dependencies, Gantt, critical path, and the link to the pro
  forma schedule.
- **Sunday midday: investor package.** Teaser, full deck, diligence checklist, data room
  index, with the disclosure footer on every page.
- **Sunday afternoon: more jurisdictions, polish, ship.** Add further jurisdictions using
  the checklist, only as far as each can be fully verified. Then README with screenshots, a
  three-minute demo script, sample-data labels, a clean deploy, and a fresh-clone test.
  Draft the resume bullets and cover letter last, from what actually shipped.

**Work rhythm for Claude Code.** One module per session, tests passing before moving on, a
commit at each step, and no feature added that is not in this document without an explicit
decision.

## Acceptance tests

The MVP is done when every check below passes; the first group matters most because
financial credibility depends on it.

### Engine

- [ ] Sources equal uses in every scenario, to the cent.
- [ ] Each loan balance rolls forward correctly: opening plus draws plus capitalized
  interest minus repayments equals closing.
- [ ] Waterfall distributions across all tiers and classes sum exactly to distributable
  cash each period.
- [ ] Project and LP IRR match an independent spreadsheet built by hand on a reference
  deal, within 0.01 percentage points.
- [ ] The interest-reserve iteration converges, and a forced non-convergence raises a
  visible error.
- [ ] Edge cases pass: no mezzanine, zero promote, PIK versus current-pay mezzanine, a
  deal that never reaches the pref.
- [ ] Switching to modular changes only the documented drivers and nothing else.

### Site and zoning

- [ ] Parcel area and edge lengths agree with the county's recorded area to within a small
  tolerance, stated in the test.
- [ ] The rule table for the pilot jurisdiction is marked verified, with a citation on
  every rule.
- [ ] A unit test exists for each constraint becoming the binding one.
- [ ] Two or three real parcels checked by hand against the code, with results saved as
  golden tests.

### Product

- [ ] Every sample number carries a visible sample label.
- [ ] A missing map layer shows "not available" and never a blank pass.
- [ ] The teaser PDF renders on one page with the disclaimer footer.
- [ ] A fresh clone runs from the README in under five minutes.

### Additional modules

- [ ] Preferred equity: with it on, distributions and balances still reconcile; with it
  off, results equal the base case exactly.
- [ ] Waterfall: tests for three tiers, five tiers, catch-up under 100%, and a clawback
  case where early promote must be returned.
- [ ] Mixed-use: component NOI sums to total NOI; phase cost allocations sum to total
  shared cost; a one-phase deal equals the same deal without phasing.
- [ ] Balloon: a loan maturing before exit forces a takeout; a takeout shortfall raises a
  flag and an equity cure, never a silent plug.
- [ ] Scenarios: the base case in the tornado equals the main result exactly; one run
  completes in under 50 ms.
- [ ] Breakevens: plugging a breakeven value back into the engine returns zero profit
  within tolerance.
- [ ] Tracker: moving a milestone changes the pro forma schedule and the change in IRR
  shown matches a manual rerun.
- [ ] Assumption flags: a value outside the comp interquartile range always flags; a value
  inside never does.
- [ ] Bonus provisions: the bonus case never reports fewer units than the base case.
- [ ] Deck and data room: every number in the deck equals the engine result; the data room
  CSV round-trips.
- [ ] Each added jurisdiction has the verified flag, per-value citations, and three golden
  parcels before it is selectable.

### Case study reference deal

- [ ] With the Aprao inputs and senior debt only, the engine lands within the stated
  tolerances on sale value, total cost, finance cost, profit, both IRRs, and return on
  equity.
- [ ] Yield on cost is stabilized NOI divided by total cost; profit on cost is reported
  separately and labeled.
- [ ] The output report follows the nine-part layout in the case study section.
- [ ] Each sensitivity grid is nine by nine, centered on the base case, and the center cell
  equals the main result.

### One-page flow and DMV pilot

- [ ] Entering an address updates the parcel, max program, comparison, verdict, and winning
  pro forma without leaving the page.
- [ ] By-right and plan-based cases both display; the plan-based case shows its source and
  an approval-risk label.
- [ ] Hold and sell cases share identical land, program, and cost inputs; changing one
  input changes both.
- [ ] The verdict names the objective used, the margin, and the crossover value, and flips
  when the objective preset changes.
- [ ] The headline input panel stays at about 20 fields; every detail block opens
  pre-filled and changes nothing until edited.
- [ ] Arlington and Fairfax rule tables are marked verified only after a human checks each
  value against the current code, with source files saved in `docs/sources/`.
- [ ] Three golden parcels per county, hand-calculated, pass.

### Ordinance source reader

- [ ] No rule-table value exists without an ordinance name, effective date, section, page,
  and quoted source text.
- [ ] A value whose number is absent from its quoted text on that page is rejected.
- [ ] A missing or unreadable value shows "not found" and blocks any calculation that needs
  it; no default is ever substituted.
- [ ] Every figure the ordinance does not state directly shows its formula and inputs next
  to the ordinance's own wording.
- [ ] Condition sentences such as "may be increased by the Board" appear verbatim with
  their citation and are never turned into numbers.
- [ ] On the supplied Arlington and Fairfax PDFs, every value in the hand-extracted answer
  key is reproduced exactly or marked needs reading, with zero silent errors.
- [ ] Footnote markers, split tables, and column-position tables are flagged needs reading
  when not matched with certainty.
- [ ] A person-entered or corrected value records who, when, and the page it was read from.
- [ ] Loading a newer ordinance PDF lists exactly which values changed.

## Open questions

Seven items are open; the first two block the site view.

- [ ] **Premium Point's markets and deal types.** Which southwestern markets and what
  product mix do they actually work in? Check their website and listings, and use the
  answer to choose the first southwestern jurisdiction after the DMV example.
- [ ] **Pilot jurisdiction.** Decided: Arlington and Fairfax counties. Still needed: the
  current Arlington zoning ordinance text, and the current Fairfax commercial and
  planned-district articles.
- [ ] **Raise audience.** Institutional LPs, family offices, or individual accredited
  investors? This sets the tone and detail of the teaser.
- [ ] **Reference deal.** The Aprao case study covers the senior-debt-only path. A second
  hand-built deal with mezzanine, preferred equity, a balloon, and a waterfall is still
  needed before the waterfall is trusted.
- [ ] **Modular figures.** Sourced cost premium and schedule savings for prefab modular, to
  replace the labeled sample values.
- [ ] **Securities counsel.** Who reviews the process if this ever moves from a portfolio
  demo to a real raise?
- [ ] **Resume and cover letter.** Draft after the build, using only what shipped, with the
  demo link and the three-minute script.
