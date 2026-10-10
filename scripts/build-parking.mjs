// Parking and EV charging data for the map and the planner. Called from build-data.mjs:
//
//   npm run data -- parking    # zones, car parks, street-side parking, occupancy profiles
//   npm run data -- chargers   # EV charging points (Via Lietuva national registry, OCPI 2.3.0)
//   npm run data -- street     # street-side parking only (zones and areas from parking.json)
//   npm run data -- scooters   # JUDU scooter parking spots and the Old Town scooter zone
//
// Sources (all public, no keys; full inventory with licences in docs/parkavimas-duomenys.md):
//   - JUDU: rinkliavos zonos (nuo 2025-07-01), aikštelių ribos, užimtumas (dabar ir istorija),
//     gyventojų leidimų zonos, įrengtos stovėjimo vietos, vietos ant šaligatvio, draudžiamo stovėjimo zonos
//   - Klaipėdos m. sav.: parkavimo zonos
//   - UNIPARK: viešai skelbiami aikštelių puslapiai (koordinatės ir kainos)
//   - data/curated-parking.json: prekybos centrų taisyklės, surinktos rankiniu būdu su šaltiniais
//   - OpenStreetMap (Overpass): aikštelės, parkavimas gatvėse, parduotuvės šalia
//   - Via Lietuva: viešai prieinamų įkrovimo prieigų informacinė sistema (OCPI)
//
// Outputs (public/data/):
//   parking.json        – municipal paid zones + resident-permit areas (street spaces, occupancy)
//   lots.json           – car parks: JUDU, UNIPARK, curated malls, OpenStreetMap
//   street-parking.json – where you may park along the street, and where you may not
//   lot-occupancy.json  – JUDU gated lots: typical free spaces and chance of a space, weekday × hour
//   scooter-spots.json  – where shared scooters may be left (JUDU), Vilnius Old Town scooter zone
//   chargers.json       – EV charging points with connectors, power and prices

import fs from "node:fs/promises";
import path from "node:path";

const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];
const JUDU_ORG = "https://services1.arcgis.com/vVI5TNykiYD9EhM5/arcgis/rest/services";
const SISP = "https://arcgis.sisp.lt/arcgis/rest/services/Hosted";
const SRC = {
  zones: `${JUDU_ORG}/rinkliavos_zonos_2025_07/FeatureServer/5`,
  areas: `${JUDU_ORG}/Gyventoju_leidimu_zonos_nuo_25_07_01/FeatureServer/0`,
  lots: `${JUDU_ORG}/aiksteliu_ribos/FeatureServer/9`,
  live: `${SISP}/aiksteliu_uzimtumas_actual/FeatureServer/0`,
  history: `${SISP}/aiksteliu_uzimtumas_history/FeatureServer/0`,
  installed: `${JUDU_ORG}/automobiliu_stov%C4%97jimo_vietos_per%C5%BEi%C5%ABra/FeatureServer/0`,
  sidewalk: `${JUDU_ORG}/Stov%C4%97jimo_vietos_ant_saligatvio_Vietos_ant_saligatvio_1/FeatureServer/0`,
  noParking: `${JUDU_ORG}/Draud%C5%BEiamo_stov%C4%97jimo_zona_vie%C5%A1inimui/FeatureServer/0`,
  scooterSpots: `${JUDU_ORG}/Stov%C4%97jimo_vietos_per%C5%BEi%C5%ABra/FeatureServer/0`,
  oldTownScooters: `${JUDU_ORG}/Senamiestis_paspirtukai/FeatureServer/0`,
  klaipeda: "https://maps.klaipeda.lt/arcgis/rest/services/Parkavimo_zonos/MapServer/0",
  pr: "https://judu.lt/vairuotojams/statyk-ir-vaziuok-aiksteles/",
  ocpi: "https://ev.vialietuva.lt/ocpi/2.3.0",
};

// ---------------------------------------------------------------- geometry

const rad = (d) => (d * Math.PI) / 180;
function dist(a, b) {
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.sqrt(x));
}
function inRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i];
    const [yj, xj] = ring[j];
    if (yi > p[0] !== yj > p[0] && p[1] < ((xj - xi) * (p[0] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** `polys` is [rings][] as stored in the output files: [[outer, ...holes], ...]. */
const inPolys = (p, polys) => polys.some((rings) => inRing(p, rings[0]) && !rings.slice(1).some((h) => inRing(p, h)));
function centroid(ring) {
  let la = 0, ln = 0;
  for (const [a, b] of ring) { la += a; ln += b; }
  return [la / ring.length, ln / ring.length];
}
const polyCenter = (polys) => centroid(polys.reduce((best, r) => (r[0].length > best.length ? r[0] : best), polys[0][0]));

/** GeoJSON polygon geometry -> [[outer, ...holes], ...] in [lat, lng], simplified. */
function polygonsOf(h, geom, tol = 3) {
  if (!geom) return [];
  const polys = geom.type === "MultiPolygon" ? geom.coordinates : geom.type === "Polygon" ? [geom.coordinates] : [];
  return polys
    .map((rings) => rings.map((ring) => h.simplify(ring.map(([lng, lat]) => [lat, lng]), tol).map(([a, b]) => [h.round5(a), h.round5(b)])))
    .filter((rings) => rings[0].length >= 4);
}
function linesOf(h, geom, tol = 2) {
  if (!geom) return [];
  const lines = geom.type === "MultiLineString" ? geom.coordinates : geom.type === "LineString" ? [geom.coordinates] : [];
  return lines.map((l) => h.simplify(l.map(([lng, lat]) => [lat, lng]), tol).map(([a, b]) => [h.round5(a), h.round5(b)])).filter((l) => l.length >= 2);
}

/** ArcGIS layer -> GeoJSON features in WGS84, all pages. */
async function arcgisFeatures(h, layer, { where = "1=1", outFields = "*", geometry = true } = {}) {
  const out = [];
  for (let offset = 0; ; ) {
    const q = new URLSearchParams({ where, outFields, returnGeometry: String(geometry), outSR: "4326", f: "geojson", resultOffset: String(offset), resultRecordCount: "1000" });
    const page = await h.getJson(`${layer}/query?${q}`);
    if (page.error) throw new Error(`${layer}: ${JSON.stringify(page.error)}`);
    out.push(...page.features);
    if (!page.properties?.exceededTransferLimit && !page.exceededTransferLimit) break;
    offset += page.features.length;
  }
  return out;
}

const norm = (s) => (s ?? "").normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
const eur = (v) => `${v.toFixed(2).replace(".", ",")} €`;
const vilniusDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Vilnius" }).format(new Date());

async function writeJson(h, name, data) {
  await fs.mkdir(path.join(h.ROOT, "public", "data"), { recursive: true });
  const file = path.join(h.ROOT, "public", "data", name);
  const body = JSON.stringify(data);
  // Stage and rename, so a failed write never leaves a truncated file behind.
  await fs.writeFile(`${file}.tmp`, body);
  await fs.rename(`${file}.tmp`, file);
  return `${(body.length / 1024).toFixed(0)} KB`;
}

/** Cached JSON fetch for slow aggregate queries (20 h, like the raw downloads). */
async function cachedJson(h, url, name) {
  const dest = path.join(h.CACHE, name);
  try {
    const st = await fs.stat(dest);
    if (Date.now() - st.mtimeMs < 20 * 3600 * 1000) return JSON.parse(await fs.readFile(dest, "utf8"));
  } catch {}
  const data = await h.getJson(url);
  if (data.error) throw new Error(`${url}: ${JSON.stringify(data.error)}`);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, JSON.stringify(data));
  return data;
}

// ---------------------------------------------------------------- schedules

const ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7 };
const ROMAN_RE = "(VII|VI|IV|V|III|II|I)";
const DASH = "\\s*[-–—]\\s*";

/** "I-VI 8-22 val.", "I–V 08:00–20:00", "24/7" -> rules; null if not understood. */
export function parseSchedule(s) {
  s = (s ?? "").trim();
  if (!s) return null;
  if (/^24\s*\/\s*7$/.test(s)) return [{ season: null, days: ALL_DAYS, hours: [[0, 24]] }];
  const m = new RegExp(`^${ROMAN_RE}${DASH}${ROMAN_RE}\\s+(\\d{1,2})(?:[:.](\\d\\d))?${DASH}(\\d{1,2})(?:[:.](\\d\\d))?`).exec(s);
  if (!m) return null;
  const days = [];
  for (let d = ROMAN[m[1]]; d <= ROMAN[m[2]]; d++) days.push(d);
  const h0 = +m[3] + (+m[4] || 0) / 60;
  const h1 = +m[5] + (+m[6] || 0) / 60;
  return [{ season: null, days, hours: [[h0, h1 || 24]] }];
}

const MONTHS = { sausio: 1, vasario: 2, kovo: 3, balandžio: 4, gegužės: 5, birželio: 6, liepos: 7, rugpjūčio: 8, rugsėjo: 9, spalio: 10, lapkričio: 11, gruodžio: 12 };

/** "nuo gegužės 1 d. iki rugsėjo 30 d" -> [501, 930] */
function parseSeason(s) {
  const m = /nuo\s+(\p{L}+)\s+(\d+)\s*d\.?\s*iki\s+(\p{L}+)\s+(\d+)/iu.exec(s ?? "");
  if (!m) return null;
  const a = MONTHS[m[1].toLowerCase()], b = MONTHS[m[3].toLowerCase()];
  return a && b ? [a * 100 + +m[2], b * 100 + +m[4]] : null;
}

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
    rules.push({ season: c.season, days: weekdaysOnly ? [1, 2, 3, 4, 5] : ALL_DAYS, hours });
  }
  return rules.length ? rules : null;
}

