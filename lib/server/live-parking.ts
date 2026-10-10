import "server-only";
import type { LiveLot } from "../plan-types";

// Live free spaces in JUDU's gated car parks (the layer behind judu.lt's occupancy
// map, refreshed every 30 s) and the live status of public EV chargers (Via Lietuva's
// national registry, OCPI 2.3.0). Both are cached briefly. A failed or implausible
// reading is left out: we never show old counts as if they were live.

const JUDU =
  "https://arcgis.sisp.lt/arcgis/rest/services/Hosted/aiksteliu_uzimtumas_actual/FeatureServer/0/query" +
  "?where=1%3D1&outFields=code,pavadinimas,capacity,occupied,vacant,status,timestamp_ms&returnGeometry=false&f=json";
const OCPI = "https://ev.vialietuva.lt/ocpi/2.3.0/locations";
const UA = { "User-Agent": "EismoPulsas/0.2 (https://github.com/EismoPulsas/eismopulsas)" };

/** A value refreshed at most every `ttl` ms; concurrent callers share one fetch, failures back off for `ttl`. */
function cached<T>(ttl: number, load: () => Promise<T>): () => Promise<T | null> {
  let entry: { at: number; data: T | null } | null = null;
  let inflight: Promise<T | null> | null = null;
  return () => {
    if (entry && Date.now() - entry.at < ttl) return Promise.resolve(entry.data);
    inflight ??= load()
      .catch(() => null)
      .then((data) => {
        entry = { at: Date.now(), data };
        inflight = null;
        return data;
      });
    return inflight;
  };
}

type JuduRow = { code: string; pavadinimas: string; capacity: number; occupied: number; vacant: number; status: string; timestamp_ms: number };

/** Free spaces per lot, keyed like lots.json › occ ("code/name"). */
export const liveLots = cached(30_000, async () => {
  const res = await fetch(JUDU, { headers: UA, signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`JUDU ${res.status}`);
  const body = (await res.json()) as { features?: { attributes: JuduRow }[]; error?: unknown };
  if (!body.features || body.error) throw new Error("JUDU: bad response");
  const out: Record<string, LiveLot> = {};
  const now = Date.now();
  for (const { attributes: r } of body.features) {
    const ok =
      r.status === "ok" &&
      Number.isInteger(r.capacity) &&
      r.capacity > 0 &&
      Number.isInteger(r.vacant) &&
      r.vacant >= 0 &&
      r.occupied >= 0 &&
      r.vacant <= r.capacity &&
      now - r.timestamp_ms < 10 * 60_000 &&
      r.timestamp_ms - now < 60_000;
    if (ok) out[`${r.code}/${r.pavadinimas}`] = { vacant: r.vacant, capacity: r.capacity, at: new Date(r.timestamp_ms).toISOString() };
  }
  return out;
});

type OcpiPage = { status_code: number; data?: { id: number | string; publish?: boolean; evses?: { status: string }[] }[] };

/** [available, total] charge points per charging location (chargers.json › id). */
export const liveChargers = cached(3 * 60_000, async () => {
  const out: Record<string, [number, number]> = {};
  for (let offset = 0; offset < 20_000; offset += 1000) {
    const res = await fetch(`${OCPI}?offset=${offset}&limit=1000`, { headers: UA, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`OCPI ${res.status}`);
    const page = (await res.json()) as OcpiPage;
    if (page.status_code !== 1000) throw new Error(`OCPI ${page.status_code}`);
    if (!page.data?.length) break;
    for (const loc of page.data) {
      const evses = (loc.evses ?? []).filter((e) => e.status !== "REMOVED");
      if (evses.length) out[String(loc.id)] = [evses.filter((e) => e.status === "AVAILABLE").length, evses.length];
    }
  }
  return out;
});
