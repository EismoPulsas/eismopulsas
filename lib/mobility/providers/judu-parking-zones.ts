import "server-only";

// Paid street-parking zone at a point, from JUDU's public ArcGIS layer
// "Rinkliavos zonos 2025-07" (CC BY-NC 4.0, © JUDU; DATA.md › A2). The tariffs
// themselves are in config.ts (PARKING_ZONES). Proxied and cached like
// app/api/geocode: short timeout, 24 h in-memory cache per server instance.

import { PARKING_ZONES_SOURCE, ZONE_PRIORITY } from "../config";
import type { LatLng } from "../types";
import type { ParkingZoneProvider } from "./types";

const QUERY = `${PARKING_ZONES_SOURCE.url}/query`;
const TIMEOUT_MS = 2500;
const TTL = 24 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; zone: string | null }>();

export const juduParkingZones: ParkingZoneProvider = {
  source: {
    id: "judu-parking-zones",
    name: "JUDU rinkliavos zonos (ArcGIS)",
    basis: "official",
    url: PARKING_ZONES_SOURCE.url,
    licence: PARKING_ZONES_SOURCE.licence,
    note: "Zona nustatoma pagal tikslo tašką; tarifai patikrinti 2026-10-10.",
  },

  async zoneAt(p: LatLng): Promise<string | null> {
    const key = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL) return hit.zone;

    const params = new URLSearchParams({
      geometry: `${p.lng},${p.lat}`,
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "Zona",
      returnGeometry: "false",
      f: "json",
    });
    const res = await fetch(`${QUERY}?${params}`, {
      headers: { "User-Agent": "EismoPulsas/0.1 (https://github.com/EismoPulsas/eismopulsas)" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`JUDU zones ${res.status}`);
    const body = (await res.json()) as { features?: { attributes?: { Zona?: string } }[]; error?: unknown };
    if (!Array.isArray(body.features)) throw new Error("Unexpected JUDU zones response");

    const names = body.features.map((f) => f.attributes?.Zona).filter((z): z is string => !!z);
    const zone = ZONE_PRIORITY.find((z) => names.includes(z)) ?? names[0] ?? null;
    if (cache.size > 2000) cache.clear();
    cache.set(key, { at: Date.now(), zone });
    return zone;
  },
};
