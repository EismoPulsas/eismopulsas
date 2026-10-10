import assert from "node:assert/strict";
import { test } from "node:test";
import type { LatLng } from "../lib/geo";
import {
  DEFAULT_SETTINGS,
  hubStayHours,
  hybridKinds,
  modeAllowed,
  OWN_SCOOTER_CO2_KM,
  rank,
  summarize,
  summarizeHybrids,
  SWITCH_PENALTY_SEC,
  withOwnScooter,
  type Settings,
} from "../lib/metrics";
import type { HybridOption, Lot, ParkingOption, PlanResponse, RideLeg, ScooterResult, TransitResult } from "../lib/plan-types";
import { estimateStay, stayBucket, type StayHabits } from "../lib/stay";
import { osrmRoute } from "../lib/server/osrm";
import { curbApproach, hubsAround } from "../lib/server/parking";
import { tomtomRoute } from "../lib/server/tomtom";
import { departure } from "../lib/departure";

const NO_HABITS: StayHabits = { overrides: [], observed: [] };
const B: LatLng = [54.6812, 25.2876];
const MON = 1;
const SAT = 6;
const at = (h: number) => h * 3600;

test("stay: an office on a weekday morning means a workday, a mall on Saturday two hours", () => {
  const office = estimateStay({ to: B, cat: "office=company", weekday: MON, arriveSec: at(8), habits: NO_HABITS, profileHours: 2 });
  assert.equal(office.source, "place");
  assert.equal(office.hours, 9.5); // until 17:30
  assert.equal(estimateStay({ to: B, cat: "office=company", weekday: MON, arriveSec: at(14), habits: NO_HABITS, profileHours: 2 }).hours, 3);
  const mall = estimateStay({ to: B, cat: "shop=mall", weekday: SAT, arriveSec: at(14), habits: NO_HABITS, profileHours: 5 });
  assert.deepEqual([mall.hours, mall.source], [2, "place"]);
  assert.equal(estimateStay({ to: B, cat: "amenity=kindergarten", weekday: MON, arriveSec: at(8), habits: NO_HABITS, profileHours: 2 }).hours, 0.25);
});

test("stay: unknown place on a weekday morning is a guessed workday, otherwise the profile", () => {
  const morning = estimateStay({ to: B, cat: null, weekday: MON, arriveSec: at(7.5), habits: NO_HABITS, profileHours: 2 });
  assert.deepEqual([morning.source, morning.hours], ["time", 10]);
  const evening = estimateStay({ to: B, cat: "building=yes", weekday: MON, arriveSec: at(19), habits: NO_HABITS, profileHours: 2 });
  assert.deepEqual([evening.source, evening.hours], ["profile", 2]);
  assert.equal(estimateStay({ to: B, weekday: SAT, arriveSec: at(8), habits: NO_HABITS, profileHours: 4 }).source, "profile");
});

test("stay: the user's own correction beats habits, habits beat the kind of place", () => {
  const bucket = stayBucket(MON, at(8));
  const near: LatLng = [B[0] + 0.0005, B[1]]; // ~55 m away
  const habits: StayHabits = {
    overrides: [{ pos: near, bucket, hours: 4, at: "2026-10-01T00:00:00Z" }, { pos: near, bucket, hours: 6, at: "2026-10-05T00:00:00Z" }],
    observed: [{ pos: near, bucket, hours: 8, at: "x" }, { pos: near, bucket, hours: 9, at: "x" }],
  };
  assert.deepEqual(estimateStay({ to: B, cat: "office=company", weekday: MON, arriveSec: at(8), habits, profileHours: 2 }), { hours: 6, reason: "kaip nurodėte anksčiau", source: "override" });
  const learned = estimateStay({ to: B, cat: "office=company", weekday: MON, arriveSec: at(8), habits: { ...habits, overrides: [] }, profileHours: 2 });
  assert.deepEqual([learned.source, learned.hours], ["habit", 8.5]);
  // Another time of the week, or one observation only, falls back to the place.
  assert.equal(estimateStay({ to: B, cat: "office=company", weekday: SAT, arriveSec: at(8), habits, profileHours: 2 }).source, "place");
  assert.equal(estimateStay({ to: B, cat: "office=company", weekday: MON, arriveSec: at(8), habits: { overrides: [], observed: habits.observed.slice(1) }, profileHours: 2 }).source, "place");
});

