#!/usr/bin/env node
// Builds the data files the route planner reads.
//
//   npm run data            # everything
//   npm run data -- transit # only one part: transit | lanes | parking | border
//
// Sources (all open, no keys needed):
//   - LTSA nacionalinis prieigos taškas, visų Lietuvos viešojo transporto GTFS (visimarsrutai.lt)
//   - stops.lt Šiaulių miesto GTFS (Šiaulių maršrutų nacionaliniame rinkinyje nėra)
//   - SĮ „Susisiekimo paslaugos“ (JUDU): Vilniaus A / A+ juostos (ArcGIS FeatureServer)
//   - OpenStreetMap (Overpass): autobusų juostos kituose miestuose
//   - Vilniaus m. sav. (vplanas) ir Klaipėdos m. sav.: vietinės rinkliavos (parkavimo) zonos
//   - geoBoundaries (OpenStreetMap): Lietuvos siena žemėlapio kaukei
//
// Outputs:
//   data/transit.json.gz      – compact timetable for the server-side router
//   public/data/bus-lanes.json
//   public/data/parking.json
//   public/data/lithuania.json
//
// Raw downloads are cached in .cache/ for a day, so re-runs are fast.

import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const CACHE = path.join(ROOT, ".cache");
const UA = "EismoPulsas/0.2 data builder (+https://github.com/EismoPulsas/eismopulsas)";

const FEEDS = [
  { id: "lt", name: "LTSA nacionalinis prieigos taškas", url: "https://www.visimarsrutai.lt/gtfs/google_transit.zip" },
  { id: "sia", name: "stops.lt – Šiauliai", url: "https://www.stops.lt/siauliai/siauliai/gtfs.zip", agency: "Šiaulių m. sav." },
];
const WINDOW_DAYS = 42;

// ---------------------------------------------------------------- helpers

async function cachedDownload(url, name) {
  const dest = path.join(CACHE, name);
  try {
    const st = await fs.stat(dest);
    if (Date.now() - st.mtimeMs < 20 * 3600 * 1000) return fs.readFile(dest);
  } catch {}
  console.log(`  ↓ ${url}`);
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.mkdir(CACHE, { recursive: true });
  await fs.writeFile(dest, buf);
  return buf;
}

async function getJson(url, init = {}, tries = 4) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { ...init, headers: { "User-Agent": UA, Accept: "application/json", ...init.headers } });
      if (res.ok) return await res.json();
      if (res.status < 500 && res.status !== 429) throw Object.assign(new Error(`${url} -> HTTP ${res.status}`), { fatal: true });
      if (attempt >= tries) throw new Error(`${url} -> HTTP ${res.status}`);
    } catch (err) {
      // Some CDN nodes time out on connect; DNS round-robin usually gives a working one next time.
      if (err.fatal || attempt >= tries) throw err;
    }
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
}

/** Minimal ZIP reader: returns { name: Buffer } for the requested entries. */
function unzip(buf, wanted) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("Not a zip file");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = {};
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen).split("/").pop();
    p += 46 + nameLen + extraLen + commentLen;
    if (!wanted.includes(name)) continue;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + csize);
    out[name] = method === 0 ? data : zlib.inflateRawSync(data);
  }
  return out;
}

/** CSV -> array of objects. Handles quoted fields and a BOM. */
function* csvRows(buf) {
  if (!buf) return;
  let text = buf.toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  let header = null;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const fields = [];
    for (;;) {
      let v = "";
      if (text[i] === '"') {
        i++;
        for (;;) {
          const q = text.indexOf('"', i);
          if (q < 0) { v += text.slice(i); i = n; break; }
          v += text.slice(i, q);
          i = q + 1;
          if (text[i] === '"') { v += '"'; i++; } else break;
        }
      } else {
        let j = i;
        while (j < n && text[j] !== "," && text[j] !== "\n" && text[j] !== "\r") j++;
        v = text.slice(i, j);
        i = j;
      }
      fields.push(v);
      if (text[i] === ",") { i++; continue; }
      if (text[i] === "\r") i++;
      if (text[i] === "\n") i++;
      break;
    }
    if (!header) { header = fields.map((f) => f.trim()); continue; }
    if (fields.length === 1 && fields[0] === "") continue;
    const row = {};
    for (let k = 0; k < header.length; k++) row[header[k]] = fields[k] ?? "";
    yield row;
  }
}

