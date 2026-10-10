// Live road sensors from eismoinfo.lt (Via Lietuva) for the map layer.
//
//   GET /api/traffic  ->  { time, sensors: [{ name, road, pos, speed, limit, vehicles }] }

import { liveSensors } from "@/lib/server/traffic";

export async function GET() {
  const { sensors } = await liveSensors();
  const out = sensors
    .map((s) => {
      // Both directions together: vehicle-weighted average speed.
      const segs = s.segments.filter((g) => g.vehicles > 0 && g.speed > 0);
      const vehicles = segs.reduce((a, g) => a + g.vehicles, 0);
      if (!vehicles) return null;
      const speed = segs.reduce((a, g) => a + g.speed * g.vehicles, 0) / vehicles;
      const limit = Math.max(...s.segments.map((g) => g.limit));
      return { name: s.name, road: s.road, pos: s.pos, speed: Math.round(speed), limit, vehicles };
    })
    .filter(Boolean);
  return Response.json(
    { time: sensors[0]?.time ?? null, sensors: out },
    { headers: { "Cache-Control": "public, max-age=120, s-maxage=300" } },
  );
}
