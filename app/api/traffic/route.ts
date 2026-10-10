// Live road sensors from eismoinfo.lt (Via Lietuva) for the map layer.
//
//   GET /api/traffic  ->  { time, sensors: [{ name, road, pos, speed, limit, vehicles }] }

import { freshSensor, liveSensors } from "@/lib/server/traffic";
import { observationTime } from "@/lib/departure";

export async function GET() {
  const { sensors } = await liveSensors();
  const out = sensors
    .filter((s) => freshSensor(s))
    .map((s) => {
      // Both directions together: vehicle-weighted average speed.
      const segs = s.segments.filter((g) => g.vehicles > 0 && Number.isFinite(g.speed) && g.speed > 0 && g.speed <= 200 && Number.isFinite(g.limit) && g.limit > 0);
      const vehicles = segs.reduce((a, g) => a + g.vehicles, 0);
      if (!vehicles) return null;
      const speed = segs.reduce((a, g) => a + g.speed * g.vehicles, 0) / vehicles;
      const limit = Math.max(...s.segments.map((g) => g.limit));
      return { name: s.name, road: s.road, pos: s.pos, speed: Math.round(speed), limit, vehicles, observedAt: new Date(observationTime(s.time)!).toISOString() };
    })
    .filter(Boolean);
  return Response.json(
    { time: out.map((s) => s!.observedAt).sort()[0] ?? null, sensors: out },
    { headers: { "Cache-Control": "public, max-age=120, s-maxage=300" } },
  );
}
