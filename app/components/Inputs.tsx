import React from "react";
import type { Deal, TrancheKind } from "../../engine/types.js";
import { withUpdate } from "../state.js";
import { Card, NumberField } from "./ui.js";

function trancheIndex(deal: Deal, kind: TrancheKind): number {
  return deal.stack.tranches.findIndex((t) => t.kind === kind);
}

export function Inputs({ deal, setDeal }: { deal: Deal; setDeal: (d: Deal) => void }) {
  const set = (path: string, v: unknown) => setDeal(withUpdate(deal, path, v));
  const comp = deal.program.components[0]!;
  const ops = deal.operations[0]!;
  const si = trancheIndex(deal, "senior");
  const mi = trancheIndex(deal, "mezz");
  const pi = trancheIndex(deal, "pref");

  const setUnit = (ui: number, field: "count" | "rentPerMonth", v: number) => {
    const next = structuredClone(deal);
    const u = next.program.components[0]!.unitMix![ui]!;
    u[field] = v;
    setDeal(next);
  };

  return (
    <>
      <Card title="Site & program">
        <div className="grid">
          <NumberField label="Land price" value={deal.site.landPrice} onChange={(v) => set("site.landPrice", v)} suffix="$" sample />
          <NumberField label="Land closing costs" value={deal.site.landClosingCosts} onChange={(v) => set("site.landClosingCosts", v)} suffix="$" sample />
          <NumberField label="Net rentable" value={comp.netSf} onChange={(v) => set("program.components.0.netSf", v)} suffix="SF" sample />
          <NumberField label="Gross area" value={comp.grossSf} onChange={(v) => set("program.components.0.grossSf", v)} suffix="SF" sample />
          <NumberField label="Ancillary income" value={comp.ancillaryIncomePerYear ?? 0} onChange={(v) => set("program.components.0.ancillaryIncomePerYear", v)} suffix="$/yr" sample />
        </div>
        <table className="mix">
          <thead>
            <tr>
              <th>Unit type</th>
              <th>Count</th>
              <th>Rent / mo</th>
            </tr>
          </thead>
          <tbody>
            {comp.unitMix!.map((u, i) => (
              <tr key={u.label}>
                <td>{u.label}</td>
                <td>
                  <input className="mini" value={u.count} onChange={(e) => setUnit(i, "count", Number(e.target.value) || 0)} />
                </td>
                <td>
                  <input className="mini" value={u.rentPerMonth} onChange={(e) => setUnit(i, "rentPerMonth", Number(e.target.value.replace(/[^0-9.]/g, "")) || 0)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Costs">
        <div className="grid">
          <NumberField label="Hard cost / gross SF" value={deal.budget.hard.verticalPerGrossSf} onChange={(v) => set("budget.hard.verticalPerGrossSf", v)} suffix="$" sample />
          <NumberField label="Contingency" value={deal.budget.hard.contingencyPct} onChange={(v) => set("budget.hard.contingencyPct", v)} scale={100} suffix="%" digits={1} sample />
          <NumberField label="Soft cost (% of hard)" value={deal.budget.soft.pctOfHard} onChange={(v) => set("budget.soft.pctOfHard", v)} scale={100} suffix="%" digits={2} sample />
          <NumberField label="Fixed opex" value={ops.fixedOpexPerYear} onChange={(v) => set("operations.0.fixedOpexPerYear", v)} suffix="$/yr" sample />
          <NumberField label="Management" value={ops.managementPctOfEgi} onChange={(v) => set("operations.0.managementPctOfEgi", v)} scale={100} suffix="%" digits={1} sample />
          <NumberField label="Rent / opex growth" value={ops.rentGrowth} onChange={(v) => { set("operations.0.rentGrowth", v); setDeal(withUpdate(withUpdate(deal, "operations.0.rentGrowth", v), "operations.0.opexGrowth", v)); }} scale={100} suffix="%/yr" digits={1} sample />
        </div>
      </Card>

      <Card title="Schedule & exit">
        <div className="grid">
          <NumberField label="Construction start" value={deal.schedule.constructionStartMonth} onChange={(v) => set("schedule.constructionStartMonth", Math.round(v))} suffix="mo" />
          <NumberField label="Completion" value={deal.schedule.constructionEndMonth} onChange={(v) => set("schedule.constructionEndMonth", Math.round(v))} suffix="mo" />
          <NumberField label="Operations start" value={deal.schedule.operationsStartMonth} onChange={(v) => set("schedule.operationsStartMonth", Math.round(v))} suffix="mo" />
          <NumberField label="Exit month" value={deal.schedule.exitMonth} onChange={(v) => set("schedule.exitMonth", Math.round(v))} suffix="mo" />
          <NumberField label="Stabilized occupancy" value={deal.schedule.stabilizedOccupancy} onChange={(v) => set("schedule.stabilizedOccupancy", v)} scale={100} suffix="%" digits={1} sample />
          <NumberField label="Exit cap rate" value={deal.exit.exitCapRate} onChange={(v) => set("exit.exitCapRate", v)} scale={100} suffix="%" digits={2} sample />
          <NumberField label="Selling cost" value={deal.exit.sellingCostPct} onChange={(v) => set("exit.sellingCostPct", v)} scale={100} suffix="%" digits={1} sample />
        </div>
      </Card>

      <Card title="Capital stack">
        <div className="grid">
          {si >= 0 && (
            <>
              <NumberField label="Senior LTC" value={deal.stack.tranches[si]!.maxPctOfCost} onChange={(v) => set(`stack.tranches.${si}.maxPctOfCost`, v)} scale={100} suffix="%" digits={0} sample />
              <NumberField label="Senior rate" value={deal.stack.tranches[si]!.rate} onChange={(v) => set(`stack.tranches.${si}.rate`, v)} scale={100} suffix="%" digits={2} sample />
            </>
          )}
          {mi >= 0 && (
            <>
              <NumberField label="Mezz combined LTC" value={deal.stack.tranches[mi]!.maxPctOfCost} onChange={(v) => set(`stack.tranches.${mi}.maxPctOfCost`, v)} scale={100} suffix="%" digits={0} sample />
              <NumberField label="Mezz rate" value={deal.stack.tranches[mi]!.rate} onChange={(v) => set(`stack.tranches.${mi}.rate`, v)} scale={100} suffix="%" digits={2} sample />
            </>
          )}
          {pi >= 0 && (
            <>
              <NumberField label="Pref (% of cost)" value={deal.stack.tranches[pi]!.maxPctOfCost} onChange={(v) => set(`stack.tranches.${pi}.maxPctOfCost`, v)} scale={100} suffix="%" digits={0} sample />
              <NumberField label="Pref rate" value={deal.stack.tranches[pi]!.rate} onChange={(v) => set(`stack.tranches.${pi}.rate`, v)} scale={100} suffix="%" digits={2} sample />
            </>
          )}
          {deal.waterfall && (
            <NumberField label="GP promote" value={deal.waterfall.promoteShare} onChange={(v) => set("waterfall.promoteShare", v)} scale={100} suffix="%" digits={0} sample />
          )}
        </div>
      </Card>
    </>
  );
}
