// Official "juodosios dėmės" and dangerous road sections on state roads,
// fetched live from the Police IRD ArcGIS service (EĮIS) and returned as GeoJSON.

const SERVICE = "https://maps.ird.lt/server/rest/services/EIIS/EIIS/MapServer/0/query";

let cache: { at: number; body: unknown } | null = null;
const TTL = 6 * 60 * 60 * 1000;

export async function GET() {
  if (cache && Date.now() - cache.at < TTL) return Response.json(cache.body);
  try {
    const url = `${SERVICE}?where=1%3D1&outFields=KELIONR,PRADZIAKM,PABAIGAKM,PAVAD,IVEDIMODATA&outSR=4326&f=geojson`;
    const res = await fetch(url, { headers: { "User-Agent": "EismoPulsas/0.1" } });
    if (!res.ok) throw new Error(`IRD ${res.status}`);
    const body = await res.json();
    if (!Array.isArray(body?.features)) throw new Error("Unexpected IRD response");
    cache = { at: Date.now(), body };
    return Response.json(body);
  } catch (err) {
    console.error("Black spots fetch failed:", err);
    // Stale data is better than nothing.
    if (cache) return Response.json(cache.body);
    return Response.json({ error: "Policijos GIS paslauga nepasiekiama" }, { status: 502 });
  }
}
