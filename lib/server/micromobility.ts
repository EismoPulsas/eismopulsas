import "server-only";
import { haversine, type LatLng } from "../geo";
import type { BikeshareResult, ScooterResult } from "../plan-types";
import { bikeStations, type BikeStation } from "./bikeshare";
import type { OsrmRoute } from "./osrm";
import { nearestScooter, type Fleet } from "./scooters";
import { bikeRoute, walkPath } from "./streets";

// Shared bikes and e-scooters.
//
// Cyclocity Vilnius (JCDecaux) publishes an official, live GBFS feed: stations,
// bikes and free docks. Bolt and other scooter operators publish no open feed
// for Lithuania (Bolt's public GBFS covers only a handful of cities abroad), so
// scooters are an estimate: typical speed, time to find one, typical price.

const RIDE_SPEED = 16 / 3.6;
const SCOOTER_SPEED = 17 / 3.6; // 25 km/h cap, crossings and pavements in between
const MAX_WALK = 900;

/** The system runs April–October (system_information.opening_hours). */
const inSeason = (date: string) => {
  const m = +date.slice(5, 7);
  return m >= 4 && m <= 10;
};

/** A straight-line stand-in when street routing is unavailable (≈ street distance × 1.3). */
export function straightRoute(from: LatLng, to: LatLng, speed: number): OsrmRoute {
  const distance = haversine(from, to) * 1.3;
  return { distance, duration: distance / speed, coords: [from, to], segDurations: [] };
}

/** `estimate`: without a street route, ride along a straight-line estimate instead of giving up. */
export async function planBikeshare(
  from: LatLng,
  to: LatLng,
  date: string,
  isNow: boolean,
  estimate = false,
  /** false: skip street routing for the walks (car + bike combinations try many hubs). */
  streets = true,
): Promise<{ result: BikeshareResult | null; note: string | null }> {
  let stations: BikeStation[];
  try {
    stations = await bikeStations();
  } catch (err) {
    console.error("Cyclocity GBFS unavailable:", err);
    return { result: null, note: null };
  }
  if (!stations.length) return { result: null, note: null };
  const near = (p: LatLng, ok: (s: BikeStation) => boolean) =>
    stations
      .filter((s) => s.open && ok(s))
      .map((s) => ({ s, d: haversine(p, s.pos) }))
      .filter((x) => x.d <= MAX_WALK)
      .sort((a, b) => a.d - b.d)[0];
  // Nothing near either end: the trip is simply outside the system's area.
  const anyA = near(from, () => true);
  const anyB = near(to, () => true);
  if (!anyA || !anyB) return { result: null, note: null };
  if (!inSeason(date)) return { result: null, note: "Cyclocity dviračiai veikia balandžio–spalio mėn." };

  // Live counts only matter when leaving now; for later trips any station will do.
  const a = isNow ? near(from, (s) => s.bikes > 0) : anyA;
  const b = isNow ? near(to, (s) => s.docks > 0) : anyB;
  if (!a || !b) return { result: null, note: !a ? "Šalia A dabar nėra laisvų Cyclocity dviračių." : "Šalia B dabar nėra laisvų Cyclocity vietų." };
  if (a.s.id === b.s.id) return { result: null, note: null };

  const straightWalk = (p: LatLng, q: LatLng) => {
    const d = Math.round(haversine(p, q) * 1.3);
    return Promise.resolve({ distance: d, duration: Math.round(d / 1.25), coords: [p, q] as LatLng[], routed: false });
  };
  const walk = streets ? walkPath : straightWalk;
  const [routed, walkA, walkB] = await Promise.all([bikeRoute(a.s.pos, b.s.pos), walk(from, a.s.pos), walk(b.s.pos, to)]);
  const ride = routed ?? (estimate ? straightRoute(a.s.pos, b.s.pos, RIDE_SPEED) : null);
  if (!ride) return { result: null, note: null };
  const rideTime = Math.max(ride.duration, ride.distance / RIDE_SPEED);
  return {
    result: {
      system: "Cyclocity Vilnius",
      from: { name: a.s.name, pos: a.s.pos, bikes: a.s.bikes },
      to: { name: b.s.name, pos: b.s.pos, docks: b.s.docks },
      walkTo: walkA.distance,
      walkFrom: walkB.distance,
      walkToGeometry: walkA.coords,
      walkFromGeometry: walkB.coords,
      ride: Math.round(ride.distance),
      rideDuration: Math.round(rideTime),
      // Walk, take a bike (1 min), ride, dock it (1 min), walk.
      duration: Math.round(walkA.duration + 60 + rideTime + 60 + walkB.duration),
      geometry: ride.coords,
      live: isNow,
      updated: null,
    },
    note: null,
  };
}

// Towns where shared e-scooters (Bolt and others) operate, roughly.
const SCOOTER_TOWNS: { name: string; c: LatLng; r: number }[] = [
  { name: "Vilnius", c: [54.6872, 25.2797], r: 12000 },
  { name: "Kaunas", c: [54.8985, 23.9036], r: 10000 },
  { name: "Klaipėda", c: [55.7033, 21.1443], r: 9000 },
  { name: "Šiauliai", c: [55.9349, 23.3137], r: 6000 },
  { name: "Panevėžys", c: [55.7348, 24.3575], r: 6000 },
  { name: "Palanga", c: [55.9175, 21.0686], r: 5000 },
  { name: "Alytus", c: [54.3963, 24.0459], r: 5000 },
  { name: "Marijampolė", c: [54.5593, 23.354], r: 4000 },
  { name: "Druskininkai", c: [54.0167, 23.9667], r: 4000 },
];

/** `maxWalk`: the farthest (straight-line metres) a known scooter may be from `from`. */
export async function estimateScooter(from: LatLng, to: LatLng, bike: OsrmRoute | null, fleet: Fleet, maxWalk = 600): Promise<ScooterResult | null> {
  if (!bike) return null;

  if (fleet.source !== "none") {
    // Known fleet: walk to the nearest free scooter, unlock (30 s), ride from there, park (1 min).
    const v = nearestScooter(fleet, from, maxWalk);
    if (!v) return null;
    const [walk, ride] = await Promise.all([walkPath(from, v.pos), v.distance > 100 ? bikeRoute(v.pos, to) : bike]);
    const r = ride ?? bike;
    const rideDuration = Math.round(r.distance / SCOOTER_SPEED);
    return {
      distance: Math.round(r.distance),
      rideDuration,
      geometry: r.coords,
      operator: fleet.operator,
      city: null,
      source: fleet.source,
      vehicle: { id: v.id, pos: v.pos, battery: v.battery, walk: walk.distance, walkGeometry: walk.coords },
      duration: walk.duration + 30 + rideDuration + 60,
    };
  }

  const town = SCOOTER_TOWNS.find((t) => haversine(from, t.c) <= t.r && haversine(to, t.c) <= t.r);
  if (!town) return null;
  const rideDuration = Math.round(bike.distance / SCOOTER_SPEED);
  // ≈ 3 min to walk to the nearest scooter and unlock it, 1 min to park.
  return {
    distance: Math.round(bike.distance),
    rideDuration,
    geometry: bike.coords,
    operator: fleet.operator,
    city: town.name,
    source: "estimate",
    vehicle: null,
    duration: 180 + rideDuration + 60,
  };
}