const toSec = (s) => {
  const m = /^(\d+):(\d\d):(\d\d)$/.exec(s.trim());
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : null;
};
const ymd = (d) => d.toISOString().slice(0, 10).replaceAll("-", "");

/** Today's date in Lithuania as a UTC-midnight Date. */
function vilniusToday() {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Vilnius" }).format(new Date());
  return new Date(`${s}T00:00:00Z`);
}

// Local metric projection around Lithuania, good enough for simplification.
const KX = 111320 * Math.cos((55.2 * Math.PI) / 180), KY = 110540;

function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const ax = pts[a][1] * KX, ay = pts[a][0] * KY, bx = pts[b][1] * KX, by = pts[b][0] * KY;
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    let best = -1, bestD = tol * tol;
    for (let i = a + 1; i < b; i++) {
      const px = pts[i][1] * KX, py = pts[i][0] * KY;
      let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const ex = ax + t * dx - px, ey = ay + t * dy - py, d = ex * ex + ey * ey;
      if (d > bestD) { bestD = d; best = i; }
    }
    if (best > 0) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Google encoded polyline, precision 5. */
function encodePolyline(pts) {
  let out = "", plat = 0, plng = 0;
  const enc = (v) => {
    v = v < 0 ? ~(v << 1) : v << 1;
    let s = "";
    while (v >= 0x20) { s += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; }
    return s + String.fromCharCode(v + 63);
  };
  for (const [lat, lng] of pts) {
    const a = Math.round(lat * 1e5), b = Math.round(lng * 1e5);
    out += enc(a - plat) + enc(b - plng);
    plat = a; plng = b;
  }
  return out;
}

const round5 = (v) => Math.round(v * 1e5) / 1e5;

// ---------------------------------------------------------------- transit

function fareKey(agencyName) {
  const n = agencyName.toLowerCase();
  if (n.includes("transporto saugos")) return "intercity";
  if (n.startsWith("vilniaus m")) return "vilnius";
  if (n.startsWith("kauno m")) return "kaunas";
  if (n.startsWith("klaipėdos m")) return "klaipeda";
  if (n.startsWith("šiaulių m")) return "siauliai";
  if (n.startsWith("panevėžio m")) return "panevezys";
  if (n.startsWith("alytaus m")) return "alytus";
  if (n.includes("perkėl")) return "ferry";
  return "regional";
}

