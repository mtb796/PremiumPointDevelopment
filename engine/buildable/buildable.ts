/**
 * Max-buildable engine (handoff: max-buildable module).
 *
 * Given a parcel and a district's dimensional standards, returns the largest unit count
 * the written rules allow and names the single binding constraint. Each constraint is
 * applied independently and converted to a unit count; the answer is the minimum.
 *
 *   units_max = min(U_coverage, U_height, U_FAR, U_density, U_parking, U_open_space)
 *
 * Integrity (ordinance reader rules): a standard whose value is "not-found" or
 * "needs-reading" BLOCKS the result — the engine reports "cannot calculate" for that
 * constraint and does not return a confident unit count, rather than substituting a
 * default. A standard that is "not-regulated" is simply skipped. The engine reports what
 * the written rules allow; it does not predict approvals, variances, or timelines.
 *
 * Pure: no UI, no network.
 */
import type {
  BuildableOptions,
  BuildableProgram,
  DimensionalStandards,
  District,
  Parcel,
  SourcedNumber,
} from "./types.js";

const SQFT_PER_ACRE = 43_560;

export interface ConstraintResult {
  constraint: "coverage" | "height" | "far" | "density" | "parking" | "open-space" | "user-density";
  units: number | null; // null when blocked
  computable: boolean;
  blocked: boolean;
  reason?: string; // "cannot calculate: value not found in source", or why it was skipped
  detail?: string;
}

export interface MaxBuildableResult {
  case: "by-right" | "plan-based";
  blocked: boolean;
  blockedValues: string[]; // names of standards that blocked the result
  units: number | null; // null when blocked
  bindingConstraint?: ConstraintResult["constraint"];
  runnerUpConstraint?: ConstraintResult["constraint"];
  grossSf?: number;
  netSf?: number;
  footprintSf?: number;
  parkingStalls?: number;
  buildableAreaSf?: number;
  stories?: number;
  constraints: ConstraintResult[];
  sentence: string; // plain-language binding-constraint sentence
}

type Resolved = { ok: true; value: number } | { ok: false; blocked: boolean; reason: string; name: string };

function resolve(sv: SourcedNumber | undefined, name: string): Resolved {
  if (!sv || sv.status === "not-regulated") return { ok: false, blocked: false, reason: `${name} not regulated`, name };
  if (sv.status === "not-found" || sv.status === "needs-reading") {
    return { ok: false, blocked: true, reason: `cannot calculate: ${name} ${sv.status} in source`, name };
  }
  if (sv.value === undefined) return { ok: false, blocked: true, reason: `cannot calculate: ${name} has no value`, name };
  return { ok: true, value: sv.value };
}

function floorAreaToUnits(gfa: number, program: BuildableProgram): number {
  return (gfa * program.efficiency) / program.avgUnitNetSf;
}

