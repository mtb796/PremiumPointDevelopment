# Premium Point Development App

Address → maximum-yield building program → full capital stack and returns →
investor-ready one-pager, in one live page.

> **Not affiliated with Premium Point Development.** This is a portfolio piece.
> It uses no Premium Point logos or branding, and **every sample number carries a
> visible "sample" label.** Nothing here is market evidence.
>
> **Not legal or investment advice.** A real capital raise carries securities-law
> obligations (who may be solicited, what projections may be shown). This app
> organizes materials; it does not provide legal review. Any real offering needs a
> securities attorney. See the disclosure footer used throughout the investor
> package: *"Illustrative only. Sample assumptions. Not an offer to sell or a
> solicitation of an offer to buy any security."*

See [`docs/handoff.md`](docs/handoff.md) for the full specification. This README
is updated as the build progresses.

## Status

This repository is being built in the order of the weekend build order in the
handoff. Current state:

- **Foundations (Friday evening):** repo + TypeScript + Vitest, `engine/types.ts`,
  the engine conventions README, the Aprao reference-deal fixture, reference tests
  written first, and the monthly pro forma + senior loan with reserve solver.
- **Debt & waterfall (Friday night → Saturday morning):** multi-tranche capital
  stack (senior, mezzanine, preferred equity) with sizing, funding order, balloon
  takeout; the configurable distribution waterfall (tiers, GP catch-up, clawback);
  the modular override comparison; and a hand-built structured reference deal whose
  project IRR is checked against an independent reconstruction.

Engine tests: pro forma, senior debt, waterfall, multi-tranche stack, edge cases
(preferred on/off, PIK vs current-pay mezz, no mezz, zero promote), the balloon
takeout, and the circularity solver (convergence + forced non-convergence).

See [`docs/aprao-reconciliation.md`](docs/aprao-reconciliation.md) for exactly where
the engine lands against each Aprao target and the reasoning behind the model
choices.

## Architecture

The calculation engine is **pure, deterministic, and tested**. It lives in
[`engine/`](engine/) with no UI or network imports. The same inputs always give the
same outputs. See [`engine/README.md`](engine/README.md) for the engine conventions
that every module and test references.

The AI layer (later, under `api/`) only **proposes and explains** inputs; it never
computes a number that appears in the output, and it **never supplies, infers, or
fills in a zoning value.** Zoning standards are data (`rules/*.json`), each value
copied from an ordinance PDF with its page and quoted text by the ordinance source
reader; a value that cannot be read is stored as "not found" and never estimated.

```
engine/     pure TypeScript calculation engine (no UI, no network)
  proforma/ monthly cash flows, operations, mixed-use, phasing
  debt/     senior, mezzanine, preferred equity, reserve solver, takeout
  waterfall/tiers, catch-up, clawback
  buildable/geometry and constraint minimum
  scenarios/sensitivity, grids, breakevens
rules/      one JSON file per jurisdiction, plus registry.json
data/       sample comps (CSV), golden deals, golden parcels
app/        React UI (built after the engine)
api/        serverless: /model (AI), /geocode, /gis proxies
export/     teaser, deck and checklist templates, print CSS
tests/      engine, rules, golden cases
docs/       handoff spec, reference-deal notes, ordinance sources
```

## Developing

Requires Node 20+.

```bash
npm install
```

```bash
npm test
```

```bash
npm run typecheck
```

The engine has no runtime dependencies; `npm install` only pulls the dev toolchain
(TypeScript, Vitest).

## Environment variables

All secrets are server-side only (consumed by functions under `api/`), never
exposed to the browser. Copy [`.env.example`](.env.example) to `.env` and fill in.
