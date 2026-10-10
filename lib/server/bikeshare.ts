import "server-only";
import type { LatLng } from "../geo";

// Vilnius public bike share (Cyclocity, JCDecaux) via its open GBFS v3 feed.
// Station list changes rarely; availability is refreshed every minute.
// The system runs April–October, so off-season stations simply report 0 bikes.

const SOURCE = "https://api.cyclocity.fr/contracts/vilnius/gbfs/v3";

export type BikeStation = {
  id: string;
  name: string;
  address: string;
  pos: LatLng;
  capacity: number;
  bikes: number;
  docks: number;
  open: boolean;
};

type RawInfo = { station_id: string; name: { text: string; language: string }[]; lat: number; lon: number; address?: string; capacity?: number };
type RawStatus = {
  station_id: string;
  num_vehicles_available: number;
  num_docks_available: number;
  is_installed: boolean;
  is_renting: boolean;
  is_returning: boolean;
};

// "K. SIRVYDO SKVERAS" -> "K. Sirvydo skveras": capitalise names, keep common nouns lower-case.
const COMMON = new Set(
  "skveras aikštė gatvė stotis parkas turgus turgavietė tiltas ir biblioteka gimnazija teatras stadionas universitetas centras žiedas rūmai kalnas miestas miestelis vartai".split(" "),
);
const tidy = (s: string) =>
  s !== s.toUpperCase()
    ? s
    : s
        .toLowerCase()
        .split(" ")
        .map((w, i) => (i > 0 && COMMON.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
        .join(" ");

let info: { at: number; stations: RawInfo[] } | null = null;
let cache: { at: number; stations: BikeStation[] } | null = null;
let inflight: Promise<BikeStation[]> | null = null;

async function get<T>(feed: string): Promise<T> {
  const res = await fetch(`${SOURCE}/${feed}.json`, { headers: { "User-Agent": "EismoPulsas/0.2" }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`cyclocity ${feed} ${res.status}`);
  return ((await res.json()) as { data: T }).data;
}

export async function bikeStations(): Promise<BikeStation[]> {
  if (cache && Date.now() - cache.at < 60 * 1000) return cache.stations;
  inflight ??= (async () => {
    try {
      if (!info || Date.now() - info.at > 6 * 3600 * 1000) {
        info = { at: Date.now(), stations: (await get<{ stations: RawInfo[] }>("station_information")).stations };
      }
      const status = new Map((await get<{ stations: RawStatus[] }>("station_status")).stations.map((s) => [s.station_id, s]));
      const stations = info.stations.map((s): BikeStation => {
        const st = status.get(s.station_id);
        const name = tidy(s.name.find((n) => n.language === "lt")?.text ?? s.name[0]?.text ?? s.station_id);
        return {
          id: s.station_id,
          name,
          address: s.address ?? "",
          pos: [s.lat, s.lon],
          capacity: s.capacity ?? 0,
          bikes: st?.num_vehicles_available ?? 0,
          docks: st?.num_docks_available ?? 0,
          open: !!st && st.is_installed && st.is_renting,
        };
      });
      cache = { at: Date.now(), stations };
      return stations;
    } catch (e) {
      // Stale data beats an empty map.
      if (cache) return cache.stations;
      throw e;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
