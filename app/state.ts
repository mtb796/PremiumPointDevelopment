import type { Deal } from "../engine/types.js";
import { structuredDeal } from "../data/golden-deals/structured.js";
import { apraoDeal } from "../data/golden-deals/aprao.js";

/** Starting deal for the UI — a copy of the structured sample so edits don't mutate the fixture. */
export function defaultDeal(): Deal {
  const d = structuredClone(structuredDeal);
  // Sample for-sale config so the hold-vs-sell verdict can run out of the box.
  d.forSale = { mode: "units", pricePerSf: 650, absorptionUnitsPerMonth: 12, sellingCostPct: 0.05 };
  return d;
}

export const presets: { label: string; make: () => Deal }[] = [
  { label: "Structured (mezz + pref + waterfall)", make: () => structuredClone(structuredDeal) },
  { label: "Aprao reference (senior only)", make: () => structuredClone(apraoDeal) },
];

/** Immutably set a value at a dotted path on a cloned deal (small helper for inputs). */
export function withUpdate<T extends object>(obj: T, path: string, value: unknown): T {
  const next = structuredClone(obj);
  const keys = path.split(".");
  // deno-lint-ignore no-explicit-any
  let cur: any = next;
  for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]!];
  cur[keys[keys.length - 1]!] = value;
  return next;
}
