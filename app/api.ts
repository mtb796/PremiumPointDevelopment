/**
 * Client helpers for the serverless proxies. Each returns a typed result or a
 * "not available" marker — never throws into the UI, so a failed layer shows
 * "not available" and the page keeps going (handoff failure behavior).
 */

export interface GeocodeResult {
  available: boolean;
  found?: boolean;
  lat?: number;
  lon?: number;
  matchedAddress?: string;
}
export interface FloodResult {
  available: boolean;
  zone?: string | null;
  subtype?: string | null;
}
export interface GisResult {
  available: boolean;
  found?: boolean;
  attributes?: Record<string, unknown> | null;
}

async function getJson<T>(url: string): Promise<T | { available: false }> {
  try {
    const r = await fetch(url, { headers: { accept: "application/json" } });
    const ct = r.headers.get("content-type") ?? "";
    if (!ct.includes("application/json")) return { available: false }; // e.g. dev server HTML fallback
    return (await r.json()) as T;
  } catch {
    return { available: false };
  }
}

export function geocode(address: string): Promise<GeocodeResult | { available: false }> {
  return getJson<GeocodeResult>(`/api/geocode?address=${encodeURIComponent(address)}`);
}
export function flood(lat: number, lon: number): Promise<FloodResult | { available: false }> {
  return getJson<FloodResult>(`/api/flood?lat=${lat}&lon=${lon}`);
}
export function gis(layer: string, lat: number, lon: number, outFields = "*"): Promise<GisResult | { available: false }> {
  return getJson<GisResult>(`/api/gis?layer=${encodeURIComponent(layer)}&lat=${lat}&lon=${lon}&outFields=${encodeURIComponent(outFields)}`);
}
