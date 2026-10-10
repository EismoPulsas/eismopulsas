// JUDU's public gated-lot feed, mapped only to the official P+R site list.
// Pure parsing + an injected loader keep ArcGIS details out of the planner.
import type { ParkingInfo, SourceRef } from "../types";
import { PARK_AND_RIDE_SITES } from "./judu-park-ride";
import type { ParkingAvailabilityProvider, ParkingAvailabilitySnapshot } from "./types";

export const OCCUPANCY_SOURCE: SourceRef = {
  id: "judu-parking-occupancy",
  name: "JUDU aikštelių užimtumas (ArcGIS)",
  basis: "live",
  url: "https://arcgis.sisp.lt/arcgis/rest/services/Hosted/aiksteliu_uzimtumas_actual/FeatureServer/0",
  licence: "CC BY-NC 4.0, © JUDU",
  note: "Užimtumas stebėjimo metu, ne prognozė atvykimo laikui. Duomenys gali būti iki 2 min. senumo.",
};

// Operational assumptions, not promises by JUDU (DATA.md A6).
export const OCCUPANCY_CACHE_MS = 30_000;
export const OCCUPANCY_MAX_AGE_MS = 120_000;
export const OCCUPANCY_CLOCK_SKEW_MS = 30_000;

const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const count = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const normalize = (v: string) => v.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("lt-LT");
const siteIds = new Map(PARK_AND_RIDE_SITES.map((s) => [normalize(s.name), s.id]));
const unknownSites = (): Record<string, ParkingInfo["availability"]> => Object.fromEntries(PARK_AND_RIDE_SITES.map((s) => [s.id, null]));

export function parseJuduParkingOccupancy(payload: unknown, nowMs: number): ParkingAvailabilitySnapshot["bySiteId"] {
  if (!record(payload) || payload.error || payload.exceededTransferLimit === true || !Array.isArray(payload.features)) {
    throw new Error("Unexpected JUDU occupancy response");
  }
  const bySiteId = unknownSites();
  const seen = new Set<string>();
  for (const feature of payload.features) {
    if (!record(feature) || !record(feature.attributes)) continue;
    const a = feature.attributes;
    if (typeof a.pavadinimas !== "string") continue;
    const id = siteIds.get(normalize(a.pavadinimas));
    if (!id) continue;
    // Ambiguous duplicates are unknown, even if one of the rows looks valid.
    if (seen.has(id)) {
      bySiteId[id] = null;
      continue;
    }
    seen.add(id);
    if (a.status !== "ok" || !count(a.capacity) || a.capacity === 0 || !count(a.occupied) || !count(a.vacant)) continue;
    if (a.occupied > a.capacity || a.vacant > a.capacity || a.occupied + a.vacant !== a.capacity) continue;
    const at = a.timestamp_ms;
    if (!count(at) || at === 0 || at > nowMs + OCCUPANCY_CLOCK_SKEW_MS || nowMs - at > OCCUPANCY_MAX_AGE_MS) continue;
    bySiteId[id] = { vacant: a.vacant, capacity: a.capacity, observedAt: new Date(at).toISOString() };
  }
  return bySiteId;
}

/** One small cache per provider/server instance; failed loads also back off for 30 s. */
export function createParkingAvailabilityProvider(load: () => Promise<unknown>, now: () => number = Date.now): ParkingAvailabilityProvider {
  type Cached = { at: number; payload: unknown; source: SourceRef };
  let cache: Cached | undefined;
  let pending: Promise<Cached> | undefined;

  async function refresh(): Promise<Cached> {
    try {
      const payload = await load();
      const at = now();
      parseJuduParkingOccupancy(payload, at); // Reject ArcGIS error envelopes and truncated results.
      return { at, payload, source: { ...OCCUPANCY_SOURCE, fetchedAt: new Date(at).toISOString() } };
    } catch {
      // Do not reuse the last known counts after an upstream failure.
      return { at: now(), payload: null, source: { ...OCCUPANCY_SOURCE, note: "Užimtumo šaltinis laikinai nepasiekiamas arba grąžino netinkamus duomenis." } };
    }
  }

  return {
    async snapshot() {
      if (!cache || now() - cache.at >= OCCUPANCY_CACHE_MS) {
        pending ??= refresh();
        try {
          cache = await pending;
        } finally {
          pending = undefined;
        }
      }
      // Re-evaluate observation age even on a cache hit; fetching never resets it.
      return {
        source: { ...cache.source },
        bySiteId: cache.payload === null ? unknownSites() : parseJuduParkingOccupancy(cache.payload, now()),
      };
    },
  };
}
