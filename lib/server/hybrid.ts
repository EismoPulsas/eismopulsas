import "server-only";
import fs from "node:fs";
import path from "node:path";
import { Grid, haversine, inPolygon, simplify, type LatLng } from "../geo";
import type { departure } from "../departure";
import { evalParkingAt, MINUTE_EUR, SWITCH_PENALTY_SEC, CHARGE_BONUS_SEC, type Settings } from "../metrics";
import type { HybridOption, HybridResponse, HybridSecond, LiveLot, ParkingOption, ScooterResult, SecondKind } from "../plan-types";
import { bikeStations, type BikeStation } from "./bikeshare";
import { estimateScooter, planBikeshare, straightRoute } from "./micromobility";
import { osrmRoute, osrmTable } from "./osrm";
import { hubsAround } from "./parking";
import { nearestScooter, scooterFleet, type Fleet } from "./scooters";
import { planTransit, resolveDay, stopNear } from "./transit";

// Car + second leg: drive part of the way, leave the car where it is cheap (P+R, a car
// park, free street parking) or where it can charge, and continue by public transport,
// Cyclocity or scooter. The hub must sit next to the next vehicle: a stop, a Cyclocity
// station or a scooter spot (JUDU) or scooter.
//
// Cost of one request: 1 OSRM table call for the drive to every candidate hub, ≤ 4 OSRM
// bike routes, ≤ 5 OSRM car routes for the map. No TomTom calls: the hub drive is OSRM
// scaled by the TomTom A → B time the planner already has (`carSec`).

type Departure = ReturnType<typeof departure>;

const MIN_STRAIGHT = 1500; // shorter trips: just drive or walk
const ACCESS = { transit: 400, bikeshare: 250, scooter: 200 } satisfies Record<SecondKind, number>;
const WALK = 1.25; // m/s
const DETOUR = 1.3;
/** Candidates kept per kind after the rough estimate, then after the real drive times. */
const ROUGH_KEEP = 8;
const EXACT_KEEP = { transit: 3, bikeshare: 2, scooter: 2 } satisfies Record<SecondKind, number>;
const MAX_OPTIONS = 5;
const PER_KIND = 2;

// ---------------------------------------------------------------- JUDU scooter spots

type Spot = { pos: LatLng; addr: string | null };
let spots: { grid: Grid<Spot>; oldTown: LatLng[][][] } | null = null;

function scooterSpots() {
  if (spots) return spots;
  const grid = new Grid<Spot>(0.005);
  let oldTown: LatLng[][][] = [];
  try {
    const f = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "scooter-spots.json"), "utf8")) as { spots: Spot[]; oldTown: LatLng[][][] };
    for (const s of f.spots) grid.add(s.pos, s);
    oldTown = f.oldTown;
  } catch {}
  spots = { grid, oldTown };
  return spots;
}

function spotNear(p: LatLng, radius: number): (Spot & { distance: number }) | null {
  let best: (Spot & { distance: number }) | null = null;
  for (const s of scooterSpots().grid.near(p, radius)) {
    const distance = haversine(p, s.pos);
    if (distance <= radius && (!best || distance < best.distance)) best = { ...s, distance };
  }
  return best;
}

/** Vilnius Old Town: shared scooters may only be left at the marked spots. */
const inOldTown = (p: LatLng) => scooterSpots().oldTown.some((rings) => inPolygon(p, rings));

// ---------------------------------------------------------------- search

type Candidate = { hub: ParkingOption; kind: SecondKind; access: number; carSec: number; carDist: number | null; score: number };

const stationNear = (stations: BikeStation[], p: LatLng, isNow: boolean) =>
  stations
    .filter((s) => s.open && (!isNow || s.bikes > 0))
    .map((s) => ({ s, d: haversine(p, s.pos) }))
    .filter((x) => x.d <= ACCESS.bikeshare)
    .sort((a, b) => a.d - b.d)[0] ?? null;

/** Rough seconds from leaving the hub to B, before routing it. */
function secondGuess(kind: SecondKind, access: number, hubToB: number): number {
  const d = hubToB * DETOUR;
  if (kind === "transit") return (access * DETOUR) / WALK + 300 + d / (20 / 3.6);
  if (kind === "bikeshare") return (access * DETOUR) / WALK + 120 + d / (16 / 3.6) + 180;
  return (access * DETOUR) / WALK + 90 + d / (17 / 3.6);
}

/** Money of the second leg there and back, roughly (P+R includes Vilnius public transport). */
function secondPriceGuess(kind: SecondKind, hub: ParkingOption, rideSec: number, s: Settings): number {
  if (kind === "transit") return hub.lot?.t.flat ? 0 : 2;
  if (kind === "bikeshare") return 0;
  return 2 * (s.scooterUnlock + Math.ceil(rideSec / 60) * s.scooterPerMin);
}

/** Lower is better: seconds, with euros converted at the user's value of time. */
function generalized(sec: number, euros: number, chargeKwh: number, s: Settings): number {
  return sec + euros * (60 / MINUTE_EUR[s.priority]) + SWITCH_PENALTY_SEC - (chargeKwh >= 10 && s.chargeWhenParked ? CHARGE_BONUS_SEC : 0);
}

