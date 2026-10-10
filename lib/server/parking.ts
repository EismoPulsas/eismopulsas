import "server-only";
import fs from "node:fs";
import path from "node:path";
import { Grid, haversine, inPolygon, type LatLng } from "../geo";
import type { Charger, Connector, LiveLot, Lot, OccupancyProfile, ParkingOption, ParkingZone } from "../plan-types";
import { lotCost } from "../metrics";

// Where a car can be left near B: municipal zones, street-side parking, car parks and
// (for EV drivers) charging points, from the files scripts/build-parking.mjs writes.
// Prices are applied in the browser (lib/metrics.ts) so profile changes apply instantly.

type Zone = ParkingZone & { poly: LatLng[][][] };
type Area = { name: string; spaces: number | null; occupancy: number | null; poly: LatLng[][][] };
type StreetFile = {
  segments: { line: LatLng[]; name: string | null; side?: string; oneway?: 1 | -1; lanes?: number; orientation?: string | null; fee?: string | null; maxStayMin?: number; spaces?: number | null; zi?: number; ai?: number }[];
  areas: { pos: LatLng; name: string | null; kind: string; cap: number | null; fee: string | null; maxStayMin?: number; zi?: number; ai?: number }[];
  points: { pos: LatLng; name: string | null; spaces: number | null; zi?: number; ai?: number }[];
};
type StreetSpot = { name: string | null; pts: LatLng[]; fee?: string | null; maxStayMin?: number; zi?: number; ai?: number; what: string; curb?: boolean };

/**
 * Should the driver arrive with this street piece on the right (kerb) side? Yes, except on
 * one-way streets with parking on the left: KET 142 allows parking there and arriving
 * "from the right" would force a detour. JUDU lines have no side but lie on the parking side.
 */
export function curbApproach(g: { line: LatLng[]; side?: string; oneway?: 1 | -1 }): boolean {
  if (g.line.length < 2) return false;
  if (!g.side) return true;
  const leftOfTraffic = (g.side === "left") !== (g.oneway === -1);
  return !(g.oneway && leftOfTraffic);
}

const read = <T>(name: string): T | null => {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", name), "utf8")) as T;
  } catch {
    return null;
  }
};

type Data = {
  zones: Zone[];
  areas: Area[];
  lots: Grid<Lot>;
  street: Grid<StreetSpot>;
  chargers: Grid<Charger>;
  chargersByLot: Map<string, Charger[]>;
  occupancy: Record<string, OccupancyProfile>;
};
let data: Data | null = null;

function load(): Data {
  if (data) return data;
  const parking = read<{ zones: Zone[]; areas?: Area[] }>("parking.json");
  const lots = new Grid<Lot>(0.005);
  for (const file of ["lots.json", "lots-lt.json"]) for (const l of read<{ lots: Lot[] }>(file)?.lots ?? []) lots.add(l.pos, l);

  const street = new Grid<StreetSpot>(0.005);
  const s = read<StreetFile>("street-parking.json");
  for (const g of s?.segments ?? []) {
    const spot: StreetSpot = { name: g.name, pts: g.line, fee: g.fee, maxStayMin: g.maxStayMin, zi: g.zi, ai: g.ai, what: g.orientation ? `gatvėje, ${g.orientation}` : "gatvėje", curb: curbApproach(g) };
    for (const p of g.line) street.add(p, spot);
  }
  for (const a of s?.areas ?? []) street.add(a.pos, { name: a.name, pts: [a.pos], fee: a.fee, maxStayMin: a.maxStayMin, zi: a.zi, ai: a.ai, what: "prie gatvės" });
  for (const p of s?.points ?? []) street.add(p.pos, { name: p.name, pts: [p.pos], zi: p.zi, ai: p.ai, what: "ant šaligatvio" });

  const chargers = new Grid<Charger>(0.005);
  const chargersByLot = new Map<string, Charger[]>();
  for (const c of read<{ chargers: Charger[] }>("chargers.json")?.chargers ?? []) {
    chargers.add(c.pos, c);
    if (c.lotId) chargersByLot.set(c.lotId, [...(chargersByLot.get(c.lotId) ?? []), c]);
  }

  data = {
    zones: parking?.zones ?? [],
    areas: parking?.areas ?? [],
    lots,
    street,
    chargers,
    chargersByLot,
    occupancy: read<{ lots: Record<string, OccupancyProfile> }>("lot-occupancy.json")?.lots ?? {},
  };
  return data;
}

const zoneOf = ({ city, zone, price, firstHour, text, rules }: Zone): ParkingZone => ({ city, zone, price, firstHour, text, rules });

/** The municipal paid-parking zone at p, if any (Vilnius, Klaipėda). */
export function parkingZoneAt(p: LatLng): ParkingZone | null {
  // Overlapping zones: the dearest one applies at the exact spot.
  const hits = load()
    .zones.filter((z) => z.poly.some((rings) => inPolygon(p, rings)))
    .sort((a, b) => b.price - a.price);
  return hits.length ? zoneOf(hits[0]) : null;
}

