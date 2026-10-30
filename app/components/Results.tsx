import React from "react";
import type { Result } from "../../engine/types.js";
import { Card, Row, Flags } from "./ui.js";
import { usd, usdShort, pct, mult, num } from "../format.js";

/** The appraisal report: summary, sources & uses, capital stack, returns, exit. */
export function Results({ result }: { result: Result }) {
  const r = result;
  const ret = r.returns;

  return (
    <>
      <Card title="Summary">
        <Row k="Gross sale value (exit)" v={usd(r.exit.grossValue)} />
        <Row k="Net sale proceeds" v={usd(r.exit.netProceeds)} indent />
        <Row k="Total cost incl. finance" v={usd(r.costSummary.totalCostInclFinance)} />
        <Row k="— Land" v={usd(r.costSummary.land)} indent />
        <Row k="— Hard cost" v={usd(r.costSummary.hard)} indent />
        <Row k="— Soft cost" v={usd(r.costSummary.soft)} indent />
        <Row k="— Finance cost" v={usd(r.costSummary.financeCost)} indent />
        <Row k="Development profit" v={usd(ret.profit)} strong />
        <hr />
        <Row k="Unlevered (project) IRR" v={pct(ret.project.annual)} />
        <Row k="Levered (equity) IRR" v={pct(ret.levered.annual)} strong />
        {ret.lp && <Row k="LP IRR" v={pct(ret.lp.annual)} indent />}
        {ret.gp && <Row k="GP IRR" v={pct(ret.gp.annual)} indent />}
        <Row k="Equity multiple" v={mult(ret.equityMultiple)} />
        <Row k="Return on equity (profit / equity)" v={pct(ret.returnOnEquity)} />
        <Row k="Yield on cost (stabilized NOI / cost)" v={pct(ret.yieldOnCost)} />
        <Row k="Profit on cost" v={pct(ret.profitOnCost)} indent />
        {ret.stabilizedDscr !== undefined && <Row k="Stabilized DSCR" v={`${ret.stabilizedDscr.toFixed(2)}x`} />}
        {ret.debtYield !== undefined && <Row k="Debt yield" v={pct(ret.debtYield)} />}
        {ret.promote !== undefined && <Row k="GP promote" v={usd(ret.promote)} />}
        <Flags flags={r.flags} />
        <p className="defn">
          Yield on cost is stabilized NOI ÷ total cost; profit on cost is development profit ÷ total cost — reported
          separately so the two are never confused.
        </p>
      </Card>

      <Card title="Sources & uses" right={<span className="muted">balances to the cent</span>}>
        <div className="su">
          <div>
            <h3>Uses</h3>
            {r.sourcesUses.uses.map((u) => (
              <Row key={u.label} k={u.label} v={usd(u.amount)} />
            ))}
            <Row k="Total uses" v={usd(r.sourcesUses.totalUses)} strong />
          </div>
          <div>
            <h3>Sources</h3>
            {r.sourcesUses.sources.map((s) => (
              <Row key={s.label} k={s.label} v={usd(s.amount)} />
            ))}
            <Row k="Total sources" v={usd(r.sourcesUses.totalSources)} strong />
          </div>
        </div>
      </Card>

      <Card title="Capital stack">
        <table className="tbl">
          <thead>
            <tr>
              <th>Tranche</th>
              <th>Commitment</th>
              <th>Rate</th>
              <th>Cap. interest</th>
              <th>Exit balance</th>
            </tr>
          </thead>
          <tbody>
            {r.tranches.map((t) => (
              <tr key={t.label}>
                <td>{t.label}</td>
                <td>{usdShort(t.commitment)}</td>
                <td>{pct(t.rate)}</td>
                <td>{usdShort(t.capitalizedInterestTotal)}</td>
                <td>{usdShort(t.exitBalance)}</td>
              </tr>
            ))}
            <tr className="total">
              <td>Common equity</td>
              <td>{usdShort(ret.peakEquity)}</td>
              <td>—</td>
              <td>—</td>
              <td>—</td>
            </tr>
          </tbody>
        </table>
      </Card>

      {r.components.length > 1 && (
        <Card title="By component (mixed-use)">
          <table className="tbl">
            <thead>
              <tr>
                <th>Component</th>
                <th>Net SF</th>
                <th>Stabilized NOI</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {r.components.map((c) => (
                <tr key={c.label}>
                  <td>{c.label}</td>
                  <td>{num(c.netSf)}</td>
                  <td>{usdShort(c.stabilizedNoi)}</td>
                  <td>{usdShort(c.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
