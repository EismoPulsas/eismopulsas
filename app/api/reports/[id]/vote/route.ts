import { reportsStore, voterId } from "@/lib/reports-store";

export const dynamic = "force-dynamic";

// POST /api/reports/:id/vote – "aš irgi" (+1). One vote per voter id.
export async function POST(req: Request, ctx: RouteContext<"/api/reports/[id]/vote">) {
  const voter = voterId(req);
  if (!voter) return Response.json({ error: "Trūksta x-voter-id antraštės" }, { status: 400 });
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "Neteisingas id" }, { status: 400 });

  try {
    const result = await reportsStore().vote(id, voter);
    if (!result) return Response.json({ error: "Pranešimas nerastas" }, { status: 404 });
    return Response.json(result);
  } catch (err) {
    console.error("Voting failed:", err);
    return Response.json({ error: "Nepavyko užskaityti balso" }, { status: 500 });
  }
}
