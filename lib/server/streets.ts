import "server-only";
import { haversine, type LatLng } from "../geo";
import type { TransitLeg, TransitResult, WalkLeg } from "../plan-types";
import { osrmRoute, type OsrmRoute } from "./osrm";

// Street routing for bikes, scooters and walking.
//
// Valhalla (FOSSGIS public instance, OpenStreetMap data) is the first choice: its
// bicycle profile uses cycle paths and quiet streets sensibly, where the public
// OSRM bike profile often detours 1.5–2× the straight-line distance. OSRM stays
// as the fallback. Short walks (to a stop, between stops, to a station) go to OSRM's
// foot profile first – it is good at those – so one plan does not send ten requests
// to the same free server. They are cached: stops never move, so the same legs come
// up again and again.

const VALHALLA = "https://valhalla1.openstreetmap.de/route";
const UA = { "User-Agent": "EismoPulsas/0.2 (https://github.com/EismoPulsas/eismopulsas)" };

/** Valhalla shapes are Google polylines with 6 decimals. */
function decode6(str: string): LatLng[] {
  const out: LatLng[] = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  while (i < str.length) {
    for (let k = 0; k < 2; k++) {
      let shift = 0;
      let result = 0;
      let b: number;
      do {
        b = str.charCodeAt(i++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (k === 0) lat += d;
      else lng += d;
    }
    out.push([lat / 1e6, lng / 1e6]);
  }
  return out;
}

type Costing = "bicycle" | "pedestrian";

async function valhalla(costing: Costing, from: LatLng, to: LatLng): Promise<OsrmRoute | null> {
  const body = {
    locations: [
      { lat: from[0], lon: from[1] },
      { lat: to[0], lon: to[1] },
    ],
    costing,
    // An everyday hybrid bike that prefers cycle infrastructure but will use a road.
    costing_options: costing === "bicycle" ? { bicycle: { bicycle_type: "Hybrid", use_roads: 0.5 } } : {},
    units: "kilometers",
    directions_type: "none",
  };
  try {
    const res = await fetch(`${VALHALLA}?json=${encodeURIComponent(JSON.stringify(body))}`, { headers: UA, signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(`Valhalla ${costing} ${res.status}`);
    const d = (await res.json()) as { trip?: { summary: { length: number; time: number }; legs: { shape: string }[] } };
    if (!d.trip) return null;
    return {
      distance: d.trip.summary.length * 1000,
      duration: d.trip.summary.time,
      coords: d.trip.legs.flatMap((l) => decode6(l.shape)),
      segDurations: [],
    };
  } catch (err) {
    console.error(`Valhalla ${costing} failed:`, err);
    return null;
  }
}

export async function bikeRoute(from: LatLng, to: LatLng): Promise<OsrmRoute | null> {
  return (await valhalla("bicycle", from, to)) ?? osrmRoute("bike", from, to);
}

export async function footRoute(from: LatLng, to: LatLng): Promise<OsrmRoute | null> {
  return (await valhalla("pedestrian", from, to)) ?? osrmRoute("foot", from, to);
}

// ---------------------------------------------------------------- short walks

const walkCache = new Map<string, { distance: number; duration: number; coords: LatLng[] }>();
const key = (a: LatLng, b: LatLng) => `${a[0].toFixed(5)},${a[1].toFixed(5)}>${b[0].toFixed(5)},${b[1].toFixed(5)}`;

export type WalkPath = { distance: number; duration: number; coords: LatLng[]; routed: boolean };

/**
 * A short walk along streets, for drawing and honest timing. Falls back to the
 * straight line (marked `routed: false`) if no router answers, so a plan never fails
 * because of it.
 */
export async function walkPath(from: LatLng, to: LatLng): Promise<WalkPath> {
  const straight = haversine(from, to);
  if (straight < 40) return { distance: Math.round(straight), duration: Math.round(straight / 1.25), coords: [from, to], routed: false };
  const k = key(from, to);
  const hit = walkCache.get(k);
  if (hit) return { ...hit, routed: true };
  const r = (await osrmRoute("foot", from, to)) ?? (await valhalla("pedestrian", from, to));
  if (!r || r.coords.length < 2) return { distance: Math.round(straight * 1.3), duration: Math.round((straight * 1.3) / 1.25), coords: [from, to], routed: false };
  const path = { distance: Math.round(r.distance), duration: Math.round(r.duration), coords: [from, ...r.coords, to] };
  if (walkCache.size > 5000) walkCache.clear();
  walkCache.set(k, path);
  return { ...path, routed: true };
}

// ---------------------------------------------------------------- transit walks

/**
 * Replace the timetable router's straight-line walks with street paths. The ride
 * times stay as scheduled; the first walk starts earlier and the last one ends later
 * if the real path is longer. A change whose real walk does not fit before the next
 * departure is flagged `tight`.
 */
export async function routeTransitWalks(t: TransitResult): Promise<TransitResult> {
  const paths = await Promise.all(t.legs.map((l) => (l.kind === "walk" ? walkPath(l.from, l.to) : null)));
  const legs: TransitLeg[] = t.legs.map((l, i) => {
    const p = paths[i];
    if (l.kind !== "walk" || !p) return l;
    const leg: WalkLeg = { ...l, distance: p.distance, geometry: p.coords };
    if (i === 0) leg.start = l.end - p.duration;
    else {
      leg.end = l.start + p.duration;
      const next = t.legs[i + 1];
      if (next?.kind === "ride" && leg.end > next.dep) leg.tight = true;
    }
    return leg;
  });
  const first = legs[0];
  const last = legs[legs.length - 1];
  const leave = first.kind === "walk" ? first.start : first.dep;
  const arrive = last.kind === "walk" ? last.end : last.arr;
  return {
    ...t,
    legs,
    leave,
    arrive,
    duration: arrive - leave,
    walkDistance: legs.reduce((a, l) => a + (l.kind === "walk" ? l.distance : 0), 0),
  };
}
