import "server-only";
import { haversine, type LatLng } from "../geo";
import type { CarLeg, DriveWarning } from "../plan-types";

type Place = { code: string; name: string; coordinates: { latitude: number; longitude: number } };
type Forecast = {
  forecastCreationTimeUtc: string;
  forecastTimestamps: { forecastTimeUtc: string; conditionCode: string | null; airTemperature?: number; windSpeed?: number; totalPrecipitation?: number }[];
};
const conditions: Record<string, string> = {
  "light-rain": "Šlapia kelio danga", rain: "Lietus", "heavy-rain": "Smarkus lietus", thunder: "Perkūnija",
  "isolated-thunderstorms": "Trumpas lietus su perkūnija", thunderstorms: "Lietus su perkūnija", "heavy-rain-with-thunderstorms": "Smarkus lietus su perkūnija",
  "light-sleet": "Šlapdriba", sleet: "Šlapdriba", "freezing-rain": "Lijundra", hail: "Kruša",
  "light-snow": "Sniegas", snow: "Sniegas", "heavy-snow": "Smarkus sniegas", fog: "Rūkas",
};
const utc = (value: string) => Date.parse(value.replace(" ", "T") + (/(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? "" : "Z"));

/** Cached GET against api.meteo.lt; concurrent requests for one path share a fetch. */
function meteoClient(request: typeof fetch) {
  const cached = new Map<string, { at: number; value: unknown }>();
  const pending = new Map<string, Promise<unknown>>();
  async function json(path: string, ttl: number): Promise<unknown> {
    const entry = cached.get(path);
    if (entry && Date.now() - entry.at < ttl) return entry.value;
    if (pending.has(path)) return pending.get(path)!;
    const work = (async () => {
      const res = await request(`https://api.meteo.lt/v1/${path}`, { cache: "no-store", signal: AbortSignal.timeout(4000) });
      if (!res.ok) throw new Error("Weather unavailable");
      const value: unknown = await res.json();
      if (cached.size >= 256) cached.delete(cached.keys().next().value!);
      cached.set(path, { at: Date.now(), value });
      return value;
    })();
    pending.set(path, work);
    try { return await work; } finally { pending.delete(path); }
  }
  return json;
}

async function weatherPlaces(json: (path: string, ttl: number) => Promise<unknown>): Promise<Place[]> {
  const raw = await json("places", 24 * 3600000);
  return (Array.isArray(raw) ? raw : []).filter((p: Place) => typeof p?.code === "string" && /^[a-z0-9-]+$/.test(p.code) && Number.isFinite(p.coordinates?.latitude) && Number.isFinite(p.coordinates?.longitude)) as Place[];
}

/** One service instance shares only public forecast data, never user journeys. */
export function createWeatherService(request: typeof fetch = fetch) {
  const json = meteoClient(request);
  return async function weatherFor(leg: CarLeg): Promise<Pick<CarLeg, "weather" | "warnings">> {
    const warnings: DriveWarning[] = [];
    try {
      const places = await weatherPlaces(json);
      if (!places.length) throw new Error("No weather places");
      const samples: { pos: LatLng; fraction: number }[] = [{ pos: leg.from, fraction: 0 }, { pos: midpoint(leg.geometry), fraction: 0.5 }, { pos: leg.to, fraction: 1 }];
      const matches = samples.map((sample) => ({ ...sample, place: places.reduce((best, p) => haversine(sample.pos, [p.coordinates.latitude, p.coordinates.longitude]) < haversine(sample.pos, [best.coordinates.latitude, best.coordinates.longitude]) ? p : best) }));
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

export const weatherFor = createWeatherService();

const SKY: Record<string, string> = {
  clear: "Giedra", "partly-cloudy": "Mažai debesuota", "cloudy-with-sunny-intervals": "Debesuota su pragiedruliais", cloudy: "Debesuota",
  ...Object.fromEntries(Object.entries(conditions).map(([k, v]) => [k, k === "light-rain" ? "Nedidelis lietus" : v])),
};

export type Conditions = { place: string; at: string; temp: number; wind: number; precip: number; code: string; text: string };

/** Forecast for one spot and time (the trip start), from the nearest meteo.lt place. */
export function createForecastService(request: typeof fetch = fetch) {
  const json = meteoClient(request);
  return async function conditionsAt(pos: LatLng, atMs: number): Promise<Conditions | null> {
    try {
      const places = await weatherPlaces(json);
      if (!places.length) return null;
      const place = places.reduce((best, p) => (haversine(pos, [p.coordinates.latitude, p.coordinates.longitude]) < haversine(pos, [best.coordinates.latitude, best.coordinates.longitude]) ? p : best));
      const f = (await json(`places/${place.code}/forecasts/long-term`, 30 * 60000)) as Forecast;
      const times = (f?.forecastTimestamps ?? []).filter((p) => typeof p?.forecastTimeUtc === "string" && Number.isFinite(p.airTemperature));
      if (!times.length) return null;
      const nearest = times.reduce((a, b) => (Math.abs(utc(a.forecastTimeUtc) - atMs) <= Math.abs(utc(b.forecastTimeUtc) - atMs) ? a : b));
      if (Math.abs(utc(nearest.forecastTimeUtc) - atMs) > 90 * 60000) return null;
      const code = nearest.conditionCode ?? "";
      return {
        place: place.name,
        at: new Date(utc(nearest.forecastTimeUtc)).toISOString(),
        temp: nearest.airTemperature!,
        wind: nearest.windSpeed ?? 0,
        precip: nearest.totalPrecipitation ?? 0,
        code,
        text: SKY[code] ?? "",
      };
    } catch {
      return null;
    }
  };
}

export const conditionsAt = createForecastService();