test("street parking: arrive from the kerb side, except on one-way streets with parking on the left", () => {
  const line: LatLng[] = [[54.69, 25.28], [54.691, 25.281]];
  assert.equal(curbApproach({ line, side: "right" }), true);
  assert.equal(curbApproach({ line, side: "left" }), true); // two-way: approach from the other direction
  assert.equal(curbApproach({ line, side: "left", oneway: 1 }), false); // KET 142: the left side is fine there
  assert.equal(curbApproach({ line, side: "right", oneway: -1 }), false); // drawn against the traffic = left of it
  assert.equal(curbApproach({ line, side: "right", oneway: 1 }), true);
  assert.equal(curbApproach({ line }), true); // JUDU lines lie on the parking side
  assert.equal(curbApproach({ line: [line[0]] }), false);
});

test("routers ask for a kerb-side arrival only when told to", async () => {
  const scheduled = departure("2026-10-12T08:00", Date.parse("2026-10-10T08:00Z"));
  const bodies: Record<string, unknown>[] = [];
  const request: typeof fetch = async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return Response.json({});
  };
  await tomtomRoute([54.73, 25.22], B, scheduled, "key", request);
  await tomtomRoute([54.73, 25.22], B, scheduled, "key", request, { curb: true });
  assert.equal(bodies[0].arrivalSidePreference, undefined);
  assert.equal(bodies[1].arrivalSidePreference, "curbSide");

  const urls: string[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    urls.push(String(url));
    return Response.json({ code: "Ok", routes: [{ distance: 100, duration: 20, geometry: { coordinates: [[25.1, 54.1], [25.2, 54.2]] }, legs: [] }] });
  }) as typeof fetch;
  try {
    await osrmRoute("car", [54.101, 25.101], [54.201, 25.201], false, true);
    await osrmRoute("car", [54.102, 25.102], [54.202, 25.202]);
  } finally {
    globalThis.fetch = real;
  }
  assert.match(urls[0], /approaches=unrestricted;curb/);
  assert.doesNotMatch(urls[1], /approaches/);
});

test("hubs: the JUDU P+R on the way is offered for Pašilaičiai → Old Town even among free car parks", () => {
  const d = departure("2026-10-12T08:00", Date.parse("2026-10-10T08:00Z"));
  const hubs = hubsAround([54.7329, 25.2236], B, d.date, d.sec + 900, null, { stayHours: 9, ev: false, connectors: ["T2"], minDist: 600, maxDist: 5600 });
  const pr = hubs.filter((h) => h.lot?.access === "pr");
  assert.ok(pr.some((h) => /Ukmerg/.test(h.name)), "P+R Ukmergės g. 246");
  assert.ok(hubs.every((h) => h.kind !== "charger"), "no chargers for a petrol car");
  assert.ok(hubs.filter((h) => h.kind === "lot").every((h) => h.lot!.t.known && (h.lot!.access === "public" || h.lot!.access === "pr")));
});

// ---------------------------------------------------------------- pricing combinations

const plan = { depart: { date: "2026-10-12", sec: at(8), weekday: MON, isNow: false, at: "2026-10-12T05:00:00.000Z" }, weather: null } as unknown as PlanResponse;
const settings: Settings = { ...DEFAULT_SETTINGS, parkingHours: 9 };

