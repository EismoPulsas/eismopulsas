// ┌────────────────────────────────────────────────────────────────────────────┐
// │ DEMO DATA — SYNTHETIC ROUTES. NOT JUDU TIMETABLES, NOT REAL-TIME, NOT OTP.  │
// │ Every leg it returns carries basis "demo", and the API reports            │
// │ dataMode "demo". Replace it with a real RoutingProvider (ADR-0002); do not │
// │ "improve" it into something that looks real.                              │
// └────────────────────────────────────────────────────────────────────────────┘
//
// Deterministic: the same request always gives the same legs. The heuristics only
// aim to be structurally plausible for Vilnius:
//   - straight-line distance × detour factor;
//   - driving is slow near the centre (2,5 km around Katedros a.) and in peak hours;
//   - public transport runs at a steady speed (dedicated lanes), with one transfer on
//     longer rides, a hash-based wait and walks to/from generic stops;
//   - no line numbers (inventing real line names would mislead).

import { CITY_CENTRE as CENTRE } from "../config";
import { addMin, hash, haversineKm, round1, vilniusParts } from "../geo";
import type { Leg, LatLng, LineString, Place, SourceRef } from "../types";
import type { RoutingProvider, StreetPath, TransitItinerary } from "./types";

const INNER_KM = 2.5;
const DETOUR = { car: 1.3, walk: 1.25, transit: 1.3 };
const SPEED_KMH = {
  peak: { inner: 12, outer: 30, transit: 19 },
  offPeak: { inner: 22, outer: 40, transit: 22 },
};
const WALK_KMH = 4.8;

const SOURCE: SourceRef = {
  id: "demo-routing",
  name: "Demonstraciniai maršrutai (sintetiniai)",
  basis: "demo",
  note: "DemoRoutingProvider: laikai, persėdimai ir geometrija sugeneruoti, ne JUDU tvarkaraštis ir ne tikralaikiai duomenys.",
};

function isPeak(at: Date): boolean {
  const p = vilniusParts(at);
  const h = p.hour + p.minute / 60;
  return p.weekday <= 5 && ((h >= 7 && h < 9.5) || (h >= 16 && h < 18.5));
}

const lerp = (a: LatLng, b: LatLng, t: number): LatLng => ({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });

/** A gently bent polyline so the map does not show ruler-straight lines. Clearly not a road geometry. */
function bentLine(a: LatLng, b: LatLng, seed: number): LineString {
  const dx = b.lng - a.lng;
  const dy = b.lat - a.lat;
  const side = seed % 2 === 0 ? 1 : -1;
  const k = 0.08 * side;
  const pts = [0, 0.33, 0.66, 1].map((t) => {
    const bulge = Math.sin(Math.PI * t) * k;
    return [a.lng + dx * t - dy * bulge, a.lat + dy * t + dx * bulge] as [number, number];
  });
  return { type: "LineString", coordinates: pts };
}

const seedOf = (a: LatLng, b: LatLng, at: Date) =>
  hash(`${a.lat.toFixed(4)},${a.lng.toFixed(4)}|${b.lat.toFixed(4)},${b.lng.toFixed(4)}|${at.toISOString().slice(0, 16)}`);

function walkLeg(from: Place, to: Place, departAt: Date, durationMin: number, note: string): Leg {
  return {
    mode: "walk",
    from,
    to,
    departAt: departAt.toISOString(),
    arriveAt: addMin(departAt, durationMin).toISOString(),
    durationMin,
    distanceKm: round1((durationMin / 60) * WALK_KMH),
    line: null,
    geometry: { type: "LineString", coordinates: [[from.lng, from.lat], [to.lng, to.lat]] },
    note,
    basis: "demo",
  };
}

