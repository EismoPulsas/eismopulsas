// Every street, town and building address in Lithuania, and named places, for the search box.
// Called from build-data.mjs:
//
//   npm run data -- addresses   # the address register -> data/addresses.json.gz
//   npm run data -- places      # districts, malls, schools, stations (OpenStreetMap) -> data/places.json.gz
//
// Source: Registrų centras, Lietuvos Respublikos adresų registras (open data, updated monthly):
//   - adr_gra_adresai_LT.zip – address points (one per building or plot) with WGS84 coordinates
//   - adr_stat_lr.csv        – the same addresses as text: street, house number, building block
//   - adr_gatves.csv         – streets: name and type (g., pr., al., pl. …), the town they are in
//   - adr_savivaldybes.csv   – municipalities
//   - data.gov.lt (Spinta)   – towns and villages, names in the nominative and the genitive
//
// Output: data/addresses.json.gz – columns of towns, streets and their house numbers, read by
// lib/server/addresses.ts. Coordinates are integers in 1e-5° (≈ 1 m); a street's addresses are
// stored as offsets from the previous one, which keeps the file small.

import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";

const RC = "https://www.registrucentras.lt/aduomenys/?byla=";
const TOWNS = "https://get.data.gov.lt/datasets/gov/rc/ar/gyvenamojivietove/GyvenamojiVietove/:format/csv";

/** Town types, most important first (index = code in the output). */
const TOWN_TYPES = ["m.", "mstl.", "k.", "k. dal.", "vs.", "glž. st.", "md.", "gyv."];

/** "Vilniaus rajono" -> "Vilniaus r.", "Birštono" -> "Birštono sav." */
const savShort = (name) => (name.endsWith(" rajono") ? name.replace(/ rajono$/, " r.") : name.endsWith(" miesto") ? name.replace(/ miesto$/, " m.") : `${name} sav.`);

/** "12A" < "12B" < "13" < "120": numbers by their numeric part, then the rest. */
function byHouse(a, b) {
  const na = parseInt(a.nr, 10);
  const nb = parseInt(b.nr, 10);
  if (na !== nb) return (Number.isNaN(na) ? 1e9 : na) - (Number.isNaN(nb) ? 1e9 : nb);
  if (a.nr !== b.nr) return a.nr < b.nr ? -1 : 1;
  return (+a.k || 0) - (+b.k || 0);
}

