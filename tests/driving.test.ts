import assert from "node:assert/strict";
import { test } from "node:test";
import { carDeparture, departure, localSecondsAt, observationTime } from "../lib/departure";
import { parsePoint, wazeNavigationUrl, wazeUrl, withDrive } from "../lib/driving";
import { Grid, type LatLng } from "../lib/geo";
import type { CarLeg, PlanResponse } from "../lib/plan-types";
import { createCarRouter } from "../lib/server/driving";
import { parseTomtom, tomtomRoute } from "../lib/server/tomtom";
import { estimateTraffic, freshSensor, type Sensor } from "../lib/server/traffic";
import { createWeatherService } from "../lib/server/weather";
import { DEFAULT_SETTINGS, evalParking, summarize } from "../lib/metrics";
import { GET as driveGet } from "../app/api/drive/route";
import { GET as planGet } from "../app/api/plan/route";

const from: LatLng = [54.7329, 25.2236];
const to: LatLng = [54.6812, 25.2876];
const scheduled = departure("2026-10-12T08:00", Date.parse("2026-10-10T08:00Z"));
const providerBody = () => ({ routes: [{ summary: { travelDurationInSeconds: 900, lengthInMeters: 8000, trafficDelayDurationInSeconds: 120 },
  legs: [{ path: { type: "LineString", coordinates: [[from[1], from[0]], [to[1], to[0]]] } }],
  sections: { traffic: [{ iconCategory: "roadWorks" }, { iconCategory: "roadWorks" }] } }] });
const leg = () => parseTomtom(providerBody(), from, to, scheduled)!;
const fetchResult = (body: unknown, status = 200): typeof fetch => async () => Response.json(body, { status });

test("Lithuanian departures use the correct weekday, offset and strict calendar validation", () => {
  assert.equal(scheduled.at, "2026-10-12T05:00:00.000Z");
  assert.equal(scheduled.weekday, 1);
  assert.equal(departure("2026-12-12T08:00").at, "2026-12-12T06:00:00.000Z");
  assert.equal(departure("2026-10-10T08:00").weekday, 6);
  for (const invalid of ["2026-02-30T08:00", "2026-13-01T08:00", "2026-10-12T24:00", "2026-10-12T08:60", "2026-10-12T08:00garbage", "bad", "2026-02-30T08:00:00Z"]) assert.throws(() => departure(invalid));
});

test("DST gaps are rejected and the earlier repeated autumn time is chosen", () => {
  assert.throws(() => departure("2026-03-29T03:30"), /laiko nėra/);
  assert.equal(departure("2026-10-25T03:30").at, "2026-10-25T00:30:00.000Z");
  assert.equal(departure("2026-10-25T03:30:00+02:00").at, "2026-10-25T01:30:00.000Z");
  assert.equal(localSecondsAt("2026-10-25T01:30Z", "2026-10-25"), 3.5 * 3600);
});

test("driving starts after car access, including midnight and DST crossings", () => {
  const d = departure("2026-10-12T23:59");
  const drive = carDeparture(d);
  assert.equal(drive.date, "2026-10-13");
  assert.equal(drive.sec, 60);
  assert.equal(localSecondsAt(drive.at, d.date), 86460);
  assert.equal(carDeparture(departure("2026-03-29T02:59")).sec, 4 * 3600 + 60);
});

test("future departures do not reuse live readings simply because they are within 45 minutes", () => {
  const now = Date.parse("2026-10-12T05:00Z");
  assert.equal(departure("2026-10-12T08:40", now).isNow, false);
  assert.equal(departure(null, now).isNow, true);
});

test("provider duration is authoritative, geometry is converted and incidents deduplicated", () => {
  const result = leg();
  assert.equal(result.duration, 900);
  assert.equal(result.traffic.delaySeconds, 120);
  assert.equal(result.baseDuration, null);
  assert.deepEqual(result.geometry, [from, to]);
  assert.equal(result.traffic.mode, "predicted");
  assert.equal(result.arrivalAt, "2026-10-12T05:15:00.000Z");
  assert.deepEqual(result.warnings.map((w) => w.text), ["Kelio darbai"]);
  assert.equal(parseTomtom({ routes: [] }, from, to, scheduled), null);
  const bad = providerBody();
  bad.routes[0].summary.travelDurationInSeconds = NaN;
  assert.equal(parseTomtom(bad, from, to, scheduled), null);
  const broken = providerBody();
  broken.routes[0].legs[0].path.coordinates[0][0] = 200;
  assert.equal(parseTomtom(broken, from, to, scheduled), null);
});

