/**
 * Project tracker (handoff: project tracker module).
 *
 * Holds the milestones that move a deal from site to stabilization and computes the
 * critical path from their dependencies. Its anchor milestones feed the pro forma's
 * month offsets, so moving a milestone changes the schedule — and the returns. Pure:
 * no UI, no network.
 *
 * Milestone `start`/`due` are month offsets (engine convention 1: month 0 = land
 * close). An activity's duration is `due - start`; dependencies push a milestone's
 * earliest start to the latest finish of its predecessors (classic CPM).
 */
import type { Deal, Month } from "../types.js";
import { runDeal } from "../index.js";

export type MilestoneStatus = "not-started" | "in-progress" | "blocked" | "done";
export type MilestonePhase =
  | "entitlement"
  | "financing"
  | "design-permitting"
  | "construction"
  | "lease-up";

export interface Milestone {
  id: string;
  name: string;
  phase: MilestonePhase;
  owner?: string;
  start: Month; // planned start (month offset)
  due: Month; // planned finish (month offset)
  status: MilestoneStatus;
  blocker?: string;
  dependsOn: string[]; // ids of predecessors
}

export interface CpmNode {
  id: string;
  duration: number;
  earliestStart: number;
  earliestFinish: number;
  latestStart: number;
  latestFinish: number;
  slack: number;
  critical: boolean;
}

export interface CpmResult {
  nodes: Map<string, CpmNode>;
  projectFinish: number;
  /** Critical-path milestone ids in topological order. */
  criticalPath: string[];
  topoOrder: string[];
}

/** Topological order (Kahn). Throws on a dependency cycle. */
function topoSort(milestones: Milestone[]): string[] {
  const byId = new Map(milestones.map((m) => [m.id, m]));
  const indegree = new Map<string, number>();
  const successors = new Map<string, string[]>();
  for (const m of milestones) {
    indegree.set(m.id, 0);
    successors.set(m.id, []);
  }
  for (const m of milestones) {
    for (const dep of m.dependsOn) {
      if (!byId.has(dep)) throw new Error(`milestone ${m.id} depends on unknown milestone ${dep}`);
      indegree.set(m.id, (indegree.get(m.id) ?? 0) + 1);
      successors.get(dep)!.push(m.id);
    }
  }
  const queue = milestones.filter((m) => (indegree.get(m.id) ?? 0) === 0).map((m) => m.id);
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const s of successors.get(id)!) {
      indegree.set(s, (indegree.get(s) ?? 0) - 1);
      if ((indegree.get(s) ?? 0) === 0) queue.push(s);
    }
  }
  if (order.length !== milestones.length) throw new Error("dependency cycle detected in milestones");
  return order;
}

/** Critical-path method: earliest/latest start/finish, slack, and the critical path. */
export function criticalPath(milestones: Milestone[]): CpmResult {
  const byId = new Map(milestones.map((m) => [m.id, m]));
  const topoOrder = topoSort(milestones);
  const nodes = new Map<string, CpmNode>();

  // Forward pass: earliest start respects both the planned start and predecessors' finishes.
  for (const id of topoOrder) {
    const m = byId.get(id)!;
    const duration = Math.max(0, m.due - m.start);
    let es = m.start;
    for (const dep of m.dependsOn) {
      const pred = nodes.get(dep)!;
      es = Math.max(es, pred.earliestFinish);
    }
    nodes.set(id, {
      id,
      duration,
      earliestStart: es,
      earliestFinish: es + duration,
      latestStart: 0,
      latestFinish: 0,
      slack: 0,
      critical: false,
    });
  }

  const projectFinish = Math.max(...[...nodes.values()].map((n) => n.earliestFinish));

  // Build successor map for the backward pass.
  const successors = new Map<string, string[]>();
  for (const m of milestones) successors.set(m.id, []);
  for (const m of milestones) for (const dep of m.dependsOn) successors.get(dep)!.push(m.id);

  // Backward pass (reverse topo order).
  for (const id of [...topoOrder].reverse()) {
    const n = nodes.get(id)!;
    const succ = successors.get(id)!;
    let lf = projectFinish;
    if (succ.length > 0) {
      lf = Math.min(...succ.map((s) => nodes.get(s)!.latestStart));
    }
    n.latestFinish = lf;
    n.latestStart = lf - n.duration;
    n.slack = n.latestStart - n.earliestStart;
    n.critical = Math.abs(n.slack) < 1e-9;
  }

  const criticalPathIds = topoOrder.filter((id) => nodes.get(id)!.critical);
  return { nodes, projectFinish, criticalPath: criticalPathIds, topoOrder };
}

export interface SlipAlert {
  milestoneId: string;
  code: "overdue" | "blocked-on-critical-path";
  message: string;
}

/**
 * Slip alerts: a milestone past its due month and not done, or a blocked item on the
 * critical path (handoff: "raises a flag on the deal summary").
 */
