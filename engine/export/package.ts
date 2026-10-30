/**
 * Investor package generators (handoff: investor package export).
 *
 * Everything is generated from the engine Result (and Deal) so no number is typed by
 * hand — the teaser, deck, diligence checklist, and data-room index all read from the
 * computed result. The disclosure footer appears on every page and a compliance note is
 * carried in the package. Pure: no UI, no network.
 *
 * Compliance: a real capital raise carries securities-law obligations (who may be
 * solicited, what projections may be shown). The app organizes materials; it does not
 * provide legal review. Any real offering needs a securities attorney.
 */
import type { Deal, Result } from "../types.js";

export const DISCLOSURE_FOOTER =
  "Illustrative only. Sample assumptions. Not an offer to sell or a solicitation of an offer to buy any security.";

export const COMPLIANCE_NOTE =
  "A real capital raise carries securities-law obligations, including who may be solicited and what projections may be shown. This app organizes materials but does not provide legal review. Any real offering needs a securities attorney.";

export interface TeaserData {
  propertyName: string;
  sample: boolean;
  program: { units: number; netSf: number; grossSf: number };
  returns: {
    leveredIrr: number;
    lpIrr?: number;
    equityMultiple: number;
    holdOrSell: string;
    profit: number;
  };
  downside: { leveredIrr: number; profit: number } | null;
  capitalStack: { label: string; amount: number; pct: number }[];
  sourcesUses: Result["sourcesUses"];
  disclosure: string;
}

function totalUnits(deal: Deal): number {
  return deal.program.components.reduce(
    (a, c) => a + (c.unitMix?.reduce((s, u) => s + u.count, 0) ?? 0),
    0,
  );
}

export function buildTeaser(deal: Deal, result: Result, downside?: Result): TeaserData {
  const netSf = deal.program.components.reduce((a, c) => a + c.netSf, 0);
  const grossSf = deal.program.components.reduce((a, c) => a + c.grossSf, 0);
  const totalCapital = result.sourcesUses.totalSources;
  const capitalStack = result.sourcesUses.sources.map((s) => ({
    label: s.label,
    amount: s.amount,
    pct: totalCapital > 0 ? s.amount / totalCapital : 0,
  }));

  return {
    propertyName: deal.meta?.name ?? "Development",
    sample: deal.meta?.sample ?? true,
    program: { units: totalUnits(deal), netSf, grossSf },
    returns: {
      leveredIrr: result.returns.levered.annual,
      ...(result.returns.lp ? { lpIrr: result.returns.lp.annual } : {}),
      equityMultiple: result.returns.equityMultiple,
      holdOrSell: deal.businessPlan === "sell" ? "Build to sell" : "Build to hold",
      profit: result.returns.profit,
    },
    downside: downside ? { leveredIrr: downside.returns.levered.annual, profit: downside.returns.profit } : null,
    capitalStack,
    sourcesUses: result.sourcesUses,
    disclosure: DISCLOSURE_FOOTER,
  };
}

// ---------------------------------------------------------------------------
// Diligence checklist
// ---------------------------------------------------------------------------

export type DiligenceState = "pending" | "complete" | "n/a";
export interface DiligenceItem {
  item: string;
  state: DiligenceState;
}

/** The standard diligence checklist, generated for the deal. */
export function buildDiligenceChecklist(_deal: Deal): DiligenceItem[] {
  return [
    "Survey",
    "Title",
    "Flood determination",
    "Zoning verification letter",
    "Geotechnical report",
    "Environmental report",
    "Utility availability",
    "Entitlement status",
    "Construction budget review",
  ].map((item) => ({ item, state: "pending" as DiligenceState }));
}

// ---------------------------------------------------------------------------
// Data room index (with CSV round-trip)
// ---------------------------------------------------------------------------

export type DataRoomStatus = "Requested" | "Received" | "Reviewed" | "N/A";
export interface DataRoomItem {
  folder: string;
  document: string;
  status: DataRoomStatus;
  date: string;
  note: string;
}

const DATA_ROOM_FOLDERS: Record<string, string[]> = {
  Sponsor: ["Sponsor overview", "Track record"],
  Site: ["Survey", "Parcel / GIS export", "Flood determination"],
  Entitlements: ["Zoning verification letter", "Site plan", "Entitlement status memo"],
  "Financial model": ["Pro forma (this model)", "Sources & uses", "Sensitivity analysis"],
  Legal: ["Purchase agreement", "Operating agreement", "Securities counsel memo"],
  Construction: ["GMP / construction contract", "Construction budget", "Draw schedule"],
  "Third-party reports": ["Appraisal", "Geotechnical report", "Environmental (Phase I)", "Market study"],
};

export function buildDataRoomIndex(): DataRoomItem[] {
  const items: DataRoomItem[] = [];
  for (const [folder, docs] of Object.entries(DATA_ROOM_FOLDERS)) {
    for (const document of docs) items.push({ folder, document, status: "Requested", date: "", note: "" });
  }
  return items;
}

const CSV_HEADER = ["folder", "document", "status", "date", "note"] as const;

function csvEscape(field: string): string {
  if (/[",\n]/.test(field)) return `"${field.replace(/"/g, '""')}"`;
  return field;
}

/** Encode the data-room index as CSV (quoted fields). */
export function dataRoomToCsv(items: DataRoomItem[]): string {
  const lines = [CSV_HEADER.join(",")];
  for (const it of items) {
    lines.push([it.folder, it.document, it.status, it.date, it.note].map((f) => csvEscape(String(f))).join(","));
  }
  return lines.join("\n");
}

/** Parse a CSV (produced by dataRoomToCsv) back into data-room items. */
export function csvToDataRoom(csv: string): DataRoomItem[] {
  const rows = parseCsv(csv);
  const [header, ...body] = rows;
  if (!header) return [];
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  return body
    .filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ""))
    .map((r) => ({
      folder: r[idx.folder!] ?? "",
      document: r[idx.document!] ?? "",
      status: (r[idx.status!] ?? "Requested") as DataRoomStatus,
      date: r[idx.date!] ?? "",
      note: r[idx.note!] ?? "",
    }));
}

/** Minimal RFC-4180-ish CSV parser (handles quotes, escaped quotes, commas, newlines). */
function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (csv[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && csv[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Full deck section list (every number is read from the Result at render time)
// ---------------------------------------------------------------------------

export const DECK_SECTIONS = [
  "Cover",
  "Investment summary",
  "Location & site",
  "Zoning & entitlement",
  "Program & unit mix",
  "Market & comps",
  "Development budget (sources & uses)",
  "Schedule (incl. modular vs. conventional)",
  "Capital structure",
  "Returns & the waterfall",
  "Sensitivities & downside",
  "Key risks",
  "Sponsor & team",
  "Disclosures",
] as const;
