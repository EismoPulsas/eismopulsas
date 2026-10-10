// Vilnius Cyclocity bike-share stations with live availability, for the map layer.
//
//   GET /api/bikeshare  ->  { stations: [{ id, name, address, pos, capacity, bikes, docks, open }] }

import { bikeStations } from "@/lib/server/bikeshare";

export async function GET() {
  try {
    const stations = await bikeStations();
    return Response.json({ stations }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } });
  } catch {
    return Response.json({ stations: [] }, { status: 502 });
  }
}
