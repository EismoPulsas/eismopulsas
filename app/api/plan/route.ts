// Compares getting from A to B by car, public transport, bicycle and on foot.
//
//   GET /api/plan?from=54.6872,25.2797&to=54.7310,25.2620[&depart=2026-10-10T08:30]
//
// `depart` is local Lithuanian time; without it the trip starts now. Costs and
// CO₂ are computed in the browser (lib/metrics.ts) so settings apply instantly.

import { haversine, inLithuania, simplify, type LatLng } from "@/lib/geo";
import type { CarResult, PlanResponse } from "@/lib/plan-types";
import { estimateScooter, planBikeshare } from "@/lib/server/micromobility";
import { osrmRoute } from "@/lib/server/osrm";
import { parkingZoneAt } from "@/lib/server/parking";
import { applyTraffic } from "@/lib/server/traffic";
import { planTransit, resolveDay, timetableInfo } from "@/lib/server/transit";

const BIKE_SPEED = 16 / 3.6; // m/s

const parsePoint = (s: string | null): LatLng | null => {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(s ?? "");
  return m ? [+m[1], +m[2]] : null;
};

/** Current or requested local time in Lithuania. */
function departure(param: string | null) {
  const now = new Date();
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Vilnius",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const nowDate = `${parts.year}-${parts.month}-${parts.day}`;
  const nowSec = +parts.hour * 3600 + +parts.minute * 60 + +parts.second;
  const m = /^(\d{4}-\d\d-\d\d)T(\d\d):(\d\d)/.exec(param ?? "");
  const date = m ? m[1] : nowDate;
  const sec = m ? +m[2] * 3600 + +m[3] * 60 : nowSec;
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const diff = (Date.parse(`${date}T00:00:00Z`) + sec * 1000 - (Date.parse(`${nowDate}T00:00:00Z`) + nowSec * 1000)) / 60000;
  return { date, sec, weekday, isNow: Math.abs(diff) <= 45 };
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const from = parsePoint(q.get("from"));
  const to = parsePoint(q.get("to"));
  if (!from || !to) return Response.json({ error: "Nurodykite from ir to (lat,lng)" }, { status: 400 });
  if (!inLithuania(from) || !inLithuania(to))
    return Response.json({ error: "Kol kas skaičiuojame tik maršrutus Lietuvoje" }, { status: 400 });

  const depart = departure(q.get("depart"));
  const straight = haversine(from, to);
  if (straight < 50) return Response.json({ error: "Taškai A ir B per arti vienas kito" }, { status: 400 });

  const [carRoute, bike, walk, share] = await Promise.all([
    osrmRoute("car", from, to, true),
    straight < 80_000 ? osrmRoute("bike", from, to) : null,
    straight < 25_000 ? osrmRoute("foot", from, to) : null,
    straight < 20_000 ? planBikeshare(from, to, depart.date, depart.isNow) : { result: null, note: null },
  ]);
  const scooter = straight < 20_000 ? estimateScooter(from, to, bike) : null;

  let car: CarResult | null = null;
  if (carRoute) {
    const { extra, info } = await applyTraffic(carRoute.coords, carRoute.segDurations, depart.weekday, depart.sec, depart.isNow);
    const parking = parkingZoneAt(to);
    // Walk to the car, then find a spot and walk from it (longer in paid zones).
    const overhead = 120 + (parking ? 360 : 180);
    const baseDuration = Math.round(carRoute.duration);
    car = {
      distance: Math.round(carRoute.distance),
      baseDuration,
      traffic: info,
      overhead,
      duration: baseDuration + extra + overhead,
      geometry: simplify(carRoute.coords, 8),
      parking,
    };
  }

  const { day, shifted } = resolveDay(depart.date);
  let transit = null;
  let transitNote: string | null = null;
  if (straight < 400) transitNote = "Per arti viešajam transportui – geriau eiti pėsčiomis.";
  else {
    transit = planTransit(from, to, day, depart.sec);
    if (!transit) transitNote = "Šiuo metu tinkamo viešojo transporto reiso nerasta (gal per vėlu arba šalia nėra stotelių).";
  }

  const body: PlanResponse = {
    from,
    to,
    depart,
    straight: Math.round(straight),
    car,
    bike: bike && {
      distance: Math.round(bike.distance),
      // The public bike profile assumes racing speeds (~25–30 km/h); an everyday
      // city ride with crossings averages ≈ 16 km/h, plus a minute to lock up.
      duration: Math.round(Math.max(bike.duration, bike.distance / BIKE_SPEED) + 60),
      geometry: simplify(bike.coords, 8),
    },
    walk: walk && { distance: Math.round(walk.distance), duration: Math.round(walk.duration), geometry: simplify(walk.coords, 8) },
    bikeshare: share.result && { ...share.result, geometry: simplify(share.result.geometry, 8) },
    bikeshareNote: share.note,
    scooter: scooter && { ...scooter, geometry: simplify(scooter.geometry, 8) },
    transit,
    transitNote,
    timetable: { ...timetableInfo(), shifted },
  };
  return Response.json(body);
}
