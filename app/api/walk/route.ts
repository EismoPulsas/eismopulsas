// A short walk along streets, for drawing on the map.
//
//   GET /api/walk?from=54.6800,25.2800&to=54.6812,25.2876
//     -> { coords: [[lat, lng], …], distance, duration, routed }
//
// The map asks only for the walk it is showing (from a car park to B, from a car
// park to a stop…). Results are cached server-side; `routed: false` means no
// router answered and the straight line is all we have.

import { parsePoint } from "@/lib/driving";
import { haversine, inLithuania } from "@/lib/geo";
import { walkPath } from "@/lib/server/streets";

const MAX_WALK = 5000; // m; longer is not a walk to draw

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const from = parsePoint(q.get("from"));
  const to = parsePoint(q.get("to"));
  if (!from || !to || !inLithuania(from) || !inLithuania(to)) return Response.json({ error: "Nurodykite from ir to (lat,lng) Lietuvoje" }, { status: 400 });
  if (haversine(from, to) > MAX_WALK) return Response.json({ error: "Per toli ėjimui" }, { status: 400 });
  const path = await walkPath(from, to);
  return Response.json(path, { headers: { "Cache-Control": "public, max-age=86400" } });
}