export const demoRouting: RoutingProvider = {
  source: SOURCE,

  async drive(from, to, at): Promise<StreetPath> {
    const speeds = isPeak(at) ? SPEED_KMH.peak : SPEED_KMH.offPeak;
    // Split the straight line into 10 pieces; pieces near the centre are slower.
    let minutes = 2; // getting going
    let km = 0;
    for (let i = 0; i < 10; i++) {
      const a = lerp(from, to, i / 10);
      const b = lerp(from, to, (i + 1) / 10);
      const pieceKm = haversineKm(a, b) * DETOUR.car;
      const inner = haversineKm(lerp(a, b, 0.5), CENTRE) < INNER_KM;
      minutes += (pieceKm / (inner ? speeds.inner : speeds.outer)) * 60;
      km += pieceKm;
    }
    return { distanceKm: round1(km), durationMin: Math.round(minutes), geometry: bentLine(from, to, seedOf(from, to, at)), basis: "demo" };
  },

  async transit(from, to, arriveBy): Promise<TransitItinerary | null> {
    const straight = haversineKm(from, to);
    if (straight < 0.5) return null; // walking distance
    const seed = seedOf(from, to, arriveBy);
    const speeds = isPeak(arriveBy) ? SPEED_KMH.peak : SPEED_KMH.offPeak;
    const accessMin = 3 + (seed % 5);
    const egressMin = 2 + ((seed >>> 3) % 5);
    const waitMin = 2 + ((seed >>> 6) % 5);
    const earlyMin = (seed >>> 9) % 5; // timetable granularity: arrive a little early
    const rideKm = straight * DETOUR.transit;
    const transfers = rideKm > 6 ? 1 : 0;
    const rideMin = Math.max(3, Math.round((rideKm / speeds.transit) * 60));
    const transferMin = transfers ? 3 + ((seed >>> 12) % 4) : 0;

    const walkKm = (min: number) => (min / 60) * WALK_KMH;
    const board: Place = { ...lerp(from, to, Math.min(0.3, walkKm(accessMin) / straight)), label: "Įlipimo stotelė" };
    const alight: Place = { ...lerp(from, to, Math.max(0.7, 1 - walkKm(egressMin) / straight)), label: "Išlipimo stotelė" };

    // Build backwards from the arrival.
    const arriveAt = addMin(arriveBy, -earlyMin);
    const egressStart = addMin(arriveAt, -egressMin);
    const rides: { from: Place; to: Place; start: Date; minutes: number; km: number }[] = [];
    if (transfers) {
      const mid: Place = { ...lerp(board, alight, 0.55), label: "Persėdimo stotelė" };
      const r1 = Math.round(rideMin * 0.55);
      const r2 = rideMin - r1;
      const r2Start = addMin(egressStart, -r2);
      const r1Start = addMin(r2Start, -transferMin - r1);
      rides.push({ from: board, to: mid, start: r1Start, minutes: r1, km: rideKm * 0.55 });
      rides.push({ from: mid, to: alight, start: r2Start, minutes: r2, km: rideKm * 0.45 });
    } else {
      rides.push({ from: board, to: alight, start: addMin(egressStart, -rideMin), minutes: rideMin, km: rideKm });
    }
    const firstRide = rides[0].start;
    const accessStart = addMin(firstRide, -waitMin - accessMin);

    const legs: Leg[] = [walkLeg(from, board, accessStart, accessMin, "Eikite iki stotelės")];
    rides.forEach((r, i) => {
      if (i > 0) legs.push(walkLeg(rides[i - 1].to, r.from, addMin(r.start, -transferMin), transferMin, "Persėskite"));
      legs.push({
        mode: "transit",
        from: r.from,
        to: r.to,
        departAt: r.start.toISOString(),
        arriveAt: addMin(r.start, r.minutes).toISOString(),
        durationMin: r.minutes,
        distanceKm: round1(r.km),
        line: null,
        geometry: bentLine(r.from, r.to, seed >>> (i + 1)),
        note: "Važiuokite viešuoju transportu",
        basis: "demo",
      });
    });
    legs.push(walkLeg(alight, to, egressStart, egressMin, "Eikite iki tikslo"));

    const last = rides[rides.length - 1];
    return {
      legs,
      rideSpanMin: Math.round((addMin(last.start, last.minutes).getTime() - firstRide.getTime()) / 60_000),
      ridePassengerKm: rideKm,
      transfers,
    };
  },
};
