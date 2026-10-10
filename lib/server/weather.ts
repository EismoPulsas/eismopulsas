import "server-only";
import { haversine, type LatLng } from "../geo";
import type { CarLeg, DriveWarning, TripWeather } from "../plan-types";

type Place = { code: string; name: string; coordinates: { latitude: number; longitude: number } };
type Point = {
  forecastTimeUtc: string;
  conditionCode: string | null;
  airTemperature?: number;
  feelsLikeTemperature?: number;
  windSpeed?: number;
  windGust?: number;
  totalPrecipitation?: number;
};
type Forecast = { forecastCreationTimeUtc: string; forecastTimestamps: Point[] };
const conditions: Record<string, string> = {
  "light-rain": "Šlapia kelio danga", rain: "Lietus", "heavy-rain": "Smarkus lietus", thunder: "Perkūnija",
  "isolated-thunderstorms": "Trumpas lietus su perkūnija", thunderstorms: "Lietus su perkūnija", "heavy-rain-with-thunderstorms": "Smarkus lietus su perkūnija",
  "light-sleet": "Šlapdriba", sleet: "Šlapdriba", "freezing-rain": "Lijundra", hail: "Kruša",
  "light-snow": "Sniegas", snow: "Sniegas", "heavy-snow": "Smarkus sniegas", fog: "Rūkas",
};
const utc = (value: string) => Date.parse(value.replace(" ", "T") + (/(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? "" : "Z"));

type Json = (url: string, ttl: number) => Promise<unknown>;

/** Cached, de-duplicated GETs of public forecast data (never user journeys). */
function createCache(request: typeof fetch): Json {
  const cached = new Map<string, { at: number; value: unknown }>();
  const pending = new Map<string, Promise<unknown>>();
  return async function json(url: string, ttl: number): Promise<unknown> {
    const entry = cached.get(url);
    if (entry && Date.now() - entry.at < ttl) return entry.value;
    if (pending.has(url)) return pending.get(url)!;
    const work = (async () => {
      const res = await request(url, { cache: "no-store", signal: AbortSignal.timeout(4000) });
      if (!res.ok) throw new Error("Weather unavailable");
      const value: unknown = await res.json();
      if (cached.size >= 256) cached.delete(cached.keys().next().value!);
      cached.set(url, { at: Date.now(), value });
      return value;
    })();
    pending.set(url, work);
    try { return await work; } finally { pending.delete(url); }
  };
}

const METEO = "https://api.meteo.lt/v1/";

async function meteoPlaces(json: Json): Promise<Place[]> {
  const raw = await json(`${METEO}places`, 24 * 3600000);
  const places = (Array.isArray(raw) ? raw : []).filter((p: Place) => typeof p?.code === "string" && /^[a-z0-9-]+$/.test(p.code) && Number.isFinite(p.coordinates?.latitude) && Number.isFinite(p.coordinates?.longitude)) as Place[];
  if (!places.length) throw new Error("No weather places");
  return places;
}

const nearestPlace = (places: Place[], pos: LatLng) =>
  places.reduce((best, p) => (haversine(pos, [p.coordinates.latitude, p.coordinates.longitude]) < haversine(pos, [best.coordinates.latitude, best.coordinates.longitude]) ? p : best));

/** One service instance shares only public forecast data, never user journeys. */
export function createWeatherService(request: typeof fetch = fetch, shared?: Json) {
  const cache = shared ?? createCache(request);
  const json = (path: string, ttl: number) => cache(`${METEO}${path}`, ttl);
  return async function weatherFor(leg: CarLeg): Promise<Pick<CarLeg, "weather" | "warnings">> {
    const warnings: DriveWarning[] = [];
    try {
      const places = await meteoPlaces(cache);
      const samples: { pos: LatLng; fraction: number }[] = [{ pos: leg.from, fraction: 0 }, { pos: midpoint(leg.geometry), fraction: 0.5 }, { pos: leg.to, fraction: 1 }];
      const matches = samples.map((sample) => ({ ...sample, place: nearestPlace(places, sample.pos) }));
      const forecasts = new Map<string, Forecast | null>();
      await Promise.all([...new Set(matches.map((s) => s.place.code))].map(async (code) => {
        try { forecasts.set(code, await json(`places/${code}/forecasts/long-term`, 30 * 60000) as Forecast); }
        catch { forecasts.set(code, null); }
      }));
      let covered = 0;
      const creationTimes: number[] = [];
      for (const sample of matches) {
        const f = forecasts.get(sample.place.code);
        const created = f && typeof f.forecastCreationTimeUtc === "string" ? utc(f.forecastCreationTimeUtc) : NaN;
        if (!f || !Number.isFinite(created) || Date.now() - created > 6 * 3600000 || created > Date.now() + 60000 || !Array.isArray(f.forecastTimestamps)) continue;
        const times = f.forecastTimestamps.filter((p) => p && typeof p.forecastTimeUtc === "string" && Number.isFinite(utc(p.forecastTimeUtc)));
        const at = Date.parse(leg.departureAt) + sample.fraction * leg.duration * 1000;
        if (!times.length || at < Math.min(...times.map((p) => utc(p.forecastTimeUtc))) || at > Math.max(...times.map((p) => utc(p.forecastTimeUtc)))) continue;
        const nearest = times.reduce((a, b) => Math.abs(utc(a.forecastTimeUtc) - at) <= Math.abs(utc(b.forecastTimeUtc) - at) ? a : b);
        if (Math.abs(utc(nearest.forecastTimeUtc) - at) > 90 * 60000 || typeof nearest.conditionCode !== "string") continue;
        covered++;
        creationTimes.push(created);
        const condition = conditions[nearest.conditionCode!];
        const text = condition ? `${sample.place.name}: ${condition.toLowerCase()} (prognozė)` : null;
        if (text && !warnings.some((w) => w.text === text)) warnings.push({ kind: "weather", text, at: new Date(utc(nearest.forecastTimeUtc)).toISOString() });
      }
      return { warnings, weather: { status: covered === samples.length ? "available" : covered ? "partial" : "unavailable", forecastCreatedAt: creationTimes.length ? new Date(Math.min(...creationTimes)).toISOString() : null } };
    } catch {
      return { warnings, weather: { status: "unavailable", forecastCreatedAt: null } };
    }
  };
}

function midpoint(points: LatLng[]): LatLng {
  let total = 0;
  const lengths = points.slice(1).map((p, i) => { const d = haversine(points[i], p); total += d; return d; });
  let traversed = 0;
  for (let i = 0; i < lengths.length; i++) {
    if (traversed + lengths[i] >= total / 2) {
      const fraction = lengths[i] ? (total / 2 - traversed) / lengths[i] : 0;
      return [points[i][0] + fraction * (points[i + 1][0] - points[i][0]), points[i][1] + fraction * (points[i + 1][1] - points[i][1])];
    }
    traversed += lengths[i];
  }
  return points[0];
}

// ---------------------------------------------------------------- trip weather

// Riding a bike or scooter: what makes it a bad idea.
const WET = new Set(["rain", "heavy-rain", "thunder", "isolated-thunderstorms", "thunderstorms", "heavy-rain-with-thunderstorms", "light-sleet", "sleet", "freezing-rain", "hail", "light-snow", "snow", "heavy-snow"]);
const LABEL: Record<string, string> = {
  clear: "Giedra", "partly-cloudy": "Mažai debesuota", "cloudy-with-sunny-intervals": "Debesuota su pragiedruliais", cloudy: "Debesuota",
  "light-rain": "Nedidelis lietus", ...conditions, fog: "Rūkas",
};

/**
 * Weather at the start of a trip, for choosing how to travel. Meteo.lt (LHMT) gives
 * the official hourly forecast; Open-Meteo adds the chance of rain, which Meteo.lt
 * does not publish. Either may be missing – the trip is still planned.
 */
export function createTripWeather(request: typeof fetch = fetch, shared?: Json) {
  const json = shared ?? createCache(request);
  return async function tripWeather(pos: LatLng, startMs: number, durationSec: number): Promise<TripWeather | null> {
    const until = startMs + Math.max(durationSec, 3600) * 1000;
    const [meteo, chance] = await Promise.all([
      (async () => {
        const place = nearestPlace(await meteoPlaces(json), pos);
        const f = (await json(`${METEO}places/${place.code}/forecasts/long-term`, 30 * 60000)) as Forecast;
        // Hourly points covering the trip (the hour it starts in through arrival).
        const points = f.forecastTimestamps.filter((p) => {
          const t = utc(p.forecastTimeUtc);
          return t > startMs - 3600000 && t <= until;
        });
        return points.length ? { place: place.name, created: f.forecastCreationTimeUtc, points } : null;
      })().catch(() => null),
      (async () => {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${pos[0].toFixed(2)}&longitude=${pos[1].toFixed(2)}&hourly=precipitation_probability&timezone=GMT&forecast_days=7`;
        const d = (await json(url, 30 * 60000)) as { hourly?: { time: string[]; precipitation_probability: (number | null)[] } };
        const h = d.hourly;
        if (!h) return null;
        let max: number | null = null;
        h.time.forEach((t, i) => {
          const at = Date.parse(`${t}:00Z`);
          const v = h.precipitation_probability[i];
          if (at > startMs - 3600000 && at <= until && typeof v === "number") max = Math.max(max ?? 0, v);
        });
        return max;
      })().catch(() => null),
    ]);
    if (!meteo && chance === null) return null;

    const pts = meteo?.points ?? [];
    const first = pts[0];
    const worst = pts.find((p) => p.conditionCode && WET.has(p.conditionCode)) ?? first;
    const precip = Math.max(0, ...pts.map((p) => p.totalPrecipitation ?? 0));
    const gust = Math.max(0, ...pts.map((p) => p.windGust ?? 0));
    const temp = first?.airTemperature ?? null;
    const code = worst?.conditionCode ?? null;

    const bad: string[] = [];
    const caution: string[] = [];
    if (chance !== null && chance >= 60) bad.push(`lietaus tikimybė ${chance} %`);
    else if (chance !== null && chance >= 30) caution.push(`lietaus tikimybė ${chance} %`);
    if (code && WET.has(code)) bad.push(LABEL[code]?.toLowerCase() ?? "krituliai");
    else if (code === "light-rain") caution.push("nedidelis lietus");
    if (precip >= 0.5) bad.push(`${precip.toFixed(1).replace(".", ",")} mm/val. kritulių`);
    else if (precip > 0) caution.push("galimi krituliai");
    if (gust >= 15) bad.push(`vėjo gūsiai iki ${Math.round(gust)} m/s`);
    else if (gust >= 11) caution.push(`vėjo gūsiai ${Math.round(gust)} m/s`);
    if (temp !== null && temp <= 0 && (precip > 0 || (code && WET.has(code)))) bad.push("slidu");
    else if (temp !== null && temp <= 2) caution.push(`šalta (${Math.round(temp)} °C)`);
    if (code === "fog") caution.push("rūkas");

    return {
      place: meteo?.place ?? null,
      condition: code,
      // A dry-sounding condition but a high rain chance: say both.
      label: [code ? (LABEL[code] ?? code) : "Prognozė", chance !== null && chance >= 50 && !(code && WET.has(code)) ? "tikėtinas lietus" : ""].filter(Boolean).join(", "),
      temp: temp === null ? null : Math.round(temp),
      feelsLike: first?.feelsLikeTemperature === undefined ? null : Math.round(first.feelsLikeTemperature),
      wind: first?.windSpeed ?? null,
      gust: gust || null,
      precip,
      rainChance: chance,
      risk: bad.length ? "bad" : caution.length ? "caution" : "ok",
      reasons: bad.length ? bad : caution,
      forecastCreatedAt: meteo ? new Date(utc(meteo.created)).toISOString() : null,
    };
  };
}

const sharedCache = createCache(fetch);
export const weatherFor = createWeatherService(fetch, sharedCache);
export const tripWeather = createTripWeather(fetch, sharedCache);