async function buildTransit() {
  console.log("Transit (GTFS)…");
  const base = vilniusToday();
  const dates = Array.from({ length: WINDOW_DAYS }, (_, d) => new Date(base.getTime() + d * 86400000));
  const dateKeys = dates.map(ymd);
  const weekdayCol = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

  const out = {
    v: 1,
    built: new Date().toISOString(),
    base: base.toISOString().slice(0, 10),
    days: WINDOW_DAYS,
    feeds: FEEDS.map((f) => ({ name: f.name, url: f.url })),
    agencies: [],
    routes: [],
    stops: { name: [], lat: [], lng: [] },
    services: [],
    shapes: [],
    patterns: [],
  };

  for (const feed of FEEDS) {
    const zip = await cachedDownload(feed.url, `gtfs-${feed.id}.zip`);
    const files = unzip(zip, [
      "agency.txt", "routes.txt", "trips.txt", "stop_times.txt", "stops.txt",
      "calendar.txt", "calendar_dates.txt", "shapes.txt",
    ]);

    // Services -> active-day bitmap over the window.
    const cal = new Map();
    for (const r of csvRows(files["calendar.txt"])) cal.set(r.service_id, r);
    const exceptions = new Map();
    for (const r of csvRows(files["calendar_dates.txt"])) {
      if (!exceptions.has(r.service_id)) exceptions.set(r.service_id, new Map());
      exceptions.get(r.service_id).set(r.date, r.exception_type);
    }
    const serviceIds = new Set([...cal.keys(), ...exceptions.keys()]);
    const serviceIdx = new Map();
    for (const sid of serviceIds) {
      const c = cal.get(sid), ex = exceptions.get(sid);
      let bits = "";
      for (let d = 0; d < WINDOW_DAYS; d++) {
        const key = dateKeys[d];
        let on = false;
        if (c && key >= c.start_date && key <= c.end_date && c[weekdayCol[dates[d].getUTCDay()]] === "1") on = true;
        const e = ex?.get(key);
        if (e === "1") on = true;
        if (e === "2") on = false;
        bits += on ? "1" : "0";
      }
      if (bits.includes("1")) {
        serviceIdx.set(sid, out.services.length);
        out.services.push(bits);
      }
    }

    // Agencies & routes.
    const agencyIdx = new Map();
    for (const a of csvRows(files["agency.txt"])) {
      const name = feed.agency ?? a.agency_name;
      agencyIdx.set(a.agency_id || "_", out.agencies.length);
      out.agencies.push({ name, fare: fareKey(name) });
    }
    const routeIdx = new Map();
    for (const r of csvRows(files["routes.txt"])) {
      const ai = agencyIdx.get(r.agency_id || "_") ?? agencyIdx.values().next().value;
      routeIdx.set(r.route_id, out.routes.length);
      out.routes.push([
        r.route_short_name.trim(),
        r.route_long_name.trim(),
        +r.route_type,
        r.route_color ? `#${r.route_color}` : "",
        ai,
      ]);
    }

    // Trips we keep (active in the window).
    const trips = new Map();
    for (const t of csvRows(files["trips.txt"])) {
      const si = serviceIdx.get(t.service_id);
      const ri = routeIdx.get(t.route_id);
      if (si === undefined || ri === undefined) continue;
      trips.set(t.trip_id, { si, ri, head: t.trip_headsign.trim(), shape: t.shape_id, st: [] });
    }

    // Stop times.
    for (const r of csvRows(files["stop_times.txt"])) {
      const t = trips.get(r.trip_id);
      if (!t) continue;
      const dep = toSec(r.departure_time || r.arrival_time);
      const arr = toSec(r.arrival_time || r.departure_time);
      if (dep === null) continue;
      t.st.push([+r.stop_sequence, r.stop_id, arr, dep]);
    }

    // Stops (only those used).
    const usedStops = new Set();
    for (const t of trips.values()) {
      t.st.sort((a, b) => a[0] - b[0]);
      for (const s of t.st) usedStops.add(s[1]);
    }
    const stopIdx = new Map();
    for (const s of csvRows(files["stops.txt"])) {
      if (!usedStops.has(s.stop_id)) continue;
      const lat = +s.stop_lat, lng = +s.stop_lon;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      stopIdx.set(s.stop_id, out.stops.name.length);
      out.stops.name.push(s.stop_name.trim());
      out.stops.lat.push(Math.round(lat * 1e5));
      out.stops.lng.push(Math.round(lng * 1e5));
    }

    // Shapes (only those used), simplified.
    const usedShapes = new Set([...trips.values()].map((t) => t.shape).filter(Boolean));
    const rawShapes = new Map();
    for (const r of csvRows(files["shapes.txt"])) {
      if (!usedShapes.has(r.shape_id)) continue;
      if (!rawShapes.has(r.shape_id)) rawShapes.set(r.shape_id, []);
      rawShapes.get(r.shape_id).push([+r.shape_pt_sequence, +r.shape_pt_lat, +r.shape_pt_lon]);
    }
    const shapePts = new Map();
    for (const [id, pts] of rawShapes) {
      pts.sort((a, b) => a[0] - b[0]);
      shapePts.set(id, simplify(pts.map((p) => [p[1], p[2]]), 6));
    }
    const shapeIdx = new Map();

    // Group trips into patterns (same route + stop sequence + shape).
    const patterns = new Map();
    for (const t of trips.values()) {
      if (t.st.length < 2 || t.st.some((s) => !stopIdx.has(s[1]))) continue;
      const stops = t.st.map((s) => stopIdx.get(s[1]));
      const key = `${t.ri}|${t.shape}|${stops.join(",")}`;
      let p = patterns.get(key);
      if (!p) {
        p = { ri: t.ri, head: t.head, shape: t.shape, stops, profiles: new Map(), trips: [] };
        patterns.set(key, p);
      }
      const start = t.st[0][3];
      const dep = t.st.map((s) => s[3] - start);
      const arr = t.st.map((s) => s[2] - start);
      const pk = `${dep.join(",")}|${arr.join(",")}`;
      if (!p.profiles.has(pk)) p.profiles.set(pk, { i: p.profiles.size, dep, arr });
      p.trips.push([start, p.profiles.get(pk).i, t.si]);
    }

    for (const p of patterns.values()) {
      let sh = -1, cut = null;
      const pts = shapePts.get(p.shape);
      if (pts && pts.length > 1) {
        if (!shapeIdx.has(p.shape)) {
          shapeIdx.set(p.shape, out.shapes.length);
          out.shapes.push(encodePolyline(pts));
        }
        sh = shapeIdx.get(p.shape);
        // Nearest shape vertex for each stop, moving forward along the shape.
        cut = [];
        let from = 0;
        for (const s of p.stops) {
          const sy = out.stops.lat[s] / 1e5, sx = out.stops.lng[s] / 1e5;
          let best = from, bestD = Infinity;
          for (let i = from; i < pts.length; i++) {
            const d = ((pts[i][0] - sy) * KY) ** 2 + ((pts[i][1] - sx) * KX) ** 2;
            if (d < bestD) { bestD = d; best = i; }
          }
          cut.push(best);
          from = best;
        }
      }
      p.trips.sort((a, b) => a[0] - b[0]);
      const profiles = [...p.profiles.values()];
      out.patterns.push({
        r: p.ri,
        h: p.head,
        s: p.stops,
        sh,
        c: cut,
        pd: profiles.map((x) => x.dep),
        pa: profiles.map((x) => (x.arr.every((v, i) => v === x.dep[i]) ? 0 : x.arr)),
        t: p.trips.flat(),
      });
    }
    console.log(`  ${feed.id}: ${trips.size} trips, ${patterns.size} patterns, ${stopIdx.size} stops, ${shapeIdx.size} shapes`);
  }

  await fs.mkdir(path.join(ROOT, "data"), { recursive: true });
  const gz = zlib.gzipSync(JSON.stringify(out), { level: 9 });
  await fs.writeFile(path.join(ROOT, "data", "transit.json.gz"), gz);
  console.log(`  → data/transit.json.gz (${(gz.length / 1e6).toFixed(1)} MB)`);
}

