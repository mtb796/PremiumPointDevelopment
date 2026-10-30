/**
 * Investor package acceptance tests (handoff):
 *   - every number in the package equals the engine result;
 *   - the data-room CSV round-trips;
 *   - the disclosure footer is present.
 */
import { describe, it, expect } from "vitest";
import { runDeal } from "../engine/index.js";
import {
  buildTeaser,
  buildDiligenceChecklist,
  buildDataRoomIndex,
  dataRoomToCsv,
  csvToDataRoom,
  DISCLOSURE_FOOTER,
  COMPLIANCE_NOTE,
} from "../engine/export/package.js";
import { structuredDeal } from "../data/golden-deals/structured.js";

const result = runDeal(structuredDeal);

describe("teaser", () => {
  it("every headline number is read straight from the engine result", () => {
    const t = buildTeaser(structuredDeal, result);
    expect(t.returns.leveredIrr).toBe(result.returns.levered.annual);
    expect(t.returns.lpIrr).toBe(result.returns.lp!.annual);
    expect(t.returns.equityMultiple).toBe(result.returns.equityMultiple);
    expect(t.returns.profit).toBe(result.returns.profit);
    expect(t.sourcesUses).toBe(result.sourcesUses);
  });

  it("the capital stack percentages sum to ~100%", () => {
    const t = buildTeaser(structuredDeal, result);
    const sum = t.capitalStack.reduce((a, s) => a + s.pct, 0);
    expect(sum).toBeCloseTo(1, 6);
  });

  it("carries the disclosure footer and a downside when supplied", () => {
    const downside = runDeal({ ...structuredDeal }); // same deal as a stand-in downside
    const t = buildTeaser(structuredDeal, result, downside);
    expect(t.disclosure).toBe(DISCLOSURE_FOOTER);
    expect(t.downside).not.toBeNull();
  });
});

describe("diligence checklist", () => {
  it("generates the standard items", () => {
    const items = buildDiligenceChecklist(structuredDeal);
    const names = items.map((i) => i.item);
    expect(names).toContain("Zoning verification letter");
    expect(names).toContain("Flood determination");
    expect(names).toContain("Construction budget review");
    expect(items.every((i) => i.state === "pending")).toBe(true);
  });
});

describe("data room index CSV round-trips", () => {
  it("encode then decode returns the same items", () => {
    const items = buildDataRoomIndex();
    const csv = dataRoomToCsv(items);
    const back = csvToDataRoom(csv);
    expect(back).toEqual(items);
  });

  it("round-trips fields that contain commas and quotes", () => {
    const items = buildDataRoomIndex();
    items[0]!.note = 'Needs review, see "memo"';
    items[1]!.status = "Received";
    items[1]!.date = "2026-10-31";
    const back = csvToDataRoom(dataRoomToCsv(items));
    expect(back).toEqual(items);
  });

  it("has a Financial model folder with the pro forma", () => {
    const items = buildDataRoomIndex();
    expect(items.some((i) => i.folder === "Financial model" && i.document === "Pro forma (this model)")).toBe(true);
  });
});

describe("disclosures", () => {
  it("the disclosure footer and compliance note are non-empty and mention securities", () => {
    expect(DISCLOSURE_FOOTER).toMatch(/security/i);
    expect(COMPLIANCE_NOTE).toMatch(/securities attorney/i);
  });
});
