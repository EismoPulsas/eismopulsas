// Car + second leg: where to leave the car on the way and how to continue.
//
//   GET /api/hybrid?from=54.7329,25.2236&to=54.7228,25.3375&depart=2026-10-12T05:00:00.000Z
//       &car=1260&stay=9[&ev=1&conn=T2,CCS&ac=11&dc=100&bat=60&permit=1][&prio=cheap]
//       [&modes=transit,bikeshare,scooter][&su=0.5&sm=0.15]
//
// `depart` is the door departure (as /api/plan returns it), `car` the driving A → B
// seconds with traffic, `stay` how long the car will stand (hours). Prices and the final
// ranking are worked out in the browser (lib/metrics.ts › summarizeHybrids).

import { inLithuania } from "@/lib/geo";
import { departure } from "@/lib/departure";
import { parsePoint } from "@/lib/driving";
import { DEFAULT_SETTINGS, type Priority, type Settings } from "@/lib/metrics";
import type { Connector, SecondKind } from "@/lib/plan-types";
import { planHybrids } from "@/lib/server/hybrid";
import { liveLots } from "@/lib/server/live-parking";

const PRIORITIES: Priority[] = ["balanced", "fast", "cheap", "green"];
const KINDS: SecondKind[] = ["transit", "bikeshare", "scooter"];
const CONNECTORS: Connector[] = ["T2", "CCS", "CHADEMO", "T1", "SCHUKO", "OTHER"];

const num = (v: string | null, lo: number, hi: number, dflt: number) => {
  const n = Number(v);
  return v !== null && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const from = parsePoint(q.get("from"));
  const to = parsePoint(q.get("to"));
  if (!from || !to || !inLithuania(from) || !inLithuania(to)) return Response.json({ error: "Nurodykite from ir to (lat,lng) Lietuvoje." }, { status: 400 });
  let depart;
  try {
    depart = departure(q.get("depart"));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Neteisingas laikas." }, { status: 400 });
  }
  const ev = q.get("ev") === "1";
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    fuel: ev ? "electric" : "petrol",
    parkingHours: num(q.get("stay"), 0.25, 24, DEFAULT_SETTINGS.parkingHours),
    connectors: (q.get("conn") ?? "").split(",").filter((c): c is Connector => CONNECTORS.includes(c as Connector)),
    acKw: num(q.get("ac"), 1, 50, DEFAULT_SETTINGS.acKw),
    dcKw: num(q.get("dc"), 1, 400, DEFAULT_SETTINGS.dcKw),
    batteryKwh: num(q.get("bat"), 5, 200, DEFAULT_SETTINGS.batteryKwh),
    evPermit: q.get("permit") === "1",
    priority: PRIORITIES.find((p) => p === q.get("prio")) ?? "balanced",
    hybridModes: q.has("modes") ? KINDS.filter((k) => q.get("modes")!.split(",").includes(k)) : KINDS,
    scooterUnlock: num(q.get("su"), 0, 5, DEFAULT_SETTINGS.scooterUnlock),
    scooterPerMin: num(q.get("sm"), 0, 2, DEFAULT_SETTINGS.scooterPerMin),
  };
  if (!settings.connectors.length) settings.connectors = DEFAULT_SETTINGS.connectors;
  const carSec = q.has("car") ? num(q.get("car"), 60, 6 * 3600, 0) : null;
  const live = depart.isNow ? await liveLots() : null;
  const body = await planHybrids({ from, to, depart, carSec, settings, live });
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
