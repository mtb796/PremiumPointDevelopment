import React, { useMemo } from "react";
import type { Deal } from "../../engine/types.js";
import { modularComparison } from "../../engine/modular.js";
import {
  tornado,
  twoWayTable,
  residualLandValue,
  standardScenarios,
  metrics,
  type Driver,
} from "../../engine/scenarios/scenarios.js";
import { Card, Row } from "./ui.js";
import { usd, usdShort, pct, mult } from "../format.js";

const driverLabels: Record<Driver, string> = {
  rent: "Rent",
  hardCost: "Hard cost",
  exitCap: "Exit cap rate",
  interestRate: "Interest rate",
  vacancy: "Vacancy",
  scheduleDelay: "Schedule delay",
};

export function Analysis({ deal }: { deal: Deal }) {
  const modular = useMemo(() => (deal.modular ? modularComparison(deal) : null), [deal]);
  const torn = useMemo(() => tornado(deal, metrics.leveredIrr), [deal]);
  const grid = useMemo(
    () => twoWayTable(deal, "exitCap", [0.9, 0.95, 1.0, 1.05, 1.1], "rent", [0.9, 0.95, 1.0, 1.05, 1.1], metrics.leveredIrr),
    [deal],
  );
  const rlv = useMemo(() => residualLandValue(deal, { target: 0 }), [deal]);
  const scenarios = useMemo(() => standardScenarios(deal), [deal]);

  const maxRange = Math.max(...torn.bars.map((b) => b.range), 1e-9);

  return (
    <>
      {modular && (
        <Card title="Modular vs. conventional" right={<span className="muted">sample premium & savings</span>}>
          <table className="tbl">
            <thead>
              <tr>
                <th></th>
                <th>Conventional</th>
                <th>Modular</th>
                <th>Δ</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Total cost</td>
                <td>{usdShort(modular.conventional.costSummary.totalCostInclFinance)}</td>
                <td>{usdShort(modular.modular.costSummary.totalCostInclFinance)}</td>
                <td>{usdShort(modular.deltas.totalCost)}</td>
              </tr>
              <tr>
                <td>Finance carry</td>
                <td>{usdShort(modular.conventional.costSummary.financeCost)}</td>
                <td>{usdShort(modular.modular.costSummary.financeCost)}</td>
                <td>{usdShort(modular.deltas.financeCost)}</td>
              </tr>
              <tr>
                <td>Levered IRR</td>
                <td>{pct(modular.conventional.returns.levered.annual)}</td>
                <td>{pct(modular.modular.returns.levered.annual)}</td>
                <td>{pct(modular.deltas.leveredIrr)}</td>
              </tr>
              <tr>
                <td>Equity multiple</td>
                <td>{mult(modular.conventional.returns.equityMultiple)}</td>
                <td>{mult(modular.modular.returns.equityMultiple)}</td>
                <td>{modular.deltas.equityMultiple.toFixed(2)}x</td>
              </tr>
            </tbody>
          </table>
          <p className="defn">{modular.dominantEffect}</p>
        </Card>
      )}

      <Card title="Sensitivity — tornado (levered IRR)" right={<span className="muted">±10%, delays 3 & 6 mo</span>}>
        <div className="tornado">
          {torn.bars.map((b) => (
            <div className="tbar" key={b.driver + b.low}>
              <span className="tbar-label">{driverLabels[b.driver]}</span>
              <span className="tbar-track">
                <span className="tbar-fill" style={{ width: `${(b.range / maxRange) * 100}%` }} />
              </span>
              <span className="tbar-val">
                {pct(b.low, 1)} … {pct(b.high, 1)}
              </span>
            </div>
          ))}
        </div>
        <Row k="Base (levered IRR)" v={pct(torn.base)} strong />
      </Card>

      <Card title="Two-way: exit cap × rent (levered IRR)">
        <table className="tbl grid-tbl">
          <thead>
            <tr>
              <th>cap ↓ / rent →</th>
              {grid.valuesX.map((vx) => (
                <th key={vx}>{Math.round((vx - 1) * 100)}%</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.grid.map((row, yi) => (
              <tr key={grid.valuesY[yi]}>
                <th>{Math.round((grid.valuesY[yi]! - 1) * 100)}%</th>
                {row.map((cell, xi) => (
                  <td key={xi} className={yi === 2 && xi === 2 ? "center" : ""}>
                    {pct(cell, 1)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="defn">Center cell = base case. Columns flex rent; rows flex the exit cap rate.</p>
      </Card>

      <Card title="Residual land value">
        <Row k="Land price for break-even (profit = 0)" v={rlv.solved ? usd(rlv.landPrice) : "—"} strong />
        <Row k="Current land price" v={usd(deal.site.landPrice)} />
        <p className="defn">
          The most you could pay for the land and still break even on development profit — an ARGUS-style residual.
        </p>
      </Card>

      <Card title="Scenarios">
        <table className="tbl">
          <thead>
            <tr>
              <th>Case</th>
              <th>LP IRR</th>
              <th>Multiple</th>
              <th>Min DSCR</th>
              <th>Peak equity</th>
              <th>Profit</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map((s) => (
              <tr key={s.label}>
                <td>{s.label}</td>
                <td>{pct(s.lpIrr)}</td>
                <td>{mult(s.equityMultiple)}</td>
                <td>{Number.isFinite(s.minDscr) ? `${s.minDscr.toFixed(2)}x` : "—"}</td>
                <td>{usdShort(s.peakEquity)}</td>
                <td>{usdShort(s.profit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
