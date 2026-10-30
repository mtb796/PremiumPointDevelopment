/** Display + input-parsing helpers for the UI (engine stays unit-pure). */

export function usd(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function usdShort(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(0)}k`;
  return usd(n);
}

export function pct(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

export function num(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function mult(n: number): string {
  return Number.isFinite(n) ? `${n.toFixed(2)}x` : "—";
}

/**
 * Entry shortcuts (handoff): accept "1.9k", "$1,900", "4%". Returns NaN on garbage.
 * A trailing "%" divides by 100 so a rate field can be typed as a percent.
 */
export function parseEntry(raw: string): number {
  if (raw == null) return NaN;
  let s = String(raw).trim().toLowerCase().replace(/[$,\s]/g, "");
  if (s === "") return NaN;
  let scale = 1;
  if (s.endsWith("%")) {
    scale = 0.01;
    s = s.slice(0, -1);
  } else if (s.endsWith("k")) {
    scale = 1e3;
    s = s.slice(0, -1);
  } else if (s.endsWith("m")) {
    scale = 1e6;
    s = s.slice(0, -1);
  } else if (s.endsWith("b")) {
    scale = 1e9;
    s = s.slice(0, -1);
  }
  const v = Number(s);
  return Number.isFinite(v) ? v * scale : NaN;
}