test("Orbis request uses server auth, explicit departure, fast routing and live traffic", async () => {
  const request: typeof fetch = async (url, options) => {
    assert.equal(String(url), "https://api.tomtom.com/maps/orbis/routing/routes/calculate");
    assert.equal(options!.method, "POST");
    assert.equal(options!.cache, "no-store");
    assert.equal((options!.headers as Record<string, string>)["TomTom-Api-Key"], "test-secret");
    const body = JSON.parse(options!.body as string);
    assert.equal(body.traffic, "live");
    assert.equal(body.departureDateTime, scheduled.at);
    assert.equal(body.legs[0].routeType, "fast");
    assert.deepEqual(body.routePlanningLocations.origin.coordinates, [from[1], from[0]]);
    return Response.json(providerBody());
  };
  assert.equal((await tomtomRoute(from, to, scheduled, "test-secret", request)).status, "ok");
});

test("provider failures are classified and confirmed no-route does not fall back", async () => {
  for (const [status, reason] of [[429, "quota"], [403, "authentication"], [500, "provider-error"]] as const) {
    assert.deepEqual(await tomtomRoute(from, to, scheduled, "key", fetchResult({}, status)), { status: "fallback", reason });
  }
  assert.deepEqual(await tomtomRoute(from, to, scheduled, "key", fetchResult({ detailedError: { code: "NO_ROUTE_FOUND" } }, 400)), { status: "unavailable" });
  assert.deepEqual(await tomtomRoute(from, to, scheduled, "key", fetchResult({ detailedError: { code: "MAP_MATCHING_FAILURE" } }, 400)), { status: "unavailable" });
  assert.deepEqual(await tomtomRoute(from, to, scheduled, "key", fetchResult({})), { status: "fallback", reason: "invalid-response" });
  const timeout: typeof fetch = async () => { throw new DOMException("timeout", "TimeoutError"); };
  assert.deepEqual(await tomtomRoute(from, to, scheduled, "key", timeout), { status: "fallback", reason: "timeout" });
  const malformed: typeof fetch = async () => new Response("{broken");
  assert.deepEqual(await tomtomRoute(from, to, scheduled, "key", malformed), { status: "fallback", reason: "invalid-response" });
});

const weather = async () => ({ weather: { status: "available" as const, forecastCreatedAt: scheduled.at }, warnings: [{ kind: "weather" as const, text: "Sniegas" }] });
test("provider ETA never runs fallback traffic or adds weather penalties", async () => {
  const route = createCarRouter({ key: () => "key", provider: async () => ({ status: "ok", leg: leg() }),
    fallback: async () => { throw new Error("must not call OSRM"); }, traffic: async () => { throw new Error("must not add traffic"); }, weather });
  const result = await route(from, to, scheduled);
  assert.equal(result!.duration, 900);
  assert.equal(result!.warnings.length, 2);
});

test("quota and missing-key fallback use OSRM and label the reason", async () => {
  for (const key of [undefined, "key"]) {
    const info = estimateTraffic([from, to], [600], 1, 8 * 3600, null).info;
    const route = createCarRouter({ key: () => key, provider: async () => ({ status: "fallback", reason: "quota" }),
      fallback: async () => ({ duration: 600, distance: 7000, coords: [from, to], segDurations: [600] }),
      traffic: async () => ({ extra: 200, info }), weather });
    const result = await route(from, to, scheduled);
    assert.equal(result!.duration, 800);
    assert.equal(result!.traffic.mode, "approximate");
    assert.equal(result!.traffic.fallbackReason, key ? "quota" : "missing-key");
  }
});

