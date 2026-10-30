/**
 * Ordinance source reader acceptance tests (handoff):
 *   - no rule-table value exists without a citation and quoted source text;
 *   - a value whose number is absent from its quoted text is rejected;
 *   - a missing / unreadable value shows "not found" and blocks dependent calcs;
 *   - a figure the ordinance does not state directly is shown as computed with a formula;
 *   - a person-entered / corrected value records who, when, and the page;
 *   - loading a newer ordinance lists exactly which values changed.
 *
 * The ordinance text in these tests is a SYNTHETIC FIXTURE, not the real ordinance — it
 * exercises the acceptance logic. No real zoning value is asserted here.
 */
import { describe, it, expect } from "vitest";
import {
  quoteContainsNumber,
  acceptParsedValue,
  personEnteredValue,
  correctValue,
  computedValue,
  notFound,
  guardCalculation,
  reviewRuleTable,
  diffRuleTables,
  isUsable,
  isBlocking,
} from "../engine/rules/reader.js";
import type { Citation, RuleTable } from "../engine/buildable/types.js";

const cite = (quote: string): Citation => ({
  ordinance: "Example Zoning Ordinance",
  effectiveDate: "2025-01-01",
  section: "§6.3",
  page: "6-9",
  quote,
});

describe("quote check (rule 3)", () => {
  it("accepts a number that appears as a token in the quote", () => {
    expect(quoteContainsNumber("Maximum height 40 ft, 4 stories", 40)).toBe(true);
    expect(quoteContainsNumber("1,200 sq ft of lot per unit", 1200)).toBe(true); // commas normalized
  });

  it("rejects a number that is not in the quote, and does not match a sub-number", () => {
    expect(quoteContainsNumber("Maximum height 40 ft", 36)).toBe(false);
    expect(quoteContainsNumber("height 140 ft", 40)).toBe(false); // 40 is part of 140
  });

  it("acceptParsedValue stores a value only when the quote check passes", () => {
    const ok = acceptParsedValue(40, 40, cite("Maximum height 40 ft, 4 stories"));
    expect(ok.status).toBe("parsed");
    expect(ok.value).toBe(40);
    expect(ok.citation).toBeDefined();

    const bad = acceptParsedValue(48, 48, cite("Maximum height 40 ft, 4 stories"));
    expect(bad.status).toBe("needs-reading"); // rejected, never stored as parsed
    expect(bad.value).toBeUndefined();
    expect(isUsable(bad)).toBe(false);
  });

  it("a coverage stored as a fraction is checked against the percent as written", () => {
    const ok = acceptParsedValue(0.56, 56, cite("lot coverage ... capped at 56%"));
    expect(ok.status).toBe("parsed");
    expect(ok.value).toBe(0.56);
  });
});

describe("not found blocks dependents (rule 4)", () => {
  it("guardCalculation blocks when a required field is not-found", () => {
    const std = { maxFar: notFound(cite("(page garbled)")), maxStories: acceptParsedValue(4, 4, cite("4 stories")) };
    const guard = guardCalculation(std, ["maxFar", "maxStories"]);
    expect(guard.canCalculate).toBe(false);
    expect(guard.message).toMatch(/cannot calculate/);
    expect(isBlocking(std.maxFar)).toBe(true);
  });

  it("allows the calculation when every required field is usable", () => {
    const std = { maxStories: acceptParsedValue(4, 4, cite("4 stories")), maxDensityDuAc: acceptParsedValue(36, 36, cite("36 units per acre")) };
    expect(guardCalculation(std, ["maxStories", "maxDensityDuAc"]).canCalculate).toBe(true);
  });
});

describe("computed values are shown as computed (rule 5)", () => {
  it("density from lot-per-unit is computed with a visible formula beside the ordinance wording", () => {
    const quote = "1,800 sq ft of lot area per unit";
    // the INPUT (1800) must be in the quote; the density is derived, not stated.
    expect(quoteContainsNumber(quote, 1800)).toBe(true);
    const density = computedValue(43_560 / 1_800, "43,560 sf/acre ÷ 1,800 sf/unit", cite(quote));
    expect(density.status).toBe("computed");
    expect(density.value).toBeCloseTo(24.2, 1);
    expect(density.formula).toContain("1,800");
    expect(density.citation!.quote).toBe(quote);
  });
});

describe("person-entered / corrected values record who, when, and the page", () => {
  it("records provenance", () => {
    const pe = personEnteredValue(72, cite("72 units per acre"), "MB", "2026-10-31");
    expect(pe.status).toBe("person-entered");
    expect(pe.citation!.verifier).toBe("MB");
    expect(pe.citation!.verifiedOn).toBe("2026-10-31");
    expect(pe.citation!.page).toBe("6-9");

    const cr = correctValue(40, cite("40 ft"), "MB", "2026-10-31");
    expect(cr.status).toBe("corrected");
    expect(cr.citation!.verifier).toBe("MB");
  });
});

describe("rule-table review and version diff", () => {
  const tableV1: RuleTable = {
    jurisdiction: "Example County",
    verified: false,
    districts: {
      "R-30": {
        name: "R-30",
        permittedUses: ["multifamily"],
        byRight: {
          maxDensityDuAc: acceptParsedValue(30, 30, cite("30 units per acre")),
          minOpenSpacePct: notFound(cite("(table split across pages)")),
        },
      },
    },
  };

  it("reports the fields that still need reading and the verified flag", () => {
    const review = reviewRuleTable(tableV1);
    expect(review.verified).toBe(false);
    expect(review.needsReview).toContainEqual({ district: "R-30", field: "minOpenSpacePct", status: "not-found" });
  });

  it("lists exactly which values changed when a newer ordinance is loaded", () => {
    const tableV2: RuleTable = {
      ...tableV1,
      districts: {
        "R-30": {
          ...tableV1.districts["R-30"]!,
          byRight: {
            maxDensityDuAc: acceptParsedValue(40, 40, cite("40 units per acre")), // changed 30 -> 40
            minOpenSpacePct: acceptParsedValue(0.4, 40, cite("40% open space")), // now readable
          },
        },
      },
    };
    const changes = diffRuleTables(tableV1, tableV2);
    expect(changes).toContainEqual({ district: "R-30", field: "maxDensityDuAc", from: 30, to: 40 });
    expect(changes.find((c) => c.field === "minOpenSpacePct")).toBeDefined();
  });
});
