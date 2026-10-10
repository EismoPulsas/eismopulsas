import "server-only";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { Grid, decodePolyline, haversine, lineLength, type LatLng } from "../geo";
import type { FareKey, RideLeg, TransitLeg, TransitResult } from "../plan-types";
import { laneMetersAlong } from "./lanes";

// Public transport routing over the national GTFS (scripts/build-data.mjs), with
// RAPTOR (Delling, Pajor & Werneck 2012): round k finds the earliest arrival at
// every stop using at most k vehicles.

const WALK_SPEED = 1.25; // m/s ≈ 4.5 km/h
const DETOUR = 1.3; // street distance ≈ straight line × 1.3
const ACCESS_RADIUS = 1000;
const ACCESS_RADIUS_RURAL = 3000;
const TRANSFER_RADIUS = 300;
const MIN_CHANGE = 60; // seconds to change vehicles
const MAX_RIDES = 5;

type Raw = {
  base: string;
  days: number;
  built: string;
  agencies: { name: string; fare: FareKey }[];
  routes: [string, string, number, string, number][];
  stops: { name: string[]; lat: number[]; lng: number[] };
  services: string[];
  shapes: string[];
  patterns: { r: number; h: string; s: number[]; sh: number; c: number[] | null; pd: number[][]; pa: (number[] | 0)[]; t: number[] }[];
};

type Pattern = {
  route: number;
  headsign: string;
  stops: Int32Array;
  shape: number;
  cut: number[] | null;
  dep: Int32Array[];
  arr: Int32Array[];
  start: Int32Array;
  prof: Uint16Array;
  svc: Uint16Array;
  /** Per position: max / min departure offset over all timing profiles. */
  maxDep: Int32Array;
  minDep: Int32Array;
};

type Net = {
  raw: Raw;
  base: number; // UTC ms of window day 0
  lat: Float64Array;
  lng: Float64Array;
  grid: Grid<number>;
  patterns: Pattern[];
  stopPatterns: [number, number][][];
  services: Uint8Array[]; // per service: active flag per window day
  transfers: Map<number, [number, number][]>;
  shapes: (LatLng[] | undefined)[];
};

let net: Net | null = null;

function load(): Net {
  if (net) return net;
  const file = path.join(process.cwd(), "data", "transit.json.gz");
  const raw: Raw = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString("utf8"));
  const n = raw.stops.name.length;
  const lat = new Float64Array(n);
  const lng = new Float64Array(n);
  const grid = new Grid<number>(0.005);
  for (let i = 0; i < n; i++) {
    lat[i] = raw.stops.lat[i] / 1e5;
    lng[i] = raw.stops.lng[i] / 1e5;
    grid.add([lat[i], lng[i]], i);
  }
  const stopPatterns: [number, number][][] = Array.from({ length: n }, () => []);
  const patterns: Pattern[] = raw.patterns.map((p, pi) => {
    const len = p.s.length;
    const dep = p.pd.map((a) => Int32Array.from(a));
    const arr = p.pa.map((a, i) => (a ? Int32Array.from(a) : dep[i]));
    const maxDep = new Int32Array(len);
    const minDep = new Int32Array(len).fill(2 ** 30);
    for (const d of dep)
      for (let i = 0; i < len; i++) {
        if (d[i] > maxDep[i]) maxDep[i] = d[i];
        if (d[i] < minDep[i]) minDep[i] = d[i];
      }
    const m = p.t.length / 3;
    const start = new Int32Array(m);
    const prof = new Uint16Array(m);
    const svc = new Uint16Array(m);
    for (let k = 0; k < m; k++) {
      start[k] = p.t[3 * k];
      prof[k] = p.t[3 * k + 1];
      svc[k] = p.t[3 * k + 2];
    }
    p.s.forEach((s, pos) => {
      // A stop visited twice (loops) keeps its first position only.
      if (!stopPatterns[s].some(([q]) => q === pi)) stopPatterns[s].push([pi, pos]);
    });
    return { route: p.r, headsign: p.h, stops: Int32Array.from(p.s), shape: p.sh, cut: p.c, dep, arr, start, prof, svc, maxDep, minDep };
  });
  const services = raw.services.map((bits) => Uint8Array.from(bits, (c) => (c === "1" ? 1 : 0)));
  net = {
    raw,
    base: Date.parse(`${raw.base}T00:00:00Z`),
    lat,
    lng,
    grid,
    patterns,
    stopPatterns,
    services,
    transfers: new Map(),
    shapes: [],
  };
  return net;
}

