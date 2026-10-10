import { inLithuania } from "@/lib/geo";
import { departure, localSecondsAt } from "@/lib/departure";
import { parsePoint } from "@/lib/driving";
import { routeCar } from "@/lib/server/driving";
import { parkingNear } from "@/lib/server/parking";
import { liveLots } from "@/lib/server/live-parking";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const from = parsePoint(q.get("from"));
  const to = parsePoint(q.get("to"));
  const parkingFor = q.has("parkingFor") ? parsePoint(q.get("parkingFor")) : null;
  if (q.has("parkingFor") && (!parkingFor || !inLithuania(parkingFor))) return Response.json({ error: "Neteisingas galutinis kelionės tikslas." }, { status: 400 });
  if (!from || !to || !inLithuania(from) || !inLithuania(to)) return Response.json({ error: "Nurodykite from ir to (lat,lng) Lietuvoje." }, { status: 400 });
  let depart;
  try { depart = departure(q.get("depart")); }
  catch (err) { return Response.json({ error: err instanceof Error ? err.message : "Neteisingas laikas." }, { status: 400 }); }
  const leg = await routeCar(from, to, depart);
  const body = leg && parkingFor ? { ...leg, parkingOptions: parkingNear(parkingFor, depart.date, localSecondsAt(leg.arrivalAt, depart.date), depart.isNow ? await liveLots() : null, Math.min(20, Math.max(3, Number(q.get("walk")) || 10))) } : leg;
  return Response.json(body ?? { error: "Tinkamo automobilio maršruto nerasta." }, { status: leg ? 200 : 404, headers: { "Cache-Control": "no-store" } });
}
