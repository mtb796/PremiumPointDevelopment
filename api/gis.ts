/**
 * /api/gis — proxy to a jurisdiction's public ArcGIS REST layer to return the parcel or
 * zoning attributes at a point (handoff: parcels and zoning). The layer URLs and field
 * names live in rules/registry.json and must be confirmed per jurisdiction; this proxy
 * only forwards to an ALLOWLISTED ArcGIS host and returns "not available" otherwise.
 */
import { fetchWithTimeout, notAvailable, qp, type Req, type Res } from "./_shared.js";

// Only forward to hosts a jurisdiction has been confirmed on (defense against SSRF).
const ALLOWED_HOSTS = (process.env.GIS_ALLOWED_HOSTS || "")
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);

export default async function handler(req: Req, res: Res): Promise<void> {
  const layerUrl = qp(req, "layer"); // full ArcGIS FeatureServer/MapServer layer URL
  const lat = Number(qp(req, "lat"));
  const lon = Number(qp(req, "lon"));
  const outFields = qp(req, "outFields") || "*";
  if (!layerUrl || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    res.status(400).json({ error: "layer, lat, and lon are required" });
    return;
  }
  let host: string;
  try {
    host = new URL(layerUrl).host;
  } catch {
    res.status(400).json({ error: "invalid layer URL" });
    return;
  }
  if (ALLOWED_HOSTS.length === 0 || !ALLOWED_HOSTS.includes(host)) {
    return notAvailable(res, "gis", `host ${host} not in the confirmed allowlist (set GIS_ALLOWED_HOSTS)`);
  }

  const geometry = encodeURIComponent(JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }));
  const url =
    `${layerUrl}/query?geometry=${geometry}&geometryType=esriGeometryPoint&inSR=4326` +
    `&spatialRel=esriSpatialRelIntersects&outFields=${encodeURIComponent(outFields)}&returnGeometry=true&f=json`;

  try {
    const r = await fetchWithTimeout(url, { timeoutMs: 8000, retries: 1 });
    if (!r.ok) return notAvailable(res, "gis", `upstream ${r.status}`);
    const data = (await r.json()) as { features?: { attributes?: Record<string, unknown>; geometry?: unknown }[] };
    const feature = data.features?.[0];
    res.status(200).json({ available: true, found: !!feature, attributes: feature?.attributes ?? null, geometry: feature?.geometry ?? null });
  } catch (e) {
    notAvailable(res, "gis", e instanceof Error ? e.message : "request failed");
  }
}
