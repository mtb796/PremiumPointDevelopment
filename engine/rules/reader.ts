/**
 * Ordinance source reader logic (handoff: ordinance source reader module).
 *
 * The app NEVER generates a zoning rule. The reader copies values out of the ordinance
 * with their page and exact quoted source text, and anything it cannot read is "not
 * found". This module is the deterministic acceptance layer the parser and the review
 * screen build on. It contains no zoning values of its own.
 *
 * Rules enforced here:
 *   1. No model-generated values — callers pass a value plus the number as written and
 *      its citation; nothing is invented.
 *   2. Every value has a source (ordinance, effective date, section, page, quoted line).
 *   3. Quote check — a value is accepted only if its number appears in its quoted source
 *      text on that page. A value that fails is rejected (needs reading), never stored.
 *   4. Not found stays not found — it blocks any calculation that depends on it; no
 *      default is used.
 *   5. Computed values are shown as computed, with a visible formula beside the
 *      ordinance's own wording.
 *   6. Prose is quoted, never interpreted.
 *
 * Pure: no UI, no network, no model.
 */
import type { Citation, District, DimensionalStandards, RuleTable, SourcedNumber } from "../buildable/types.js";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Quote check (rule 3): does `written` (the number exactly as it appears in the
 * ordinance, e.g. 1800 for "1,800 sq ft", 56 for "56%") occur as a standalone token in
 * the quoted source text? Commas and case are normalized; the number must not be part of
 * a larger number.
 */
export function quoteContainsNumber(quote: string, written: number): boolean {
  const norm = quote.toLowerCase().replace(/,/g, "");
  const s = String(written);
  const re = new RegExp(`(^|[^0-9.])${escapeRegExp(s)}([^0-9]|$)`);
  return re.test(norm);
}

/**
 * Accept a parsed value only if it passes the quote check (rule 3). `stored` is the value
 * in engine units (e.g. 0.56 for a coverage of 56%); `written` is the number as it
 * appears in the quote (e.g. 56). On failure the value is marked "needs-reading" — it is
 * never stored as parsed, so a wrong value is always flagged (zero silent errors).
 */
export function acceptParsedValue(stored: number, written: number, citation: Citation): SourcedNumber {
  if (quoteContainsNumber(citation.quote, written)) {
    return { status: "parsed", value: stored, citation };
  }
  return {
    status: "needs-reading",
    citation,
    note: `Quote check failed: "${written}" does not appear in the quoted source; needs reading.`,
  };
}

/** A value a person typed after reading the page image (rule for needs-reading fields). */
export function personEnteredValue(stored: number, citation: Citation, verifier: string, verifiedOn: string): SourcedNumber {
  return { status: "person-entered", value: stored, citation: { ...citation, verifier, verifiedOn } };
}

/** A reviewer's correction of a parsed value; records who and when. */
export function correctValue(stored: number, citation: Citation, verifier: string, verifiedOn: string): SourcedNumber {
  return { status: "corrected", value: stored, citation: { ...citation, verifier, verifiedOn } };
}

/**
 * A figure the ordinance does not state directly (rule 5): shown as computed, with the
 * visible formula, beside the ordinance's own wording (carried in `citation.quote`).
 * Example: density from "1,800 sq ft of lot per unit" -> 43,560 / 1,800 = 24.2 du/ac.
 */
export function computedValue(stored: number, formula: string, citation: Citation): SourcedNumber {
  return { status: "computed", value: stored, formula, citation };
}

export function notFound(citation?: Citation): SourcedNumber {
  return citation ? { status: "not-found", citation } : { status: "not-found" };
}

export function needsReading(note: string, citation?: Citation): SourcedNumber {
  return citation ? { status: "needs-reading", citation, note } : { status: "needs-reading", note };
}

/** True if a value can be used in a calculation (has a numeric status and a value). */
export function isUsable(sv: SourcedNumber | undefined): boolean {
  if (!sv || sv.value === undefined) return false;
  return sv.status === "parsed" || sv.status === "person-entered" || sv.status === "corrected" || sv.status === "computed";
}

/** True if a value exists in the ordinance but could not be read (blocks dependents). */
export function isBlocking(sv: SourcedNumber | undefined): boolean {
  return sv?.status === "not-found" || sv?.status === "needs-reading";
}