// ---------------------------------------------------------------- bus lanes

const VILNIUS_BBOX = { s: 54.56, n: 54.84, w: 25.0, e: 25.49 };
const inBox = (b, lat, lng) => lat >= b.s && lat <= b.n && lng >= b.w && lng <= b.e;

async function buildLanes() {
  console.log("Bus lanes…");
  const lanes = [];

  // Vilnius: official SĮSP (JUDU) layer of A and A+ lanes.
  const sisp = "https://services1.arcgis.com/vVI5TNykiYD9EhM5/arcgis/rest/services/A_juostos_WFL1_per%C5%BEi%C5%ABra/FeatureServer/0";
  const gj = await getJson(`${sisp}/query?where=1%3D1&outFields=A_juostos_,Spalvinim&outSR=4326&f=geojson`);
  for (const f of gj.features) {
    const lines = f.geometry.type === "MultiLineString" ? f.geometry.coordinates : [f.geometry.coordinates];
    for (const line of lines) {
      lanes.push({
        k: f.properties.Spalvinim === 2 ? "A+" : "A",
        n: (f.properties.A_juostos_ ?? "").trim(),
        c: line.map(([lng, lat]) => [round5(lat), round5(lng)]),
      });
    }
  }
  const official = lanes.length;

  // Elsewhere: OpenStreetMap bus/PSV lanes.
  const keys = [];
  for (const k of ["bus:lanes", "psv:lanes", "lanes:bus", "lanes:psv"])
    for (const s of ["", ":forward", ":backward"]) keys.push(k + s);
  const q = `[out:json][timeout:180];area["ISO3166-1"="LT"][admin_level=2]->.lt;(${keys
    .map((k) => `way(area.lt)["highway"]["${k}"];`)
    .join("")}way(area.lt)["highway"]["busway"];way(area.lt)["highway"]["busway:right"];way(area.lt)["highway"]["busway:left"];way(area.lt)["highway"]["busway:both"];way(area.lt)["highway"="busway"];);out tags geom;`;
  const osm = await getJson("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: new URLSearchParams({ data: q }),
  });
  const isLane = (tags) => {
    if (tags.highway === "busway") return true;
    for (const [k, v] of Object.entries(tags)) {
      if (/^(bus|psv):lanes/.test(k) && v.split("|").includes("designated")) return true;
      if (/^lanes:(bus|psv)/.test(k) && +v > 0) return true;
      if (/^busway/.test(k) && v === "lane") return true;
    }
    return false;
  };
  for (const w of osm.elements) {
    if (!w.geometry || !isLane(w.tags)) continue;
    const mid = w.geometry[Math.floor(w.geometry.length / 2)];
    if (inBox(VILNIUS_BBOX, mid.lat, mid.lon)) continue; // the city's own layer wins
    lanes.push({ k: "OSM", n: w.tags.name ?? "", c: w.geometry.map((p) => [round5(p.lat), round5(p.lon)]) });
  }

  const file = {
    updated: new Date().toISOString().slice(0, 10),
    sources: [
      { name: "SĮ „Susisiekimo paslaugos“ – Vilniaus A juostos", url: sisp },
      { name: "OpenStreetMap (Overpass API)", url: "https://www.openstreetmap.org/copyright" },
    ],
    lanes,
  };
  await fs.mkdir(path.join(ROOT, "public", "data"), { recursive: true });
  await fs.writeFile(path.join(ROOT, "public", "data", "bus-lanes.json"), JSON.stringify(file));
  console.log(`  → public/data/bus-lanes.json (${official} official + ${lanes.length - official} OSM segments)`);
}

