// Compares getting from A to B by car, public transport, bicycle and on foot.
//
//   GET /api/plan?from=54.6872,25.2797&to=54.7310,25.2620[&depart=2026-10-10T08:30][&walk=10]
//
// `depart` is local Lithuanian time; without it the trip starts now. `walk` is the
// longest walk from the car the user accepts, in minutes (profile; default 10).
// Costs and CO₂ are computed in the browser (lib/metrics.ts) so settings apply instantly.

import { haversine, inLithuania, simplify } from "@/lib/geo";
import { carDeparture, departure, localSecondsAt } from "@/lib/departure";
import { parsePoint } from "@/lib/driving";
import type { CarResult, PlanResponse } from "@/lib/plan-types";
import { liveLots } from "@/lib/server/live-parking";
import { estimateScooter, planBikeshare } from "@/lib/server/micromobility";
import { osrmRoute } from "@/lib/server/osrm";
import { scooterFleet } from "@/lib/server/scooters";
import { parkingNear, parkingZoneAt } from "@/lib/server/parking";
import { routeCar } from "@/lib/server/driving";
import { planTransit, resolveDay, timetableInfo } from "@/lib/server/transit";
import { tripWeather } from "@/lib/server/weather";

const BIKE_SPEED = 16 / 3.6; // m/s

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const from = parsePoint(q.get("from"));
  const to = parsePoint(q.get("to"));
  if (!from || !to) return Response.json({ error: "Nurodykite from ir to (lat,lng)" }, { status: 400 });
  if (!inLithuania(from) || !inLithuania(to))
    return Response.json({ error: "Kol kas skaičiuojame tik maršrutus Lietuvoje" }, { status: 400 });

  let depart;
  try { depart = departure(q.get("depart")); }
  catch (err) { return Response.json({ error: err instanceof Error ? err.message : "Neteisingas laikas." }, { status: 400 }); }
  const straight = haversine(from, to);
  if (straight < 50) return Response.json({ error: "Taškai A ir B per arti vienas kito" }, { status: 400 });

  const [drive, bike, walk, share, fleet, weather] = await Promise.all([
    routeCar(from, to, carDeparture(depart)),
    straight < 80_000 ? osrmRoute("bike", from, to) : null,
    straight < 25_000 ? osrmRoute("foot", from, to) : null,
    straight < 20_000 ? planBikeshare(from, to, depart.date, depart.isNow) : { result: null, note: null },
    scooterFleet(),
    // A city trip takes well under an hour; the forecast covers the first hour or so.
    tripWeather(from, Date.parse(depart.at), Math.min(3 * 3600, straight / 4)),
  ]);
  const scooter = straight < 20_000 ? estimateScooter(from, to, bike, fleet) : null;

  let car: CarResult | null = null;
  if (drive) {
    const parking = parkingZoneAt(to);
    // Walk to the car, then find a spot and walk from it (longer in paid zones).
    // The browser replaces the second part when the user picks where to park.
    const overhead = 120 + (parking ? 360 : 180);
    const duration = drive.duration + overhead;
    const arrive = localSecondsAt(Date.parse(drive.arrivalAt) + (overhead - 120) * 1000, depart.date);
    const walk = Math.min(20, Math.max(3, Number(q.get("walk")) || 10));
    // Live free spaces only make sense for a trip that starts about now.
    const live = depart.isNow ? await liveLots() : null;
    car = {
      drive,
      distance: drive.distance,
      baseDuration: drive.baseDuration,
      traffic: drive.traffic,
      overhead,
      duration,
      geometry: drive.geometry,
      parking,
      arrive,
      parkingOptions: parkingNear(to, depart.date, arrive, live, walk),
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
    weather,
  };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