export async function planHybrids(q: {
  from: LatLng;
  to: LatLng;
  depart: Departure;
  /** Driving A → B, seconds, with traffic (the planner's car leg); null = unknown. */
  carSec: number | null;
  settings: Settings;
  live: Record<string, LiveLot> | null;
}): Promise<HybridResponse> {
  const { from, to, depart, settings: s } = q;
  const straight = haversine(from, to);
  const modes = s.hybridModes;
  if (straight < MIN_STRAIGHT || !modes.length) return { options: [], trafficFactor: null, note: null };
  const ev = s.fuel === "electric" || (s.fuel === "hybrid" && s.plugIn);

  const [stations, fleet] = await Promise.all([
    modes.includes("bikeshare") ? bikeStations().catch(() => [] as BikeStation[]) : ([] as BikeStation[]),
    modes.includes("scooter") ? scooterFleet() : Promise.resolve<Fleet>({ source: "none", operator: null, updated: null, vehicles: [] }),
  ]);

  // 1. Places to leave the car, each paired with the next vehicle right next to it.
  const roughArrive = depart.sec + 120 + (q.carSec ?? straight / 8);
  const hubs = hubsAround(from, to, depart.date, roughArrive, q.live, {
    stayHours: s.parkingHours,
    ev: ev && s.chargeWhenParked,
    connectors: s.connectors,
    minDist: 600,
    maxDist: Math.min(9000, Math.max(1500, straight * 0.8)),
  });
  const rough: Candidate[] = [];
  for (const hub of hubs) {
    const park = evalParkingAt(hub, depart.date, roughArrive, s);
    if (!park.usable || park.cost == null || park.chance === "low") continue;
    const hubToB = haversine(hub.pos, to);
    const carGuess = (q.carSec ?? straight / 8) * Math.min(1, haversine(from, hub.pos) / straight) + 60;
    const access: Partial<Record<SecondKind, number>> = {};
    if (modes.includes("transit")) {
      const st = stopNear(hub.pos, ACCESS.transit);
      if (st) access.transit = st.distance;
    }
    if (modes.includes("bikeshare") && stations.length) {
      const st = stationNear(stations, hub.pos, depart.isNow);
      if (st) access.bikeshare = st.d;
    }
    if (modes.includes("scooter")) {
      const v = fleet.source !== "none" ? nearestScooter(fleet, hub.pos, 250) : null;
      const spot = spotNear(hub.pos, ACCESS.scooter);
      const d = Math.min(v?.distance ?? Infinity, spot?.distance ?? Infinity);
      if (Number.isFinite(d)) access.scooter = d;
    }
    for (const kind of Object.keys(access) as SecondKind[]) {
      const second = secondGuess(kind, access[kind]!, hubToB);
      const euros = park.cost + secondPriceGuess(kind, hub, second, s);
      rough.push({ hub, kind, access: access[kind]!, carSec: carGuess, carDist: null, score: generalized(carGuess + second, euros, park.charge?.kWh ?? 0, s) });
    }
  }
  const shortlist = (["transit", "bikeshare", "scooter"] as const).flatMap((k) => rough.filter((c) => c.kind === k).sort((a, b) => a.score - b.score).slice(0, ROUGH_KEEP));
  if (!shortlist.length) return { options: [], trafficFactor: null, note: null };

  // 2. Real drive times to every shortlisted hub in one call, scaled to the traffic on A → B.
  const uniqueHubs = [...new Map(shortlist.map((c) => [c.hub.id, c.hub])).values()];
  const table = await osrmTable(from, [to, ...uniqueHubs.map((h) => h.navigationPos ?? h.pos)]);
  let factor: number | null = null;
  if (table) {
    const ab = table.duration[0];
    factor = q.carSec && ab ? Math.min(2.5, Math.max(0.8, q.carSec / ab)) : 1.2;
    const byId = new Map(uniqueHubs.map((h, i) => [h.id, i + 1]));
    for (const c of shortlist) {
      const i = byId.get(c.hub.id)!;
      const sec = table.duration[i];
      if (sec == null) {
        c.score = Infinity;
        continue;
      }
      const old = c.carSec;
      c.carSec = sec * factor;
      c.carDist = table.distance[i];
      c.score += c.carSec - old;
    }
  }

  // 3. The real second leg for the best few of each kind.
  const { day } = resolveDay(depart.date);
  const exact = (["transit", "bikeshare", "scooter"] as const).flatMap((k) =>
    shortlist.filter((c) => c.kind === k && Number.isFinite(c.score)).sort((a, b) => a.score - b.score).slice(0, EXACT_KEEP[k]),
  );
  const built = await Promise.all(exact.map((c) => buildOption(c, q, s, fleet, day)));
  const ranked = built.filter((x): x is { option: HybridOption; score: number } => !!x).sort((a, b) => a.score - b.score);

  // 4. A varied short list: at most two per kind, never the same place twice.
  const picked: HybridOption[] = [];
  for (const { option } of ranked) {
    if (picked.length >= MAX_OPTIONS) break;
    if (picked.filter((p) => p.second.kind === option.second.kind).length >= PER_KIND) continue;
    if (picked.some((p) => p.second.kind === option.second.kind && haversine(p.hub.pos, option.hub.pos) < 300)) continue;
    picked.push(option);
  }

  // 5. The drive on the map, arriving from the parking side where that matters.
  await Promise.all(
    picked.map(async (o) => {
      const r = await osrmRoute("car", from, o.car.to, false, !!o.hub.curb);
      if (!r) return;
      o.car.geometry = simplify(r.coords, 8);
      o.car.distance = Math.round(r.distance);
    }),
  );
  return { options: picked, trafficFactor: factor, note: table ? null : `Važiavimo iki persėdimo vietos laikas apytikslis (maršrutų paslauga neatsakė).` };
}

