// Address search and reverse geocoding through OpenStreetMap Nominatim,
// proxied so we can send a proper User-Agent and cache results
// (Nominatim usage policy: max 1 request/second, identify the app).
//
//   GET /api/geocode?q=Gedimino pr. 1, Vilnius
//   GET /api/geocode?lat=54.68&lng=25.28

const NOMINATIM = "https://nominatim.openstreetmap.org";
const HEADERS = { "User-Agent": "EismoPulsas/0.1 (https://github.com/EismoPulsas/eismopulsas)", "Accept-Language": "lt" };

const cache = new Map<string, { at: number; body: unknown }>();
const TTL = 24 * 60 * 60 * 1000;
let last = 0;

async function cached(key: string, url: string, shape: (raw: unknown) => unknown) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.body;
  // Space requests out to respect the 1 req/s policy.
  const wait = last + 1000 - Date.now();
  last = Math.max(Date.now(), last + 1000);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const body = shape(await res.json());
  if (cache.size > 2000) cache.clear();
  cache.set(key, { at: Date.now(), body });
  return body;
}

type NominatimPlace = {
  lat: string;
  lon: string;
  display_name: string;
  address?: Record<string, string>;
};

const streetOf = (p: NominatimPlace) => p.address?.road ?? p.address?.pedestrian ?? p.address?.footway ?? null;
const cityOf = (p: NominatimPlace) =>
  p.address?.city ?? p.address?.town ?? p.address?.village ?? p.address?.municipality ?? null;

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const q = params.get("q")?.trim();
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));

  try {
    if (q) {
      if (q.length < 3 || q.length > 200) return Response.json([], { status: 200 });
      const search = (term: string) =>
        cached(
          `q:${term.toLowerCase()}`,
          `${NOMINATIM}/search?format=jsonv2&addressdetails=1&countrycodes=lt&limit=6&q=${encodeURIComponent(term)}`,
          (raw) =>
            (raw as NominatimPlace[]).map((p) => ({
              lat: +p.lat,
              lng: +p.lon,
              label: p.display_name,
              street: streetOf(p),
              city: cityOf(p),
            })),
        ) as Promise<{ label: string; city: string | null }[]>;

      let results = await search(q);
      // "Ukmergės g. 20, Vilnius": when OSM lacks the house number, Nominatim
      // happily returns Ukmergės g. in some village instead. If no result is in
      // the town typed after the comma, retry at street level.
      const town = q.includes(",") ? q.split(",").pop()!.trim().toLowerCase() : "";
      // Compare stems so "Kaune" matches "Kaunas".
      const stem = town.slice(0, Math.max(3, town.length - 2));
      const inTown = (r: { city: string | null }) => town.length > 2 && !!r.city?.toLowerCase().startsWith(stem);
      if (town && !results.some(inTown) && /\d/.test(q)) {
        const streetLevel = q.replace(/\s*\d+[a-zA-Z]?(?=\s*,)/, "");
        if (streetLevel !== q) results = [...(await search(streetLevel)), ...results];
      }
      if (town) results = [...results.filter(inTown), ...results.filter((r) => !inTown(r))];
      return Response.json(results.slice(0, 8));
    }
    if (Number.isFinite(lat) && Number.isFinite(lng) && params.has("lat")) {
      const key = `r:${lat.toFixed(4)},${lng.toFixed(4)}`;
      const url = `${NOMINATIM}/reverse?format=jsonv2&addressdetails=1&zoom=17&lat=${lat}&lon=${lng}`;
      const body = await cached(key, url, (raw) => {
        const p = raw as NominatimPlace;
        return { label: p.display_name ?? null, street: p ? streetOf(p) : null, city: p ? cityOf(p) : null };
      });
      return Response.json(body);
    }
    return Response.json({ error: "Nurodykite q arba lat/lng" }, { status: 400 });
  } catch (err) {
    console.error("Geocoding failed:", err);
    return Response.json({ error: "Adresų paieška laikinai neveikia" }, { status: 502 });
  }
}