export interface CalcGuard {
  canCalculate: boolean;
  blocked: { field: string; status: string }[];
  message: string;
}

/**
 * Rule 4: check the fields a calculation needs. If any is not-found / needs-reading, the
 * calculation is blocked with "cannot calculate: value not found in source".
 */
export function guardCalculation(std: DimensionalStandards, fields: (keyof DimensionalStandards)[]): CalcGuard {
  const blocked: { field: string; status: string }[] = [];
  for (const f of fields) {
    const sv = std[f] as SourcedNumber | undefined;
    if (isBlocking(sv)) blocked.push({ field: String(f), status: sv!.status });
  }
  return {
    canCalculate: blocked.length === 0,
    blocked,
    message:
      blocked.length === 0
        ? "ok"
        : `cannot calculate: ${blocked.map((b) => `${b.field} (${b.status})`).join(", ")} not found in source`,
  };
}

export interface RuleTableReview {
  jurisdiction: string;
  verified: boolean;
  /** Fields that still need a person to read them before the jurisdiction is selectable. */
  needsReview: { district: string; field: string; status: string }[];
}

/** The review state of a rule table: which values still block, and whether it is verified. */
export function reviewRuleTable(table: RuleTable): RuleTableReview {
  const needsReview: { district: string; field: string; status: string }[] = [];
  const scan = (districtName: string, std: DimensionalStandards | undefined, prefix = "") => {
    if (!std) return;
    for (const [k, v] of Object.entries(std)) {
      if (k === "setbacksFt" || k === "parking") {
        for (const [k2, v2] of Object.entries((v as Record<string, SourcedNumber>) ?? {})) {
          if (isBlocking(v2)) needsReview.push({ district: districtName, field: `${k}.${k2}`, status: v2.status });
        }
      } else if (isBlocking(v as SourcedNumber)) {
        needsReview.push({ district: districtName, field: `${prefix}${k}`, status: (v as SourcedNumber).status });
      }
    }
  };
  for (const [name, d] of Object.entries(table.districts)) {
    scan(name, d.byRight);
    scan(name, d.planBased, "planBased.");
  }
  return { jurisdiction: table.jurisdiction, verified: table.verified, needsReview };
}

export interface ValueChange {
  district: string;
  field: string;
  from: number | string;
  to: number | string;
}

/** Rule: loading a newer ordinance lists exactly which values changed. */
export function diffRuleTables(oldTable: RuleTable, newTable: RuleTable): ValueChange[] {
  const changes: ValueChange[] = [];
  const repr = (sv: SourcedNumber | undefined): number | string => (sv?.value !== undefined ? sv.value : (sv?.status ?? "absent"));
  const compare = (districtName: string, a: DimensionalStandards | undefined, b: DimensionalStandards | undefined, prefix = "") => {
    const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
    for (const k of keys) {
      if (k === "setbacksFt" || k === "parking") {
        const sa = (a?.[k as keyof DimensionalStandards] as Record<string, SourcedNumber>) ?? {};
        const sb = (b?.[k as keyof DimensionalStandards] as Record<string, SourcedNumber>) ?? {};
        const sub = new Set([...Object.keys(sa), ...Object.keys(sb)]);
        for (const k2 of sub) {
          if (repr(sa[k2]) !== repr(sb[k2])) changes.push({ district: districtName, field: `${prefix}${k}.${k2}`, from: repr(sa[k2]), to: repr(sb[k2]) });
        }
      } else {
        const va = a?.[k as keyof DimensionalStandards] as SourcedNumber | undefined;
        const vb = b?.[k as keyof DimensionalStandards] as SourcedNumber | undefined;
        if (repr(va) !== repr(vb)) changes.push({ district: districtName, field: `${prefix}${k}`, from: repr(va), to: repr(vb) });
      }
    }
  };
  const names = new Set([...Object.keys(oldTable.districts), ...Object.keys(newTable.districts)]);
  for (const name of names) {
    const od = oldTable.districts[name] as District | undefined;
    const nd = newTable.districts[name] as District | undefined;
    compare(name, od?.byRight, nd?.byRight);
    compare(name, od?.planBased, nd?.planBased, "planBased.");
  }
  return changes;
}