export function maxBuildable(
  parcel: Parcel,
  district: District,
  program: BuildableProgram,
  options: BuildableOptions,
): MaxBuildableResult {
  const std: DimensionalStandards =
    options.case === "plan-based" ? district.planBased ?? district.byRight : district.byRight;
  const parkingType = options.parkingType ?? "surface";
  const blockedValues: string[] = [];
  const constraints: ConstraintResult[] = [];

  const note = (r: Resolved) => {
    if (!r.ok && r.blocked && !blockedValues.includes(r.name)) blockedValues.push(r.name);
  };

  // --- Buildable area: lot inset by setbacks, minus constraint-layer exclusions. ---
  let buildableAreaSf: number;
  if (parcel.widthFt !== undefined && parcel.depthFt !== undefined) {
    const front = resolve(std.setbacksFt?.front, "front setback");
    const side = resolve(std.setbacksFt?.side, "side setback");
    const rear = resolve(std.setbacksFt?.rear, "rear setback");
    for (const r of [front, side, rear]) note(r);
    const f = front.ok ? front.value : 0;
    const s = side.ok ? side.value : 0;
    const re = rear.ok ? rear.value : 0;
    const bw = Math.max(0, parcel.widthFt - 2 * s);
    const bd = Math.max(0, parcel.depthFt - f - re);
    buildableAreaSf = bw * bd;
  } else {
    buildableAreaSf = parcel.areaSf;
  }
  buildableAreaSf = Math.max(0, buildableAreaSf - (parcel.excludedAreaSf ?? 0));
  const lotAreaSf = parcel.areaSf;
  const acres = lotAreaSf / SQFT_PER_ACRE;

  // --- Stories: from maxStories, else from a height limit and the design floor-to-floor. ---
  const storiesSv = resolve(std.maxStories, "max stories");
  const heightSv = resolve(std.maxHeightFt, "max height");
  let stories: number | null = null;
  if (storiesSv.ok) stories = Math.floor(storiesSv.value);
  else if (heightSv.ok) stories = Math.max(1, Math.floor(heightSv.value / program.floorToFloorFt));
  // Only block on stories when neither the stories nor the height limit could be read.
  if (stories === null) {
    note(storiesSv);
    note(heightSv);
  }

  const coverageSv = resolve(std.maxLotCoverage, "lot coverage");
  const openSpaceSv = resolve(std.minOpenSpacePct, "open space");
  const farSv = resolve(std.maxFar, "FAR");
  const densitySv = resolve(std.maxDensityDuAc, "density");

  // Coverage envelope (only when coverage is regulated): footprint = buildable ×
  // coverage; gfa = footprint × stories. When coverage is not regulated, the height
  // constraint below (full footprint × stories) already covers that case.
  if (stories !== null && coverageSv.ok) {
    const footprint = buildableAreaSf * coverageSv.value;
    const gfa = footprint * stories;
    constraints.push({
      constraint: "coverage",
      units: floorAreaToUnits(gfa, program),
      computable: true,
      blocked: false,
      detail: `footprint ${Math.round(footprint)} SF × ${stories} stories`,
    });
  } else if (!coverageSv.ok && coverageSv.blocked) {
    note(coverageSv);
    constraints.push({ constraint: "coverage", units: null, computable: false, blocked: true, reason: coverageSv.reason });
  }

  // Height/stories: full buildable footprint × stories.
  if (stories !== null) {
    const gfa = buildableAreaSf * stories;
    constraints.push({
      constraint: "height",
      units: floorAreaToUnits(gfa, program),
      computable: true,
      blocked: false,
      detail: `${stories} stories over ${Math.round(buildableAreaSf)} SF`,
    });
  }

  // FAR: lot area × FAR.
  if (farSv.ok) {
    const gfa = lotAreaSf * farSv.value;
    constraints.push({ constraint: "far", units: floorAreaToUnits(gfa, program), computable: true, blocked: false, detail: `FAR ${farSv.value}` });
  } else if (!farSv.ok && farSv.blocked) {
    note(farSv);
    constraints.push({ constraint: "far", units: null, computable: false, blocked: true, reason: farSv.reason });
  }

  // Density: acres × du/acre.
  if (densitySv.ok) {
    constraints.push({ constraint: "density", units: acres * densitySv.value, computable: true, blocked: false, detail: `${densitySv.value} du/ac × ${acres.toFixed(2)} ac` });
  } else if (!densitySv.ok && densitySv.blocked) {
    note(densitySv);
    constraints.push({ constraint: "density", units: null, computable: false, blocked: true, reason: densitySv.reason });
  }

  // Open space: footprint reduced by the required open-space fraction.
  if (stories !== null && openSpaceSv.ok) {
    const footprint = buildableAreaSf * (1 - openSpaceSv.value);
    const gfa = footprint * stories;
    constraints.push({ constraint: "open-space", units: floorAreaToUnits(gfa, program), computable: true, blocked: false, detail: `${(openSpaceSv.value * 100).toFixed(0)}% open space` });
  } else if (!openSpaceSv.ok && openSpaceSv.blocked) {
    note(openSpaceSv);
    constraints.push({ constraint: "open-space", units: null, computable: false, blocked: true, reason: openSpaceSv.reason });
  }

  // Parking (surface only): building footprint + surface parking must fit the buildable area.
  if (parkingType === "surface") {
    const perUnit = resolve(std.parking?.perUnit, "parking ratio");
    const stallSf = resolve(std.parking?.stallSf, "stall size");
    if (perUnit.ok && stallSf.ok && stories !== null) {
      const footprintPerUnit = program.avgUnitNetSf / program.efficiency / stories;
      const parkingPerUnit = perUnit.value * stallSf.value;
      const denom = footprintPerUnit + parkingPerUnit;
      const units = denom > 0 ? buildableAreaSf / denom : 0;
      constraints.push({ constraint: "parking", units, computable: true, blocked: false, detail: `${perUnit.value}/unit × ${stallSf.value} SF surface` });
    } else {
      const blockedOne = !perUnit.ok && perUnit.blocked ? perUnit : !stallSf.ok && stallSf.blocked ? stallSf : null;
      if (blockedOne) {
        note(blockedOne);
        constraints.push({ constraint: "parking", units: null, computable: false, blocked: true, reason: blockedOne.reason });
      }
    }
  }

  // User-entered density (plan-based only), labeled as not from the ordinance.
  if (options.userDensityDuAc !== undefined) {
    constraints.push({ constraint: "user-density", units: acres * options.userDensityDuAc, computable: true, blocked: false, detail: `user-entered ${options.userDensityDuAc} du/ac (not from the ordinance)` });
  }

  const blocked = blockedValues.length > 0;

  // Take the minimum across the computable constraints.
  const computable = constraints.filter((c) => c.computable && c.units !== null) as (ConstraintResult & { units: number })[];
  computable.sort((a, b) => a.units - b.units);
  const binding = computable[0];
  const runnerUp = computable[1];

  if (blocked || !binding) {
    return {
      case: options.case,
      blocked: true,
      blockedValues,
      units: null,
      buildableAreaSf,
      ...(stories !== null ? { stories } : {}),
      constraints,
      sentence: blocked
        ? `Cannot calculate: ${blockedValues.join(", ")} not found/needs reading in the source. No default is substituted.`
        : "Cannot calculate: no computable constraint for this district.",
    };
  }

  const units = Math.floor(binding.units);
  // Rebuild the binding scenario's physical outputs.
  const grossSf = (units * program.avgUnitNetSf) / program.efficiency;
  const netSf = units * program.avgUnitNetSf;
  const footprintSf = stories ? grossSf / stories : grossSf;
  const perUnitStalls = resolve(std.parking?.perUnit, "parking ratio");
  const parkingStalls = perUnitStalls.ok ? Math.ceil(units * perUnitStalls.value) : undefined;

  const headroom = runnerUp ? Math.max(0, Math.floor(runnerUp.units) - units) : undefined;
  const sentence =
    `${capitalize(binding.constraint)} caps this lot at ${units} units` +
    (runnerUp ? `; the next constraint (${runnerUp.constraint}) allows about ${Math.floor(runnerUp.units)}${headroom !== undefined ? `, ~${headroom} more` : ""}.` : ".");

  return {
    case: options.case,
    blocked: false,
    blockedValues,
    units,
    bindingConstraint: binding.constraint,
    ...(runnerUp ? { runnerUpConstraint: runnerUp.constraint } : {}),
    grossSf,
    netSf,
    footprintSf,
    ...(parkingStalls !== undefined ? { parkingStalls } : {}),
    buildableAreaSf,
    ...(stories !== null ? { stories } : {}),
    constraints,
    sentence,
  };
}