const stopPos = (N: Net, s: number): LatLng => [N.lat[s], N.lng[s]];
const walkSec = (meters: number) => Math.round((meters * DETOUR) / WALK_SPEED);

function transfersOf(N: Net, s: number): [number, number][] {
  let t = N.transfers.get(s);
  if (!t) {
    t = [];
    const p = stopPos(N, s);
    for (const o of N.grid.near(p, TRANSFER_RADIUS)) {
      if (o === s) continue;
      const d = haversine(p, stopPos(N, o));
      if (d <= TRANSFER_RADIUS) t.push([o, walkSec(d)]);
    }
    N.transfers.set(s, t);
  }
  return t;
}

function nearStops(N: Net, p: LatLng): [number, number][] {
  for (const radius of [ACCESS_RADIUS, ACCESS_RADIUS_RURAL]) {
    const out: [number, number][] = [];
    for (const s of N.grid.near(p, radius)) {
      const d = haversine(p, stopPos(N, s));
      if (d <= radius) out.push([s, d]);
    }
    if (out.length >= 2 || radius === ACCESS_RADIUS_RURAL) return out;
  }
  return [];
}

/** The service day as a window index; dates outside the window borrow the same weekday. */
export function resolveDay(date: string): { day: number; shifted: boolean } {
  const N = load();
  const t = Date.parse(`${date}T00:00:00Z`);
  let day = Math.round((t - N.base) / 86400000);
  if (day >= 0 && day < N.raw.days) return { day, shifted: false };
  const wd = new Date(t).getUTCDay();
  const baseWd = new Date(N.base).getUTCDay();
  day = (wd - baseWd + 7) % 7;
  return { day, shifted: true };
}

export function timetableInfo() {
  const N = load();
  const end = new Date(N.base + (N.raw.days - 1) * 86400000).toISOString().slice(0, 10);
  return { built: N.raw.built.slice(0, 10), window: `${N.raw.base} – ${end}` };
}

type Label = { ride: true; pattern: number; trip: number; shift: number; board: number; alight: number } | { ride: false; from: number };

type DayCtx = { shift: number; active: Uint8Array }[];

function dayContext(N: Net, day: number): DayCtx {
  const act = (d: number) => {
    const a = new Uint8Array(N.services.length);
    N.services.forEach((bits, i) => (a[i] = bits[d]));
    return a;
  };
  const ctx: DayCtx = [{ shift: 0, active: act(day) }];
  // Trips of the previous service day still running after midnight (times ≥ 24:00).
  ctx.push({ shift: -86400, active: act(day > 0 ? day - 1 : (day + 6) % N.raw.days) });
  return ctx;
}

/** Earliest trip of pattern p departing position i at or after tau. */
function earliestTrip(p: Pattern, i: number, tau: number, ctx: DayCtx) {
  let best: { trip: number; dep: number; shift: number } | null = null;
  for (const { shift, active } of ctx) {
    const target = tau - shift;
    // Binary search the first trip that could depart late enough.
    let lo = 0;
    let hi = p.start.length;
    const from = target - p.maxDep[i];
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (p.start[mid] < from) lo = mid + 1;
      else hi = mid;
    }
    for (let k = lo; k < p.start.length; k++) {
      if (best && p.start[k] + p.minDep[i] + shift >= best.dep) break;
      if (!active[p.svc[k]]) continue;
      const dep = p.start[k] + p.dep[p.prof[k]][i];
      if (dep < target) continue;
      if (!best || dep + shift < best.dep) best = { trip: k, dep: dep + shift, shift };
    }
  }
  return best;
}

type Search = {
  arrival: number;
  rides: number;
  legs: TransitLeg[];
};

