import { reportsStore, voterId } from "@/lib/reports-store";
import { REPORT_CATEGORIES, type ReportCategory } from "@/lib/reports";

export const dynamic = "force-dynamic";

// Lithuania with a little margin.
const BOUNDS = { minLat: 53.85, maxLat: 56.5, minLng: 20.9, maxLng: 26.9 };

// GET /api/reports – all user reports with vote counts.
export async function GET() {
  try {
    return Response.json(await reportsStore().list());
  } catch (err) {
    console.error("Listing reports failed:", err);
    return Response.json({ error: "Nepavyko gauti pranešimų" }, { status: 500 });
  }
}

// POST /api/reports {lat, lng, category, note?}
// A report near an existing one of the same category counts as a vote for it.
export async function POST(req: Request) {
  const voter = voterId(req);
  if (!voter) return Response.json({ error: "Trūksta x-voter-id antraštės" }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Neteisingas JSON" }, { status: 400 });
  }
  const { lat, lng, category, note } = (body ?? {}) as Record<string, unknown>;
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return Response.json({ error: "Nurodykite vietą (lat, lng)" }, { status: 400 });
  }
  if (lat < BOUNDS.minLat || lat > BOUNDS.maxLat || lng < BOUNDS.minLng || lng > BOUNDS.maxLng) {
    return Response.json({ error: "Vieta turi būti Lietuvoje" }, { status: 400 });
  }
  if (!REPORT_CATEGORIES.some((c) => c.id === category)) {
    return Response.json({ error: "Nežinoma pavojaus kategorija" }, { status: 400 });
  }
  const cleanNote = typeof note === "string" ? note.trim().slice(0, 280) || null : null;

  try {
    const result = await reportsStore().submit(
      { lat: +lat.toFixed(6), lng: +lng.toFixed(6), category: category as ReportCategory, note: cleanNote },
      voter,
    );
    return Response.json(result, { status: result.merged ? 200 : 201 });
  } catch (err) {
    console.error("Saving report failed:", err);
    return Response.json({ error: "Nepavyko išsaugoti pranešimo" }, { status: 500 });
  }
}
