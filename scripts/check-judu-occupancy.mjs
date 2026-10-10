// Focused, dependency-free assertions (uses the already installed TypeScript compiler).
// node scripts/check-judu-occupancy.mjs [--live] [--api http://localhost:3000]
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temp = await mkdtemp(join(tmpdir(), "judu-occupancy-"));
const emitted = new Set();
async function emit(relative) {
  if (emitted.has(relative)) return;
  emitted.add(relative);
  const input = await readFile(join(root, relative), "utf8");
  let output = ts.transpileModule(input, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const dependencies = [...output.matchAll(/from "(\.\.?\/[^\"]+)"/g)].map((m) => m[1]);
  for (const dependency of dependencies) await emit(join(dirname(relative), `${dependency}.ts`));
  output = output.replace(/from "(\.\.?\/[^\"]+)"/g, 'from "$1.js"');
  const target = join(temp, relative.replace(/\.ts$/, ".js"));
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, output);
}

try {
  await writeFile(join(temp, "package.json"), '{"type":"module"}');
  const entries = ["lib/mobility/providers/judu-parking-occupancy-data.ts", "lib/mobility/plan.ts", "lib/mobility/validate.ts", "lib/mobility/providers/demo.ts"];
  for (const entry of entries) await emit(entry);
  const get = (relative) => import(pathToFileURL(join(temp, relative.replace(/\.ts$/, ".js"))).href);
  const { parseJuduParkingOccupancy: parse, createParkingAvailabilityProvider: create, OCCUPANCY_SOURCE, OCCUPANCY_CACHE_MS, OCCUPANCY_MAX_AGE_MS } = await get(entries[0]);
  const { planTrip } = await get(entries[1]);
  const { parsePlanRequest } = await get(entries[2]);
  const { demoRouting } = await get(entries[3]);
  const { PARK_AND_RIDE_SITES, PARK_AND_RIDE_SOURCE } = await get("lib/mobility/providers/judu-park-ride.ts");
  const fixedNow = Date.parse("2026-10-10T05:00:00Z");
  const row = (name = "Ukmergės g. 246", patch = {}) => ({ attributes: {
    pavadinimas: name, capacity: 94, occupied: 4, vacant: 90, status: "ok", timestamp_ms: fixedNow - 1000, ...patch,
  } });
  const payload = (...features) => ({ features });
  const one = (patch) => parse(payload(row(undefined, patch)), fixedNow)["ukmerges-246"];
  let checks = 0;
  function check(name, fn) { fn(); checks++; console.log(`OK ${name}`); }
  async function checkAsync(name, fn) { await fn(); checks++; console.log(`OK ${name}`); }

  check("all three exact official names map to site ids", () => {
    const result = parse(payload(...PARK_AND_RIDE_SITES.map((s) => row(s.name, { capacity: s.capacity, vacant: s.capacity - 4 }))), fixedNow);
    for (const site of PARK_AND_RIDE_SITES) assert.deepEqual(result[site.id], { vacant: site.capacity - 4, capacity: site.capacity, observedAt: new Date(fixedNow - 1000).toISOString() });
  });
  check("zero vacancies is a valid observation", () => assert.equal(one({ occupied: 94, vacant: 0 }).vacant, 0));
  check("normalized whitespace, case and Unicode; no fuzzy matches", () => {
    assert.equal(parse(payload(row(" UKMERGE\u0307S   g. 246 ")), fixedNow)["ukmerges-246"].vacant, 90);
    assert.equal(parse(payload(row("Ukmergės g. 246 P1")), fixedNow)["ukmerges-246"], null);
  });
  check("bad counts and status never become availability", () => {
    for (const patch of [{ occupied: -1 }, { vacant: -1 }, { capacity: 0 }, { vacant: 95 }, { occupied: 95 }, { vacant: 89 }, { occupied: 4.5 }, { vacant: "90" }, { capacity: null }, { vacant: null }, { occupied: null }, { capacity: Infinity }, { status: "error" }, { status: null }]) assert.equal(one(patch), null);
  });
  check("stale, missing, seconds-based and excessive future timestamps are unknown", () => {
    for (const at of [null, 0, "1791608400000", fixedNow / 1000, fixedNow - OCCUPANCY_MAX_AGE_MS - 1, fixedNow + 30_001]) assert.equal(one({ timestamp_ms: at }), null);
    assert.ok(one({ timestamp_ms: fixedNow - OCCUPANCY_MAX_AGE_MS }));
    assert.ok(one({ timestamp_ms: fixedNow + 30_000 }));
  });
  check("missing rows, malformed rows and ambiguous duplicates are unknown", () => {
    assert.ok(Object.values(parse(payload(null, {}, { attributes: null }, row("other")), fixedNow)).every((v) => v === null));
    for (const rows of [[row(), row()], [row(), row(undefined, { status: "error" })], [row(undefined, { status: "error" }), row()]]) assert.equal(parse(payload(...rows), fixedNow)["ukmerges-246"], null);
  });
  check("ArcGIS errors and partial result envelopes fail closed", () => {
    for (const body of [null, [], {}, { features: {} }, { error: { code: 500 }, features: [] }, { exceededTransferLimit: true, features: [row()] }]) assert.throws(() => parse(body, fixedNow));
  });
  await checkAsync("cache coalesces concurrent loads and preserves fetchedAt", async () => {
    let calls = 0;
    let clock = fixedNow;
    const provider = create(async () => { calls++; return payload(row()); }, () => clock);
    const snapshots = await Promise.all([provider.snapshot(), provider.snapshot(), provider.snapshot()]);
    assert.equal(calls, 1);
    assert.deepEqual(snapshots[0], snapshots[1]);
    clock += 5000;
    assert.equal((await provider.snapshot()).source.fetchedAt, new Date(fixedNow).toISOString());
    assert.equal(calls, 1);
    clock += OCCUPANCY_CACHE_MS;
    await provider.snapshot();
    assert.equal(calls, 2);
  });
  await checkAsync("cached data can expire before the next refresh", async () => {
    let clock = fixedNow;
    const provider = create(async () => payload(row(undefined, { timestamp_ms: fixedNow - OCCUPANCY_MAX_AGE_MS + 500 })), () => clock);
    assert.ok((await provider.snapshot()).bySiteId["ukmerges-246"]);
    clock += 501;
    assert.equal((await provider.snapshot()).bySiteId["ukmerges-246"], null);
  });
  await checkAsync("failed refresh discards counts, backs off, and recovers", async () => {
    let clock = fixedNow;
    let calls = 0;
    let fail = false;
    const provider = create(async () => { calls++; if (fail) throw new Error("timeout / HTTP / JSON error"); return payload(row()); }, () => clock);
    assert.ok((await provider.snapshot()).bySiteId["ukmerges-246"]);
    fail = true;
    clock += OCCUPANCY_CACHE_MS;
    const failed = await provider.snapshot();
    assert.ok(Object.values(failed.bySiteId).every((v) => v === null));
    assert.equal(failed.source.fetchedAt, undefined);
    await provider.snapshot();
    assert.equal(calls, 2);
    fail = false;
    clock += OCCUPANCY_CACHE_MS;
    assert.ok((await provider.snapshot()).bySiteId["ukmerges-246"]);
  });
  await checkAsync("malformed successful loads become unknown", async () => {
    for (const body of [{ error: { code: 500 } }, "not json", { features: null }]) assert.ok(Object.values((await create(async () => body, () => fixedNow).snapshot()).bySiteId).every((v) => v === null));
  });

  const body = JSON.parse(await readFile(join(root, "lib/mobility/scenarios/uc1-commute-in-city.json"), "utf8"));
  body.arriveBy = "2026-10-12T08:45:00+03:00";
  const parsed = parsePlanRequest(body, new Date(fixedNow));
  assert.equal(parsed.ok, true);
  const deps = { routing: demoRouting, parkingZones: { source: { id: "fixture-zone", name: "fixture", basis: "official" }, zoneAt: async () => "Raudona" }, parkRide: { source: PARK_AND_RIDE_SOURCE, sites: PARK_AND_RIDE_SITES }, now: () => new Date(fixedNow) };
  const baseline = await planTrip(parsed.value, deps);
  await checkAsync("demo pipeline remains deterministic without the optional enricher", async () => {
    assert.deepEqual(await planTrip(parsed.value, deps), baseline);
    assert.equal(baseline.dataMode, "demo");
    assert.equal(baseline.options.length, 3);
    for (const o of baseline.options) for (const leg of o.legs.filter((l) => l.mode !== "park")) { assert.equal(leg.basis, "demo"); assert.equal(leg.line, null); }
  });
  await checkAsync("enrichment preserves routes, metrics, recommendation and demo provenance", async () => {
    const enriched = await planTrip(parsed.value, { ...deps, parkingAvailability: create(async () => payload(...PARK_AND_RIDE_SITES.map((s) => row(s.name, { capacity: s.capacity, vacant: s.capacity - 4 }))), () => fixedNow) });
    assert.equal(enriched.dataMode, "demo");
    assert.deepEqual(enriched.recommendation, baseline.recommendation);
    for (const o of enriched.options) { const original = baseline.options.find((b) => b.id === o.id); assert.deepEqual(o.metrics, original.metrics); assert.deepEqual(o.legs, original.legs); assert.deepEqual(o.basis, original.basis); }
    const pr = enriched.options.find((o) => o.strategy === "park_and_ride");
    assert.ok(pr.parking.availability);
    assert.equal(pr.parking.basis, "official");
    assert.ok(pr.sources.includes(OCCUPANCY_SOURCE.id));
    assert.equal(enriched.sources.find((s) => s.id === OCCUPANCY_SOURCE.id).basis, "live");
    assert.equal(enriched.sources.find((s) => s.id === OCCUPANCY_SOURCE.id).licence, "CC BY-NC 4.0, © JUDU");
  });
  await checkAsync("each P+R site is enriched through its canonical id", async () => {
    for (const site of PARK_AND_RIDE_SITES) {
      const destination = parsed.value.destination;
      const origin = { lat: site.lat + (site.lat - destination.lat), lng: site.lng + (site.lng - destination.lng) };
      const response = await planTrip({ ...parsed.value, origin }, { ...deps, parkRide: { ...deps.parkRide, sites: [site] }, parkingAvailability: create(async () => payload(row(site.name, { capacity: site.capacity, vacant: site.capacity - 4 })), () => fixedNow) });
      assert.equal(response.options.find((o) => o.strategy === "park_and_ride").parking.availability.capacity, site.capacity);
    }
  });
  await checkAsync("unavailable, stale or throwing enrichment cannot break planning", async () => {
    for (const provider of [create(async () => { throw new Error("offline"); }, () => fixedNow), create(async () => payload(row(undefined, { timestamp_ms: fixedNow - 120_001 })), () => fixedNow), { snapshot: async () => { throw new Error("unexpected"); } }]) {
      const response = await planTrip(parsed.value, { ...deps, parkingAvailability: provider });
      assert.equal(response.options.find((o) => o.strategy === "park_and_ride").parking.availability, null);
      assert.deepEqual(response.recommendation, baseline.recommendation);
      assert.ok(response.warnings.some((w) => w.code === "parking_availability_unknown"));
    }
  });
  await checkAsync("no car or eligible sites makes no occupancy request", async () => {
    let calls = 0;
    const parkingAvailability = { snapshot: async () => { calls++; throw new Error("should not load"); } };
    await planTrip({ ...parsed.value, profile: { ...parsed.value.profile, car: { ...parsed.value.profile.car, available: false } } }, { ...deps, parkingAvailability });
    await planTrip(parsed.value, { ...deps, parkRide: { ...deps.parkRide, sites: [] }, parkingAvailability });
    assert.equal(calls, 0);
  });

  if (process.argv.includes("--live")) {
    const params = new URLSearchParams({ where: "1=1", outFields: "pavadinimas,capacity,occupied,vacant,status,timestamp_ms", returnGeometry: "false", f: "json" });
    const res = await fetch(`${OCCUPANCY_SOURCE.url}/query?${params}`, { signal: AbortSignal.timeout(10_000) });
    assert.equal(res.ok, true);
    const raw = await res.json();
    const result = parse(raw, Date.now());
    console.log("LIVE", JSON.stringify({ fetchedAt: new Date().toISOString(), bySiteId: result }));
    for (const site of PARK_AND_RIDE_SITES) assert.equal(raw.features.filter((f) => f.attributes.pavadinimas.trim() === site.name).length, 1);
    checks++;
  }
  const apiIndex = process.argv.indexOf("--api");
  if (apiIndex !== -1) {
    const base = process.argv[apiIndex + 1];
    assert.ok(base, "--api needs a URL");
    const url = `${base}/api/mobility/plan`;
    for (const scenario of ["uc1-commute-in-city", "uc1-commute-from-district", "uc2-old-town-appointment"]) {
      const request = JSON.parse(await readFile(join(root, `lib/mobility/scenarios/${scenario}.json`), "utf8"));
      request.arriveBy = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("cache-control"), "no-store");
      const response = await res.json();
      assert.equal(response.version, 1);
      assert.equal(response.dataMode, "demo");
      assert.ok(response.options.some((o) => o.id === response.recommendation.optionId));
      const pr = response.options.find((o) => o.strategy === "park_and_ride");
      if (pr) {
        assert.ok(pr.sources.includes(OCCUPANCY_SOURCE.id));
        assert.ok(response.sources.some((s) => s.id === OCCUPANCY_SOURCE.id && s.basis === "live"));
        if (pr.parking.availability === null) assert.ok(response.warnings.some((w) => w.code === "parking_availability_unknown"));
        else assert.ok(Date.now() - Date.parse(pr.parking.availability.observedAt) <= OCCUPANCY_MAX_AGE_MS + 1000);
      }
      console.log("API", scenario, JSON.stringify({ parking: pr?.parking, warnings: response.warnings }));
      checks++;
    }
    assert.equal((await fetch(url)).status, 405);
    for (const [body, code] of [["{}", "invalid_place"], ["nope", "invalid_json"]]) {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body });
      assert.equal(res.status, 400);
      assert.equal((await res.json()).code, code);
    }
    checks++;
  }
  console.log(`Passed ${checks} focused checks.`);
} finally {
  // Only remove the unique temporary compilation directory created above.
  await rm(temp, { recursive: true, force: true });
}
