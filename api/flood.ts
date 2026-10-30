/**
 * /api/flood — proxy to FEMA's National Flood Hazard Layer ArcGIS REST service to return
 * the flood zone at a point (handoff: flood zones). The flood-hazard-zones layer index
 * can change between service versions, so it is configurable; confirm it when wiring.
 */
import { fetchWithTimeout, notAvailable, qp, type Req, type Res } from "./_shared.js";

const DEFAULT_BASE = "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer";
const DEFAULT_LAYER = process.env.FEMA_NFHL_FLOOD_LAYER || "28"; // confirm on wiring

export default async function handler(req: Req, res: Res): Promise<void> {
  const lat = Number(qp(req, "lat"));
  const lon = Number(qp(req, "lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    res.status(400).json({ error: "lat and lon query parameters are required" });
    return;
  }
  const base = process.env.FEMA_NFHL_URL || DEFAULT_BASE;
  const geometry = encodeURIComponent(JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }));
  const url =
    `${base}/${DEFAULT_LAYER}/query?geometry=${geometry}&geometryType=esriGeometryPoint&inSR=4326` +
    `&spatialRel=esriSpatialRelIntersects&outFields=FLD_ZONE,ZONE_SUBTY&returnGeometry=false&f=json`;

  try {
    const r = await fetchWithTimeout(url, { timeoutMs: 8000, retries: 1 });
    if (!r.ok) return notAvailable(res, "flood", `upstream ${r.status}`);
    const data = (await r.json()) as { features?: { attributes?: Record<string, unknown> }[] };
    const zone = data.features?.[0]?.attributes?.["FLD_ZONE"];
    res.status(200).json({
      available: true,
      zone: zone ?? null, // null = no mapped flood zone at this point
      subtype: data.features?.[0]?.attributes?.["ZONE_SUBTY"] ?? null,
    });
  } catch (e) {
    notAvailable(res, "flood", e instanceof Error ? e.message : "request failed");
  }
}
