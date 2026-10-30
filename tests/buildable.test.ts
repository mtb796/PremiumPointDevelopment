/**
 * Max-buildable acceptance tests (handoff):
 *   - a unit test for each constraint becoming the binding one;
 *   - golden parcels with hand-calculated results;
 *   - by-right vs. plan-based;
 *   - bonus provisions never report fewer units than the base;
 *   - a "not-found" value blocks the result (no default substituted).
 *
 * The dimensional standards below are EXPLICIT TEST INPUTS used to exercise the engine
 * math — not verified zoning values. They mirror the shapes in the handoff's hand-
 * extracted DMV answer key. No value here is treated as sourced truth.
 */
import { describe, it, expect } from "vitest";
import { maxBuildable, maxBuildableBothCases, maxBuildableWithBonuses } from "../engine/buildable/buildable.js";
import type { BuildableProgram, District, Parcel, SourcedNumber } from "../engine/buildable/types.js";

const sv = (value: number): SourcedNumber => ({ status: "person-entered", value });
const notFound = (): SourcedNumber => ({ status: "not-found" });

const program: BuildableProgram = { efficiency: 0.85, avgUnitNetSf: 850, floorToFloorFt: 10 };
const oneAcre: Parcel = { areaSf: 43_560 }; // 1 acre, no setback geometry

function district(partial: Partial<District> & { byRight: District["byRight"] }): District {
  return { name: "TEST", permittedUses: ["multifamily"], ...partial };
}

describe("each constraint can be the binding one", () => {
  it("density binds", () => {
    const d = district({ byRight: { maxStories: sv(10), maxDensityDuAc: sv(20) } });
    const r = maxBuildable(oneAcre, d, program, { case: "by-right", parkingType: "structured" });
    expect(r.bindingConstraint).toBe("density");
    expect(r.units).toBe(20); // 20 du/ac × 1 ac
  });

  it("FAR binds", () => {
    const d = district({ byRight: { maxStories: sv(10), maxFar: sv(1.0) } });
    const r = maxBuildable(oneAcre, d, program, { case: "by-right", parkingType: "structured" });
    expect(r.bindingConstraint).toBe("far");
    // 43,560 × 1.0 × 0.85 / 850 = 43.56 -> 43
    expect(r.units).toBe(43);
  });

  it("coverage binds", () => {
    const d = district({ byRight: { maxStories: sv(4), maxLotCoverage: sv(0.3) } });
    const r = maxBuildable(oneAcre, d, program, { case: "by-right", parkingType: "structured" });
    expect(r.bindingConstraint).toBe("coverage");
    // 43,560 × 0.3 × 4 × 0.85 / 850 = 52.27 -> 52
    expect(r.units).toBe(52);
  });

  it("height/stories binds", () => {
    const d = district({ byRight: { maxStories: sv(2) } });
    const r = maxBuildable(oneAcre, d, program, { case: "by-right", parkingType: "structured" });
    expect(r.bindingConstraint).toBe("height");
    // 43,560 × 2 × 0.85 / 850 = 87.12 -> 87
    expect(r.units).toBe(87);
  });

  it("parking binds (surface)", () => {
    const d = district({ byRight: { maxStories: sv(10), parking: { perUnit: sv(2), stallSf: sv(400) } } });
    const r = maxBuildable(oneAcre, d, program, { case: "by-right", parkingType: "surface" });
    expect(r.bindingConstraint).toBe("parking");
    // footprintPerUnit 850/0.85/10 = 100; parking 2×400 = 800; 43,560/900 = 48.4 -> 48
    expect(r.units).toBe(48);
  });

  it("open space binds", () => {
    const d = district({ byRight: { maxStories: sv(4), minOpenSpacePct: sv(0.6) } });
    const r = maxBuildable(oneAcre, d, program, { case: "by-right", parkingType: "structured" });
    expect(r.bindingConstraint).toBe("open-space");
    // 43,560 × 0.4 × 4 × 0.85 / 850 = 69.7 -> 69
    expect(r.units).toBe(69);
  });
});

describe("golden parcel with setback geometry (density binding)", () => {
  // 2-acre rectangle, setbacks reduce the buildable footprint.
  const parcel: Parcel = { areaSf: 87_120, widthFt: 200, depthFt: 435.6 };
  const d = district({
    byRight: {
      maxStories: sv(4),
      maxHeightFt: sv(40),
      maxDensityDuAc: sv(36),
      maxLotCoverage: sv(0.56),
      setbacksFt: { front: sv(20), side: sv(10), rear: sv(15) },
      parking: { perUnit: sv(1.6), stallSf: sv(325) },
    },
  });

  it("density caps the lot and the sentence names it", () => {
    const r = maxBuildable(parcel, d, program, { case: "by-right", parkingType: "surface" });
    expect(r.bindingConstraint).toBe("density");
    expect(r.units).toBe(72); // 36 du/ac × 2 ac
    expect(r.buildableAreaSf).toBeCloseTo(180 * 400.6, 0);
    expect(r.sentence).toMatch(/Density caps this lot at 72 units/);
    expect(r.runnerUpConstraint).toBeDefined();
  });
});

describe("by-right vs. plan-based", () => {
  it("plan-based maxima allow more units than by-right", () => {
    const d = district({
      byRight: { maxStories: sv(4), maxDensityDuAc: sv(36) },
      planBased: { maxStories: sv(16), maxDensityDuAc: sv(115) },
    });
    const { byRight, planBased } = maxBuildableBothCases(oneAcre, d, program, { parkingType: "structured" });
    expect(byRight.units).toBe(36);
    expect(planBased.units).toBe(115);
    expect(planBased.units!).toBeGreaterThan(byRight.units!);
  });
});

describe("bonus provisions never reduce units", () => {
  it("a density bonus yields at least the base units", () => {
    const d = district({
      byRight: { maxStories: sv(10), maxDensityDuAc: sv(36) },
      bonuses: [{ label: "Affordability bonus", trigger: "15% affordable", effect: { maxDensityDuAc: sv(50) } }],
    });
    const { base, bonuses } = maxBuildableWithBonuses(oneAcre, d, program, { case: "by-right", parkingType: "structured" });
    expect(base.units).toBe(36);
    expect(bonuses[0]!.result.units!).toBeGreaterThanOrEqual(base.units!);
    expect(bonuses[0]!.result.units).toBe(50);
  });
});

describe("a not-found value blocks the result (no default substituted)", () => {
  it("a not-found setback on a geometry parcel blocks and lists the missing value", () => {
    const parcel: Parcel = { areaSf: 43_560, widthFt: 200, depthFt: 217.8 };
    const d = district({ byRight: { maxStories: sv(4), maxDensityDuAc: sv(36), setbacksFt: { front: sv(20), side: notFound(), rear: sv(15) } } });
    const r = maxBuildable(parcel, d, program, { case: "by-right", parkingType: "structured" });
    expect(r.blocked).toBe(true);
    expect(r.units).toBeNull();
    expect(r.blockedValues).toContain("side setback");
    expect(r.sentence).toMatch(/Cannot calculate/);
  });

  it("a not-found FAR (the binding-relevant value) blocks rather than guessing", () => {
    const d = district({ byRight: { maxStories: sv(10), maxFar: notFound() } });
    const r = maxBuildable(oneAcre, d, program, { case: "by-right", parkingType: "structured" });
    expect(r.blocked).toBe(true);
    expect(r.units).toBeNull();
    expect(r.blockedValues).toContain("FAR");
  });
});
