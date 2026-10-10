import "server-only";
import type { LatLng } from "../geo";
import { simplify } from "../geo";
import type { CarLeg, DriveWarning, TrafficInfo } from "../plan-types";
import type { departure } from "../departure";

type Departure = ReturnType<typeof departure>;
type Result = { status: "ok"; leg: CarLeg } | { status: "unavailable" } | { status: "fallback"; reason: NonNullable<TrafficInfo["fallbackReason"]> };
const record = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const categories: Record<string, string> = {
  accident: "Eismo įvykis", brokenDownVehicle: "Sugedęs automobilis", dangerousConditions: "Pavojingos sąlygos",
  flooding: "Užlietas kelias", fog: "Rūkas", ice: "Plikledis", jam: "Spūstis", laneClosed: "Uždaryta eismo juosta",
  rain: "Lietus", roadClosed: "Uždarytas kelias", roadWorks: "Kelio darbai", wind: "Stiprus vėjas", unknown: "Eismo sutrikimas",
};

export function parseTomtom(body: unknown, from: LatLng, to: LatLng, depart: Departure, now = Date.now()): CarLeg | null {
  const routes = record(body).routes;
  if (!Array.isArray(routes) || !routes.length) return null;
  const route = record(routes[0]);
  const summary = record(route.summary);
  if (!finite(summary.travelDurationInSeconds) || summary.travelDurationInSeconds < 0 || !finite(summary.lengthInMeters) || summary.lengthInMeters < 0 || !Array.isArray(route.legs) || !route.legs.length) return null;
  const geometry: LatLng[] = [];
  for (const leg of route.legs) {
    const path = record(record(leg).path);
    if (path.type !== "LineString" || !Array.isArray(path.coordinates) || path.coordinates.length < 2) return null;
    for (const point of path.coordinates) {
      if (!Array.isArray(point) || point.length < 2 || !finite(point[0]) || !finite(point[1]) || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90) return null;
      const p: LatLng = [point[1], point[0]];
      if (!geometry.length || geometry.at(-1)![0] !== p[0] || geometry.at(-1)![1] !== p[1]) geometry.push(p);
    }
  }
  if (geometry.length < 2) return null;
  const duration = Math.round(summary.travelDurationInSeconds);
  const warnings: DriveWarning[] = [];
  const sections = record(route.sections).traffic;
  if (Array.isArray(sections)) for (const item of sections) {
    const section = record(item);
    const text = categories[String(section.iconCategory)] ?? categories.unknown;
    if (!warnings.some((w) => w.text === text)) warnings.push({ kind: "traffic", text });
  }
  return {
    kind: "car", from, to, duration, distance: Math.round(summary.lengthInMeters), geometry: simplify(geometry, 8),
    departureAt: depart.at, arrivalAt: new Date(Date.parse(depart.at) + duration * 1000).toISOString(), baseDuration: null,
    traffic: {
      provider: "tomtom", mode: depart.isNow ? "live" : "predicted", source: depart.isNow ? "live" : "typical",
      calculatedAt: new Date(now).toISOString(), observedAt: null, partialCoverage: false, fallbackReason: null,
      delaySeconds: finite(summary.trafficDelayDurationInSeconds) && summary.trafficDelayDurationInSeconds >= 0 ? Math.round(summary.trafficDelayDurationInSeconds) : null,
      sensors: [], urbanDelay: 0, liveDelay: 0, city: null, peak: "day",
    }, warnings, weather: { status: "unavailable", forecastCreatedAt: null },
  };
}

/** `curb`: arrive with the destination on the right-hand (kerb) side, e.g. street parking on one side only. */
export async function tomtomRoute(from: LatLng, to: LatLng, depart: Departure, key: string, request: typeof fetch = fetch, opts: { curb?: boolean } = {}): Promise<Result> {
  try {
    const res = await request("https://api.tomtom.com/maps/orbis/routing/routes/calculate", {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(8000),
      headers: { "Content-Type": "application/json", "TomTom-Api-Version": "3", "TomTom-Api-Key": key, Attributes: "routes.summary,routes.legs.path,routes.sections.traffic" },
      body: JSON.stringify({ routePlanningLocations: { origin: { type: "Point", coordinates: [from[1], from[0]] }, destination: { type: "Point", coordinates: [to[1], to[0]] } },
        departureDateTime: depart.at, traffic: "live", legs: [{ routeType: "fast" }], ...(opts.curb ? { arrivalSidePreference: "curbSide" } : {}) }),
    });
    if (res.status === 429) return { status: "fallback", reason: "quota" };
    if (res.status === 401 || res.status === 403) return { status: "fallback", reason: "authentication" };
    const body: unknown = await res.json();
    if (["NO_ROUTE_FOUND", "MAP_MATCHING_FAILURE"].includes(String(record(record(body).detailedError).code))) return { status: "unavailable" };
    if (!res.ok) return { status: "fallback", reason: "provider-error" };
    const leg = parseTomtom(body, from, to, depart);
    return leg ? { status: "ok", leg } : { status: "fallback", reason: "invalid-response" };
  } catch (err) {
    return { status: "fallback", reason: err instanceof SyntaxError ? "invalid-response" : err instanceof Error && ["TimeoutError", "AbortError"].includes(err.name) ? "timeout" : "provider-error" };
  }
}
