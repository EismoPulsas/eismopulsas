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

export async function osrmRoute(profile: keyof typeof PROFILE, from: LatLng, to: LatLng, annotate = false): Promise<OsrmRoute | null> {
  const url =
    `${BASE}/${PROFILE[profile]}/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}` +
    `?overview=full&geometries=geojson${annotate ? "&annotations=duration" : ""}`;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": "EismoPulsas/0.2 (https://github.com/EismoPulsas/eismopulsas)" },
      signal: AbortSignal.timeout(12000),
    });
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
    console.error(`OSRM ${profile} failed`, { reason: err instanceof Error ? err.name : "unknown" });
    return null;
  }
}
