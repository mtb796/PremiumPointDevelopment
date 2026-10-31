# Three-minute demo script

A tight walkthrough of the app, from address to investor one-pager. Open the app
(`npm run dev`, or the deployed URL) and follow along. Everything is **sample data**.

> One sentence to open with: *"This takes a site from an address to a maximum-yield
> building program, a full capital stack with returns, and an investor-ready one-pager —
> and the whole financial engine is original, built to a set of fixed conventions and
> validated against a reference deal."*

## 0:00 — Site & max-buildable (the "Site" tab)

- Type an address and hit **Locate** (geocode + FEMA flood via a server proxy; shows
  "not available" gracefully if the proxies aren't deployed).
- Point at the **parcel** (area/width/depth) and a **zoning district**.
- Read the headline: **by-right vs. plan-based** units, with the **binding constraint**
  named ("Density caps this lot at 72 units; the next constraint, parking, allows ~93").
- The honest part: pick a real (unverified) district and it **refuses to compute** —
  "cannot calculate: needs reading." The app never invents a zoning number.

## 0:40 — The pro forma (the "Pro forma" tab)

- Edit any input on the left (try bumping **hard cost / gross SF** or **senior rate**) —
  the whole report **recalculates live**.
- Walk the summary: sale value → cost breakdown → **development profit** → unlevered /
  levered / **LP / GP IRR** → equity multiple, ROE, **yield-on-cost vs. profit-on-cost**
  (two different numbers, never confused), DSCR, debt yield, promote.
- Point out **sources = uses, to the cent**, and the capital stack (senior / mezz / pref).

## 1:30 — Hold vs. sell (the "Hold vs sell" tab)

- The same deal, two business plans. The **verdict** names the winner, the margin, and
  the **crossover** ("selling wins while the for-sale price stays above 86% of current").
- Flip the objective (return speed / total profit / risk-adjusted) and watch the verdict
  change. Toggle the header **Hold & rent / Build to sell** to re-price the whole model.

## 2:10 — Sensitivity (the "Sensitivity" tab)

- **Tornado** ranks the drivers by effect on levered IRR; **two-way grid** (exit cap ×
  rent) with the base in the center cell; **residual land value** (the most you could pay
  for the land and break even — an ARGUS staple); base / downside / upside scenarios.

## 2:35 — Schedule risk & the investor package

- **Tracker**: the milestone Gantt with the **critical path**; drag the completion-slip
  slider and watch the **IRR impact** update (a 6-month slip ≈ −1 point).
- **Investor package**: the one-page teaser + full deck + diligence checklist + data room,
  every number pulled from the engine, disclosure footer on every page. **Print → PDF**.

## Close

> *"Most candidates can model a pro forma. The point of this is the connections — zoning
> and site constraints to units, units to a mezzanine-and-waterfall structure, and that
> structure to an investor package — in one live flow, on a tested engine. 119 tests,
> reconciled to the cent, and it never fabricates a zoning value."*
