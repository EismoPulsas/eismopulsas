import { neon } from "@neondatabase/serverless";

// Always run on each request (don't cache the database result at build time).
export const dynamic = "force-dynamic";

// Used until a database is connected, so the skeleton works from day one.
const SAMPLE = [
  { id: 1, lat: 54.6872, lng: 25.2797, severity: "injury", date: "2025-03-14", municipality: "Vilniaus m.", street: "Gedimino pr." },
  { id: 2, lat: 54.8985, lng: 23.9036, severity: "fatal", date: "2025-05-02", municipality: "Kauno m.", street: "Savanorių pr." },
  { id: 3, lat: 55.7033, lng: 21.1443, severity: "damage", date: "2025-07-21", municipality: "Klaipėdos m.", street: "Taikos pr." },
];

export async function GET() {
  const url = process.env.DATABASE_URL;
  if (!url) return Response.json(SAMPLE);

  try {
    const sql = neon(url);
    const rows = await sql`
      SELECT id, lat, lng, severity, date::text AS date, municipality, street
      FROM accidents
      LIMIT 5000
    `;
    return Response.json(rows);
  } catch (err) {
    console.error("Database query failed:", err);
    return Response.json({ error: "Database query failed" }, { status: 500 });
  }
}
