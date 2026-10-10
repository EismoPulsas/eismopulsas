// Public transport stops from the national GTFS timetable.
//
//   GET /api/stops?bbox=54.68,25.26,54.70,25.30        (south,west,north,east)
//     -> { stops: [{ id, name, pos, routes: [{ short, color, type }] }] }
//   GET /api/stops?id=1234[&depart=2026-10-12T08:00]
//     -> { name, departures: [{ route, color, type, headsign, time }] }   time = local seconds
//
// Stop ids are positions in the current timetable build, valid until `npm run data`.

import { departure } from "@/lib/departure";
import { departuresFrom, stopsInBox } from "@/lib/server/transit";

const MAX_STOPS = 800;

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;

  if (q.has("id")) {
    let depart;
    try {
      depart = departure(q.get("depart"));
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : "Neteisingas laikas." }, { status: 400 });
    }
    const result = departuresFrom(Number(q.get("id")), depart.date, depart.sec);
    if (!result) return Response.json({ error: "Tokios stotelės nėra" }, { status: 404 });
    return Response.json(result, { headers: { "Cache-Control": "public, max-age=30" } });
  }

  const b = (q.get("bbox") ?? "").split(",").map(Number);
  if (b.length !== 4 || !b.every(Number.isFinite)) return Response.json({ error: "Nurodykite bbox=pietūs,vakarai,šiaurė,rytai" }, { status: 400 });
  // Keep the box city-sized; the map only asks when zoomed in.
  if (b[2] - b[0] > 0.2 || b[3] - b[1] > 0.35) return Response.json({ stops: [] });
  return Response.json({ stops: stopsInBox(b[0], b[1], b[2], b[3], MAX_STOPS) }, { headers: { "Cache-Control": "public, max-age=3600" } });
}