/** Walking metres: straight line × 1.3 for streets and crossings. */
const walkTo = (to: LatLng, pts: LatLng[]) => Math.round(Math.min(...pts.map((p) => haversine(p, to))) * 1.3);

/** Weekday (0 = Monday) and hour at `sec` seconds after local midnight of `date`. */
function slot(date: string, sec: number): [number, number] {
  const day = Math.floor(sec / 86400);
  const wd = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6 + day) % 7;
  return [wd, Math.floor((((sec % 86400) + 86400) % 86400) / 3600)];
}

/** A car park as a place to leave the car, with its occupancy at the arrival weekday and hour. */
function lotOption(d: Data, l: Lot, walk: number, [wd, hour]: [number, number], live: Record<string, LiveLot> | null): ParkingOption {
  const lot = { ...l };
  delete lot.poly; // outlines stay on the map; the planner needs the facts
  const prof = l.occ ? d.occupancy[l.occ] : undefined;
  const chargers = d.chargersByLot.get(l.id) ?? [];
  return {
    kind: "lot",
    id: l.id,
    name: l.name ?? (l.near ? `Aikštelė prie „${l.near}“` : "Aikštelė"),
    pos: l.pos,
    walk,
    lot,
    typical: prof ? { free: prof.free[wd][hour], p: prof.p[wd][hour], days: prof.n[wd][hour] } : null,
    live: l.occ && live ? (live[l.occ] ?? null) : null,
    chargers: chargers.length ? [...chargers] : undefined,
  };
}

/**
 * Options for leaving the car within `maxWalkMin` of B, nearest first: the street at B,
 * the nearest street-side places (paid and free), car parks, and charging points.
 */
export function parkingNear(to: LatLng, date: string, arriveSec: number, live: Record<string, LiveLot> | null, maxWalkMin = 10): ParkingOption[] {
  const d = load();
  const maxWalk = maxWalkMin * 60 * 1.3; // metres at 1.3 m/s
  const radius = maxWalk / 1.3;
  const [wd, hour] = slot(date, arriveSec);
  const out: ParkingOption[] = [];

  // 1. The street at B itself (what the planner always assumed).
  const zoneHere = parkingZoneAt(to);
  out.push({ kind: "zone", id: "zone", name: zoneHere ? `Gatvėje prie tikslo, ${zoneHere.zone.toLowerCase()}` : "Gatvėje prie tikslo", pos: to, walk: 0, zone: zoneHere });

  // 2. Mapped street-side parking: the nearest, and the nearest free one if different.
  const spots = [...new Set(d.street.near(to, radius))]
    .map((s) => ({ s, walk: walkTo(to, s.pts) }))
    .filter((x) => x.walk <= maxWalk)
    .sort((a, b) => a.walk - b.walk);
  const isFree = (s: StreetSpot) => s.zi === undefined && s.fee !== "yes";
  const picks = [spots[0], spots.find((x) => isFree(x.s))].filter((x): x is NonNullable<typeof x> => x !== undefined).filter((x, i, a) => a.indexOf(x) === i);
  for (const { s, walk } of picks) {
    const area = s.ai !== undefined ? d.areas[s.ai] : undefined;
    out.push({
      kind: "street",
      id: `street-${s.pts[0].join(",")}`,
      name: `${s.name ?? "Gatvė"} (${s.what})`,
      pos: s.pts[Math.floor(s.pts.length / 2)],
      walk,
      zone: s.zi !== undefined ? zoneOf(d.zones[s.zi]) : null,
      fee: s.fee ?? null,
      maxStayMin: s.maxStayMin,
      streetOccupancy: area?.occupancy ?? null,
      curb: s.curb || undefined,
    });
  }

  // 3. Car parks: known tariffs first, then a couple of unknown ones; private ones never get here.
  const lots = [...new Set(d.lots.near(to, radius))]
    .map((l) => ({ l, walk: walkTo(to, [l.pos, ...(l.poly?.[0]?.[0] ?? [])]) }))
    .filter((x) => x.walk <= maxWalk)
    .sort((a, b) => a.walk - b.walk);
  const shown = [...lots.filter((x) => x.l.t.known).slice(0, 6), ...lots.filter((x) => !x.l.t.known).slice(0, 2)];
  const inLot = new Set<string>();
  for (const { l, walk } of shown) {
    const o = lotOption(d, l, walk, [wd, hour], live);
    for (const c of o.chargers ?? []) inLot.add(c.id);
    out.push(o);
  }

  // 4. Charging points not inside a listed car park (only offered to EV drivers, see metrics).
  const chargers = [...new Set(d.chargers.near(to, radius))]
    .filter((c) => !inLot.has(c.id))
    .map((c) => ({ c, walk: walkTo(to, [c.pos]) }))
    .filter((x) => x.walk <= maxWalk)
    .sort((a, b) => a.walk - b.walk)
    .slice(0, 4);
  for (const { c, walk } of chargers) out.push({ kind: "charger", id: `charger-${c.id}`, name: c.name, pos: c.pos, walk, chargers: [c] });

  return out.sort((a, b) => a.walk - b.walk);
}

