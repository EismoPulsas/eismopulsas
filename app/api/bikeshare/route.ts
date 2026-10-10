// Cyclocity Vilnius stations with live bikes / free docks (official GBFS), for the map layer.
//
//   GET /api/bikeshare  ->  { updated, stations: [{ id, name, pos, capacity, bikes, docks, renting }] }

import { cyclocityStations } from "@/lib/server/micromobility";

export async function GET() {
  const data = await cyclocityStations();
  return Response.json(data, { headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } });
}