export function slipAlerts(milestones: Milestone[], currentMonth: Month): SlipAlert[] {
  const cpm = criticalPath(milestones);
  const criticalSet = new Set(cpm.criticalPath);
  const alerts: SlipAlert[] = [];
  for (const m of milestones) {
    if (m.status !== "done" && currentMonth > m.due) {
      alerts.push({
        milestoneId: m.id,
        code: "overdue",
        message: `"${m.name}" was due in month ${m.due} and is ${m.status} as of month ${currentMonth}.`,
      });
    }
    if (m.status === "blocked" && criticalSet.has(m.id)) {
      alerts.push({
        milestoneId: m.id,
        code: "blocked-on-critical-path",
        message: `"${m.name}" is blocked and on the critical path${m.blocker ? ` (${m.blocker})` : ""}.`,
      });
    }
  }
  return alerts;
}

/** Anchor milestones that drive the pro forma schedule offsets. */
export interface ScheduleAnchors {
  constructionStart: string; // its earliest start -> constructionStartMonth
  completion: string; // its earliest finish -> constructionEndMonth
  stabilization: string; // its earliest finish -> operationsStartMonth
}

/**
 * Apply the tracker's anchor milestones to a deal's schedule (the hold length is
 * preserved: exit moves with operations start). Returns a new Deal; the input is not
 * mutated.
 */
export function applyTrackerToSchedule(deal: Deal, milestones: Milestone[], anchors: ScheduleAnchors): Deal {
  const cpm = criticalPath(milestones);
  const cs = cpm.nodes.get(anchors.constructionStart);
  const cp = cpm.nodes.get(anchors.completion);
  const st = cpm.nodes.get(anchors.stabilization);
  if (!cs || !cp || !st) throw new Error("anchor milestone ids not found in the tracker");

  const d: Deal = structuredClone(deal);
  const holdMonths = deal.schedule.exitMonth - deal.schedule.operationsStartMonth;
  d.schedule.constructionStartMonth = cs.earliestStart;
  d.schedule.constructionEndMonth = cp.earliestFinish;
  d.schedule.operationsStartMonth = st.earliestFinish;
  d.schedule.exitMonth = st.earliestFinish + holdMonths;
  return d;
}

/** Push a milestone (and, via the CPM, everything that depends on it) later by `months`. */
export function slipMilestone(milestones: Milestone[], id: string, months: number): Milestone[] {
  return milestones.map((m) => (m.id === id ? { ...m, due: m.due + months } : { ...m }));
}

export interface ScheduleImpact {
  baseLeveredIrr: number;
  newLeveredIrr: number;
  deltaLeveredIrr: number;
  baseExitMonth: Month;
  newExitMonth: Month;
}

/**
 * The returns impact of slipping a milestone: re-maps the tracker onto the schedule and
 * re-runs the pro forma (handoff: "Moving a milestone changes returns, and the UI shows
 * the IRR change that results").
 */
export function scheduleImpact(
  deal: Deal,
  milestones: Milestone[],
  anchors: ScheduleAnchors,
  slipId: string,
  months: number,
): ScheduleImpact {
  const baseDeal = applyTrackerToSchedule(deal, milestones, anchors);
  const base = runDeal(baseDeal);
  const slipped = applyTrackerToSchedule(deal, slipMilestone(milestones, slipId, months), anchors);
  const after = runDeal(slipped);
  return {
    baseLeveredIrr: base.returns.levered.annual,
    newLeveredIrr: after.returns.levered.annual,
    deltaLeveredIrr: after.returns.levered.annual - base.returns.levered.annual,
    baseExitMonth: baseDeal.schedule.exitMonth,
    newExitMonth: slipped.schedule.exitMonth,
  };
}

/**
 * A standard development milestone set (entitlement, financing, design/permitting,
 * construction, lease-up), as month offsets. Sample timing; callers edit freely.
 */
export function standardMilestones(): Milestone[] {
  return [
    { id: "preapp", name: "Pre-application meeting", phase: "entitlement", start: 0, due: 2, status: "not-started", dependsOn: [] },
    { id: "siteplan", name: "Site plan submission", phase: "entitlement", start: 2, due: 8, status: "not-started", dependsOn: ["preapp"] },
    { id: "zoning", name: "Zoning / rezoning approval", phase: "entitlement", start: 8, due: 14, status: "not-started", dependsOn: ["siteplan"] },
    { id: "termsheet", name: "Construction loan term sheet", phase: "financing", start: 8, due: 12, status: "not-started", dependsOn: ["siteplan"] },
    { id: "loanclose", name: "Loan closing", phase: "financing", start: 14, due: 16, status: "not-started", dependsOn: ["zoning", "termsheet"] },
    { id: "permits", name: "Building permits", phase: "design-permitting", start: 12, due: 16, status: "not-started", dependsOn: ["zoning"] },
    { id: "construction-start", name: "Construction start", phase: "construction", start: 16, due: 16, status: "not-started", dependsOn: ["loanclose", "permits"] },
    { id: "completion", name: "Construction completion", phase: "construction", start: 16, due: 40, status: "not-started", dependsOn: ["construction-start"] },
    { id: "leaseup", name: "Lease-up to stabilization", phase: "lease-up", start: 40, due: 52, status: "not-started", dependsOn: ["completion"] },
  ];
}

/** Anchors matching `standardMilestones`. */
export const standardAnchors: ScheduleAnchors = {
  constructionStart: "construction-start",
  completion: "completion",
  stabilization: "leaseup",
};
