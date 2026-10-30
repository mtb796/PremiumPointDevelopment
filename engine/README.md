# Engine conventions (read before coding)

These rules remove the ambiguity that makes two correct-looking models disagree.
Every engine module follows them and every test references them by number. They are
transcribed from the handoff and are the contract the engine upholds. The engine is
**pure and deterministic**: no UI, no network, no clock, no randomness — same inputs
always give the same outputs (`engine/` imports nothing from `app/` or `api/`).

1. **Time.** Month 0 is land closing. All flows occur at month end. The horizon runs
   through the exit month. Month indices in `Schedule` are 0-based.
2. **Rates.** Monthly interest is `openingBalance * annualRate / 12`. Growth rates
   compound monthly at `(1 + g)^(1/12) - 1`. See `engine/rates.ts`.
3. **IRR.** Solve the monthly IRR with bisection (tolerance `1e-10`), then annualize
   as `(1 + m)^12 - 1`. This equals Excel's `=(1+IRR(range))^12-1`. Do **not** compare
   against XIRR (actual dates; differs slightly). See `engine/irr.ts`.
4. **Funding order.** Equity funds first until its commitment is spent, then preferred
   equity, then mezzanine, then senior debt. A `proRataFunding` toggle is provided.
   Debt is sized at closing as a commitment; draws follow cost spend.
5. **Sizing.** Senior = the lower of the loan-to-cost and debt-yield limits. Mezzanine
   fills to the combined loan-to-cost target. Preferred equity fills to its own cap.
   Common equity is the remainder.
6. **Interest and fees.** Senior interest during construction and lease-up is
   capitalized through the interest reserve. Mezzanine and preferred are current-pay or
   accrued by setting. Origination fees are uses at closing; exit fees are paid at
   repayment.
7. **Circularity.** Financing cost depends on loan size, which depends on total cost,
   which includes financing cost. Iterate until the change is under $1, with a limit of
   50 passes. If it does not converge, throw a visible error (a `Flag` of level
   `error` plus a thrown `NonConvergenceError`). See `engine/solve.ts`.
8. **Operations.** Occupied units ramp linearly from delivery at the lease-up pace
   until stabilized occupancy. Revenue is occupied units times rent times growth.
   Operating expenses have a fixed floor (taxes, insurance, staffing) plus a variable
   share of revenue.
9. **Exit.** Gross value = forward 12-month stabilized NOI divided by the exit cap
   rate. Net proceeds = value times `(1 - sellingCostPct)` minus all debt payoffs.
10. **Balloon.** If a loan matures before the exit month, a takeout is required. Size
    the takeout loan by the lowest of loan-to-value, DSCR, and debt-yield limits. Any
    shortfall becomes a forced equity contribution and raises a visible flag.
11. **Rounding.** Keep full precision internally. Round only for display.
    Reconciliation tolerance is `$0.01` in total.
12. **Units.** Never convert units implicitly. Dollars, square feet, whole months,
    decimals. See the unit discipline comment in `engine/types.ts`.

## Development "profit" vs. IRR (important distinction)

The engine reports two different things, and they must never be confused (this is also
how the Aprao reference template works — see `docs/aprao-reconciliation.md`):

- **Profit** (`returns.profit`) is the **development margin**: net sale proceeds minus
  total cost including finance. It is the value created by building and selling. It
  does **not** include operating cash flow collected during the hold.
- **IRR** (`returns.project`, `returns.levered`) is a time-weighted return on the actual
  cash flows, which **does** include operating NOI received during the hold plus the net
  sale and any debt service.

## Yield on cost vs. profit on cost (one definition each — convention)

- **Yield on cost** (`returns.yieldOnCost`) = stabilized (first-year) NOI / total cost.
- **Profit on cost** (`returns.profitOnCost`) = development profit / total cost.

The Aprao template labels profit/cost as "yield on cost"; the app uses the standard NOI
definition for yield on cost and reports the other separately as profit on cost, so the
two are never confused. There is exactly one definition of each in the engine
(convention: one engine per concern).

## Waterfall algorithm

Treat all contributed capital as the investor class, split pro rata between LP and GP
co-invest; the GP's promote is paid on top. For each hurdle `h` with annual rate `r_h`,
track a balance that compounds monthly, grows with contributions, and shrinks with
distributions to the investor class:

```
B_h(t) = B_h(t-1) * (1 + r_h)^(1/12) + C(t) - D_h(t)
```

Each month, distributable cash is paid tier by tier. In tier `k` with investor share
`s_k`, pay the smaller of the remaining cash and `B_k / s_k`. The investor share goes
pro rata to LP and GP co-invest; the rest is promote to the GP. A catch-up of `c%` pays
the GP until cumulative promote equals its promote share of cumulative profit; at
`c = 100%` the catch-up amount is `p / (1 - p)` times the investor profit paid so far,
where `p` is the promote share. Every month's payments must sum to distributable cash
exactly.

> The waterfall module is built in the next step of the build order (Friday night /
> Saturday morning). This section is the spec it is tested against.