test("no legal route stays unavailable, and simultaneous requests share provider work", async () => {
  const noRoute = createCarRouter({ key: () => "key", provider: async () => ({ status: "unavailable" }),
    fallback: async () => { throw new Error("must not bypass a closure"); } });
  assert.equal(await noRoute(from, to, scheduled), null);
  let calls = 0;
  const route = createCarRouter({ key: () => "key", provider: async () => { calls++; await new Promise((r) => setTimeout(r, 5)); return { status: "ok", leg: leg() }; }, weather });
  await Promise.all([route(from, to, scheduled), route(from, to, scheduled)]);
  assert.equal(calls, 1);
  await route(from, to, scheduled);
  assert.equal(calls, 2); // no reuse of a response marked no-cache
});

test("sensor freshness rejects old, invalid and future timestamps", () => {
  const now = Date.parse("2026-10-12T05:00Z");
  const s = { time: "2026-10-12T07:45:00" } as Sensor;
  assert.equal(observationTime(s.time), Date.parse("2026-10-12T04:45Z"));
  assert.equal(freshSensor(s, now), true);
  assert.equal(freshSensor({ ...s, time: "2026-10-12T04:00Z" }, now), false);
  assert.equal(freshSensor({ ...s, time: "bad" }, now), false);
  assert.equal(freshSensor({ ...s, time: "2026-10-12T06:00Z" }, now), false);
});

test("sensor direction, invalid speed and staleness cannot suppress typical congestion", () => {
  const a: LatLng = [54.68, 25.27], b: LatLng = [54.6802, 25.27];
  const now = Date.parse("2026-10-12T05:00Z");
  const sensor: Sensor = { id: 1, name: "Test", road: "Test", pos: a, time: "2026-10-12T04:55Z",
    segments: [{ dir: "FORWARD", a, b, speed: 20, limit: 50, vehicles: 10, type: "car" }] };
  const calculate = (s: Sensor) => {
    const grid = new Grid<Sensor>(0.02); grid.add(a, s);
    return estimateTraffic([a, b], [100], 1, 8 * 3600, { at: now, sensors: [s], grid }, now);
  };
  assert.equal(calculate(sensor).info.sensors.length, 1);
  assert.equal(calculate(sensor).info.urbanDelay, 0);
  for (const s of [{ ...sensor, time: "2026-10-12T03:00Z" }, { ...sensor, segments: [{ ...sensor.segments[0], dir: "BACKWARD" as const }] }, { ...sensor, segments: [{ ...sensor.segments[0], speed: NaN }] }]) {
    const result = calculate(s);
    assert.equal(result.info.source, "typical");
    assert.equal(result.info.sensors.length, 0);
    assert.equal(result.extra, 55);
  }
  assert.equal(estimateTraffic([a, b], [100], 6, 8 * 3600, null, now).extra, 20);
});

test("weather forecasts are cached, deduplicated and sampled without changing duration", async () => {
  const now = Date.now();
  const d = departure(null, now);
  const drive = parseTomtom(providerBody(), from, to, d)!;
  const at = (delta: number) => new Date(now + delta).toISOString().replace("T", " ").slice(0, 19);
  let calls = 0;
  const service = createWeatherService(async (url) => {
    calls++;
    return Response.json(String(url).endsWith("/places") ? [{ code: "vilnius", name: "Vilnius", coordinates: { latitude: 54.68, longitude: 25.28 } }] :
      { forecastCreationTimeUtc: at(-60000), forecastTimestamps: [-3600000, 0, 3600000].map((delta) => ({ forecastTimeUtc: at(delta), conditionCode: "heavy-snow" })) });
  });
  const result = await service(drive);
  assert.equal(result.weather.status, "available");
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0].text, /smarkus sniegas/);
  await service(drive);
  assert.equal(calls, 2);
  assert.equal(drive.duration, 900);
  assert.equal((await service({ ...drive, departureAt: new Date(now + 5 * 86400000).toISOString() })).weather.status, "unavailable");
});

test("missing weather does not prevent routing", async () => {
  const service = createWeatherService(async () => { throw new Error("offline"); });
  assert.deepEqual(await service(leg()), { warnings: [], weather: { status: "unavailable", forecastCreatedAt: null } });
});

