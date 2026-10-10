import "server-only";
import { simplify, type LatLng } from "../geo";
import type { CarLeg, TrafficInfo } from "../plan-types";
import type { departure } from "../departure";
import { osrmRoute } from "./osrm";
import { applyTraffic } from "./traffic";
import { tomtomRoute } from "./tomtom";
import { weatherFor } from "./weather";

type Departure = ReturnType<typeof departure>;
type Dependencies = { key: () => string | undefined; provider: typeof tomtomRoute; fallback: typeof osrmRoute; traffic: typeof applyTraffic; weather: typeof weatherFor };

export function createCarRouter(overrides: Partial<Dependencies> = {}) {
  const deps: Dependencies = { key: () => process.env.TOMTOM_API_KEY, provider: tomtomRoute, fallback: osrmRoute, traffic: applyTraffic, weather: weatherFor, ...overrides };
  const pending = new Map<string, Promise<CarLeg | null>>();
  return async function routeCar(from: LatLng, to: LatLng, depart: Departure): Promise<CarLeg | null> {
    const identity = JSON.stringify([from, to, depart.isNow ? depart.at.slice(0, 16) : depart.at, depart.isNow]);
    if (pending.has(identity)) return pending.get(identity)!;
    const start = Date.now();
    const work = (async () => {
      let reason: TrafficInfo["fallbackReason"] = "missing-key";
      let leg: CarLeg | null = null;
      const key = deps.key();
      if (key) {
        const result = await deps.provider(from, to, depart, key);
        if (result.status === "unavailable") return null;
        if (result.status === "ok") leg = result.leg;
        else reason = result.reason;
      }
      if (!leg) {
        const route = await deps.fallback("car", from, to, true);
        if (!route || !Number.isFinite(route.duration) || route.duration < 0 || !Number.isFinite(route.distance) || route.distance < 0 || route.coords.length < 2 || route.coords.some((p) => !p.every(Number.isFinite))) return null;
        const { extra, info } = await deps.traffic(route.coords, route.segDurations, depart.weekday, depart.sec, depart.isNow);
        const duration = Math.max(0, Math.round(route.duration + extra));
        leg = { kind: "car", from, to, duration, distance: Math.round(route.distance), geometry: simplify(route.coords, 8),
          departureAt: depart.at, arrivalAt: new Date(Date.parse(depart.at) + duration * 1000).toISOString(), baseDuration: Math.round(route.duration),
          traffic: { ...info, fallbackReason: reason, calculatedAt: new Date().toISOString() }, warnings: [], weather: { status: "unavailable", forecastCreatedAt: null } };
      }
      const weather = await deps.weather(leg);
      console.info("Car routing", { provider: leg.traffic.provider, fallback: leg.traffic.fallbackReason, latencyMs: Date.now() - start });
      return { ...leg, weather: weather.weather, warnings: [...leg.warnings, ...weather.warnings] };
    })();
    pending.set(identity, work);
    try { return await work; } finally { pending.delete(identity); }
  };
}

export const routeCar = createCarRouter();
