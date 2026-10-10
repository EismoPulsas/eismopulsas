// Weather at the trip start for the planner (meteo.lt forecast, nearest place).
//
//   GET /api/weather?lat=54.68&lng=25.28[&at=ISO]  ->  { place, at, temp, wind, precip, code, text } | { error }

import { conditionsAt } from "@/lib/server/weather";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const lat = Number(q.get("lat"));
  const lng = Number(q.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return Response.json({ error: "lat, lng" }, { status: 400 });
  const at = q.get("at") ? Date.parse(q.get("at")!) : Date.now();
  const c = await conditionsAt([lat, lng], Number.isFinite(at) ? at : Date.now());
  if (!c) return Response.json({ error: "Orų prognozė nepasiekiama" }, { status: 502 });
  return Response.json(c, { headers: { "Cache-Control": "public, max-age=600" } });
}