/** By-right and plan-based cases together (the engine always reports both). */
export function maxBuildableBothCases(
  parcel: Parcel,
  district: District,
  program: BuildableProgram,
  opts?: Partial<BuildableOptions>,
): { byRight: MaxBuildableResult; planBased: MaxBuildableResult } {
  return {
    byRight: maxBuildable(parcel, district, program, { ...opts, case: "by-right" }),
    planBased: maxBuildable(parcel, district, program, { ...opts, case: "plan-based" }),
  };
}

/** Run the base case and each bonus case; a bonus never reports fewer units than the base. */
export function maxBuildableWithBonuses(
  parcel: Parcel,
  district: District,
  program: BuildableProgram,
  options: BuildableOptions,
): { base: MaxBuildableResult; bonuses: { label: string; result: MaxBuildableResult }[] } {
  const base = maxBuildable(parcel, district, program, options);
  const bonuses = (district.bonuses ?? []).map((b) => {
    const std = options.case === "plan-based" ? district.planBased ?? district.byRight : district.byRight;
    const merged: District = { ...district };
    if (options.case === "by-right") merged.byRight = { ...std, ...b.effect };
    else merged.planBased = { ...std, ...b.effect };
    return { label: b.label, result: maxBuildable(parcel, merged, program, options) };
  });
  return { base, bonuses };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace("-", " ");
}
