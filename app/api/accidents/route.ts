import { CATEGORIES, FLAG, YEARS } from "@/lib/data";

// Public read API over the official accident data (GeoJSON).
//
//   GET /api/accidents?year=2025&muni=13&category=bike&severity=fatal,injury&limit=1000
//
//   year      2021–2025 (default: latest)
//   muni      municipality LAU code, e.g. 13 = Vilniaus m. sav. (see /data/stats.json)
//   category  all | bike | pedestrian | scooter | moto | drunk | child
//   severity  comma list of fatal, injury, damage (default: fatal,injury)
//   limit     max features, ≤ 20000 (default 5000)

export const dynamic = "force-dynamic";

type YearFile = {
  n: number;
  dict: { muni: string[]; street: string[]; kind: string[] };
  lat: number[];
  lng: number[];
  t: number[];
  k: number[];
  i: number[];
  m: number[];
  s: number[];
  r: number[];
  f: number[];
  id: string[];
};

const EPOCH = Date.UTC(2020, 0, 1);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const p = url.searchParams;
  const year = Number(p.get("year") ?? YEARS.at(-1));
  if (!(YEARS as readonly number[]).includes(year)) {
    return Response.json({ error: `year turi būti vienas iš: ${YEARS.join(", ")}` }, { status: 400 });
  }
  const muni = p.get("muni");
  const category = CATEGORIES.find((c) => c.id === (p.get("category") ?? "all"));
  if (!category) return Response.json({ error: "Nežinoma category" }, { status: 400 });
  const severities = new Set((p.get("severity") ?? "fatal,injury").split(","));
  const limit = Math.min(Math.max(Number(p.get("limit") ?? 5000) || 5000, 1), 20000);

  // The data lives as static files next to the app; read it through our own origin
  // so this works the same locally and on serverless hosts.
  const res = await fetch(new URL(`/data/accidents-${year}.json`, url.origin));
  if (!res.ok) return Response.json({ error: "Duomenų failas nerastas" }, { status: 500 });
  const d = (await res.json()) as YearFile;

  const features = [];
  for (let j = 0; j < d.n && features.length < limit; j++) {
    const sev = d.k[j] > 0 ? "fatal" : d.i[j] > 0 ? "injury" : "damage";
    if (!severities.has(sev)) continue;
    const code = d.m[j] >= 0 ? d.dict.muni[d.m[j]] : null;
    if (muni && code !== muni) continue;
    if (category.flag && !(d.f[j] & category.flag)) continue;
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [d.lng[j] / 1e5, d.lat[j] / 1e5] },
      properties: {
        id: d.id[j],
        datetime: new Date(EPOCH + d.t[j] * 60000).toISOString().slice(0, 16).replace("T", " "),
        severity: sev,
        killed: d.k[j],
        injured: d.i[j],
        municipality: code,
        street: d.s[j] >= 0 ? d.dict.street[d.s[j]] : null,
        type: d.r[j] >= 0 ? d.dict.kind[d.r[j]] : null,
        bicycle: Boolean(d.f[j] & FLAG.BIKE),
        pedestrian: Boolean(d.f[j] & FLAG.PEDESTRIAN),
        intoxicated: Boolean(d.f[j] & FLAG.DRUNK),
      },
    });
  }

  return Response.json(
    { type: "FeatureCollection", features, source: "Policijos departamentas, EĮIS (data.gov.lt #509)" },
    { headers: { "Cache-Control": "public, s-maxage=86400" } },
  );
}
