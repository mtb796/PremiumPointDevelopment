/**
 * /api/geocode — proxy to the U.S. Census one-line address geocoder (handoff: geocoding).
 * Proxied server-side to avoid browser cross-origin errors. No key required.
 */
import { fetchWithTimeout, notAvailable, qp, type Req, type Res } from "./_shared.js";

const DEFAULT_URL = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";

export default async function handler(req: Req, res: Res): Promise<void> {
  const address = qp(req, "address");
  if (!address) {
    res.status(400).json({ error: "address query parameter is required" });
    return;
  }
  const base = process.env.CENSUS_GEOCODER_URL || DEFAULT_URL;
  const url = `${base}?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&format=json`;

  try {
    const r = await fetchWithTimeout(url, { timeoutMs: 8000, retries: 1 });
    if (!r.ok) return notAvailable(res, "geocoder", `upstream ${r.status}`);
    const data = (await r.json()) as {
      result?: { addressMatches?: { matchedAddress?: string; coordinates?: { x: number; y: number } }[] };
    };
    const match = data.result?.addressMatches?.[0];
    if (!match?.coordinates) {
      res.status(404).json({ available: true, found: false });
      return;
    }
    res.status(200).json({
      available: true,
      found: true,
      lat: match.coordinates.y,
      lon: match.coordinates.x,
      matchedAddress: match.matchedAddress ?? address,
    });
  } catch (e) {
    notAvailable(res, "geocoder", e instanceof Error ? e.message : "request failed");
  }
}