const prLot = { id: "pr", src: "judu", name: "P+R", addr: null, city: "Vilnius", pos: [54.72, 25.24], access: "pr", cap: 94, t: { known: true, text: ["1 €"], flat: { price: 1, per: "day" } } } as Lot;
const freeLot = { ...prLot, id: "free", access: "public", t: { known: true, text: ["Nemokama"], free: true } } as Lot;
const hubOf = (lot: Lot): ParkingOption => ({ kind: "lot", id: lot.id, name: lot.name!, pos: lot.pos, walk: 100, lot });
const ride = (fare: RideLeg["route"]["fare"]): RideLeg => ({
  kind: "ride", route: { short: "3G", long: "", type: 3, color: "#00f", agency: "JUDU", fare }, headsign: "", from: { name: "A", pos: [0, 0] }, to: { name: "B", pos: [0, 0] },
  dep: at(8.3), arr: at(8.6), stops: 6, distance: 5000, laneMeters: 0, geometry: [],
});
const transit = (fare: RideLeg["route"]["fare"]): TransitResult => ({ legs: [ride(fare)], leave: at(8.3), arrive: at(8.7), duration: 1440, walkDistance: 300, rideDistance: 5000, laneMeters: 0, transfers: 0, next: null });
const option = (hub: ParkingOption, second: HybridOption["second"]): HybridOption => ({
  id: `${second.kind}:${hub.id}`, hub, car: { from: [54.73, 25.22], to: hub.pos, duration: 600, distance: 4000, geometry: [], estimated: true },
  parkedAt: at(8.2), searchSec: 60, second, arrive: at(8.7), duration: at(0.7),
});
const scooter: ScooterResult = { city: "Vilnius", source: "estimate", operator: null, vehicle: null, distance: 2500, rideDuration: 600, duration: 840, geometry: [] };

test("P+R: Vilnius public transport is included, there and back", () => {
  const [h] = summarizeHybrids(plan, [option(hubOf(prLot), { kind: "transit", transit: transit("vilnius") })], settings);
  const line = (label: string) => h.costLines.find((l) => l.label === label);
  assert.equal(line("Parkavimas: P+R")!.value, 1);
  assert.equal(line("VT bilietas")!.value, 0);
  assert.equal(line("Grįžtant iki automobilio")!.value, 0);
  const fuel = h.costLines[0].value;
  assert.ok(Math.abs(h.cost - (fuel + 1)) < 1e-9);
  assert.equal(h.rankBias, SWITCH_PENALTY_SEC);
});

test("free car park + bus or scooter: the way back to the car is paid too", () => {
  const [bus, sc] = summarizeHybrids(
    plan,
    [option(hubOf(freeLot), { kind: "transit", transit: transit("vilnius") }), option(hubOf(freeLot), { kind: "scooter", scooter })],
    settings,
  );
  assert.equal(bus.costLines.find((l) => l.label === "Grįžtant iki automobilio")!.value, 1);
  const back = sc.costLines.find((l) => l.label === "Grįžtant iki automobilio")!.value;
  assert.equal(back, settings.scooterUnlock + 10 * settings.scooterPerMin);
  assert.ok(Math.abs(sc.cost - (sc.costLines[0].value + 2 * back)) < 1e-9);
  // A bad-weather day rules the scooter out, never the bus.
  const wet = summarizeHybrids({ ...plan, weather: { risk: "bad", reasons: ["lietus"] } } as unknown as PlanResponse, [option(hubOf(freeLot), { kind: "scooter", scooter })], settings);
  assert.match(wet[0].weatherWarning!, /lietus/);
  // Vehicles the user did not tick under A and B are not offered.
  assert.equal(summarizeHybrids(plan, [option(hubOf(freeLot), { kind: "scooter", scooter })], { ...settings, travel: ["car", "transit"] }).length, 0);
  assert.equal(summarizeHybrids(plan, [option(hubOf(freeLot), { kind: "transit", transit: transit("vilnius") })], { ...settings, travel: ["transit"] }).length, 0);
});

test("the car stands at the hub for the stay and the second leg both ways, and is priced for all of it", () => {
  const hourly = { ...prLot, id: "hourly", access: "public", t: { known: true, text: ["1 €/val."], rates: [{ rules: null, perHour: 1 }] } } as Lot;
  // Parked 8:12, leaves 8:13, arrives 8:42: 29 min away, so 9 h + 58 min at the car park.
  const o = option(hubOf(hourly), { kind: "transit", transit: transit("vilnius") });
  assert.ok(Math.abs(hubStayHours(o, settings) - (9 + 58 / 60)) < 1e-9);
  const [h] = summarizeHybrids(plan, [o], settings);
  assert.equal(h.costLines.find((l) => l.label === "Parkavimas: P+R")!.value, 9.97); // 598 min at 1 €/h, not just the 9 h stay
});

