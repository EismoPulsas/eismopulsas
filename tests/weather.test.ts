import assert from "node:assert/strict";
import test from "node:test";
import { rank, type ModeSummary } from "../lib/metrics";
import { createTripWeather } from "../lib/server/weather";

const pos: [number, number] = [54.68, 25.28];
const hour = (ms: number) => new Date(ms).toISOString().replace("T", " ").slice(0, 19);

/** Fake Meteo.lt + Open-Meteo answering with one hourly point at `start`. */
function service(start: number, point: Record<string, unknown>, chance: number | null) {
  return createTripWeather(async (url) => {
    const u = String(url);
    if (u.endsWith("/places")) return Response.json([{ code: "vilnius", name: "Vilnius", coordinates: { latitude: 54.68, longitude: 25.28 } }]);
    if (u.includes("meteo.lt")) return Response.json({ forecastCreationTimeUtc: hour(start - 3600000), forecastTimestamps: [{ forecastTimeUtc: hour(start), ...point }] });
    if (chance === null) throw new Error("offline");
    return Response.json({ hourly: { time: [new Date(start).toISOString().slice(0, 16)], precipitation_probability: [chance] } });
  });
}

const start = Math.floor(Date.now() / 3600000) * 3600000 + 3600000;
const dry = { conditionCode: "cloudy", airTemperature: 12, feelsLikeTemperature: 11, windSpeed: 3, windGust: 6, totalPrecipitation: 0 };

test("high rain chance makes riding a bad idea even under a dry-looking sky", async () => {
  const w = (await service(start, dry, 75)(pos, start, 1200))!;
  assert.equal(w.risk, "bad");
  assert.equal(w.rainChance, 75);
  assert.match(w.reasons.join(), /75 %/);
  assert.match(w.label, /tikėtinas lietus/);
});

test("rain, ice and gales are bad; a light breeze is fine", async () => {
  assert.equal((await service(start, { ...dry, conditionCode: "rain", totalPrecipitation: 1.2 }, null)(pos, start, 1200))!.risk, "bad");
  assert.equal((await service(start, { ...dry, airTemperature: -1, conditionCode: "light-snow", totalPrecipitation: 0.1 }, 20)(pos, start, 1200))!.risk, "bad");
  assert.equal((await service(start, { ...dry, windGust: 17 }, 5)(pos, start, 1200))!.risk, "bad");
  assert.equal((await service(start, dry, 10)(pos, start, 1200))!.risk, "ok");
  assert.equal((await service(start, dry, 40)(pos, start, 1200))!.risk, "caution");
});

test("no forecast at all leaves the plan without weather", async () => {
  const offline = createTripWeather(async () => {
    throw new Error("offline");
  });
  assert.equal(await offline(pos, start, 1200), null);
});

const mode = (id: ModeSummary["id"], duration: number, cost: number, extra: Partial<ModeSummary> = {}): ModeSummary => ({
  id, duration, distance: 4000, cost, costLines: [], co2: 0, kcal: 0, feasible: true, ...extra,
});

test("bad weather keeps the bike from being recommended, unless nothing else is left", () => {
  const bike = mode("bike", 900, 0, { weatherWarning: "Nerekomenduojama: lietus" });
  // On its own numbers the bike would win easily (fastest and free).
  assert.notEqual(rank([bike, mode("transit", 1500, 1), mode("car", 1200, 4)], "balanced").best, "bike");
  assert.equal(rank([bike, mode("walk", 3600, 0, { feasible: false })], "balanced").best, "bike");
});
