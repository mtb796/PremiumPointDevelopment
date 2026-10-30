/**
 * Project tracker acceptance tests (handoff):
 *   - a critical path is computed from dependencies;
 *   - moving a milestone changes the pro forma schedule, and the IRR change matches a
 *     manual rerun;
 *   - a milestone past its due date, or a blocked item on the critical path, raises a flag.
 */
import { describe, it, expect } from "vitest";
import { runDeal } from "../engine/index.js";
import {
  criticalPath,
  slipAlerts,
  slipMilestone,
  applyTrackerToSchedule,
  scheduleImpact,
  standardMilestones,
  standardAnchors,
  type Milestone,
} from "../engine/tracker/tracker.js";
import { structuredDeal } from "../data/golden-deals/structured.js";

describe("critical path", () => {
  // Diamond: A -> B -> D and A -> C -> D. B is the long branch.
  const ms: Milestone[] = [
    { id: "A", name: "A", phase: "entitlement", start: 0, due: 2, status: "not-started", dependsOn: [] },
    { id: "B", name: "B", phase: "construction", start: 2, due: 12, status: "not-started", dependsOn: ["A"] }, // 10 mo
    { id: "C", name: "C", phase: "design-permitting", start: 2, due: 5, status: "not-started", dependsOn: ["A"] }, // 3 mo
    { id: "D", name: "D", phase: "lease-up", start: 12, due: 16, status: "not-started", dependsOn: ["B", "C"] },
  ];

  it("identifies the longest dependency path as critical and gives the short branch slack", () => {
    const cpm = criticalPath(ms);
    expect(cpm.criticalPath).toEqual(["A", "B", "D"]);
    expect(cpm.nodes.get("C")!.critical).toBe(false);
    expect(cpm.nodes.get("C")!.slack).toBe(7); // B finishes at 12, C at 5 => 7 months slack
    expect(cpm.projectFinish).toBe(16);
  });

  it("throws on a dependency cycle", () => {
    const cyclic: Milestone[] = [
      { id: "X", name: "X", phase: "entitlement", start: 0, due: 1, status: "not-started", dependsOn: ["Y"] },
      { id: "Y", name: "Y", phase: "entitlement", start: 0, due: 1, status: "not-started", dependsOn: ["X"] },
    ];
    expect(() => criticalPath(cyclic)).toThrow(/cycle/);
  });

  it("the standard milestone set has a critical path ending at stabilization", () => {
    const cpm = criticalPath(standardMilestones());
    expect(cpm.criticalPath).toContain("completion");
    expect(cpm.criticalPath).toContain("leaseup");
  });
});

describe("tracker → schedule link", () => {
  it("maps anchor milestones onto the deal schedule and preserves the hold length", () => {
    const ms = standardMilestones();
    const d = applyTrackerToSchedule(structuredDeal, ms, standardAnchors);
    const cpm = criticalPath(ms);
    expect(d.schedule.constructionStartMonth).toBe(cpm.nodes.get("construction-start")!.earliestStart);
    expect(d.schedule.constructionEndMonth).toBe(cpm.nodes.get("completion")!.earliestFinish);
    expect(d.schedule.operationsStartMonth).toBe(cpm.nodes.get("leaseup")!.earliestFinish);
    const hold = structuredDeal.schedule.exitMonth - structuredDeal.schedule.operationsStartMonth;
    expect(d.schedule.exitMonth - d.schedule.operationsStartMonth).toBe(hold);
  });
});

describe("moving a milestone changes returns, matching a manual rerun", () => {
  it("slipping completion by 6 months pushes the schedule and the IRR delta matches a manual rerun", () => {
    const ms = standardMilestones();
    const impact = scheduleImpact(structuredDeal, ms, standardAnchors, "completion", 6);

    // Manual rerun: apply the slipped tracker to the schedule and run the deal directly.
    const slippedDeal = applyTrackerToSchedule(structuredDeal, slipMilestone(ms, "completion", 6), standardAnchors);
    const manual = runDeal(slippedDeal);
    const baseDeal = applyTrackerToSchedule(structuredDeal, ms, standardAnchors);
    const baseManual = runDeal(baseDeal);

    expect(impact.newLeveredIrr).toBeCloseTo(manual.returns.levered.annual, 10);
    expect(impact.deltaLeveredIrr).toBeCloseTo(
      manual.returns.levered.annual - baseManual.returns.levered.annual,
      10,
    );
    // A completion slip delays stabilization and exit, extending the pre-revenue carry.
    expect(impact.newExitMonth).toBe(impact.baseExitMonth + 6);
    expect(impact.deltaLeveredIrr).toBeLessThan(0);
  });
});

describe("slip alerts", () => {
  it("flags a milestone past its due date that is not done", () => {
    const ms = standardMilestones();
    const alerts = slipAlerts(ms, 20); // month 20: zoning (due 14) and loan close (due 16) overdue
    expect(alerts.some((a) => a.milestoneId === "zoning" && a.code === "overdue")).toBe(true);
  });

  it("flags a blocked item on the critical path and ignores a blocked item with slack", () => {
    const ms = standardMilestones();
    // Block a critical-path item (completion) and a slack item (termsheet).
    const blocked = ms.map((m) =>
      m.id === "completion" || m.id === "termsheet" ? { ...m, status: "blocked" as const, blocker: "subcontractor" } : m,
    );
    const alerts = slipAlerts(blocked, 0);
    const criticalBlocked = alerts.filter((a) => a.code === "blocked-on-critical-path").map((a) => a.milestoneId);
    expect(criticalBlocked).toContain("completion");
    expect(criticalBlocked).not.toContain("termsheet");
  });
});
