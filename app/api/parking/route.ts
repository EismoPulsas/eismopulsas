// Live parking data for the map's badges and cards.
//
//   GET /api/parking             -> { at, lots: { "code/name": { vacant, capacity, at } } | null }
//   GET /api/parking?chargers=1  -> … plus chargers: { "<id>": [available, total] } | null
//
// lots: JUDU gated car parks (CC BY-NC 4.0, © JUDU); chargers: Via Lietuva EV registry
// (CC BY 4.0). null means the source could not be read just now.

import { liveChargers, liveLots } from "@/lib/server/live-parking";

export async function GET(req: Request) {
  const withChargers = new URL(req.url).searchParams.get("chargers") === "1";
  const [lots, chargers] = await Promise.all([liveLots(), withChargers ? liveChargers() : Promise.resolve(undefined)]);
  return Response.json(
    { at: new Date().toISOString(), lots, ...(withChargers ? { chargers } : {}) },
    { headers: { "Cache-Control": "public, max-age=30, s-maxage=30" } },
  );
}