// ---------------------------------------------------------------- zones

const ZONE_NAMES = {
  mėlyna: "Mėlynoji zona",
  raudona: "Raudonoji zona",
  geltona: "Geltonoji zona",
  geltona1: "Geltonoji zona (paplūdimys)",
  žalia: "Žalioji zona",
};

/** Vilnius street-parking zones valid from 2025-07-01 (JUDU). */
async function vilniusZones(h) {
  const zones = [];
  for (const f of await arcgisFeatures(h, SRC.zones)) {
    const p = f.properties;
    const key = norm(p.Zona);
    const price = +(/([\d,]+)\s*Eur/i.exec(p.Rinkliava ?? "")?.[1] ?? "").replace(",", ".");
    if (!ZONE_NAMES[key] || !price) throw new Error(`Unknown Vilnius zone: ${JSON.stringify(p)}`);
    let rules = parseSchedule(p.Mokama);
    if (!rules) throw new Error(`Unparsed zone schedule: ${p.Mokama}`);
    const season = parseSeason(p.Pastaba);
    if (season) rules = rules.map((r) => ({ ...r, season }));
    const first = /pirma valanda\s*([\d,]+)/i.exec(p.Pastaba ?? "");
    const firstHour = first ? +first[1].replace(",", ".") : undefined;
    const text = [`${eur(price)}/val.`, firstHour ? `pirma valanda ${eur(firstHour)}` : "", `mokama ${p.Mokama.replace(/\s*val\.?$/, "")}`, season ? "tik gegužės 1 – rugsėjo 30 d." : ""]
      .filter(Boolean)
      .join(", ");
    zones.push({ city: "Vilnius", zone: ZONE_NAMES[key], price, firstHour, text, rules, poly: polygonsOf(h, f.geometry) });
  }
  return zones;
}

async function klaipedaZones(h) {
  const zones = [];
  const k = await h.getJson(`${SRC.klaipeda}/query?where=1%3D1&outFields=Zona,Pastabos,Mokestis,Rinkliava_renkama&outSR=4326&f=geojson`);
  const kName = { R: "Raudonoji zona", GG: "Geltonoji zona", Z: "Žalioji zona" };
  for (const f of k.features) {
    const p = f.properties;
    // "Iki 30 min. – 0,30 Eur" -> 0.60 €/h
    const m = /Iki\s+(\d+)\s*min\.?\s*[–-]\s*([\d,]+)\s*Eur/i.exec(p.Mokestis ?? "");
    if (!m || !f.geometry) continue;
    const price = Math.round(((+m[2].replace(",", ".") * 60) / +m[1]) * 100) / 100;
    zones.push({
      city: "Klaipėda",
      zone: kName[p.Pastabos] ?? `Zona ${p.Zona}`,
      price,
      text: `${m[1]} min. – ${m[2]} Eur; ${p.Rinkliava_renkama}`,
      rules: parseKlaipedaSchedule(p.Rinkliava_renkama ?? ""),
      poly: polygonsOf(h, f.geometry),
    });
  }
  return zones;
}

/** Vilnius resident-permit areas: number of street spaces and how full they usually are. */
async function residentAreas(h) {
  return (await arcgisFeatures(h, SRC.areas)).map((f) => {
    const p = f.properties;
    const occ = Object.entries(p).find(([k]) => k.normalize("NFC").startsWith("Užimtumas"))?.[1];
    return { name: p.Zone_Name_LT, spaces: p.park_viet_sk ?? null, occupancy: occ ?? null, poly: polygonsOf(h, f.geometry, 5) };
  });
}

// ---------------------------------------------------------------- JUDU lots

// "Statyk ir važiuok" sites, from the JUDU P+R page (checked 2026-10-10).
const PR_SITES = ["ukmergės g. 246", "savanorių pr. 124", "v. pociūno g. 8"];
const addrKey = (s) => norm(s).replace(/\(.*?\)/g, "").replace(/\s+/g, "");
const isPr = (...names) => names.some((n) => PR_SITES.some((s) => addrKey(n) === addrKey(s)));

/**
 * The live layer reuses one code for several sub-lots (e.g. V. Gerulaičio g. 1-1…1-3),
 * so a lot's occupancy key is its code plus its exact name in that layer.
 */
const occKey = (p) => `${p.code}/${p.pavadinimas}`;

function juduTariff(price, laikas, pr) {
  if (pr) return { known: true, flat: { price: 1, per: "day" }, text: ["1,00 € – parkavimas ir viešasis transportas vienam žmogui iki dienos pabaigos", "Bilietas – automate arba JUDU programėlėje"] };
  if (price == null) return { known: false, text: ["Kaina neskelbiama (gyventojų leidimai)"] };
  if (price === 0) return { known: true, free: true, text: ["Nemokama"] };
  const rules = parseSchedule(laikas);
  return {
    known: true,
    rates: [{ rules, perHour: price }],
    text: [`${eur(price)}/val.`, laikas ? `Mokama ${laikas}` : "Mokamas laikas nenurodytas – skaičiuojame, kad mokama visada"],
  };
}