// ---------------------------------------------------------------- parking

const ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7 };

/** "I-VI 8-20 val." -> { days: [1..6], hours: [[8, 20]] } */
function parseVilniusSchedule(s) {
  const m = /^(I{1,3}|IV|VI{0,2}|V)\s*-\s*(I{1,3}|IV|VI{0,2}|V)\s+(\d+)\s*-\s*(\d+)/.exec(s.trim());
  if (!m) return null;
  const days = [];
  for (let d = ROMAN[m[1]]; d <= ROMAN[m[2]]; d++) days.push(d);
  return [{ days, hours: [[+m[3], +m[4]]] }];
}

const MONTHS = { sausio: 1, vasario: 2, kovo: 3, balandžio: 4, gegužės: 5, birželio: 6, liepos: 7, rugpjūčio: 8, rugsėjo: 9, spalio: 10, lapkričio: 11, gruodžio: 12 };

/** Klaipėda's free-text schedule -> rules with optional seasons. */
function parseKlaipedaSchedule(s) {
  const rules = [];
  // Split into seasonal clauses where present.
  const seasonRe = /nuo\s+(\p{L}+)\s+(\d+)\s*d\.\s*iki\s+(\p{L}+)\s+(\d+)\s*d\.?\s*[–-]?\s*([^,]*?(?:val\.?|$)(?:[^,]*?val\.?)?)(?=,|\s*o\s|$)/gu;
  const clauses = [];
  let m;
  while ((m = seasonRe.exec(s))) {
    const from = MONTHS[m[1].toLowerCase()], to = MONTHS[m[3].toLowerCase()];
    if (from && to) clauses.push({ season: [from * 100 + +m[2], to * 100 + +m[4]], text: m[5] });
  }
  if (!clauses.length) clauses.push({ season: null, text: s });
  for (const c of clauses) {
    const weekdaysOnly = /darbo dienomis|išskyrus šeštadienį/.test(c.text) || (!/kiekvieną dieną/.test(c.text) && /darbo/.test(s));
    const hours = [...c.text.matchAll(/nuo\s+(\d+)[.:]\d\d\s+iki\s+(\d+)[.:]\d\d/g)].map((h) => [+h[1], +h[2]]);
    if (!hours.length) continue;
    rules.push({ season: c.season, days: weekdaysOnly ? [1, 2, 3, 4, 5] : [1, 2, 3, 4, 5, 6, 7], hours });
  }
  return rules.length ? rules : null;
}

function polygonsOf(geom) {
  const polys = geom.type === "MultiPolygon" ? geom.coordinates : [geom.coordinates];
  return polys.map((rings) => rings.map((ring) => simplify(ring.map(([lng, lat]) => [lat, lng]), 3).map(([a, b]) => [round5(a), round5(b)])));
}

