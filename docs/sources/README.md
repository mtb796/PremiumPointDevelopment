# Ordinance sources

The ordinance source reader reads zoning PDFs **from this folder** and copies each
value out with its page number and exact quoted text. No zoning value is ever
hand-typed or model-generated (see the ordinance source reader rules in
[`../handoff.md`](../handoff.md)).

## Expected files (not yet in repo)

Malik supplies these; they are not committed yet:

- `arlington-zoning-2025-01-28.pdf` — Arlington County Zoning Ordinance, effective
  January 28, 2025 (the January 2025 consolidation). Confirm no later amendment
  applies.
- `fairfax-zmod-2021.pdf` — Fairfax County adopted zMOD ordinance, annotated March
  2021, effective July 1, 2021. Predates later amendments; confirm each value
  against the county's current ordinance before marking verified.

Until a PDF is present and a person has verified each value against the published
code, the jurisdiction's rule table stays `verified: false`, results carry an
"unreviewed rules" badge, and any value marked "not found" blocks the calculations
that depend on it.

The hand-extracted draft tables in the handoff's "DMV rule tables (extracted,
unverified)" section are the **answer key** the reader is tested against: every
value must be reproduced exactly or marked "needs reading", with zero silent errors.
