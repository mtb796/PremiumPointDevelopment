import React, { useMemo, useState } from "react";
import type { Deal } from "../../engine/types.js";
import {
  criticalPath,
  slipAlerts,
  scheduleImpact,
  standardMilestones,
  standardAnchors,
} from "../../engine/tracker/tracker.js";
import { Card, Row } from "./ui.js";
import { pct } from "../format.js";

export function Tracker({ deal }: { deal: Deal }) {
  const milestones = useMemo(() => standardMilestones(), []);
  const cpm = useMemo(() => criticalPath(milestones), [milestones]);
  const alerts = useMemo(() => slipAlerts(milestones, 0), [milestones]);
  const [slip, setSlip] = useState(6);
  const impact = useMemo(
    () => scheduleImpact(deal, milestones, standardAnchors, "completion", slip),
    [deal, milestones, slip],
  );
  const critical = new Set(cpm.criticalPath);
  const span = cpm.projectFinish || 1;

  return (
    <>
      <Card title="Milestones & critical path" right={<span className="muted">standard development set</span>}>
        <div className="gantt">
          {milestones.map((m) => {
            const n = cpm.nodes.get(m.id)!;
            const left = (n.earliestStart / span) * 100;
            const width = Math.max(1.5, (n.duration / span) * 100);
            return (
              <div className="gantt-row" key={m.id}>
                <span className="gantt-name">
                  {m.name} {critical.has(m.id) && <span className="crit">critical</span>}
                </span>
                <span className="gantt-track">
                  <span
                    className={`gantt-bar ${critical.has(m.id) ? "crit" : ""}`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    title={`months ${n.earliestStart}–${n.earliestFinish}, slack ${n.slack}`}
                  />
                </span>
              </div>
            );
          })}
        </div>
        <Row k="Project finish (critical path)" v={`month ${cpm.projectFinish}`} strong />
      </Card>

      <Card title="Schedule risk → returns">
        <label className="field">
          <span className="field-label">Completion slip</span>
          <span className="field-input">
            <input type="range" min={0} max={18} value={slip} onChange={(e) => setSlip(Number(e.target.value))} />
            <span className="suffix">{slip} mo</span>
          </span>
        </label>
        <Row k="Base levered IRR" v={pct(impact.baseLeveredIrr)} />
        <Row k={`Levered IRR after +${slip} mo slip`} v={pct(impact.newLeveredIrr)} />
        <Row k="IRR impact" v={pct(impact.deltaLeveredIrr)} strong />
        <Row k="Exit month" v={`${impact.baseExitMonth} → ${impact.newExitMonth}`} />
        <p className="defn">Milestones drive the pro forma schedule, so a slip on the critical path re-prices the deal.</p>
      </Card>

      {alerts.length > 0 && (
        <Card title="Slip alerts">
          {alerts.map((a, i) => (
            <div key={i} className="flag warning">
              <strong>{a.code}</strong> {a.message}
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
