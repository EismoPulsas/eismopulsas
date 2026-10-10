// Free-floating e-scooters for the map layer (real GBFS feed if configured, demo
// data in previews – see lib/server/scooters.ts).
//
//   GET /api/scooters?bbox=54.66,25.24,54.70,25.32   (south,west,north,east)
//   ->  { source: "gbfs" | "demo" | "none", operator, updated, total, vehicles: [{ id, pos, battery }] }

import { scooterFleet } from "@/lib/server/scooters";

const MAX = 1500;

export async function GET(req: Request) {
  const fleet = await scooterFleet();
  const b = (new URL(req.url).searchParams.get("bbox") ?? "").split(",").map(Number);
  const inBox = b.length === 4 && b.every(Number.isFinite);
  const vehicles = inBox ? fleet.vehicles.filter((v) => v.pos[0] >= b[0] && v.pos[0] <= b[2] && v.pos[1] >= b[1] && v.pos[1] <= b[3]) : fleet.vehicles;
  return Response.json(
    { source: fleet.source, operator: fleet.operator, updated: fleet.updated, total: vehicles.length, vehicles: vehicles.slice(0, MAX) },
    { headers: { "Cache-Control": "public, max-age=30, s-maxage=30" } },
  );
}
