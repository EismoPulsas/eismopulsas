// Address search (as you type) and reverse geocoding, Lithuania only.
//
//   GET /api/geocode?q=Saulėtekio al. 9[&near=54.68,25.28]
//   GET /api/geocode?lat=54.68&lng=25.28
//
// Search goes to Photon (komoot, OpenStreetMap data), which is built for
// search-as-you-type and ranks results near `near` first. Nominatim is only the
// fallback: its usage policy forbids autocomplete and it often refuses cloud IPs.
// Public transport stops come from our own timetable, so they always work.

import { haversine, inLithuania, type LatLng } from "@/lib/geo";
import { searchStops } from "@/lib/server/transit";

const UA = { "User-Agent": "EismoPulsas/0.2 (https://github.com/EismoPulsas/eismopulsas)", "Accept-Language": "lt" };
const PHOTON = "https://photon.komoot.io";
const NOMINATIM = "https://nominatim.openstreetmap.org";
const LT_BBOX = "20.9,53.85,26.9,56.47";
const TTL = 24 * 60 * 60 * 1000;

type GeocodeHit = { lat: number; lng: number; label: string; sub: string; kind: "address" | "street" | "place" | "poi" | "stop" };

const cache = new Map<string, { at: number; body: unknown }>();
async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.body as T;
  const body = await load();
  if (cache.size > 3000) cache.clear();
  cache.set(key, { at: Date.now(), body });
  return body;
}

async function getJson(url: string) {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return res.json();
}

type PhotonProps = {
  name?: string;
  street?: string;
  housenumber?: string;
  city?: string;
  town?: string;
  village?: string;
  locality?: string;
  district?: string;
  county?: string;
  countrycode?: string;
  osm_key?: string;
  osm_value?: string;
  type?: string;
};
type PhotonFeature = { geometry: { coordinates: [number, number] }; properties: PhotonProps };

function fromPhoton(f: PhotonFeature): GeocodeHit | null {
  const p = f.properties;
  if (p.countrycode && p.countrycode !== "LT") return null;
  const [lng, lat] = f.geometry.coordinates;
  const town = p.city ?? p.town ?? p.village ?? p.locality ?? p.county ?? "";
  const address = p.street ? `${p.street}${p.housenumber ? ` ${p.housenumber}` : ""}` : "";
  let label: string;
  let sub: string;
  let kind: GeocodeHit["kind"];
  if (p.type === "street") {
    label = p.name ?? address;
    sub = town;
    kind = "street";
  } else if (p.type === "city" || p.type === "district" || p.type === "locality" || p.osm_key === "place") {
    label = p.name ?? town;
    sub = p.type === "city" ? p.county ?? "" : town;
    kind = "place";
  } else if (p.name) {
    label = p.name;
    sub = [address, town].filter(Boolean).join(", ");
    kind = "poi";
  } else {
    label = address || town;
    sub = town;
    kind = "address";
  }
  if (!label) return null;
  return { lat, lng, label, sub, kind };
}

async function photonSearch(q: string, near: LatLng | null): Promise<GeocodeHit[]> {
  const bias = near ? `&lat=${near[0].toFixed(3)}&lon=${near[1].toFixed(3)}` : "";
  const body = (await getJson(`${PHOTON}/api/?q=${encodeURIComponent(q)}&limit=12&bbox=${LT_BBOX}${bias}`)) as { features: PhotonFeature[] };
  return body.features.map(fromPhoton).filter((h): h is GeocodeHit => !!h);
}

type NominatimPlace = { lat: string; lon: string; display_name: string; name?: string; address?: Record<string, string> };

