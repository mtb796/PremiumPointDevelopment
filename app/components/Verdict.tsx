import React, { useMemo, useState } from "react";
import type { Deal } from "../../engine/types.js";
import { compareHoldSell, objectiveLabels, type Objective } from "../../engine/verdict.js";
import { Card, Row } from "./ui.js";
import { usd, usdShort, pct, mult } from "../format.js";

export function Verdict({ deal }: { deal: Deal }) {
  const [objective, setObjective] = useState<Objective>("total-profit");

  const v = useMemo(() => {
    if (!deal.forSale) return null;
    try {
      return compareHoldSell(deal, objective);
    } catch {
      return null;
    }
  }, [deal, objective]);

  if (!v) return <Card title="Hold vs. sell">Add for-sale terms to compare.</Card>;

  const hold = v.hold;
  const sell = v.sell;

  return (
    <>
      <Card
        title="Verdict"
        right={
          <select value={objective} onChange={(e) => setObjective(e.target.value as Objective)}>
            {(Object.keys(objectiveLabels) as Objective[]).map((o) => (
              <option key={o} value={o}>
                {objectiveLabels[o]}
              </option>
            ))}
          </select>
        }
      >
        <div className={`verdict ${v.winner}`}>
          <strong>{v.winner === "sell" ? "Build to sell" : "Build to hold and rent"} wins</strong>
          <p>{v.reason}</p>
        </div>
      </Card>

      <Card title="Hold vs. sell" right={<span className="muted">same land, program, cost, stack</span>}>
        <table className="tbl">
          <thead>
            <tr>
              <th></th>
              <th>Hold &amp; rent</th>
              <th>Sell</th>
            </tr>
          </thead>
          <tbody>
            <tr className={v.winner === "hold" && objective === "total-profit" ? "win" : v.winner === "sell" && objective === "total-profit" ? "win-r" : ""}>
              <td>Development profit</td>
              <td>{usd(hold.returns.profit)}</td>
              <td>{usd(sell.returns.profit)}</td>
            </tr>
            <tr className={objective === "return-speed" ? (v.winner === "hold" ? "win" : "win-r") : ""}>
              <td>LP IRR</td>
              <td>{pct(hold.returns.lp?.annual ?? hold.returns.levered.annual)}</td>
              <td>{pct(sell.returns.lp?.annual ?? sell.returns.levered.annual)}</td>
            </tr>
            <tr>
              <td>Levered IRR</td>
              <td>{pct(hold.returns.levered.annual)}</td>
              <td>{pct(sell.returns.levered.annual)}</td>
            </tr>
            <tr>
              <td>Equity multiple</td>
              <td>{mult(hold.returns.equityMultiple)}</td>
              <td>{mult(sell.returns.equityMultiple)}</td>
            </tr>
            <tr>
              <td>Peak equity</td>
              <td>{usdShort(hold.returns.peakEquity)}</td>
              <td>{usdShort(sell.returns.peakEquity)}</td>
            </tr>
            <tr>
              <td>Finance carry</td>
              <td>{usdShort(hold.costSummary.financeCost)}</td>
              <td>{usdShort(sell.costSummary.financeCost)}</td>
            </tr>
            <tr>
              <td>Disposition</td>
              <td>Exit sale at cap rate after a {hold.monthly.length - deal.schedule.operationsStartMonth}-mo hold</td>
              <td>{deal.forSale!.mode === "bulk" ? "Bulk sale at delivery" : "For-sale units over absorption"}</td>
            </tr>
          </tbody>
        </table>
        {v.crossoverPriceFactor !== undefined && (
          <Row
            k="Crossover (for-sale price)"
            v={`${(v.crossoverPriceFactor * 100).toFixed(0)}% of current — below this, holding wins`}
          />
        )}
        <p className="defn">
          Both cases share identical land, program, cost, and capital-stack inputs — only the business plan differs.
        </p>
      </Card>
    </>
  );
}
