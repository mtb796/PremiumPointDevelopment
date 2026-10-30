/**
 * End-to-end integrity: the shipped rule-table scaffolds are unverified and every value
 * needs reading, so the reader flags them and the max-buildable engine BLOCKS rather than
 * producing a number. This proves no zoning result is ever fabricated from a scaffold.
 */
import { describe, it, expect } from "vitest";
import { reviewRuleTable } from "../engine/rules/reader.js";
import { maxBuildable } from "../engine/buildable/buildable.js";
import type { BuildableProgram, Parcel, RuleTable } from "../engine/buildable/types.js";
import arlington from "../rules/arlington-va.json" assert { type: "json" };
import fairfax from "../rules/fairfax-va.json" assert { type: "json" };

const program: BuildableProgram = { efficiency: 0.85, avgUnitNetSf: 850, floorToFloorFt: 10 };
const parcel: Parcel = { areaSf: 43_560 };

describe("shipped rule-table scaffolds", () => {
  for (const [name, table] of [
    ["Arlington", arlington as unknown as RuleTable],
    ["Fairfax", fairfax as unknown as RuleTable],
  ] as const) {
    it(`${name} is unverified and every standard needs reading`, () => {
      const review = reviewRuleTable(table);
      expect(review.verified).toBe(false);
      expect(review.needsReview.length).toBeGreaterThan(0);
      // Every flagged value is not-found or needs-reading (never a silent numeric value).
      for (const r of review.needsReview) expect(["not-found", "needs-reading"]).toContain(r.status);
    });
  }

  it("max-buildable on a scaffold district blocks (cannot calculate), never guesses", () => {
    const table = arlington as unknown as RuleTable;
    const district = table.districts["RA8-18"]!;
    const r = maxBuildable(parcel, district, program, { case: "by-right", parkingType: "structured" });
    expect(r.blocked).toBe(true);
    expect(r.units).toBeNull();
    expect(r.blockedValues.length).toBeGreaterThan(0);
    expect(r.sentence).toMatch(/Cannot calculate/);
  });
});