async function nominatimSearch(q: string): Promise<GeocodeHit[]> {
  const raw = (await getJson(`${NOMINATIM}/search?format=jsonv2&addressdetails=1&countrycodes=lt&limit=8&q=${encodeURIComponent(q)}`)) as NominatimPlace[];
  return raw.map((p) => {
    const a = p.address ?? {};
    const street = a.road ? `${a.road}${a.house_number ? ` ${a.house_number}` : ""}` : "";
    const town = a.city ?? a.town ?? a.village ?? a.municipality ?? "";
    return { lat: +p.lat, lng: +p.lon, label: p.name || street || p.display_name.split(",")[0], sub: [street !== p.name ? street : "", town].filter(Boolean).join(", "), kind: "place" as const };
  });
}

async function reverse(p: LatLng): Promise<{ label: string | null; sub: string | null }> {
  try {
    const body = (await getJson(`${PHOTON}/reverse?lat=${p[0]}&lon=${p[1]}&limit=1`)) as { features: PhotonFeature[] };
    const hit = body.features[0] && fromPhoton(body.features[0]);
    if (hit) return { label: hit.label, sub: hit.sub };
  } catch (err) {
    console.error("Photon reverse failed:", err);
  }
  const n = (await getJson(`${NOMINATIM}/reverse?format=jsonv2&addressdetails=1&zoom=17&lat=${p[0]}&lon=${p[1]}`)) as NominatimPlace;
  const a = n.address ?? {};
  const street = a.road ? `${a.road}${a.house_number ? ` ${a.house_number}` : ""}` : null;
  return { label: street ?? n.name ?? n.display_name?.split(",")[0] ?? null, sub: a.city ?? a.town ?? a.village ?? null };
}

/** Same street split into many OSM ways -> one suggestion. */
function dedupe(hits: GeocodeHit[]): GeocodeHit[] {
  const seen = new Set<string>();
  return hits.filter((h) => {
    const k = `${h.label}|${h.sub}`.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const parseNear = (s: string | null): LatLng | null => {
  const m = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(s ?? "");
  const p: LatLng | null = m ? [+m[1], +m[2]] : null;
  return p && inLithuania(p) ? p : null;
};

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const q = params.get("q")?.trim();

  if (q !== undefined && q !== null && params.has("q")) {
    if (q.length < 2 || q.length > 200) return Response.json([]);
    const near = parseNear(params.get("near"));
    const stops = searchStops(q, near, 3).map<GeocodeHit>((s) => ({ lat: s.pos[0], lng: s.pos[1], label: s.name, sub: "VT stotelė", kind: "stop" }));
    let places: GeocodeHit[] = [];
    let failed = false;
    try {
      places = await cached(`p:${q.toLowerCase()}|${near?.map((v) => v.toFixed(2))}`, () => photonSearch(q, near));
    } catch (err) {
      console.error("Photon failed, falling back to Nominatim:", err);
      try {
        places = await cached(`n:${q.toLowerCase()}`, () => nominatimSearch(q));
      } catch (err2) {
        console.error("Nominatim failed too:", err2);
        failed = true;
      }
    }
    places = dedupe(places);
    // Addresses with a house number first; stops go after the best few places.
    const results = /\d/.test(q) ? [...places.slice(0, 6), ...stops] : [...places.slice(0, 4), ...stops, ...places.slice(4, 6)];
    if (!results.length && failed) return Response.json({ error: "Adresų paieška laikinai neveikia" }, { status: 502 });
    if (near) {
      // Keep the provider's order, but the same name in another town goes below local hits.
      const far = (h: GeocodeHit) => Number(haversine(near, [h.lat, h.lng]) > 40_000);
      results.sort((a, b) => far(a) - far(b));
    }
    return Response.json(results.slice(0, 8), { headers: { "Cache-Control": "public, max-age=3600" } });
  }

  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  if (params.has("lat") && Number.isFinite(lat) && Number.isFinite(lng)) {
    try {
      const body = await cached(`r:${lat.toFixed(4)},${lng.toFixed(4)}`, () => reverse([lat, lng]));
      return Response.json(body);
    } catch (err) {
      console.error("Reverse geocoding failed:", err);
      return Response.json({ label: null, sub: null });
    }
  }
  return Response.json({ error: "Nurodykite q arba lat/lng" }, { status: 400 });
}
