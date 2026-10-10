import "server-only";
import type { LatLng } from "../geo";

// Street routing through the public OSRM instances run by FOSSGIS on
// OpenStreetMap data (car, bicycle and foot profiles).

const BASE = "https://routing.openstreetmap.de";
const PROFILE = { car: "routed-car", bike: "routed-bike", foot: "routed-foot" } as const;

export type OsrmRoute = {
  distance: number;
  duration: number;
  coords: LatLng[];
  /** Per-segment durations along `coords` (only with annotations). */
  segDurations: number[];
};

// Answers are kept for 10 minutes: free-flow street routes do not change, and the
// public servers deserve fewer repeated requests (traffic is applied separately).
const TTL = 10 * 60 * 1000;
// When the servers stop answering (even after a retry), skip them for a short while
// instead of making every request wait for its timeout.
const PAUSE = 30 * 1000;
let downUntil = 0;
const unreachable = (err: unknown) => err instanceof Error && ["TimeoutError", "AbortError", "TypeError"].includes(err.name);
const memo = new Map<string, { at: number; work: Promise<unknown> }>();
function remember<T>(key: string, load: () => Promise<T | null>): Promise<T | null> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.work as Promise<T | null>;
  if (memo.size > 2000) memo.clear();
  const work = load().then((v) => {
    if (v === null) memo.delete(key); // failures are retried next time
    return v;
  });
  memo.set(key, { at: Date.now(), work });
  return work;
}

/** `curb`: arrive with the destination on the kerb side (right-hand traffic). */
export function osrmRoute(profile: keyof typeof PROFILE, from: LatLng, to: LatLng, annotate = false, curb = false): Promise<OsrmRoute | null> {
  return remember(JSON.stringify([profile, from, to, annotate, curb]), () => fetchRoute(profile, from, to, annotate, curb));
}

async function fetchRoute(profile: keyof typeof PROFILE, from: LatLng, to: LatLng, annotate: boolean, curb: boolean): Promise<OsrmRoute | null> {
  if (Date.now() < downUntil) return null;
  const url =
    `${BASE}/${PROFILE[profile]}/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}` +
    `?overview=full&geometries=geojson${annotate ? "&annotations=duration" : ""}${curb ? "&approaches=unrestricted;curb" : ""}`;
  const get = () =>
    fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": "EismoPulsas/0.2 (https://github.com/EismoPulsas/eismopulsas)" },
      signal: AbortSignal.timeout(7000),
    });
  try {
    // The public servers now and then drop a connection; one quick retry usually lands.
    const res = await get().catch(() => get());
    if (!res.ok) throw new Error(`OSRM ${profile} ${res.status}`);
    const body = (await res.json()) as {
      code: string;
      routes?: {
        distance: number;
        duration: number;
        geometry: { coordinates: [number, number][] };
        legs: { annotation?: { duration: number[] } }[];
      }[];
    };
    const r = body.routes?.[0];
    if (body.code !== "Ok" || !r) return null;
    return {
      distance: r.distance,
      duration: r.duration,
      coords: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      segDurations: r.legs.flatMap((l) => l.annotation?.duration ?? []),
    };
  } catch (err) {
    if (unreachable(err)) downUntil = Date.now() + PAUSE;
    console.error(`OSRM ${profile} failed`, { reason: err instanceof Error ? err.name : "unknown" });
    return null;
  }
}

/**
 * Driving times and distances from one point to many in a single request (OSRM table
 * service); null entries are unreachable. One call instead of one route per candidate.
 */
export function osrmTable(from: LatLng, to: LatLng[]): Promise<{ duration: (number | null)[]; distance: (number | null)[] } | null> {
  if (!to.length) return Promise.resolve({ duration: [], distance: [] });
  return remember(JSON.stringify(["table", from, to]), () => fetchTable(from, to));
}

async function fetchTable(from: LatLng, to: LatLng[]): Promise<{ duration: (number | null)[]; distance: (number | null)[] } | null> {
  if (Date.now() < downUntil) return null;
  const coords = [from, ...to].map(([lat, lng]) => `${lng.toFixed(5)},${lat.toFixed(5)}`).join(";");
  const get = () =>
    fetch(`${BASE}/${PROFILE.car}/table/v1/driving/${coords}?sources=0&annotations=duration,distance`, {
      cache: "no-store",
      headers: { "User-Agent": "EismoPulsas/0.2 (https://github.com/EismoPulsas/eismopulsas)" },
      signal: AbortSignal.timeout(8000),
    });
  try {
    // Same as routes: the public servers now and then drop a connection.
    let res = await get().catch(() => get());
    if (res.status === 429 || res.status >= 500) res = await get();
    if (!res.ok) throw new Error(`OSRM table ${res.status}`);
    const body = (await res.json()) as { code: string; message?: string; durations?: (number | null)[][]; distances?: (number | null)[][] };
    if (body.code !== "Ok" || !body.durations?.[0]) throw new Error(`OSRM table ${body.code} ${body.message ?? ""}`);
    return { duration: body.durations[0].slice(1), distance: body.distances?.[0]?.slice(1) ?? to.map(() => null) };
  } catch (err) {
    if (unreachable(err)) downUntil = Date.now() + PAUSE;
    console.error("OSRM table failed", { reason: err instanceof Error ? err.message : "unknown" });
    return null;
  }
}