async function buildOption(
  c: Candidate,
  q: { from: LatLng; to: LatLng; depart: Departure },
  s: Settings,
  fleet: Fleet,
  day: number,
): Promise<{ option: HybridOption; score: number } | null> {
  const { from, to, depart } = q;
  const carSec = Math.round(c.carSec);
  const parkedAt = depart.sec + 120 + carSec;
  const park = evalParkingAt(c.hub, depart.date, parkedAt, s);
  if (park.cost == null) return null;
  const leave = parkedAt + park.searchSec;
  let second: HybridSecond;
  let arrive: number;
  let walk: number;
  let extra = 0;

  if (c.kind === "transit") {
    const t = planTransit(c.hub.pos, to, day, leave);
    if (!t || !t.legs.some((l) => l.kind === "ride")) return null;
    const first = t.legs[0];
    walk = first.kind === "walk" ? first.distance : 0;
    if (walk > 700) return null; // the stop is not really at the car park
    second = { kind: "transit", transit: t };
    arrive = t.arrive;
    const rides = t.legs.filter((l) => l.kind === "ride").length;
    if (rides > 1) extra += (rides - 1) * SWITCH_PENALTY_SEC;
  } else if (c.kind === "bikeshare") {
    const { result } = await planBikeshare(c.hub.pos, to, depart.date, depart.isNow, true, false);
    if (!result || result.walkTo > 350 * DETOUR) return null;
    walk = result.walkTo;
    second = { kind: "bikeshare", bikeshare: { ...result, geometry: simplify(result.geometry, 8) } };
    arrive = leave + result.duration;
  } else {
    // Old Town: the ride ends at the nearest marked spot, then a short walk.
    const end = inOldTown(to) ? spotNear(to, 400) : null;
    const target = end?.pos ?? to;
    const ride = (await osrmRoute("bike", c.hub.pos, target)) ?? straightRoute(c.hub.pos, target, 16 / 3.6);
    const sc: ScooterResult | null = await estimateScooter(c.hub.pos, target, ride, fleet);
    if (!sc) return null;
    const endWalk = end ? Math.round(end.distance * DETOUR) : 0;
    walk = sc.vehicle?.walk ?? Math.round(c.access * DETOUR);
    second = {
      kind: "scooter",
      scooter: { ...sc, geometry: simplify(sc.geometry, 8), duration: sc.duration + Math.round(endWalk / WALK), endSpot: end ? { pos: end.pos, addr: end.addr, walk: endWalk } : null },
    };
    arrive = leave + sc.duration + Math.round(endWalk / WALK);
  }

  // Unnamed car parks and street pieces are easier to find by what is next to them.
  const landmark =
    second.kind === "transit" ? second.transit.legs.find((l) => l.kind === "ride")?.from.name
    : second.kind === "bikeshare" ? second.bikeshare.from.name
    : (spotNear(c.hub.pos, ACCESS.scooter)?.addr ?? stopNear(c.hub.pos, 400)?.name ?? null);
  const generic = /^(Aikštelė|Gatvė)( \(|$)/.test(c.hub.name);
  const name = generic && landmark ? `${c.hub.kind === "lot" ? "Aikštelė" : "Gatvėje"} prie „${landmark}“` : c.hub.name;
  const hub: ParkingOption = { ...c.hub, name, walk: Math.round(walk) };
  const hubPos = hub.navigationPos ?? hub.pos;
  const option: HybridOption = {
    id: `${c.kind}:${hub.id}`,
    hub,
    car: { from, to: hubPos, duration: carSec, distance: Math.round(c.carDist ?? haversine(from, hubPos) * DETOUR), geometry: [from, hubPos], estimated: true },
    parkedAt,
    searchSec: park.searchSec,
    second,
    arrive,
    duration: arrive - depart.sec,
  };
  const rideSec = second.kind === "scooter" ? second.scooter.rideDuration : second.kind === "bikeshare" ? second.bikeshare.rideDuration : 0;
  const euros = park.cost + secondPriceGuess(c.kind, hub, rideSec, s);
  return { option, score: generalized(option.duration + extra, euros, park.charge?.kWh ?? 0, s) };
}