function raptor(N: Net, from: LatLng, to: LatLng, t0: number, ctx: DayCtx): Search[] {
  const n = N.lat.length;
  const access = nearStops(N, from);
  const egress = new Map(nearStops(N, to).map(([s, d]) => [s, d]));
  if (!access.length || !egress.size) return [];

  const labels: Float64Array[] = [new Float64Array(n).fill(Infinity)];
  const parents: (Label | undefined)[][] = [[]];
  const best = new Float64Array(n).fill(Infinity);
  let marked = new Set<number>();
  for (const [s, d] of access) {
    const t = t0 + walkSec(d);
    labels[0][s] = t;
    best[s] = t;
    marked.add(s);
  }

  let bestTarget = Infinity;
  const results: { round: number; stop: number; arrival: number }[] = [];

  for (let k = 1; k <= MAX_RIDES && marked.size; k++) {
    const prev = labels[k - 1];
    const cur = new Float64Array(n).fill(Infinity);
    const par: (Label | undefined)[] = [];
    labels.push(cur);
    parents.push(par);

    // Patterns serving marked stops, scanned from the earliest marked position.
    const queue = new Map<number, number>();
    for (const s of marked)
      for (const [pi, pos] of N.stopPatterns[s]) {
        const q = queue.get(pi);
        if (q === undefined || pos < q) queue.set(pi, pos);
      }
    const reached = new Set<number>();

    for (const [pi, startPos] of queue) {
      const p = N.patterns[pi];
      let trip: { trip: number; dep: number; shift: number } | null = null;
      let board = -1;
      for (let i = startPos; i < p.stops.length; i++) {
        const s = p.stops[i];
        if (trip) {
          const arr = p.start[trip.trip] + p.arr[p.prof[trip.trip]][i] + trip.shift;
          if (arr < Math.min(best[s], bestTarget)) {
            cur[s] = arr;
            best[s] = arr;
            par[s] = { ride: true, pattern: pi, trip: trip.trip, shift: trip.shift, board, alight: i };
            reached.add(s);
          }
        }
        const ready = prev[s] + (k > 1 ? MIN_CHANGE : 0);
        if (prev[s] < Infinity) {
          const tripDep = trip ? p.start[trip.trip] + p.dep[p.prof[trip.trip]][i] + trip.shift : Infinity;
          if (ready <= tripDep) {
            const t = earliestTrip(p, i, ready, ctx);
            if (t && t.dep < tripDep) {
              trip = t;
              board = i;
            }
          }
        }
      }
    }

    // Short walks between nearby stops (only from stops reached by a vehicle, so
    // an itinerary never chains two walks).
    for (const s of [...reached]) {
      if (!par[s]?.ride) continue;
      for (const [o, w] of transfersOf(N, s)) {
        const t = cur[s] + w;
        if (t < Math.min(best[o], bestTarget) && t < cur[o]) {
          cur[o] = t;
          best[o] = t;
          par[o] = { ride: false, from: s };
          reached.add(o);
        }
      }
    }

    // Destination reached this round?
    let roundBest: { stop: number; arrival: number } | null = null;
    for (const [s, d] of egress) {
      if (cur[s] === Infinity) continue;
      const t = cur[s] + walkSec(d);
      if (!roundBest || t < roundBest.arrival) roundBest = { stop: s, arrival: t };
    }
    if (roundBest && roundBest.arrival < bestTarget) {
      bestTarget = roundBest.arrival;
      results.push({ round: k, ...roundBest });
    }
    marked = reached;
  }

  return results.map(({ round, stop, arrival }) => {
    const legs: TransitLeg[] = [];
    const end = egress.get(stop)!;
    legs.push({
      kind: "walk",
      from: stopPos(N, stop),
      to,
      toName: null,
      distance: Math.round(end * DETOUR),
      start: labels[round][stop],
      end: arrival,
    });
    let s = stop;
    for (let k = round; k > 0; k--) {
      let lab = parents[k][s]!;
      if (!lab.ride) {
        const from = lab.from;
        legs.push({
          kind: "walk",
          from: stopPos(N, from),
          to: stopPos(N, s),
          toName: N.raw.stops.name[s],
          distance: Math.round(haversine(stopPos(N, from), stopPos(N, s)) * DETOUR),
          start: labels[k][from],
          end: labels[k][s],
        });
        s = from;
        lab = parents[k][s]!;
      }
      if (!lab.ride) break;
      legs.push(rideLeg(N, lab));
      s = N.patterns[lab.pattern].stops[lab.board];
    }
    const first = s;
    const firstDist = access.find(([a]) => a === first)?.[1] ?? 0;
    // Leave just in time for the first vehicle.
    const leave = (legs.at(-1) as RideLeg).dep - walkSec(firstDist);
    legs.push({
      kind: "walk",
      from,
      to: stopPos(N, first),
      toName: N.raw.stops.name[first],
      distance: Math.round(firstDist * DETOUR),
      start: leave,
      end: leave + walkSec(firstDist),
    });
    legs.reverse();
    return { arrival, rides: round, legs: legs.filter((l) => l.kind === "ride" || l.distance > 0) };
  });
}

