import { planTrip } from "@/lib/mobility/plan";
import { getProviders } from "@/lib/mobility/providers";
import { parsePlanRequest } from "@/lib/mobility/validate";

export const dynamic = "force-dynamic";

// POST /api/mobility/plan – compare car, public transport and car → P+R → public
// transport for one trip and recommend one (contract: ROUTING.md § 9,
// lib/mobility/types.ts). The request body holds personal locations: it is never
// stored and never logged.
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Neteisingas JSON", code: "invalid_json" }, { status: 400 });
  }
  const parsed = parsePlanRequest(body, new Date());
  if (!parsed.ok) return Response.json({ error: parsed.error, code: parsed.code }, { status: 400 });

  try {
    const plan = await planTrip(parsed.value, getProviders());
    return Response.json(plan, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("Mobility plan failed:", err instanceof Error ? err.message : "unknown error");
    return Response.json({ error: "Nepavyko suplanuoti kelionės", code: "plan_failed" }, { status: 500 });
  }
}
