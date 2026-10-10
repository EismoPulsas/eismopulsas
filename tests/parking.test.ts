import assert from "node:assert/strict";
import { test } from "node:test";
import { bestParking, DEFAULT_SETTINGS, evalParkingAt, lotRateAt, zoneLot, zonePaidAt, type ParkingEval, type Settings } from "../lib/metrics";
import type { Lot, ParkingOption, ParkingZone } from "../lib/plan-types";
import { parkingNear } from "../lib/server/parking";
import { lotClass, lotLabel, slotOf, whenLabel } from "../components/planner/parking-meta";

const YELLOW: ParkingZone = { city: "Vilnius", zone: "Geltonoji zona", price: 1, text: "1,00 €/val., mokama I-V 8-20", rules: [{ season: null, days: [1, 2, 3, 4, 5], hours: [[8, 20]] }] };
const WED = "2026-10-07";
const SAT = "2026-10-10";
const at = (h: number, m = 0) => h * 3600 + m * 60;
const osmFree = (access: Lot["access"]): Lot => ({
  id: "osm-w1",
  src: "osm",
  name: null,
  addr: null,
  city: "Vilnius",
  pos: [54.67634, 25.26943],
  access,
  cap: null,
  t: { known: true, free: true, text: ["Nemokama (pagal OpenStreetMap)"] },
});

test("zones: paid on weekdays 8–20 only, the moment decides", () => {
  assert.equal(zonePaidAt(YELLOW, WED, at(18, 36)), true);
  assert.equal(zonePaidAt(YELLOW, WED, at(21)), false);
  assert.equal(zonePaidAt(YELLOW, SAT, at(12)), false);
  // Past midnight of the departure day counts on the next day (Wed 23:30 + 9 h = Thu 08:30).
  assert.equal(zonePaidAt(YELLOW, WED, at(32, 30)), true);
  assert.deepEqual(slotOf({ date: WED, sec: at(18, 36), isNow: false }), [2, 18]);
  assert.equal(whenLabel({ date: WED, sec: at(18, 36), isNow: false }), "Tr 18:36");
});

test("a car park tagged free in OpenStreetMap but inside a paid zone is priced as the zone", () => {
  const lot = zoneLot(osmFree("public"), YELLOW);
  assert.equal(lot.t.free, undefined);
  assert.equal(lot.t.zone, YELLOW);
  assert.match(lot.t.assumed ?? "", /mokamoje zonoje/);
  // Wednesday 18:36 it is paid, never shown as free…
  const wed = { date: WED, sec: at(18, 36), isNow: false };
  assert.equal(lotRateAt(lot.t, wed.date, wed.sec), 1);
  assert.equal(lotClass(lot, wed), "paid");
  assert.equal(lotLabel(lot, wed), "1 €/h");
  // …but in the evening and at the weekend it is free.
  for (const w of [{ date: WED, sec: at(21), isNow: false }, { date: SAT, sec: at(12), isNow: false }]) {
    assert.equal(lotClass(lot, w), "free");
    assert.equal(lotLabel(lot, w), "0 €");
  }
  // Shop car parks and car parks outside zones keep their own rules.
  assert.equal(zoneLot(osmFree("customers"), YELLOW).t.free, true);
  assert.equal(zoneLot(osmFree("public"), null).t.free, true);
});

test("the stay in such a car park costs the zone's paid hours; the JUDU EV permit makes it free", () => {
  const lot = zoneLot(osmFree("public"), YELLOW);
  const o: ParkingOption = { kind: "lot", id: lot.id, name: "Aikštelė", pos: lot.pos, walk: 100, lot };
  // Arrive 18:36 (+1 min to get in), stay 2 h: paid until 20:00 only.
  const e = evalParkingAt(o, WED, at(18, 36), DEFAULT_SETTINGS, 2);
  assert.ok(e.cost! > 1.3 && e.cost! < 1.45, `cost ${e.cost}`);
  const ev: Settings = { ...DEFAULT_SETTINGS, fuel: "electric", evPermit: true };
  assert.equal(evalParkingAt(o, WED, at(18, 36), ev, 2).cost, 0);
  assert.equal(evalParkingAt(o, SAT, at(12), DEFAULT_SETTINGS, 2).cost, 0);
});

test("server: free-tagged car parks in Naujamiestis's yellow zone are no longer offered as free on a weekday", () => {
  const opts = parkingNear([54.6765, 25.2695], WED, at(18, 36), null);
  const zoned = opts.filter((o) => o.kind === "lot" && o.lot?.t.zone);
  assert.ok(zoned.length > 0);
  for (const o of zoned) assert.ok(evalParkingAt(o, WED, at(18, 36), DEFAULT_SETTINGS, 2).cost! > 0, o.id);
});

test("EV: charging while parked tips the choice to a charger a little farther away, only when asked", () => {
  const ev = (id: string, walkSec: number, charge: boolean): ParkingEval => ({
    option: { kind: id === "c" ? "charger" : "zone", id, name: id, pos: [54.68, 25.28], walk: walkSec * 1.3 },
    cost: 1,
    costNote: "",
    walkSec,
    searchSec: 60,
    chance: null,
    chanceText: null,
    charge: charge ? ({ kW: 11, kWh: 20, km: 110, cost: 5 } as ParkingEval["charge"]) : null,
    usable: true,
  });
  const evals = [ev("street", 0, false), ev("c", 240, true)];
  assert.equal(bestParking(evals, "balanced")?.option.id, "street");
  assert.equal(bestParking(evals, "balanced", true)?.option.id, "c");
});