async function juduLots(h) {
  const [bounds, live] = await Promise.all([arcgisFeatures(h, SRC.lots), arcgisFeatures(h, SRC.live)]);
  const lots = [];
  const used = new Set();
  const liveByName = new Map(live.map((f) => [norm(f.properties.pavadinimas), f]));

  const add = (p, geom, liveF) => {
    const name = (p.pavadinimas ?? p.Adresas ?? p.adresas ?? "").trim();
    const addr = (p.Adresas ?? p.adresas ?? name).trim();
    const pr = isPr(name, addr);
    const poly = polygonsOf(h, geom);
    if (!poly.length) return;
    const price = p.kaina_NUO ?? p.kaina_nuo ?? null;
    lots.push({
      id: `judu-${lots.length}`,
      src: "judu",
      name: pr ? `P+R ${addr}` : name,
      addr,
      city: "Vilnius",
      pos: polyCenter(poly).map(h.round5),
      poly,
      gated: (p.Uztvaras ?? p.uztvaras) === 1,
      access: pr ? "pr" : "public",
      cap: p.Parkavimo_vietu_skaicius_NUO ?? liveF?.properties.capacity ?? null,
      op: "JUDU",
      url: p.linkai || (pr ? SRC.pr : null),
      res: /galioja/i.test(p.Gyventoju_leidimai_NUO ?? "") && !/negalioja/i.test(p.Gyventoju_leidimai_NUO ?? ""),
      t: juduTariff(price, p.laikas, pr),
      occ: liveF ? occKey(liveF.properties) : undefined,
    });
  };

  for (const f of bounds) {
    const p = f.properties;
    let liveF = liveByName.get(norm(p.pavadinimas));
    // Fall back to geometry: a live polygon whose centre lies inside this lot.
    if (!liveF) {
      const poly = polygonsOf(h, f.geometry);
      liveF = live.find((l) => !used.has(l) && poly.length && inPolys(polyCenter(polygonsOf(h, l.geometry)), poly));
    }
    if (liveF) used.add(liveF);
    add(p, f.geometry, liveF);
  }
  // Gated lots that report occupancy but are missing from the boundary layer.
  for (const f of live) if (!used.has(f)) add(f.properties, f.geometry, f);
  return lots;
}

// ---------------------------------------------------------------- occupancy history

const WEEKDAY = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const localParts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Vilnius", weekday: "short", hour: "2-digit", hourCycle: "h23" });
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
};

/**
 * Last 12 weeks of 30-second snapshots, aggregated on the server per (UTC) day and hour,
 * then folded into local weekday × hour: typical free spaces (median of hourly means)
 * and the share of days on which at least one space stayed free for the whole hour.
 */
async function occupancyProfiles(h, keys) {
  const WEEKS = 12;
  const end = new Date(`${vilniusDate()}T00:00:00Z`);
  const windows = [0, 1].map((i) => {
    const a = new Date(end.getTime() - (WEEKS - i * 6) * 7 * 86400000);
    const b = new Date(a.getTime() + 6 * 7 * 86400000);
    return [a, b].map((d) => d.toISOString().slice(0, 19).replace("T", " "));
  });
  const stats = JSON.stringify([
    { statisticType: "avg", onStatisticField: "vacant", outStatisticFieldName: "v" },
    { statisticType: "min", onStatisticField: "vacant", outStatisticFieldName: "vmin" },
    { statisticType: "max", onStatisticField: "capacity", outStatisticFieldName: "cap" },
    { statisticType: "count", onStatisticField: "objectid1", outStatisticFieldName: "n" },
  ]);
  const group = ["YEAR", "MONTH", "DAY", "HOUR"].map((u) => `EXTRACT(${u} FROM timestamp_ms)`).join(",");
  const sql = (s) => `'${s.replace(/'/g, "''")}'`;
  const out = {};
  for (const key of keys) {
    const [code, ...rest] = key.split("/");
    const name = rest.join("/");
    const cells = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => []));
    let cap = 0;
    for (const [a, b] of windows) {
      const q = new URLSearchParams({
        where: `code=${sql(code)} AND pavadinimas=${sql(name)} AND status='ok' AND vacant >= 0 AND vacant <= capacity AND timestamp_ms >= timestamp '${a}' AND timestamp_ms < timestamp '${b}'`,
        outStatistics: stats,
        groupByFieldsForStatistics: group,
        resultRecordCount: "2000",
        f: "json",
      });
      const file = `occupancy/${key.replace(/[^\p{L}\p{N}]+/gu, "_")}-${a.slice(0, 10)}.json`;
      const d = await cachedJson(h, `${SRC.history}/query?${q}`, file);
      if (d.exceededTransferLimit) throw new Error(`occupancy ${key}: more than 2000 rows`);
      for (const { attributes: r } of d.features ?? []) {
        if (r.n < 60) continue; // under half an hour of snapshots
        const t = new Date(Date.UTC(r.EXPR_1, r.EXPR_2 - 1, r.EXPR_3, r.EXPR_4));
        const parts = Object.fromEntries(localParts.formatToParts(t).map((p) => [p.type, p.value]));
        cells[WEEKDAY[parts.weekday] - 1][+parts.hour].push(r);
        cap = Math.max(cap, r.cap);
      }
    }
    if (!cap) continue;
    out[key] = {
      cap,
      free: cells.map((day) => day.map((c) => (c.length ? Math.round(median(c.map((r) => r.v))) : null))),
      p: cells.map((day) => day.map((c) => (c.length ? Math.round((100 * c.filter((r) => r.vmin >= 1).length) / c.length) : null))),
      n: cells.map((day) => day.map((c) => c.length)),
    };
  }
  return { weeks: WEEKS, from: windows[0][0].slice(0, 10), to: windows[1][1].slice(0, 10), lots: out };
}

// ---------------------------------------------------------------- OpenStreetMap

const VILNIUS = { s: 54.56, w: 25.0, n: 54.84, e: 25.49 };
const inVilnius = ([lat, lng]) => lat >= VILNIUS.s && lat <= VILNIUS.n && lng >= VILNIUS.w && lng <= VILNIUS.e;
const LT_AREA = 'area["ISO3166-1"="LT"][admin_level=2]->.lt;';

async function overpass(h, name, query) {
  const dest = path.join(h.CACHE, `osm-${name}.json`);
  try {
    const st = await fs.stat(dest);
    if (Date.now() - st.mtimeMs < 20 * 3600 * 1000) return JSON.parse(await fs.readFile(dest, "utf8"));
  } catch {}
  // The main server is often busy (504); fall back to a public mirror.
  let data, last;
  for (const server of ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter"]) {
    try {
      data = await h.getJson(server, { method: "POST", body: new URLSearchParams({ data: `[out:json][timeout:300];${query}` }) }, 2);
      break;
    } catch (err) {
      last = err;
      console.log(`  (${server}: ${err.message.split(" -> ").pop()}, trying the next server)`);
    }
  }
  if (!data) throw last;
  await fs.mkdir(h.CACHE, { recursive: true });
  await fs.writeFile(dest, JSON.stringify(data));
  return data;
}

const elPos = (e) => (e.center ? [e.center.lat, e.center.lon] : e.lat != null ? [e.lat, e.lon] : e.geometry ? centroid(e.geometry.map((p) => [p.lat, p.lon])) : null);
const elRing = (h, e) => {
  if (e.type !== "way" || !e.geometry || e.geometry.length < 4) return null;
  const ring = e.geometry.map((p) => [p.lat, p.lon]);
  const [a, b] = [ring[0], ring[ring.length - 1]];
  if (a[0] !== b[0] || a[1] !== b[1]) return null;
  return [[h.simplify(ring, 2).map(([x, y]) => [h.round5(x), h.round5(y)])]];
};

const STREET_KINDS = new Set(["street_side", "lane", "on_kerb", "half_on_kerb", "layby", "shoulder"]);
const CLOSED_ACCESS = new Set(["private", "no", "employees", "permit", "delivery", "residents", "military"]);
const ACCESS = { yes: "public", permissive: "public", destination: "public", public: "public", customers: "customers" };