function planFixture(): PlanResponse {
  const drive = leg();
  return { from, to, depart: scheduled, straight: 6000, car: { drive, baseDuration: null, traffic: drive.traffic, duration: drive.duration + 300,
    overhead: 300, distance: drive.distance, geometry: drive.geometry, parking: null, arrive: 8 * 3600 + 1200,
    parkingOptions: [{ kind: "lot", id: "parking", name: "Aikštelė", pos: [54.68, 25.28], walk: 390,
      lot: { id: "parking", src: "judu", name: "Aikštelė", addr: null, city: "Vilnius", pos: [54.68, 25.28], access: "public", cap: 100, gated: true, t: { known: true, free: true, text: ["Nemokama"] } } }] },
    bike: null, walk: null, transit: null, transitNote: null, timetable: { built: "", window: "", shifted: false } };
}

test("selected parking leg drives ETA, geometry, fuel/CO2 and Waze to the same destination", () => {
  const plan = planFixture();
  const parking = plan.car!.parkingOptions[0];
  const drive: CarLeg = { ...leg(), to: parking.pos, duration: 1200, distance: 10000, geometry: [from, parking.pos], arrivalAt: "2026-10-12T05:20:00.000Z" };
  const changed = { ...plan, car: withDrive(plan.car!, drive, plan.depart.date) };
  const car = summarize(changed, DEFAULT_SETTINGS, parking.id)[0];
  assert.equal(car.duration, 1200 + 120 + 90 + 300);
  assert.equal(car.distance, 10000);
  assert.equal(car.co2, DEFAULT_SETTINGS.consumption / 10 * 2.31);
  assert.deepEqual(changed.car.geometry.at(-1), parking.pos);
  const url = new URL(wazeUrl(drive));
  assert.equal(url.pathname, "/live-map/directions");
  assert.equal(url.searchParams.get("from"), `ll.${from.join(",")}`);
  assert.equal(url.searchParams.get("to"), `ll.${parking.pos.join(",")}`);
  const hybrid = [{ kind: "walk", duration: 120 }, drive, { kind: "ride", duration: 600 }];
  assert.equal(wazeUrl(hybrid[1] as CarLeg), wazeUrl(drive));
});

test("Waze preview validates both ends while native navigation keeps its destination-only deep link", () => {
  const drive = leg();
  const navigation = new URL(wazeNavigationUrl(drive));
  assert.equal(navigation.pathname, "/ul");
  assert.equal(navigation.searchParams.get("ll"), to.join(","));
  assert.equal(navigation.searchParams.get("navigate"), "yes");
  assert.equal(navigation.searchParams.get("utm_source"), "eismopulsas");
  assert.throws(() => wazeUrl({ ...drive, from: [NaN, 25] }));
  assert.throws(() => wazeUrl({ ...drive, to: [54, 181] }));
  assert.throws(() => wazeNavigationUrl({ to: [91, 25] }));
});

test("parking tariffs use arrival at parking, excluding the onward walk", () => {
  const plan = planFixture();
  const drive = { ...leg(), arrivalAt: "2026-10-12T04:57:00.000Z" };
  plan.car = withDrive(plan.car!, drive, plan.depart.date);
  const parking = plan.car.parkingOptions[0];
  parking.lot!.t = { known: true, rates: [{ perHour: 1, rules: [{ season: null, days: [1], hours: [[8, 9]] }] }], text: [] };
  const result = evalParking(parking, plan, { ...DEFAULT_SETTINGS, parkingHours: 1 });
  assert.equal(result.cost, 0.97); // minute-based tariff rounded to cents, before the 5 min walk
});

test("API rejects invalid coordinates and departure before any routing request", async () => {
  assert.equal(parsePoint("NaN,25"), null);
  assert.equal((await driveGet(new Request("http://localhost/api/drive?from=0,0&to=0,1"))).status, 400);
  const q = new URLSearchParams({ from: from.join(","), to: to.join(","), depart: "2026-03-29T03:30" });
  assert.equal((await driveGet(new Request(`http://localhost/api/drive?${q}`))).status, 400);
  assert.equal((await planGet(new Request(`http://localhost/api/plan?${q}`))).status, 400);
});