test("own scooter: nothing to rent, nothing to pay on the way back", () => {
  const own: ScooterResult = { ...scooter, source: "own" };
  const [h] = summarizeHybrids(plan, [option(hubOf(freeLot), { kind: "scooter", scooter: own })], { ...settings, ownScooter: true });
  assert.equal(h.cost, h.costLines[0].value); // fuel only: free car park, own scooter
  assert.ok(!h.costLines.some((l) => l.label === "Grįžtant iki automobilio"));
  assert.ok(Math.abs(h.co2 - ((4 * settings.consumption) / 100) * 2.31 - 2.5 * OWN_SCOOTER_CO2_KM) < 1e-9);
});

const fullPlan = (over: Partial<PlanResponse> = {}): PlanResponse =>
  ({
    ...plan,
    from: [54.73, 25.22],
    to: B,
    car: null,
    transit: transit("vilnius"),
    bike: { distance: 3400, duration: 900, geometry: [] },
    walk: { distance: 1000, duration: 800, geometry: [] },
    bikeshare: null,
    scooter: { ...scooter, source: "demo" },
    ...over,
  }) as PlanResponse;

test("vehicles picked under A and B: only options using them alone, plus a short walk", () => {
  const p = fullPlan();
  const shown = (s: Settings) => summarize(p, s).filter((m) => modeAllowed(m, s)).map((m) => m.id);
  assert.deepEqual(shown({ ...settings, travel: ["transit"] }), ["transit", "walk"]);
  assert.deepEqual(shown({ ...settings, travel: ["transit", "scooter"] }), ["transit", "scooter", "walk"]);
  // A long walk is not a "vehicle": it goes away once it takes longer than a quarter of an hour.
  assert.deepEqual(summarize(fullPlan({ walk: { distance: 2400, duration: 1900, geometry: [] } }), settings).filter((m) => modeAllowed(m, { ...settings, travel: ["transit"] })).map((m) => m.id), ["transit"]);
  // Bike: own bike or Cyclocity, never both.
  assert.ok(modeAllowed({ id: "bike", duration: 900 }, { ...settings, ownBike: true }));
  assert.ok(!modeAllowed({ id: "bikeshare", duration: 900 }, { ...settings, ownBike: true }));
  // No car in the profile, or the car unticked: no combinations either.
  assert.deepEqual(hybridKinds({ ...settings, travel: ["transit", "scooter"] }), []);
  assert.deepEqual(hybridKinds({ ...settings, hasCar: false }), []);
  assert.deepEqual(hybridKinds({ ...settings, travel: ["car", "scooter"] }), ["scooter"]);
});

test("own scooter from A: the bike route at scooter speed, free", () => {
  const p = withOwnScooter(fullPlan());
  assert.equal(p.scooter!.source, "own");
  assert.equal(p.scooter!.vehicle, null);
  assert.equal(p.scooter!.distance, 3400);
  const m = summarize(p, settings).find((x) => x.id === "scooter")!;
  assert.equal(m.cost, 0);
  assert.equal(m.duration, Math.round(3400 / (17 / 3.6)) + 90);
});

test("parking: an unknown price is never shown as free", () => {
  const atB: ParkingOption = { kind: "zone", id: "zone", name: "Gatvėje prie tikslo", pos: B, walk: 0, zone: null, zoneUnknown: true };
  const car = {
    drive: { duration: 900, distance: 8000, to: B, arrivalAt: "2026-10-12T05:17:00.000Z", traffic: {} },
    distance: 8000,
    duration: 1200,
    overhead: 300,
    parking: null,
    parkingOptions: [atB],
  } as unknown as NonNullable<PlanResponse["car"]>;
  const m = summarize(fullPlan({ car }), settings).find((x) => x.id === "car")!;
  assert.equal(m.costUnknown, true);
  assert.ok(m.costLines.some((l) => l.unknown && /kainų neturime/.test(l.note ?? "")));
  assert.equal(m.parking?.option.id, "zone"); // still parked at B, just without a price
});

test("ranking: a change of vehicle costs a little comfort, so a tie goes to the direct option", () => {
  const base = { feasible: true, duration: 1800, cost: 2, co2: 1 };
  const r = rank([{ id: "transit", ...base }, { id: "h:x", ...base, rankBias: SWITCH_PENALTY_SEC }, { id: "car", ...base, duration: 1500, cost: 15, co2: 3 }], "balanced");
  assert.ok(r.scores.get("transit")! < r.scores.get("h:x")!);
  assert.equal(r.best, "transit");
});
