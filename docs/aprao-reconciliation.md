# Aprao reference deal — reconciliation notes

This records exactly where the engine lands against each Aprao template target, the
model choices behind the numbers, and the investigation into the residual gaps. The
handoff is explicit that Aprao's method is not published: *"treat the tolerance as a
target to investigate, not a guarantee."* Nothing here is tuned to fake a match; every
input is either taken from the template or calibrated to a figure the template itself
reports, and labelled as such.

The fixture is `data/golden-deals/aprao.ts`; the tests are
`tests/aprao.reference.test.ts`.

## Result vs. target (engine output)

| Output | Engine | Target | Tolerance | Status |
| --- | ---: | ---: | --- | --- |
| Gross sale value | $90,954,637 | $90,952,272 | ±0.5% | **within (0.003%)** |
| Total cost incl. finance | $76,442,802 | $76,334,909 | ±0.5% | **within (0.14%)** |
| Profit (development margin) | $13,147,515 | $13,253,078 | ±2% | **within (0.80%)** |
| Return on equity (profit/equity) | 48.20% | 48.44% | ±1.0 pt | **within (0.24 pt)** |
| Finance cost | $5,133,008 | $5,490,446 | ±2% | gap: 6.5% low |
| Unleveraged IRR | 7.97% | 8.78% | ±0.25 pt | gap: 0.81 pt low |
| Leveraged IRR | 8.65% | 11.66% | ±0.25 pt | gap: 3.01 pt low |

The deterministic cash totals and ROE — the figures that make or break financial
credibility — reconcile. The two IRRs and the exact finance-cost split do not, for the
reasons set out below.

## The two sanity checks (both hold)

1. **Exit on forward income (convention 9).** Exit value = forward-12-month (year-6)
   NOI ÷ exit cap rate. The engine's `exit.forward12Noi / 0.0525` equals its
   `exit.grossValue` to the cent, and that value ($90.95M) matches the template.
2. **Yield on cost vs. profit on cost.** The template labels profit/cost (~17.4%) as
   "yield on cost". The engine uses the standard definition — stabilized NOI / total
   cost (~5.4%) — for `yieldOnCost`, and reports profit/cost separately as
   `profitOnCost`. They are never equal and never confused.

## Model choices

- **Profit is the development margin,** not a cash-flow total: net sale proceeds
  ($90.95M × (1 − 1.5%) = $89.59M) − total cost incl. finance ($76.44M) = $13.15M.
  Operating NOI collected during the hold is **not** in profit (it is in the IRRs).
  This is how the template's own profit ($13,253,078 = $89.59M − $76.33M) is built, and
  it matches to 0.8%.
- **Calibrated opex.** Aprao does not publish its per-unit payroll / insurance / tax /
  utility / reserve lines. The fixture's `fixedOpexPerYear` ($1,755,856) is calibrated
  so the engine's stabilized NOI reproduces the template's reported stabilized NOI
  (~$4,118,952), which, escalated at 3%, gives the template's year-6 exit income
  ($4,774,994) and gross value ($90,952,272). Calibrating to the **exit value** target
  automatically reproduces the stabilized-NOI and yield-on-cost figures, because they
  are linked by the 3% escalation — a good internal-consistency check.
- **Pro-rata funding.** The Aprao fixture sets `proRataFunding: true` (the handoff's
  convention-4 toggle). Equity and the senior loan fund each cost 38/62 and the
  interest reserve is 100% loan-funded. This reproduces (a) the equity base — equity ≈
  38% of cash cost ≈ $27.3M, giving ROE 48.2% vs. the 48.44% target — and (b) rolled-up
  interest closer to the template than equity-first funding, which back-loads the loan
  and understates both. Equity-first (the global default) gives ROE 52.0% and finance
  cost $3.7M here, so it is the wrong model for this template.

## Investigation into the residual gaps

All three remaining gaps were investigated by sweeping the genuine modelling degrees of
freedom. None of the knobs closes them without breaking a target that currently passes,
which is the signature of a method difference rather than a bug. The arithmetic of each
IRR was independently reproduced outside the engine, so the engine is computing the
right IRR *for these cash flows*.

- **Spend curve (linear ↔ S-curve steepness 1.5–3):** moves unlevered IRR by <0.03 pt
  and finance cost by <0.4% — the construction window (27 months) is short next to the
  ~5-year hold, so curve shape barely matters. Not the lever.
- **Interest treatment (current-pay vs. PIK through the hold):** levered IRR moves from
  8.65% to 8.87% — +0.22 pt, not the +3 pt needed. "Rolled-up interest" (PIK) is not
  the explanation for 11.66%.
- **Funding order (pro-rata vs. debt-first):** debt-first lifts levered IRR to 9.12%
  but overshoots finance cost ($6.62M) and total cost ($77.9M), breaking two passing
  targets, and still falls 2.5 pt short on levered IRR.
- **Finance cost vs. total cost are in tension with the stated cost lines.** The
  targets imply a non-finance cost of $76.33M − $5.49M = $70.84M, but the literal cost
  buildup from the template's lines (land $9.91M + hard $54.42M + soft 12.83% of hard
  $6.98M) is $71.31M. The $0.47M difference means you cannot hit *both* finance cost
  ($5.49M) *and* total cost ($76.33M) with the stated lines — hitting finance exactly
  would push total cost to ~$76.80M (0.6% over, outside ±0.5%). The engine keeps the
  literal cost buildup (total cost passes at 0.14%) and lands finance cost at $5.13M.

### Most likely cause of the IRR gaps

A 2.88-point spread between the template's unlevered (8.78%) and levered (11.66%) IRRs
is large for a 62% loan-to-cost at 7% when the project's own unlevered return is only
~8–9%: during construction the loan accrues interest while the asset earns nothing
(negative leverage), which mutes the boost. Reproducing an 11.66% levered IRR from an
8.78% unlevered IRR requires either a materially smaller/shorter equity exposure or
annual-period cash flows (a common appraisal convention) rather than the monthly model
conventions 1–3 mandate. The engine follows the stated conventions; the template likely
differs in period construction and/or draw-and-distribution timing it does not publish.

## Conclusion

The engine is correct against the conventions, reconciles to the cent (sources = uses,
loan balance roll-forward, full repayment at exit), and matches the Aprao template on
every deterministic cash total and on ROE. The IRR and finance-cost gaps are recorded
here as open items to close against the template's own method when it is available — and
against the second, hand-built reference deal (mezzanine + preferred equity + balloon +
waterfall) called for in the handoff, whose cash flows are known exactly because we
build them. The acceptance-test file asserts the reconciled targets and identities
strictly, and reports the IRR/finance comparison as a labelled diagnostic so the gap
stays visible rather than hidden.