/** "2 hours", "120 minutes", "1:30", "90" -> minutes. */
function parseMaxStay(v) {
  if (!v || v === "no") return undefined;
  let m = /^(\d+(?:\.\d+)?)\s*(h|hours?|val\.?)$/i.exec(v.trim());
  if (m) return Math.round(+m[1] * 60);
  m = /^(\d+)\s*(min|minutes?)?$/i.exec(v.trim());
  if (m) return +m[1];
  m = /^(\d+):(\d\d)$/.exec(v.trim());
  return m ? +m[1] * 60 + +m[2] : undefined;
}
const fmtStay = (min) => (min % 60 ? `${min} min.` : `${min / 60} val.`);

function osmTariff(t) {
  const maxStayMin = parseMaxStay(t.maxstay);
  const extra = [maxStayMin ? `Ne ilgiau kaip ${fmtStay(maxStayMin)}` : "", t.opening_hours ? `Darbo laikas: ${t.opening_hours}` : ""].filter(Boolean);
  if (t.fee === "no") return { known: true, free: true, maxStayMin, text: ["Nemokama (pagal OpenStreetMap)", ...extra] };
  const m = /([\d.,]+)\s*(?:EUR|€)\s*\/\s*(h|hour|val)/i.exec(t.charge ?? "");
  if (t.fee === "yes" && m) {
    const perHour = +m[1].replace(",", ".");
    return { known: true, rates: [{ rules: null, perHour }], maxStayMin, text: [`${eur(perHour)}/val. (pagal OpenStreetMap)`, ...extra] };
  }
  if (t.fee === "yes") return { known: false, maxStayMin, text: ["Mokama, kaina nežinoma", ...(t.charge ? [`OpenStreetMap: ${t.charge}`] : []), ...extra] };
  return { known: false, maxStayMin, text: [t.access === "customers" ? "Klientams; taisyklės nežinomos" : "Mokestis ir taisyklės nežinomi", ...extra] };
}

const osmAddr = (t) => (t["addr:street"] ? `${t["addr:street"]}${t["addr:housenumber"] ? ` ${t["addr:housenumber"]}` : ""}` : null);

