import "server-only";
import { haversine, type LatLng } from "../geo";
import type { BikeshareResult, ScooterResult } from "../plan-types";
import { osrmRoute, type OsrmRoute } from "./osrm";

// Shared bikes and e-scooters.
//
// Cyclocity Vilnius (JCDecaux) publishes an official, live GBFS feed: stations,
// bikes and free docks. Bolt and other scooter operators publish no open feed
// for Lithuania (Bolt's public GBFS covers only a handful of cities abroad), so
// scooters are an estimate: typical speed, time to find one, typical price.

const GBFS = "https://api.cyclocity.fr/contracts/vilnius/gbfs/v3";
const WALK = 1.25 / 1.3; // m/s along streets ≈ straight line / 1.3
const RIDE_SPEED = 16 / 3.6;
const SCOOTER_SPEED = 17 / 3.6; // 25 km/h cap, crossings and pavements in between
const MAX_WALK = 900;

export type Station = { id: string; name: string; pos: LatLng; capacity: number; bikes: number | null; docks: number | null; renting: boolean };

let info: { at: number; stations: Map<string, Omit<Station, "bikes" | "docks" | "renting">> } | null = null;
let status: { at: number; updated: string | null; byId: Map<string, { bikes: number; docks: number; renting: boolean; returning: boolean }> } | null = null;

async function getJson(url: string) {
  const res = await fetch(url, { headers: { "User-Agent": "EismoPulsas/0.2" }, signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json();
}

type Text = { text: string; language: string }[] | string;
const textOf = (t: Text) => (typeof t === "string" ? t : (t.find((x) => x.language === "lt") ?? t[0])?.text ?? "");
// "K. SIRVYDO SKVERAS" -> "K. Sirvydo skveras": capitalise names, keep common nouns lower-case.
const COMMON = new Set(
  "skveras aikštė gatvė stotis parkas turgus turgavietė tiltas ir biblioteka gimnazija teatras stadionas universitetas centras žiedas rūmai kalnas miestas miestelis vartai".split(" "),
);
const tidy = (s: string) =>
  s !== s.toUpperCase()
    ? s
    : s
        .toLowerCase()
        .split(" ")
        .map((w, i) => (i > 0 && COMMON.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
        .join(" ");

/** All Cyclocity stations with live availability (stale data is kept if the feed hiccups). */
export async function cyclocityStations(): Promise<{ stations: Station[]; updated: string | null }> {
  try {
    if (!info || Date.now() - info.at > 3600_000) {
      const d = await getJson(`${GBFS}/station_information.json`);
      const stations = new Map<string, Omit<Station, "bikes" | "docks" | "renting">>();
      for (const s of d.data.stations as { station_id: string; name: Text; lat: number; lon: number; capacity: number }[])
        stations.set(s.station_id, { id: s.station_id, name: tidy(textOf(s.name)), pos: [s.lat, s.lon], capacity: s.capacity });
      info = { at: Date.now(), stations };
    }
    if (!status || Date.now() - status.at > 60_000) {
      const d = await getJson(`${GBFS}/station_status.json`);
      const byId = new Map<string, { bikes: number; docks: number; renting: boolean; returning: boolean }>();
      for (const s of d.data.stations as { station_id: string; num_vehicles_available: number; num_docks_available: number; is_renting: boolean; is_returning: boolean; is_installed: boolean }[])
        byId.set(s.station_id, { bikes: s.num_vehicles_available, docks: s.num_docks_available, renting: s.is_installed && s.is_renting, returning: s.is_installed && s.is_returning });
      status = { at: Date.now(), updated: d.last_updated ?? null, byId };
    }
  } catch (err) {
    console.error("Cyclocity GBFS unavailable:", err);
  }
  if (!info) return { stations: [], updated: null };
  const stations = [...info.stations.values()].map((s) => {
    const st = status?.byId.get(s.id);
    return { ...s, bikes: st?.bikes ?? null, docks: st?.docks ?? null, renting: st ? st.renting && st.returning : true };
  });
  return { stations, updated: status?.updated ?? null };
}

/** The system runs April–October (system_information.opening_hours). */
const inSeason = (date: string) => {
  const m = +date.slice(5, 7);
  return m >= 4 && m <= 10;
};

export async function planBikeshare(
  from: LatLng,
  to: LatLng,
  date: string,
  isNow: boolean,
): Promise<{ result: BikeshareResult | null; note: string | null }> {
  const { stations, updated } = await cyclocityStations();
  if (!stations.length) return { result: null, note: null };
  const near = (p: LatLng, ok: (s: Station) => boolean) =>
    stations
      .filter((s) => s.renting && ok(s))
      .map((s) => ({ s, d: haversine(p, s.pos) }))
      .filter((x) => x.d <= MAX_WALK)
      .sort((a, b) => a.d - b.d)[0];
  // Nothing near either end: the trip is simply outside the system's area.
  const anyA = near(from, () => true);
  const anyB = near(to, () => true);
  if (!anyA || !anyB) return { result: null, note: null };
  if (!inSeason(date)) return { result: null, note: "Cyclocity dviračiai veikia balandžio–spalio mėn." };

  // Live counts only matter when leaving now; for later trips any station will do.
  const a = isNow ? near(from, (s) => (s.bikes ?? 1) > 0) : anyA;
  const b = isNow ? near(to, (s) => (s.docks ?? 1) > 0) : anyB;
  if (!a || !b) return { result: null, note: !a ? "Šalia A dabar nėra laisvų Cyclocity dviračių." : "Šalia B dabar nėra laisvų Cyclocity vietų." };
  if (a.s.id === b.s.id) return { result: null, note: null };

  const ride = await osrmRoute("bike", a.s.pos, b.s.pos);
  if (!ride) return { result: null, note: null };
  const walkTo = Math.round(a.d * 1.3);
  const walkFrom = Math.round(b.d * 1.3);
  const rideTime = Math.max(ride.duration, ride.distance / RIDE_SPEED);
  return {
    result: {
      system: "Cyclocity Vilnius",
      from: { name: a.s.name, pos: a.s.pos, bikes: a.s.bikes },
      to: { name: b.s.name, pos: b.s.pos, docks: b.s.docks },
      walkTo,
      walkFrom,
      ride: Math.round(ride.distance),
      rideDuration: Math.round(rideTime),
      // Walk, take a bike (1 min), ride, dock it (1 min), walk.
      duration: Math.round(a.d / WALK + 60 + rideTime + 60 + b.d / WALK),
      geometry: ride.coords,
      live: isNow && a.s.bikes !== null,
      updated,
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

export function estimateScooter(from: LatLng, to: LatLng, bike: OsrmRoute | null): ScooterResult | null {
  if (!bike) return null;
  const town = SCOOTER_TOWNS.find((t) => haversine(from, t.c) <= t.r && haversine(to, t.c) <= t.r);
  if (!town) return null;
  const rideDuration = Math.round(bike.distance / SCOOTER_SPEED);
  return {
    city: town.name,
    distance: Math.round(bike.distance),
    rideDuration,
    // ≈ 3 min to walk to the nearest scooter and unlock it, 1 min to park.
    duration: 180 + rideDuration + 60,
    geometry: bike.coords,
  };
}