/** The point nearest to the middle of the others: inside the town or on the street, never in a field between two parts. */
function medoid(pts) {
  const ys = pts.map((p) => p[0]).sort((a, b) => a - b);
  const xs = pts.map((p) => p[1]).sort((a, b) => a - b);
  const my = ys[ys.length >> 1];
  const mx = xs[xs.length >> 1];
  let best = pts[0];
  let bd = Infinity;
  for (const p of pts) {
    const d = (p[0] - my) ** 2 + ((p[1] - mx) * 0.57) ** 2;
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

/** Address points: the file is ~450 MB of GeoJSON, so it is scanned in pieces instead of parsed whole. */
function readPoints(buf) {
  const pos = new Map();
  const re = /"AOB_KODAS":(\d+)[^}]*?"E_KOORD":(-?[\d.]+),"N_KOORD":(-?[\d.]+)/g;
  const STEP = 32 << 20;
  let carry = "";
  for (let at = 0; at < buf.length; at += STEP) {
    const text = carry + buf.toString("latin1", at, Math.min(buf.length, at + STEP));
    // Keep the unfinished feature for the next piece.
    const cut = text.lastIndexOf("}}");
    const head = cut < 0 ? "" : text.slice(0, cut + 2);
    carry = cut < 0 ? text : text.slice(cut + 2);
    re.lastIndex = 0;
    for (let m; (m = re.exec(head)); ) pos.set(+m[1], [Math.round(+m[3] * 1e5), Math.round(+m[2] * 1e5)]);
  }
  return pos;
}

/**
 * Named places people search for that are not addresses: districts, malls, schools, hospitals,
 * stations, sights. `cat` (OpenStreetMap key=value) also tells the planner how long the car stays.
 */
const PLACE_QUERIES = [
  ["place", "suburb|quarter|neighbourhood"],
  ["shop", "mall|supermarket|department_store|doityourself|hardware|furniture|electronics|car|wholesale"],
  ["amenity", "university|college|hospital|clinic|theatre|cinema|townhall|library|marketplace|bus_station|courthouse|police|arts_centre|community_centre|conference_centre|events_venue|swimming_pool|ferry_terminal"],
  ["amenity", "school|kindergarten|post_office|fuel|place_of_worship"],
  ["tourism", "attraction|museum|hotel|gallery|zoo|theme_park|camp_site"],
  ["leisure", "stadium|sports_centre|park|water_park|ice_rink|golf_course"],
  ["aeroway", "aerodrome|terminal"],
  ["railway", "station"],
  ["office", "government"],
  ["historic", "castle|manor"],
];
const OVERPASS = "https://overpass-api.de/api/interpreter";

export async function buildPlaces({ ROOT, UA }) {
  console.log("Vietos (OpenStreetMap)…");
  const byKey = new Map();
  for (const [key, values] of PLACE_QUERIES) {
    const q = `[out:json][timeout:180];area["ISO3166-1"="LT"][admin_level=2]->.a;nwr["name"]["${key}"~"^(${values})$"](area.a);out center tags qt;`;
    // The public server turns big requests away when busy: one category at a time, patiently.
    let els = null;
    for (let attempt = 1; !els; attempt++) {
      try {
        const res = await fetch(OVERPASS, { method: "POST", headers: { "User-Agent": UA, Accept: "application/json" }, body: new URLSearchParams({ data: q }) });
        const text = await res.text();
        if (!res.ok || !text.startsWith("{")) throw new Error(`HTTP ${res.status}`);
        els = JSON.parse(text).elements;
      } catch (err) {
        if (attempt >= 5) throw new Error(`Overpass ${key}: ${err.message}`);
        await new Promise((r) => setTimeout(r, 20000 * attempt));
      }
    }
    for (const e of els) {
      const t = e.tags ?? {};
      const lat = e.lat ?? e.center?.lat;
      const lng = e.lon ?? e.center?.lon;
      if (!t.name || lat == null) continue;
      const y = Math.round(lat * 1e5);
      const x = Math.round(lng * 1e5);
      // A shop drawn both as a point and as a building is one place.
      const k = `${t.name.toLowerCase()}|${Math.round(y / 300)}|${Math.round(x / 500)}`;
      if (!byKey.has(k)) byKey.set(k, { n: t.name, c: `${key}=${t[key]}`, y, x });
    }
    console.log(`  ${key}=${values.split("|").length} rūšių: ${els.length}`);
  }
  const list = [...byKey.values()];
  const cats = [...new Set(list.map((p) => p.c))];
  const out = {
    built: new Date().toISOString().slice(0, 10),
    source: "OpenStreetMap bendruomenė (ODbL), Overpass API",
    cats,
    n: list.map((p) => p.n),
    c: list.map((p) => cats.indexOf(p.c)),
    y: list.map((p) => p.y),
    x: list.map((p) => p.x),
  };
  const gz = zlib.gzipSync(JSON.stringify(out), { level: 9 });
  await fs.writeFile(path.join(ROOT, "data", "places.json.gz"), gz);
  console.log(`  → data/places.json.gz (${list.length} vietų, ${(gz.length / 1e6).toFixed(1)} MB)`);
}

const pipeRows = (buf) =>
  buf
    .toString("utf8")
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .slice(1)
    .filter(Boolean)
    .map((l) => l.split("|"));

export async function buildAddresses({ ROOT, cachedDownload, unzip, csvRows }) {
  console.log("Adresai (Registrų centras)…");
  const [zip, statBuf, streetBuf, savBuf, townBuf] = await Promise.all([
    cachedDownload(`${RC}adr_gra_adresai_LT.zip`, "adr_gra_adresai_LT.zip"),
    cachedDownload(`${RC}adr_stat_lr.csv`, "adr_stat_lr.csv"),
    cachedDownload(`${RC}adr_gatves.csv`, "adr_gatves.csv"),
    cachedDownload(`${RC}adr_savivaldybes.csv`, "adr_savivaldybes.csv"),
    cachedDownload(TOWNS, "adr_gyvenamosios_vietoves.csv"),
  ]);
  const points = readPoints(unzip(zip, ["adr_gra_adresai_LT.json"])["adr_gra_adresai_LT.json"]);
  console.log(`  ${points.size} adresų taškų`);

  const savName = new Map(pipeRows(savBuf).map((r) => [+r[0], savShort(r[3])]));
  const townInfo = new Map();
  for (const r of csvRows(townBuf)) {
    if (r.gyv_iki?.trim()) continue;
    townInfo.set(+r.gyv_kodas, { name: r.pavadinimas, gen: r.pavadinimas_k, type: Math.max(0, TOWN_TYPES.indexOf(r.tipo_santrumpa)) });
  }
  const streetInfo = new Map(pipeRows(streetBuf).map((r) => [+r[0], { name: r[3], type: r[2], town: +r[4] }]));

  // Every address joined with its point, grouped by street (or by town where there are no streets).
  const groups = new Map(); // key: "s<gat>" | "t<gyv>"
  const townSav = new Map(); // gyv -> Map(sav -> count)
  let missing = 0;
  for (const [sav, aob, gyv, gat, nr, korp] of pipeRows(statBuf)) {
    const p = points.get(+aob);
    if (!p || !nr) {
      missing++;
      continue;
    }
    const key = gat ? `s${gat}` : `t${gyv}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { gyv: +gyv, gat: gat ? +gat : null, list: [] }));
    g.list.push({ nr: nr.trim(), k: korp.trim(), p });
    const counts = townSav.get(+gyv) ?? new Map();
    counts.set(+sav, (counts.get(+sav) ?? 0) + 1);
    townSav.set(+gyv, counts);
  }
  console.log(`  ${missing} adresų be taško ar numerio praleista`);

  // Towns: only those with at least one address (they are the ones we can place on the map).
  const townPts = new Map();
  for (const g of groups.values()) {
    const list = townPts.get(g.gyv) ?? [];
    for (const a of g.list) list.push(a.p);
    townPts.set(g.gyv, list);
  }
  const townIds = [...townPts.keys()].filter((id) => townInfo.has(id));
  townIds.sort((a, b) => townPts.get(b).length - townPts.get(a).length);
  const townIndex = new Map(townIds.map((id, i) => [id, i]));
  const savList = [...new Set([...savName.values()])];
  const towns = { n: [], g: [], t: [], s: [], y: [], x: [], c: [] };
  for (const id of townIds) {
    const info = townInfo.get(id);
    const [[sav]] = [...townSav.get(id)].sort((a, b) => b[1] - a[1]);
    const [y, x] = medoid(townPts.get(id));
    towns.n.push(info.name);
    towns.g.push(info.gen === info.name ? "" : info.gen);
    towns.t.push(info.type);
    towns.s.push(savList.indexOf(savName.get(sav)));
    towns.y.push(y);
    towns.x.push(x);
    towns.c.push(townPts.get(id).length);
  }

  // Streets (street-less village addresses become a street with no name), with their house numbers.
  const types = [];
  const streets = { n: [], t: [], w: [], y: [], x: [], a: [] };
  const addr = { h: [], y: [], x: [] };
  const entries = [...groups.values()].filter((g) => townIndex.has(g.gyv));
  entries.sort((a, b) => townIndex.get(a.gyv) - townIndex.get(b.gyv) || (a.gat ? streetInfo.get(a.gat).name : "").localeCompare(b.gat ? streetInfo.get(b.gat).name : "", "lt"));
  let py = 0;
  let px = 0;
  for (const g of entries) {
    const s = g.gat ? streetInfo.get(g.gat) : null;
    const type = s ? s.type : "";
    let ti = types.indexOf(type);
    if (ti < 0) ti = types.push(type) - 1;
    const [y, x] = medoid(g.list.map((a) => a.p));
    streets.n.push(s ? s.name : "");
    streets.t.push(ti);
    streets.w.push(townIndex.get(g.gyv));
    streets.y.push(y);
    streets.x.push(x);
    g.list.sort(byHouse);
    streets.a.push(g.list.length);
    addr.h.push(g.list.map((a) => (a.k ? `${a.nr} k${a.k}` : a.nr)).join("|"));
    for (const a of g.list) {
      addr.y.push(a.p[0] - py);
      addr.x.push(a.p[1] - px);
      [py, px] = a.p;
    }
  }

  const out = {
    built: new Date().toISOString().slice(0, 10),
    source: "Registrų centras, Lietuvos Respublikos adresų registras",
    townTypes: TOWN_TYPES,
    streetTypes: types,
    sav: savList,
    towns,
    streets,
    addr: { h: addr.h.join("\n"), y: addr.y, x: addr.x },
  };
  const gz = zlib.gzipSync(JSON.stringify(out), { level: 9 });
  await fs.mkdir(path.join(ROOT, "data"), { recursive: true });
  await fs.writeFile(path.join(ROOT, "data", "addresses.json.gz"), gz);
  console.log(`  → data/addresses.json.gz (${towns.n.length} gyvenviečių, ${streets.n.length} gatvių, ${addr.y.length} adresų, ${(gz.length / 1e6).toFixed(1)} MB)`);
}