function shapeOf(N: Net, i: number): LatLng[] | undefined {
  if (i < 0) return undefined;
  return (N.shapes[i] ??= decodePolyline(N.raw.shapes[i]));
}

/** Closest point to p on segments lo…hi-1 of a line (segment i runs from vertex i to i+1). */
function project(line: LatLng[], p: LatLng, lo: number, hi: number): { seg: number; point: LatLng } {
  const kx = Math.cos((p[0] * Math.PI) / 180);
  let best = { seg: lo, point: line[lo], d: Infinity };
  for (let i = lo; i < Math.max(hi, lo + 1) && i + 1 < line.length; i++) {
    const [ay, ax] = line[i];
    const [by, bx] = line[i + 1];
    const dx = (bx - ax) * kx;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? (((p[1] - ax) * kx) * dx + (p[0] - ay) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const point: LatLng = [ay + t * (by - ay), ax + t * (bx - ax)];
    const d = ((point[0] - p[0]) ** 2) + ((point[1] - p[1]) * kx) ** 2;
    if (d < best.d) best = { seg: i, point, d };
  }
  return { seg: best.seg, point: best.point };
}

function rideLeg(N: Net, lab: Extract<Label, { ride: true }>): RideLeg {
  const p = N.patterns[lab.pattern];
  const r = N.raw.routes[p.route];
  const agency = N.raw.agencies[r[4]];
  const fromStop = p.stops[lab.board];
  const toStop = p.stops[lab.alight];
  const prof = p.prof[lab.trip];
  const startT = p.start[lab.trip] + lab.shift;
  const shape = shapeOf(N, p.shape);
  let geometry: LatLng[];
  if (shape && p.cut) {
    // Cut the line exactly where the stops project onto it. Cutting at the nearest
    // vertex can overshoot a stop and draw a spur out and back.
    const cb = p.cut[lab.board];
    const ca = p.cut[lab.alight];
    const a = project(shape, stopPos(N, fromStop), Math.max(0, cb - 2), Math.min(shape.length - 1, cb + 2));
    const b = project(shape, stopPos(N, toStop), Math.max(a.seg, ca - 2), Math.min(shape.length - 1, ca + 2));
    geometry = b.seg > a.seg ? [a.point, ...shape.slice(a.seg + 1, b.seg + 1), b.point] : [a.point, b.point];
  } else {
    geometry = [];
    for (let i = lab.board; i <= lab.alight; i++) geometry.push(stopPos(N, p.stops[i]));
  }
  return {
    kind: "ride",
    route: { short: r[0], long: r[1], type: r[2], color: r[3], agency: agency.name, fare: agency.fare },
    headsign: p.headsign,
    from: { name: N.raw.stops.name[fromStop], pos: stopPos(N, fromStop) },
    to: { name: N.raw.stops.name[toStop], pos: stopPos(N, toStop) },
    dep: startT + p.dep[prof][lab.board],
    arr: startT + p.arr[prof][lab.alight],
    stops: lab.alight - lab.board,
    distance: Math.round(lineLength(geometry)),
    laneMeters: Math.round(laneMetersAlong(geometry)),
    geometry,
  };
}

function summarize(s: Search): TransitResult {
  const rides = s.legs.filter((l): l is RideLeg => l.kind === "ride");
  const leave = s.legs[0].kind === "walk" ? s.legs[0].start : rides[0].dep;
  return {
    legs: s.legs,
    leave,
    arrive: s.arrival,
    duration: s.arrival - leave,
    walkDistance: s.legs.reduce((a, l) => a + (l.kind === "walk" ? l.distance : 0), 0),
    rideDistance: rides.reduce((a, l) => a + l.distance, 0),
    laneMeters: rides.reduce((a, l) => a + l.laneMeters, 0),
    transfers: Math.max(0, rides.length - 1),
    next: null,
  };
}

/** Pick among RAPTOR's per-round answers: a transfer must save > 4 min to be worth it. */
function choose(results: Search[]): Search | null {
  let best: Search | null = null;
  for (const r of results) if (!best || r.arrival + 240 * r.rides < best.arrival + 240 * best.rides) best = r;
  return best;
}

export function planTransit(from: LatLng, to: LatLng, day: number, t0: number): TransitResult | null {
  const N = load();
  const ctx = dayContext(N, day);
  const first = choose(raptor(N, from, to, t0, ctx));
  if (!first) return null;
  const result = summarize(first);
  // Look up the following departure so people know how bad missing it is.
  const firstRide = result.legs.find((l): l is RideLeg => l.kind === "ride");
  if (firstRide) {
    const again = choose(raptor(N, from, to, result.leave + 60, ctx));
    if (again) result.next = summarize(again).leave;
  }
  return result;
}

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .trim();

let stopIndex: { key: string; stops: number[] }[] | null = null;

/** Stops whose name matches `q` (accent-insensitive), one per name, nearest first. */
export function searchStops(q: string, near: LatLng | null, limit: number): { name: string; pos: LatLng }[] {
  const N = load();
  if (!stopIndex) {
    const byName = new Map<string, number[]>();
    N.raw.stops.name.forEach((name, i) => {
      const k = fold(name);
      const list = byName.get(k);
      if (list) list.push(i);
      else byName.set(k, [i]);
    });
    stopIndex = [...byName].map(([key, stops]) => ({ key, stops }));
  }
  const f = fold(q);
  if (f.length < 3) return [];
  const out: { name: string; pos: LatLng; d: number; exact: boolean }[] = [];
  for (const { key, stops } of stopIndex) {
    if (!(key.startsWith(f) || key.includes(` ${f}`))) continue;
    // Same name in different towns: take the platform closest to `near`.
    let best = stops[0];
    let bestD = near ? haversine(near, stopPos(N, best)) : 0;
    if (near)
      for (const s of stops) {
        const d = haversine(near, stopPos(N, s));
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }
    out.push({ name: N.raw.stops.name[best], pos: stopPos(N, best), d: bestD, exact: key === f });
  }
  out.sort((a, b) => Number(b.exact) - Number(a.exact) || a.d - b.d);
  return out.slice(0, limit).map(({ name, pos }) => ({ name, pos }));
}

/** Positions of stops within `radius` m of `c` – handy street-side points. */
export function stopsWithin(c: LatLng, radius: number): LatLng[] {
  const N = load();
  return N.grid
    .near(c, radius)
    .map((s) => stopPos(N, s))
    .filter((p) => haversine(c, p) <= radius);
}

export type StopInfo = { id: number; name: string; pos: LatLng; routes: { short: string; color: string; type: number }[] };

/** Stops inside a box, with the routes that call there (for the map layer). */
export function stopsInBox(s: number, w: number, n: number, e: number, limit: number): StopInfo[] {
  const N = load();
  const out: StopInfo[] = [];
  for (let i = 0; i < N.lat.length && out.length < limit; i++) {
    if (N.lat[i] < s || N.lat[i] > n || N.lng[i] < w || N.lng[i] > e) continue;
    const seen = new Set<number>();
    const routes: StopInfo["routes"] = [];
    for (const [pi, pos] of N.stopPatterns[i]) {
      const p = N.patterns[pi];
      if (pos === p.stops.length - 1 || seen.has(p.route)) continue; // only boarding
      seen.add(p.route);
      const r = N.raw.routes[p.route];
      routes.push({ short: r[0] || "?", color: r[3], type: r[2] });
    }
    if (!routes.length) continue;
    routes.sort((a, b) => a.short.localeCompare(b.short, "lt", { numeric: true }));
    out.push({ id: i, name: N.raw.stops.name[i], pos: stopPos(N, i), routes });
  }
  return out;
}

export type Departure = { route: string; color: string; type: number; headsign: string; time: number };

/** Next departures from a stop, from `sec` (local seconds) on `date`, within `windowSec`. */
export function departuresFrom(stop: number, date: string, sec: number, limit = 8, windowSec = 2 * 3600): { name: string; departures: Departure[] } | null {
  const N = load();
  if (!Number.isInteger(stop) || stop < 0 || stop >= N.lat.length) return null;
  const { day } = resolveDay(date);
  const ctx = dayContext(N, day);
  const out: Departure[] = [];
  for (const [pi, pos] of N.stopPatterns[stop]) {
    const p = N.patterns[pi];
    if (pos === p.stops.length - 1) continue; // arrivals only, nobody boards at the terminus
    const r = N.raw.routes[p.route];
    for (const { shift, active } of ctx)
      for (let k = 0; k < p.start.length; k++) {
        if (!active[p.svc[k]]) continue;
        const t = p.start[k] + p.dep[p.prof[k]][pos] + shift;
        if (t >= sec && t <= sec + windowSec) out.push({ route: r[0] || "?", color: r[3], type: r[2], headsign: p.headsign, time: t });
      }
  }
  out.sort((a, b) => a.time - b.time);
  return { name: N.raw.stops.name[stop], departures: out.slice(0, limit) };
}