async function osmLots(h) {
  const b = `(${VILNIUS.s},${VILNIUS.w},${VILNIUS.n},${VILNIUS.e})`;
  // One at a time: Overpass gives each client only a couple of slots.
  const vln = await overpass(h, "parking-vilnius", `(way["amenity"="parking"]${b};node["amenity"="parking"]${b};relation["amenity"="parking"]${b};);out tags geom;`);
  const lt = await overpass(h, "parking-lt", `${LT_AREA}nwr["amenity"="parking"](area.lt);out tags center;`);
  const shops = await overpass(h, "shops-lt", `${LT_AREA}nwr["shop"~"^(supermarket|mall|department_store|doityourself|hardware|furniture|electronics|car)$"](area.lt);out tags center;`);

  // Shops, to say whose customers an unnamed car park serves.
  const shopList = shops.elements
    .map((e) => ({ pos: elPos(e), name: e.tags.brand ?? e.tags.name ?? null, mall: e.tags.shop === "mall" }))
    .filter((s) => s.pos && s.name);
  const nearShop = (p) => {
    let best = null, bestD = 80;
    for (const s of shopList) {
      if (Math.abs(s.pos[0] - p[0]) > 0.001 || Math.abs(s.pos[1] - p[1]) > 0.0016) continue;
      const d = dist(p, s.pos);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best?.name ?? null;
  };

  const lots = [];
  const streetAreas = [];
  const seen = new Set();
  for (const [els, full] of [[vln.elements, true], [lt.elements, false]]) {
    for (const e of els) {
      const key = `${e.type[0]}${e.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const t = e.tags ?? {};
      const pos = elPos(e);
      if (!pos || (!full && inVilnius(pos))) continue;
      if (CLOSED_ACCESS.has(t.access) || /^(garage_boxes|garages|carports|sheds)$/.test(t.parking ?? "")) continue;
      const poly = full ? elRing(h, e) : null;
      if (STREET_KINDS.has(t.parking)) {
        streetAreas.push({ src: "osm", pos: pos.map(h.round5), poly, kind: t.parking, cap: +t.capacity || null, fee: t.fee ?? null, maxStayMin: parseMaxStay(t.maxstay), name: osmAddr(t) ?? t.name ?? null });
        continue;
      }
      const near = t.name ? null : nearShop(pos);
      lots.push({
        id: `osm-${key}`,
        src: "osm",
        name: t.name ?? null,
        addr: osmAddr(t),
        city: t["addr:city"] ?? (inVilnius(pos) ? "Vilnius" : null),
        pos: pos.map(h.round5),
        ...(poly ? { poly } : {}),
        kind: t.parking ?? undefined,
        gated: t.barrier ? true : undefined,
        access: t.park_ride && t.park_ride !== "no" ? "pr" : (ACCESS[t.access] ?? (near ? "customers" : "unknown")),
        cap: +t.capacity || null,
        op: t.operator ?? null,
        url: t.website ?? null,
        near: near ?? undefined,
        t: osmTariff(t),
      });
    }
  }
  return { lots, streetAreas };
}

// ---------------------------------------------------------------- street-side parking

const POSITIVE = new Set(["lane", "street_side", "on_kerb", "half_on_kerb", "shoulder", "yes", "parallel", "diagonal", "perpendicular", "marked"]);
const NEGATIVE = new Set(["no", "no_parking", "no_stopping", "no_standing", "fire_lane"]);
const ORIENTATION = { parallel: "lygiagrečiai", diagonal: "įstrižai", perpendicular: "statmenai" };

/** Shift a line sideways by `m` metres (positive = right of the drawing direction). */
function offsetLine(line, m) {
  const KX = 111320 * Math.cos(rad(line[0][0])), KY = 110540;
  const xy = line.map(([lat, lng]) => [lng * KX, lat * KY]);
  const out = [];
  for (let i = 0; i < xy.length; i++) {
    const a = xy[Math.max(0, i - 1)], b = xy[Math.min(xy.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    // Right-hand normal of the direction a -> b.
    out.push([(xy[i][1] + (-dx / len) * m) / KY, (xy[i][0] + (dy / len) * m) / KX]);
  }
  return out;
}

async function streetParking(h, zones, areas, osmStreetAreas) {
  // Keys listed one by one: a key-regex filter came back empty from the mirror.
  const keys = ["parking:left", "parking:right", "parking:both", "parking:lane:left", "parking:lane:right", "parking:lane:both"];
  const ways = await overpass(h, "street-parking-lt2", `${LT_AREA}(${keys.map((k) => `way["highway"]["${k}"](area.lt);`).join("")});out tags geom;`);
  const zoneAt = (p) => {
    // Overlapping zones: the dearest applies, as in the planner.
    let best = -1;
    zones.forEach((z, i) => {
      if (inPolys(p, z.poly) && (best < 0 || z.price > zones[best].price)) best = i;
    });
    return best < 0 ? undefined : best;
  };
  const areaAt = (p) => {
    const i = areas.findIndex((a) => inPolys(p, a.poly));
    return i < 0 ? undefined : i;
  };
  const mid = (line) => line[Math.floor(line.length / 2)];

  const segments = [];
  const noParking = [];
  for (const w of ways.elements) {
    if (!w.geometry || w.geometry.length < 2) continue;
    const t = w.tags;
    const line = h.simplify(w.geometry.map((p) => [p.lat, p.lon]), 1.5);
    for (const side of ["left", "right"]) {
      const old = t[`parking:lane:${side}`] ?? t["parking:lane:both"];
      const v = t[`parking:${side}`] ?? t["parking:both"] ?? old;
      if (!v || v === "separate") continue;
      const sideTag = (k) => t[`parking:${side}:${k}`] ?? t[`parking:both:${k}`];
      const shifted = offsetLine(line, side === "right" ? 4.5 : -4.5).map(([a, b]) => [h.round5(a), h.round5(b)]);
      const m = mid(shifted);
      if (NEGATIVE.has(v) || sideTag("restriction") === "no_parking" || sideTag("restriction") === "no_stopping") {
        if (inVilnius(m)) noParking.push({ line: shifted, kind: sideTag("restriction") ?? v, name: t.name ?? null });
        continue;
      }
      if (!POSITIVE.has(v)) continue;
      const orientation = ORIENTATION[sideTag("orientation")] ?? ORIENTATION[old] ?? null;
      const maxStayMin = parseMaxStay(sideTag("maxstay") ?? t[`parking:condition:${side}:maxstay`] ?? t["parking:condition:both:maxstay"]);
      // One-way streets (KET 142: parking on the left is allowed there) and lane count.
      const oneway = t.oneway === "yes" || t.oneway === "1" ? 1 : t.oneway === "-1" ? -1 : undefined;
      const lanes = Number.parseInt(t.lanes, 10) || undefined;
      segments.push({ src: "osm", line: shifted, name: t.name ?? null, side, oneway, lanes, orientation, fee: sideTag("fee") ?? null, maxStayMin, zi: zoneAt(m), ai: areaAt(m) });
    }
  }

  // JUDU: installed street spaces (lines) and spaces on the sidewalk (points).
  for (const f of await arcgisFeatures(h, SRC.installed)) {
    const p = f.properties;
    if (!/įrengtos/i.test(p.Tipas ?? "") || /planuojam/i.test(p.Tipas ?? "")) continue;
    for (const line of linesOf(h, f.geometry)) {
      const m = mid(line);
      segments.push({ src: "judu", line, name: p.Adresas ?? null, note: p.pastaba ?? null, spaces: p.Vietu_sk ?? null, zi: zoneAt(m), ai: areaAt(m) });
    }
  }
  const points = [];
  for (const f of await arcgisFeatures(h, SRC.sidewalk)) {
    const c = f.geometry?.coordinates;
    if (!c) continue;
    const pos = [h.round5(c[1]), h.round5(c[0])];
    points.push({ src: "judu", pos, name: f.properties.adresas ?? null, spaces: +f.properties.stovejimo_vietu_sk || null, kind: "sidewalk", zi: zoneAt(pos), ai: areaAt(pos) });
  }
  const streetAreas = osmStreetAreas.map((a) => ({ ...a, zi: zoneAt(a.pos), ai: areaAt(a.pos) }));

  // JUDU no-parking zones (squares, pedestrian streets, school areas).
  const noZones = (await arcgisFeatures(h, SRC.noParking)).map((f) => ({ name: f.properties.Pavadinimas ?? null, poly: polygonsOf(h, f.geometry, 2) })).filter((z) => z.poly.length);

  return { segments, areas: streetAreas, points, noParking, noZones };
}

// ---------------------------------------------------------------- UNIPARK

const STORE_HOURS = [{ season: null, days: ALL_DAYS, hours: [[8, 22]] }];
const NOT_STORE_HOURS = [{ season: null, days: ALL_DAYS, hours: [[0, 8], [22, 24]] }];
const WORKDAYS = [1, 2, 3, 4, 5];
const WEEKEND = [6, 7];
const num = (s) => +s.replace(",", ".");
// "2 val.", "1.5 val.", "30 min", "pirmos 4 val."
const DUR_RE = /^(?:pirmos\s+|pirma\s+)?(\d+(?:[.,]\d+)?)\s*(val|min)\.?$/i;
const PRICE_RE = /^(\d+(?:[.,]\d+)?)\s*Eur\.?(?:\s*\((pirmos|po pirmų)\s+(\d+)\s*val\.?\))?$/i;
const durMin = (m) => Math.round(num(m[1]) * (/^val/i.test(m[2]) ? 60 : 1));
const hoursOf = (a, b) => (a < b ? [[a, b]] : [[a, 24], [0, b]]);

/** A trailing "(07:00 – 20:00)" or "(darbo dienomis, 06:00 – 19:00)" -> [line without it, rules | null]. */
function splitWindow(s) {
  const m = /\s*\((?:(darbo dienomis|pirmadieniais-penktadieniais|savaitgaliais)\s*,?\s*)?(\d{1,2}):(\d\d)\s*[–-]\s*(\d{1,2}):(\d\d)\)\s*$/i.exec(s);
  if (!m) return [s, null];
  const days = /savait/i.test(m[1] ?? "") ? WEEKEND : m[1] ? WORKDAYS : ALL_DAYS;
  return [s.slice(0, m.index).trim(), [{ season: null, days, hours: hoursOf(+m[2] + +m[3] / 60, +m[4] + +m[5] / 60 || 24) }]];
}

/** A header's days narrowed to a line's hours. */
function within(cond, win) {
  if (!win) return cond;
  if (!cond) return win;
  return cond.flatMap((c) => win.map((w) => ({ season: c.season ?? w.season, days: c.days.filter((d) => w.days.includes(d)), hours: w.hours })));
}

/**
 * The "Kainos" block of a UNIPARK lot page -> tariff. Strict: any line it doesn't
 * understand makes the tariff unknown (the published lines are still shown).
 */
export function parseUniparkPrices(lines) {
  const t = { known: true, text: [], rates: [] };
  const tiers = [];
  const unknown = [];
  let cond = null; // the header the next prices fall under
  let store = false;
  const clean = (s) => (s ?? "").replace(/\s+/g, " ").trim();
  const rate = (perHour, win) => t.rates.push({ rules: within(cond, win), perHour });
  const free = (min, rules) => {
    if (t.freeMin != null) return false; // a second, differently timed free period: too complex
    t.freeMin = min;
    if (rules) t.freeRules = rules;
    return true;
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = clean(lines[i]);
    const [s, win] = splitWindow(raw);
    const [next, nextWin] = splitWindow(clean(lines[i + 1]));
    let m, p;
    // Fine print and notes.
    if (/^Gali būti taikomi papildomi mokesčiai/i.test(s) || /^Kiekvienos papildomos/i.test(s) || /^Įkrovimo (kainos|metu)/i.test(s)) continue;
    if ((m = /^(?:Tarifas|Kaina) skaičiuojam\w* (valandos|(\d+) min\.?) tikslumu/i.exec(s))) { t.step ??= m[2] ? +m[2] : 60; continue; }
    if (/programėlės paslaugos mokestis/i.test(s)) { t.text.push(s); continue; }
    if (/^El\. įkrovimas$/i.test(s)) { t.charging = true; continue; }
    if (/elektromobiliams (parkavimas )?nemokam/i.test(s)) { t.text.push(raw); continue; }
    if (/^Nemokamas (stovėjimo )?laikas sumuojamas$/i.test(s)) { t.text.push("Nemokamas laikas sumuojamas"); continue; }
    if (/^Pažeidus taisykles$/i.test(s)) { i++; continue; }
    if (/^Mėnesinis abonementas$/i.test(s) && (m = /([\d.,]+)\s*Eur/i.exec(next))) { t.monthly = num(m[1]); i++; continue; }
    if (/^(1\s+)?Para$/i.test(s) && (m = PRICE_RE.exec(next))) { t.dayCap = num(m[1]); i++; continue; }
    // "0.50 Eur" + "Kiekvienos papildomos 30 min"
    const each = /^Kiekvienos papildomos (\d+) min/i.exec(next);
    if (each && (m = PRICE_RE.exec(s)) && !m[2]) { rate((num(m[1]) * 60) / +each[1], win); i++; continue; }
    // Headers: the prices below them apply only then.
    if (/^Parduotuvės darbo laiku$/i.test(s)) { cond = STORE_HOURS; store = true; continue; }
    if (/^Parduotuvės nedarbo laiku$/i.test(s)) { cond = NOT_STORE_HOURS; store = true; continue; }
    if (/^(Pirmadienį\s*[-–]\s*penktadienį|Darbo dienomis)$/i.test(s)) { cond = within([{ season: null, days: WORKDAYS, hours: [[0, 24]] }], win); continue; }
    if (/^Savaitgaliais( ir švenčių dienomis)?$/i.test(s)) { cond = within([{ season: null, days: WEEKEND, hours: [[0, 24]] }], win); continue; }
    if ((m = /^(\d{1,2}):(\d\d)\s*[-–]\s*(\d{1,2}):(\d\d)$/.exec(s))) { cond = [{ season: null, days: ALL_DAYS, hours: hoursOf(+m[1] + +m[2] / 60, +m[3] + +m[4] / 60 || 24) }]; continue; }
    // Tiers by time already parked.
    if (/^Pirma valanda$/i.test(s) && (m = PRICE_RE.exec(next))) { tiers.push({ fromMin: 0, perHour: num(m[1]) }); i++; continue; }
    if (/^Po pirmos valandos$/i.test(s) && (m = PRICE_RE.exec(next))) { tiers.push({ fromMin: 60, perHour: num(m[1]) }); i++; continue; }
    if (/^papildoma val\.?$/i.test(s) && (m = PRICE_RE.exec(next))) { rate(num(m[1]), nextWin); i++; continue; }
    // Free time.
    if (/^nemokamai$/i.test(s) && (m = DUR_RE.exec(next))) { if (free(durMin(m), nextWin)) { i++; continue; } }
    if (/^nemokamai$/i.test(s)) continue; // "Savaitgaliais" + "nemokamai": no rate then, i.e. free
    if ((m = /(\d+(?:[.,]\d+)?)\.?\s*(val|min)\.?\s+nemokamai/i.exec(s))) { if (free(durMin(m), win ?? cond)) continue; }
    // "1 val. – 2.00 Eur" on one line (under a header).
    if ((m = /^(\d+(?:[.,]\d+)?)\s*(val|min)\.?\s*[–-]\s*(\d+(?:[.,]\d+)?)\s*Eur\.?$/i.exec(s))) { rate((num(m[3]) * 60) / durMin(m), win); continue; }
    // A duration followed by "nemokamai…" or by a price.
    if ((m = DUR_RE.exec(s))) {
      const dm = durMin(m);
      if (/^nemokamai\b/i.test(next)) {
        const storeFree = /parduotuvės darbo laiku/i.test(next);
        if (storeFree) store = true;
        if (free(dm, nextWin ?? (storeFree ? STORE_HOURS : cond))) {
          if (/terminal|kartą per parą|per parą/i.test(next)) t.text.push(`${raw}: ${clean(lines[i + 1])}`);
          i++;
          continue;
        }
      } else if ((p = PRICE_RE.exec(next))) {
        const perHour = (num(p[1]) * 60) / dm;
        if (p[2]) tiers.push({ fromMin: /^po/i.test(p[2]) ? +p[3] * 60 : 0, perHour });
        else rate(perHour, nextWin);
        i++;
        continue;
      }
    }
    unknown.push(raw);
  }
  if (tiers.length) t.tiers = tiers.sort((a, b) => a.fromMin - b.fromMin);
  if (store) t.assumed = "Parduotuvės darbo laikas laikomas 8–22 val.";
  if (unknown.length || (!t.rates.length && !tiers.length)) t.known = false;
  if (!t.rates.length) delete t.rates;
  return t;
}

/** The page shows a condition and its price side by side: "1 val." + "2.00 Eur" -> "1 val. – 2.00 Eur". */
function pairLines(block) {
  const out = [];
  const fine = (x) => /^(Tarifas|Kaina) skaičiuojam|^Gali būti|^Nemokamas (stovėjimo )?laikas sumuojamas|programėlės/i.test(x);
  for (let i = 0; i < block.length; i++) {
    const a = block[i], b = block[i + 1];
    if (b && !fine(b)) {
      if (/^nemokamai$/i.test(a) && DUR_RE.test(b)) { out.push(`Nemokamai ${b}`); i++; continue; }
      if (PRICE_RE.test(a) && /^Kiekvienos papildomos/i.test(b)) { out.push(`${a} už kiekvieną papildomą ${b.replace(/^Kiekvienos papildomos\s*/i, "")}`); i++; continue; }
      const header = !/\d/.test(a) && !/Eur|nemokam/i.test(a) && a.length < 40;
      if (DUR_RE.test(a) || header) { out.push(`${a}${header ? ": " : " – "}${b}`); i++; continue; }
    }
    out.push(a);
  }
  return out;
}

const pageText = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<svg[\s\S]*?<\/svg>/gi, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#8222;|&#8220;/g, "„")
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(+c))
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

async function uniparkPage(h, url) {
  const slug = url.replace(/\/$/, "").split("/").slice(-2).join("_");
  const dest = path.join(h.CACHE, "unipark", `${slug}.html`);
  try {
    const st = await fs.stat(dest);
    if (Date.now() - st.mtimeMs < 20 * 3600 * 1000) return fs.readFile(dest, "utf8");
  } catch {}
  await new Promise((r) => setTimeout(r, 1000)); // be gentle: one page a second
  const res = await fetch(url, { headers: { "User-Agent": h.UA } });
  if (!res.ok) return null;
  const html = await res.text();
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, html);
  return html;
}

async function uniparkLots(h) {
  const sitemap = (await h.cachedDownload("https://unipark.lt/parkings-sitemap.xml", "unipark-sitemap.xml")).toString("utf8");
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1])
    .filter((u) => /^https:\/\/unipark\.lt\/parkavimas-mieste\/[^/]+\/[^/]+\/?$/.test(u) && !/zona|judu-/i.test(u));
  const lots = [];
  let unknown = 0;
  for (const url of urls) {
    const html = await uniparkPage(h, url);
    if (!html) continue;
    // The page's own schema.org data: name, address, coordinates, code. Text only, never executed.
    let fac = null;
    for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
      try {
        const d = JSON.parse(m[1]);
        for (const x of d["@graph"] ?? [d]) if (x["@type"] === "ParkingFacility" && x.geo) fac = x;
      } catch {}
    }
    if (!fac) continue;
    const lat = +fac.geo.latitude, lng = +fac.geo.longitude;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const lines = pageText(html);
    const a = lines.indexOf("Kainos");
    const b = lines.findIndex((l, i) => i > a && /^Pagrindinė informacija/.test(l));
    const block = a >= 0 && b > a ? lines.slice(a + 1, b) : [];
    const t = parseUniparkPrices(block);
    t.text = [...pairLines(block.filter((l) => !/^Gali būti taikomi|^Įkrovimo kainos|^El\. įkrovimas$/i.test(l))), ...t.text.filter((x) => !block.some((b) => b.toLowerCase() === x.toLowerCase()))];
    if (!t.known) unknown++;
    const code = fac.identifier?.value ?? null;
    // "UP048 – PC LIDL, Vėtrungių g. 16, Vilnius" -> "PC LIDL, Vėtrungių g. 16"
    let name = (fac.name ?? "").replace(/^[A-Z0-9]+\s*[–-]\s*/, "");
    const city = fac.address?.addressLocality;
    if (city && name.endsWith(`, ${city}`)) name = name.slice(0, -(city.length + 2));
    const desc = fac.description ?? "";
    lots.push({
      // The page slug, not the code: sub-lots (P1/P2, −1a/−2a) share one code.
      id: `unipark-${url.replace(/\/$/, "").split("/").pop()}`,
      src: "unipark",
      name: name || fac.address?.streetAddress || code,
      code,
      addr: fac.address?.streetAddress ?? null,
      city: fac.address?.addressLocality ?? null,
      pos: [h.round5(lat), h.round5(lng)],
      kind: /požemin/i.test(fac.name + desc) ? "underground" : /daugiaaukšt/i.test(fac.name + desc) ? "multi-storey" : undefined,
      gated: /barjer|užtvar|šlagbaum/i.test(desc) ? !/nėra[^.]*(barjer|užtvar)/i.test(desc) : undefined,
      access: /parduotuvės|PC |PLC |prekybos/i.test(fac.name + desc) ? "customers" : "public",
      op: "UNIPARK",
      url,
      t,
      charging: t.charging || undefined,
    });
  }
  return { lots, unknown };
}

// ---------------------------------------------------------------- merge

/**
 * One record per car park. Richer sources win (JUDU > UNIPARK > curated > OSM);
 * an OSM polygon under a richer record lends it its outline and is dropped.
 */
function mergeLots(h, judu, unipark, curated, osm) {
  const osmLeft = new Set(osm);
  const claim = (lot, { within = 40, kind } = {}) => {
    let best = null, bestD = within;
    for (const o of osmLeft) {
      if (Math.abs(o.pos[0] - lot.pos[0]) > 0.005 || Math.abs(o.pos[1] - lot.pos[1]) > 0.008) continue;
      if (kind && o.kind && o.kind !== kind) continue;
      const inside = o.poly && inPolys(lot.pos, o.poly);
      const d = inside ? 0 : dist(lot.pos, o.pos);
      if (d <= bestD) { bestD = d; best = o; }
    }
    if (!best) return;
    osmLeft.delete(best);
    if (!lot.poly && best.poly) lot.poly = best.poly;
    lot.kind ??= best.kind;
    lot.cap ??= best.cap;
  };
  for (const l of judu) {
    // JUDU has its own outlines; drop OSM duplicates inside or right next to them.
    for (const o of [...osmLeft]) if (inPolys(o.pos, l.poly) || dist(o.pos, l.pos) < 25) { osmLeft.delete(o); l.kind ??= o.kind; }
  }
  for (const l of unipark) claim(l, { within: 40, kind: l.kind === "underground" ? "underground" : undefined });
  for (const l of curated) {
    claim(l, l.snap ?? {});
    delete l.snap;
  }
  return [...judu, ...unipark, ...curated, ...osmLeft];
}

// ---------------------------------------------------------------- main

export async function buildParking(h) {
  console.log("Parking…");
  const zones = [...(await vilniusZones(h)), ...(await klaipedaZones(h))];
  const areas = await residentAreas(h);
  console.log(`  zones: ${zones.length}, resident areas: ${areas.length}`);

  const updated = vilniusDate();
  let size = await writeJson(h, "parking.json", {
    updated,
    sources: [
      { name: "JUDU – Vilniaus rinkliavos zonos nuo 2025-07-01 (CC BY-NC 4.0)", url: SRC.zones },
      { name: "JUDU – gyventojų leidimų zonos", url: SRC.areas },
      { name: "Klaipėdos m. sav. – parkavimo zonos", url: SRC.klaipeda },
    ],
    zones,
    areas,
  });
  console.log(`  → public/data/parking.json (${size})`);

  const judu = await juduLots(h);
  console.log(`  JUDU lots: ${judu.length} (${judu.filter((l) => l.occ).length} with occupancy)`);

  console.log("  occupancy history (12 weeks)…");
  const occupancy = await occupancyProfiles(h, judu.filter((l) => l.occ).map((l) => l.occ));
  size = await writeJson(h, "lot-occupancy.json", {
    updated,
    source: { name: "JUDU – aikštelių užimtumo istorija (CC BY-NC 4.0)", url: SRC.history },
    ...occupancy,
  });
  console.log(`  → public/data/lot-occupancy.json (${Object.keys(occupancy.lots).length} lots, ${occupancy.from} – ${occupancy.to}, ${size})`);

  console.log("  OpenStreetMap…");
  const osm = await osmLots(h);
  console.log(`  OSM: ${osm.lots.length} car parks, ${osm.streetAreas.length} street-side areas`);

  console.log("  UNIPARK pages (1 per second when not cached)…");
  const unipark = await uniparkLots(h);
  console.log(`  UNIPARK: ${unipark.lots.length} lots (${unipark.lots.filter((l) => l.city === "Vilnius").length} Vilnius), ${unipark.unknown} with tariffs we could not read`);

  const curated = JSON.parse(await fs.readFile(path.join(h.ROOT, "data", "curated-parking.json"), "utf8")).lots.map((l) => ({ ...l, src: "curated" }));

  const lots = mergeLots(h, judu, unipark.lots, curated, osm.lots);
  const bySrc = Object.entries(Object.groupBy(lots, (l) => l.src)).map(([k, v]) => `${k} ${v.length}`).join(", ");
  const sources = [
    { name: "JUDU – aikštelių ribos (CC BY 4.0)", url: SRC.lots },
    { name: "JUDU – aikštelių užimtumas (CC BY-NC 4.0)", url: SRC.live },
    { name: "UNIPARK – aikštelių puslapiai", url: "https://unipark.lt/parkavimas-mieste/vilnius/" },
    { name: "Prekybos centrų svetainės (žr. data/curated-parking.json)", url: null },
    { name: "OpenStreetMap (ODbL)", url: "https://www.openstreetmap.org/copyright" },
  ];
  // Vilnius in full (outlines included) plus every non-OSM lot in the country;
  // the rest of Lithuania's OSM lots go to a second, lighter file the map loads on demand.
  const main = lots.filter((l) => l.src !== "osm" || inVilnius(l.pos));
  const rest = lots.filter((l) => l.src === "osm" && !inVilnius(l.pos)); // points only, no outlines
  size = await writeJson(h, "lots.json", { updated, sources, lots: main });
  const sizeRest = await writeJson(h, "lots-lt.json", { updated, sources: sources.slice(-1), lots: rest });
  console.log(`  → public/data/lots.json (${main.length} lots, ${size}) + lots-lt.json (${rest.length} OSM lots elsewhere, ${sizeRest}); all: ${bySrc}`);

  await writeStreet(h, updated, zones, areas, osm.streetAreas);
}

async function writeStreet(h, updated, zones, areas, osmStreetAreas) {
  console.log("  street-side parking…");
  const street = await streetParking(h, zones, areas, osmStreetAreas);
  const size = await writeJson(h, "street-parking.json", {
    updated,
    note: "zi – zonos indeksas parking.json › zones; ai – gyventojų leidimų zonos indeksas parking.json › areas",
    sources: [
      { name: "OpenStreetMap: parking:left/right/both, amenity=parking + parking=street_side (ODbL)", url: "https://wiki.openstreetmap.org/wiki/Street_parking" },
      { name: "JUDU – įrengtos automobilių stovėjimo vietos", url: SRC.installed },
      { name: "JUDU – stovėjimo vietos ant šaligatvio", url: SRC.sidewalk },
      { name: "JUDU – draudžiamo stovėjimo zonos", url: SRC.noParking },
    ],
    ...street,
  });
  console.log(
    `  → public/data/street-parking.json (${street.segments.length} street pieces, ${street.areas.length} areas, ${street.points.length} sidewalk points, ${street.noParking.length} no-parking pieces, ${street.noZones.length} no-parking zones; ${size})`,
  );
}

/** Street-side parking alone: zones and resident areas are read back from parking.json. */
export async function buildStreet(h) {
  console.log("Street-side parking…");
  const parking = JSON.parse(await fs.readFile(path.join(h.ROOT, "public", "data", "parking.json"), "utf8"));
  const osm = await osmLots(h);
  await writeStreet(h, vilniusDate(), parking.zones, parking.areas ?? [], osm.streetAreas);
}

// ---------------------------------------------------------------- scooter spots

/** Where shared scooters may be left (JUDU), and the Old Town zone where only those spots are allowed. */
export async function buildScooterSpots(h) {
  console.log("Scooter parking spots…");
  const spots = [];
  for (const f of await arcgisFeatures(h, SRC.scooterSpots)) {
    const c = f.geometry?.coordinates;
    if (!c) continue;
    spots.push({ pos: [h.round5(c[1]), h.round5(c[0])], addr: f.properties.Adresas ?? null });
  }
  const oldTown = (await arcgisFeatures(h, SRC.oldTownScooters)).flatMap((f) => polygonsOf(h, f.geometry, 3));
  const size = await writeJson(h, "scooter-spots.json", {
    updated: vilniusDate(),
    sources: [
      { name: "JUDU – paspirtukų stovėjimo vietos", url: SRC.scooterSpots },
      { name: "JUDU – Senamiesčio paspirtukų zona", url: SRC.oldTownScooters },
    ],
    spots,
    oldTown,
  });
  console.log(`  → public/data/scooter-spots.json (${spots.length} spots, ${oldTown.length} Old Town polygons; ${size})`);
}

// ---------------------------------------------------------------- EV chargers

const CONNECTOR = { IEC_62196_T2: "T2", IEC_62196_T2_COMBO: "CCS", CHADEMO: "CHADEMO", IEC_62196_T1: "T1", IEC_62196_T1_COMBO: "CCS", DOMESTIC_F: "SCHUKO" };

/** All pages of an OCPI list endpoint (offset/limit; unpublished items are left out by the server). */
async function ocpiAll(h, module) {
  const out = new Map();
  for (let offset = 0; offset < 50000; offset += 1000) {
    const page = await h.getJson(`${SRC.ocpi}/${module}?offset=${offset}&limit=1000`);
    if (page.status_code !== 1000) throw new Error(`OCPI ${module}: ${page.status_code} ${page.status_message}`);
    if (!page.data?.length) break;
    for (const x of page.data) out.set(x.id, x);
  }
  return [...out.values()];
}

/** OCPI tariff -> published prices. TIME and PARKING_TIME are per hour in OCPI. */
function ocpiPrice(t) {
  if (!t) return {};
  const p = {};
  for (const el of t.elements ?? []) {
    if (el.restrictions && Object.keys(el.restrictions).length) continue; // keep the base price only
    for (const c of el.price_components ?? []) {
      const v = +c.price;
      if (!Number.isFinite(v)) continue;
      if (c.type === "ENERGY") p.perKwh ??= v;
      else if (c.type === "TIME") p.perMin ??= v / 60;
      else if (c.type === "PARKING_TIME") p.parkingPerMin ??= v / 60;
      else if (c.type === "FLAT") p.start ??= v;
    }
  }
  const alt = t.tariff_alt_text ?? [];
  const text = (alt.find((a) => a.language === "lt") ?? alt.find((a) => a.language === "en") ?? alt[0])?.text;
  if (text) p.priceText = text.trim().slice(0, 160);
  return p;
}

export async function buildChargers(h) {
  console.log("EV chargers (Via Lietuva, OCPI 2.3.0)…");
  const [locations, tariffs] = await Promise.all([ocpiAll(h, "locations"), ocpiAll(h, "tariffs")]);
  const tariffById = new Map(tariffs.map((t) => [t.id, t]));

  let lots = [];
  try {
    for (const name of ["lots.json", "lots-lt.json"]) lots.push(...JSON.parse(await fs.readFile(path.join(h.ROOT, "public", "data", name), "utf8")).lots);
  } catch {
    console.log("  (no lots.json yet – chargers are not linked to car parks; run `npm run data -- parking` first)");
  }
  const lotAt = (p) => {
    let best = null, bestD = 50;
    for (const l of lots) {
      if (Math.abs(l.pos[0] - p[0]) > 0.004 || Math.abs(l.pos[1] - p[1]) > 0.007) continue;
      if (l.poly && inPolys(p, l.poly)) return l;
      const d = dist(p, l.pos);
      if (d < bestD) { bestD = d; best = l; }
    }
    return best;
  };

  const chargers = [];
  for (const loc of locations) {
    if (loc.publish === false) continue;
    const pos = [+loc.coordinates?.latitude, +loc.coordinates?.longitude];
    if (!Number.isFinite(pos[0]) || !Number.isFinite(pos[1])) continue;
    const groups = new Map();
    for (const e of loc.evses ?? []) {
      if (e.status === "REMOVED") continue;
      // `n` counts connectors, so a driver can match their plug. An EVSE with
      // two connectors (e.g. CCS + CHAdeMO) still charges one car at a time.
      const cons = (e.connectors ?? []).map((c) => ({
        std: CONNECTOR[c.standard] ?? "OTHER",
        dc: /^DC/.test(c.power_type ?? ""),
        kW: Math.round(((c.max_electric_power ?? 0) / 1000) * 10) / 10,
        price: ocpiPrice(tariffById.get(c.tariff_ids?.[0])),
      }));
      for (const c of cons) {
        const key = `${c.std}|${c.dc}|${c.kW}`;
        const g = groups.get(key) ?? { std: c.std, dc: c.dc, kW: c.kW, n: 0, ...c.price };
        g.n++;
        groups.set(key, g);
      }
    }
    if (!groups.size) continue;
    const p = pos.map(h.round5);
    const lot = lotAt(p);
    chargers.push({
      id: String(loc.id),
      name: (loc.name ?? "").split(" | ")[0].trim() || loc.address, // "A. Vienuolio g. 6 | operator | …"
      pos: p,
      address: loc.address ?? null,
      city: loc.city ?? null,
      operator: loc.operator?.name ?? loc.owner?.name ?? null,
      plugs: [...groups.values()].sort((a, b) => b.kW - a.kW),
      open24: loc.opening_times ? !!loc.opening_times.twentyfourseven : null,
      ...(lot ? { lotId: lot.id } : {}),
    });
  }
  const size = await writeJson(h, "chargers.json", {
    updated: vilniusDate(),
    source: { name: "Via Lietuva – viešai prieinamų įkrovimo prieigų informacinė sistema (CC BY 4.0)", url: "https://ev.vialietuva.lt/atviri-duomenys-1" },
    chargers,
  });
  const vln = chargers.filter((c) => inVilnius(c.pos)).length;
  console.log(`  → public/data/chargers.json (${chargers.length} locations, ${vln} in Vilnius, ${chargers.filter((c) => c.lotId).length} in a known car park; ${size})`);
}
