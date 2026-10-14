import assert from "node:assert/strict";
import { test } from "node:test";
import { inLithuania, type LatLng } from "../lib/geo";
import { fold, reverseAddress, searchAddresses } from "../lib/server/addresses";

const VILNIUS: LatLng = [54.687, 25.28];

test("address search: accents, case and street types do not matter", () => {
  assert.equal(fold("Saulėtekio al. 9"), "sauletekio al 9");
  const [first] = searchAddresses("sauletekio al", VILNIUS);
  assert.equal(first.label, "Saulėtekio al.");
  assert.equal(first.sub, "Vilnius");
});

test("address search: a house number finds the building, block letters next", () => {
  const hits = searchAddresses("gedimino pr 9", VILNIUS);
  assert.equal(hits[0].kind, "address");
  assert.equal(hits[0].pick, "Gedimino pr. 9, Vilnius");
  assert.equal(hits[1].label, "Gedimino pr. 9A");
});

test("address search: the town may follow the number, and wins over distance", () => {
  const [first] = searchAddresses("Laisvės al. 50 Kaunas", VILNIUS);
  assert.equal(first.pick, "Laisvės al. 50, Kaunas");
});

test("address search: a typed street type rules out streets of other types", () => {
  const streets = searchAddresses("Taikos pr", VILNIUS).filter((h) => h.kind === "street");
  assert.ok(streets.length > 0);
  for (const h of streets) assert.match(h.label, /pr\.$/);
});

test("address search: nearer streets first, villages get their municipality", () => {
  const hits = searchAddresses("saules", VILNIUS);
  assert.equal(hits[0].pick, "Saulės g., Vilnius");
  assert.ok(hits.slice(1).some((h) => / r\.$/.test(h.sub)), "a village street names its district");
});

test("address search: a typo still finds the street, and names start with what was typed", () => {
  assert.equal(searchAddresses("gedemino", VILNIUS)[0].pick, "Gedimino pr., Vilnius");
  assert.equal(searchAddresses("kalvarju", VILNIUS)[0].pick, "Kalvarijų g., Vilnius");
  assert.equal(searchAddresses("kauans", VILNIUS)[0].label, "Kaunas");
  // "ged": Gedimino pr. before Juozo Gedimino Morkūno g.
  for (const h of searchAddresses("ged", VILNIUS).filter((h) => h.kind === "street")) assert.match(h.label, /^Ged/);
});

test("address search: towns, districts and named places", () => {
  assert.equal(searchAddresses("kaunas", VILNIUS)[0].kind, "place");
  assert.equal(searchAddresses("pilaite", VILNIUS)[0].label, "Pilaitė");
  const mall = searchAddresses("akropolis kaunas", VILNIUS)[0];
  assert.equal(mall.kind, "poi");
  assert.equal(mall.sub, "Kaunas");
  assert.equal(mall.cat, "shop=mall");
});

test("address search: everything found is in Lithuania", () => {
  for (const q of ["Gedimino", "Rygos", "Varšuvos", "Minsko", "Karaliaučiaus", "Ryga", "Warszawa"])
    for (const h of searchAddresses(q, null)) assert.ok(inLithuania([h.lat, h.lng]), `${q}: ${h.label}`);
});

test("reverse address: a known place keeps its kind, for the parking stay guess", () => {
  const mall = searchAddresses("akropolis", VILNIUS)[0];
  const r = reverseAddress([mall.lat, mall.lng]);
  assert.equal(r?.cat, "shop=mall");
  assert.equal(r?.pick, "PLC „Akropolis“, Vilnius");
});

test("reverse address: the building at a point, else the street", () => {
  const home = searchAddresses("zirmunu 70", VILNIUS)[0];
  assert.equal(reverseAddress([home.lat, home.lng])?.pick, "Žirmūnų g. 70, Vilnius");
  // Out in the fields: the nearest street within 400 m, never a foreign place.
  assert.match(reverseAddress([55.3, 24.5])?.sub ?? "", /r\.$/);
});