async function buildParking() {
  console.log("Parking zones…");
  const zones = [];

  const vln = "https://zemelapiai.vplanas.lt/arcgis/rest/services/Open_Data/Vietines_rinkliavos_zonos/MapServer/1";
  const v = await getJson(`${vln}/query?where=1%3D1&outFields=Rinkliava,Mokama,Zona&outSR=4326&f=geojson`);
  for (const f of v.features) {
    const p = f.properties;
    const price = +(/([\d,]+)\s*Eur/.exec(p.Rinkliava)?.[1] ?? "").replace(",", ".");
    if (!price) continue;
    const seasonal = /maudykl/i.test(p.Mokama);
    const rules = seasonal ? [{ season: [601, 831], days: [1, 2, 3, 4, 5, 6, 7], hours: [[8, 20]] }] : parseVilniusSchedule(p.Mokama);
    zones.push({ city: "Vilnius", zone: p.Zona, price, text: `${p.Rinkliava}, ${p.Mokama}`, rules, poly: polygonsOf(f.geometry) });
  }

  const kln = "https://maps.klaipeda.lt/arcgis/rest/services/Parkavimo_zonos/MapServer/0";
  const k = await getJson(`${kln}/query?where=1%3D1&outFields=Zona,Pastabos,Mokestis,Rinkliava_renkama&outSR=4326&f=geojson`);
  const kName = { R: "Raudonoji zona", GG: "Geltonoji zona", Z: "Žalioji zona" };
  for (const f of k.features) {
    const p = f.properties;
    // "Iki 30 min. – 0,30 Eur" -> 0.60 €/h
    const m = /Iki\s+(\d+)\s*min\.?\s*[–-]\s*([\d,]+)\s*Eur/i.exec(p.Mokestis ?? "");
    if (!m || !f.geometry) continue;
    const price = Math.round((+m[2].replace(",", ".") * 60) / +m[1] * 100) / 100;
    zones.push({
      city: "Klaipėda",
      zone: kName[p.Pastabos] ?? `Zona ${p.Zona}`,
      price,
      text: `${m[1]} min. – ${m[2]} Eur; ${p.Rinkliava_renkama}`,
      rules: parseKlaipedaSchedule(p.Rinkliava_renkama ?? ""),
      poly: polygonsOf(f.geometry),
    });
  }

  const file = {
    updated: new Date().toISOString().slice(0, 10),
    sources: [
      { name: "Vilniaus m. sav. – vietinės rinkliavos zonos", url: vln },
      { name: "Klaipėdos m. sav. – parkavimo zonos", url: kln },
    ],
    zones,
  };
  await fs.writeFile(path.join(ROOT, "public", "data", "parking.json"), JSON.stringify(file));
  const unparsed = zones.filter((z) => !z.rules).length;
  console.log(`  → public/data/parking.json (${zones.length} zones${unparsed ? `, ${unparsed} without parsed schedule` : ""})`);
}

// ---------------------------------------------------------------- border

async function buildBorder() {
  console.log("Lithuania border…");
  const meta = await getJson("https://www.geoboundaries.org/api/current/gbOpen/LTU/ADM0/");
  const gj = await getJson(meta.simplifiedGeometryGeoJSON);
  const rings = [];
  for (const f of gj.features) {
    const polys = f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [f.geometry.coordinates];
    for (const poly of polys) {
      const outer = simplify(poly[0].map(([lng, lat]) => [lat, lng]), 120);
      if (outer.length >= 4) rings.push(outer.map(([a, b]) => [round5(a), round5(b)]));
    }
  }
  const file = { source: "geoBoundaries gbOpen LTU ADM0 (OpenStreetMap, ODbL)", rings };
  await fs.writeFile(path.join(ROOT, "public", "data", "lithuania.json"), JSON.stringify(file));
  console.log(`  → public/data/lithuania.json (${rings.length} rings, ${rings.reduce((a, r) => a + r.length, 0)} points)`);
}

// ---------------------------------------------------------------- main

const only = process.argv.slice(2);
const want = (part) => !only.length || only.includes(part);
if (want("lanes")) await buildLanes();
if (want("parking")) await buildParking();
if (want("border")) await buildBorder();
if (want("transit")) await buildTransit();