/**
 * Places to leave the car on the way to B for a car + second-leg trip: P+R, car parks with
 * a known, low price, free or cheap street parking and (for EVs) charging points. Only
 * places between `minDist` and `maxDist` from B and not far off the A → B line count.
 * `walk` is 0 here; the hybrid planner sets it to the walk to the next vehicle.
 */
export function hubsAround(
  from: LatLng,
  to: LatLng,
  date: string,
  arriveSec: number,
  live: Record<string, LiveLot> | null,
  opts: { stayHours: number; ev: boolean; connectors: Connector[]; minDist: number; maxDist: number },
): ParkingOption[] {
  const d = load();
  const ab = haversine(from, to);
  const [wd, hour] = slot(date, arriveSec);
  // Inside an ellipse around A and B: a hub must not send the driver the wrong way.
  const onTheWay = (p: LatLng, slack: number, maxDist = opts.maxDist) => {
    const pb = haversine(p, to);
    return pb >= opts.minDist && pb <= maxDist && (haversine(from, p) + pb) / ab <= slack;
  };
  // P+R sits at the city edge, often close to A: anywhere nearer to B than A is fine.
  const prReach = Math.max(opts.maxDist, Math.min(ab, 20000));
  const out: ParkingOption[] = [];

  // P+R and car parks with a known price for the stay (customer-only lots are not for commuters).
  const lots = [...new Set(d.lots.near(to, prReach))]
    .filter((l) => {
      if (!l.t.known || (l.access !== "public" && l.access !== "pr")) return false;
      const pr = l.access === "pr" || !!l.t.flat;
      return pr ? onTheWay(l.pos, 1.6, prReach) : onTheWay(l.pos, 1.35);
    })
    .map((l) => ({ l, cost: lotCost(l.t, date, arriveSec, opts.stayHours) }))
    .filter((x): x is { l: Lot; cost: number } => x.cost != null && (x.l.t.maxStayMin ?? Infinity) >= opts.stayHours * 60)
    .sort((a, b) => a.cost - b.cost || haversine(a.l.pos, to) - haversine(b.l.pos, to))
    // P+R always stays in: its price includes public transport, which free car parks lack.
    .filter((x, i) => i < 80 || x.l.access === "pr" || !!x.l.t.flat);
  for (const { l } of lots) out.push(lotOption(d, l, 0, [wd, hour], live));

  // Street parking that is free or in a cheap zone (≤ 1 €/h).
  const seen = new Set<StreetSpot>();
  const spots = d.street
    .near(to, opts.maxDist)
    .filter((s) => (seen.has(s) ? false : (seen.add(s), true)))
    .filter((s) => (s.zi === undefined ? s.fee !== "yes" : d.zones[s.zi].price <= 1) && (s.maxStayMin ?? Infinity) >= opts.stayHours * 60)
    .map((s) => ({ s, pos: s.pts[Math.floor(s.pts.length / 2)] }))
    .filter((x) => onTheWay(x.pos, 1.35))
    .sort((a, b) => Number(a.s.zi !== undefined) - Number(b.s.zi !== undefined) || haversine(a.pos, to) - haversine(b.pos, to))
    .slice(0, 80);
  for (const { s, pos } of spots) {
    const area = s.ai !== undefined ? d.areas[s.ai] : undefined;
    out.push({
      kind: "street",
      id: `street-${s.pts[0].join(",")}`,
      name: `${s.name ?? "Gatvė"} (${s.what})`,
      pos,
      walk: 0,
      zone: s.zi !== undefined ? zoneOf(d.zones[s.zi]) : null,
      fee: s.fee ?? null,
      maxStayMin: s.maxStayMin,
      streetOccupancy: area?.occupancy ?? null,
      curb: s.curb || undefined,
    });
  }

  // EV: a charging point the car can use; AC for long stays (DC chargers are for quick top-ups).
  if (opts.ev) {
    const inLots = new Set(lots.flatMap(({ l }) => (d.chargersByLot.get(l.id) ?? []).map((c) => c.id)));
    const chargers = [...new Set(d.chargers.near(to, opts.maxDist))]
      .filter((c) => !inLots.has(c.id) && onTheWay(c.pos, 1.35))
      .filter((c) => c.plugs.some((p) => opts.connectors.includes(p.std) && (opts.stayHours < 1 ? true : !p.dc)))
      .sort((a, b) => haversine(a.pos, to) - haversine(b.pos, to))
      .slice(0, 60);
    for (const c of chargers) out.push({ kind: "charger", id: `charger-${c.id}`, name: c.name, pos: c.pos, walk: 0, chargers: [c], zone: parkingZoneAt(c.pos) });
  }
  return out;
}
