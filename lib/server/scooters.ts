import "server-only";
import { haversine, type LatLng } from "../geo";
import { stopsWithin } from "./transit";

// Free-floating e-scooters.
//
// Real data: set SCOOTER_GBFS_URL to an operator's GBFS free_bike_status (v2) or
// vehicle_status (v3) endpoint, plus SCOOTER_GBFS_TOKEN if it needs a Bearer
// token and SCOOTER_OPERATOR for the label. No operator publishes such a feed
// for Lithuania openly yet (Bolt shares one with SĮSP), so access must be asked for.
//
// Demo data: without a feed, local and Vercel preview builds generate fake
// scooters next to real street-side points (public transport stops), so the
// layer and the scooter option can be tested. Production never shows demo data
// unless SCOOTER_DEMO=1 is set on purpose. The UI labels demo data clearly.

export type Scooter = { id: string; pos: LatLng; battery: number | null };
export type Fleet = { source: "gbfs" | "demo" | "none"; operator: string | null; updated: string | null; vehicles: Scooter[] };

const NONE: Fleet = { source: "none", operator: null, updated: null, vehicles: [] };

/** Demo on in `next dev` and Vercel previews, off in production unless forced. */
function demoEnabled() {
  if (process.env.SCOOTER_DEMO) return process.env.SCOOTER_DEMO === "1";
  if (process.env.VERCEL_ENV) return process.env.VERCEL_ENV !== "production";
  return process.env.NODE_ENV !== "production";
}

// ---------------------------------------------------------------- real feed

let cache: { at: number; fleet: Fleet } | null = null;

type GbfsVehicle = {
  bike_id?: string;
  vehicle_id?: string;
  lat: number;
  lon: number;
  is_reserved?: boolean;
  is_disabled?: boolean;
  current_fuel_percent?: number;
  current_range_meters?: number;
};

async function fromGbfs(url: string): Promise<Fleet> {
  const headers: Record<string, string> = { "User-Agent": "EismoPulsas/0.2" };
  if (process.env.SCOOTER_GBFS_TOKEN) headers.Authorization = `Bearer ${process.env.SCOOTER_GBFS_TOKEN}`;
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`GBFS ${res.status}`);
  const body = (await res.json()) as { last_updated?: number | string; data: { bikes?: GbfsVehicle[]; vehicles?: GbfsVehicle[] } };
  const list = body.data.vehicles ?? body.data.bikes ?? [];
  const updated = typeof body.last_updated === "number" ? new Date(body.last_updated * 1000).toISOString() : (body.last_updated ?? null);
  return {
    source: "gbfs",
    operator: process.env.SCOOTER_OPERATOR ?? null,
    updated,
    vehicles: list
      .filter((v) => !v.is_reserved && !v.is_disabled)
      .map((v) => ({
        id: v.vehicle_id ?? v.bike_id ?? `${v.lat},${v.lon}`,
        pos: [v.lat, v.lon] as LatLng,
        // v3 gives a fraction 0–1; older feeds only a range.
        battery: v.current_fuel_percent !== undefined ? Math.round(v.current_fuel_percent * 100) : null,
      })),
  };
}

// ---------------------------------------------------------------- demo data

const DEMO_TOWNS: { name: string; c: LatLng; r: number; n: number }[] = [
  { name: "Vilnius", c: [54.6872, 25.2797], r: 7500, n: 900 },
  { name: "Kaunas", c: [54.8985, 23.9036], r: 6000, n: 450 },
  { name: "Klaipėda", c: [55.7033, 21.1443], r: 5500, n: 220 },
  { name: "Šiauliai", c: [55.9349, 23.3137], r: 3500, n: 80 },
  { name: "Panevėžys", c: [55.7348, 24.3575], r: 3500, n: 80 },
  { name: "Palanga", c: [55.9175, 21.0686], r: 3000, n: 60 },
];

/** Small seeded PRNG so every server instance generates the same fleet. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function demoFleet(): Fleet {
  // A new snapshot every 5 minutes: scooters drift a little, some get rented.
  const bucket = Math.floor(Date.now() / 300_000);
  const vehicles: Scooter[] = [];
  DEMO_TOWNS.forEach((town, ti) => {
    const anchors = stopsWithin(town.c, town.r);
    if (!anchors.length) return;
    const base = mulberry32(1000 + ti); // stable home spots
    const now = mulberry32(bucket * 31 + ti); // per-snapshot changes
    for (let i = 0; i < town.n; i++) {
      const a = anchors[Math.floor(base() * anchors.length)];
      const ang = base() * Math.PI * 2;
      const dist = 20 + base() * 140 + now() * 60;
      if (now() < 0.12) continue; // currently rented
      vehicles.push({
        id: `DEMO-${town.name.slice(0, 3).toUpperCase()}-${i}`,
        pos: [a[0] + (Math.cos(ang) * dist) / 110540, a[1] + (Math.sin(ang) * dist) / (111320 * Math.cos((a[0] * Math.PI) / 180))],
        battery: Math.round(15 + base() * 85),
      });
    }
  });
  return { source: "demo", operator: "DEMO", updated: new Date(bucket * 300_000).toISOString(), vehicles };
}

// ---------------------------------------------------------------- public

export async function scooterFleet(): Promise<Fleet> {
  if (cache && Date.now() - cache.at < 30_000) return cache.fleet;
  let fleet = NONE;
  const url = process.env.SCOOTER_GBFS_URL;
  if (url) {
    try {
      fleet = await fromGbfs(url);
    } catch (err) {
      console.error("Scooter GBFS unavailable:", err);
      fleet = cache?.fleet ?? NONE;
    }
  } else if (demoEnabled()) fleet = demoFleet();
  cache = { at: Date.now(), fleet };
  return fleet;
}

/** Nearest available scooter to p within `max` metres. */
export function nearestScooter(fleet: Fleet, p: LatLng, max = 600): (Scooter & { distance: number }) | null {
  let best: (Scooter & { distance: number }) | null = null;
  for (const v of fleet.vehicles) {
    if (Math.abs(v.pos[0] - p[0]) > 0.01 || Math.abs(v.pos[1] - p[1]) > 0.016) continue;
    const d = haversine(p, v.pos);
    if (d <= max && (!best || d < best.distance)) best = { ...v, distance: d };
  }
  return best;
}
