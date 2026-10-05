#!/usr/bin/env node
// Builds the static data files the app reads (public/data/*).
//
//   node scripts/build-data.mjs            # all years
//   node scripts/build-data.mjs 2024 2025  # only these years
//
// Sources (all open data, no keys needed):
//   - Policijos departamentas, EĮIS eismo įvykiai (data.gov.lt dataset 509)
//   - Valstybės duomenų agentūra: gyventojai pagal savivaldybes ir amžių (osp-rs.stat.gov.lt SDMX API)
//   - Valstybės duomenų agentūra: savivaldybių ribos (osp-sdg.stat.gov.lt ArcGIS)
//   - Regitra: transporto priemonės pagal markę (get.data.gov.lt universal API)
//
// Raw downloads are cached in .cache/ (≈100 MB per year), so re-runs are fast.

import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const CACHE = path.join(ROOT, ".cache");
const OUT = path.join(ROOT, "public", "data");

// data.gov.lt distribution id for each year's yearly snapshot (ei_YYYY_12_31.json).
const OFFICIAL = { 2021: 10856, 2022: 14438, 2023: 15652, 2024: 17389, 2025: 19566 };
const UA = "Mozilla/5.0 (EismoPulsas data builder; +https://github.com/EismoPulsas/eismopulsas)";

// ---------------------------------------------------------------- helpers

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

// data.gov.lt sets a session cookie on the first hop and redirects to the file,
// so follow redirects by hand and carry cookies along.
async function download(url, dest) {
  if (await exists(dest)) return;
  let cookies = "";
  for (let hop = 0; hop < 8; hop++) {
    const res = await fetch(url, { redirect: "manual", headers: { "User-Agent": UA, Cookie: cookies } });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookies = [cookies, ...set.map((c) => c.split(";")[0])].filter(Boolean).join("; ");
    if (res.status >= 300 && res.status < 400) {
      url = new URL(res.headers.get("location"), url).toString();
      continue;
    }
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, Buffer.from(await res.arrayBuffer()));
    return;
  }
  throw new Error(`Too many redirects for ${url}`);
}

async function getJson(url, tries = 3) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (res.ok) return res.json();
    // get.data.gov.lt answers the odd request with a 500; a retry usually works.
    if (attempt >= tries || res.status < 500) throw new Error(`${url} -> HTTP ${res.status}`);
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
}

// LKS-94 (EPSG:3346, Transverse Mercator on GRS80) -> WGS84 lat/lng.
function lks94ToWgs84(x, y) {
  const a = 6378137, f = 1 / 298.257222101, k0 = 0.9998, lon0 = (24 * Math.PI) / 180;
  const e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const M = y / k0;
  const mu = M / (a * (1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const phi1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
    + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const s = Math.sin(phi1), c = Math.cos(phi1), t = Math.tan(phi1);
  const N1 = a / Math.sqrt(1 - e2 * s * s);
  const R1 = (a * (1 - e2)) / (1 - e2 * s * s) ** 1.5;
  const C1 = ep2 * c * c, T1 = t * t;
  const D = (x - 500000) / (N1 * k0);
  const lat = phi1 - (N1 * t / R1) * (D * D / 2
    - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4 / 24
    + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6 / 720);
  const lng = lon0 + (D - (1 + 2 * T1 + C1) * D ** 3 / 6
    + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5 / 120) / c;
  return [(lat * 180) / Math.PI, (lng * 180) / Math.PI];
}

// "Šiaulių miesto sav." / "Šiaulių m. sav." -> "Šiaulių m. sav."
const normMuni = (s) => s && s.replace(/\s+miesto\s+/, " m. ").replace(/\s+rajono\s+/, " r. ").trim();

// Minutes since 2020-01-01 00:00 local time (stored as naive UTC on the client).
const EPOCH = Date.UTC(2020, 0, 1);
function toMinutes(s) {
  const m = /^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d)/.exec(s ?? "");
  if (!m) return null;
  return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - EPOCH) / 60000);
}

// Normalise vehicle makes so "VW" and "VOLKSWAGEN" count together.
const MAKE_ALIASES = { VW: "VOLKSWAGEN", "MERCEDES BENZ": "MERCEDES-BENZ", MERCEDES: "MERCEDES-BENZ", "LAND-ROVER": "LAND ROVER", "ŠKODA": "SKODA", "CITROËN": "CITROEN", "KIA MOTORS": "KIA" };
const normMake = (s) => {
  if (!s) return null;
  const up = s.trim().toUpperCase().replace(/\s+/g, " ");
  return MAKE_ALIASES[up] ?? up;
};

// Bit flags stored per accident (kept in sync with lib/data.ts).
const F = {
  BIKE: 1, PEDESTRIAN: 2, SCOOTER: 4, MOTO: 8, DRUNK: 16, CHILD: 32, COUNTED: 64,
  BUS_STOP: 128, BMW: 256, CROSSING: 512, TRUCK: 1024, FLED: 2048, ANIMAL: 4096,
};

const AGE_BUCKETS = [[0, 17], [18, 20], [21, 24], [25, 29], [30, 34], [35, 39], [40, 44], [45, 49], [50, 54], [55, 59], [60, 64], [65, 69], [70, 74], [75, 79], [80, 120]];
const ageBucket = (a) => AGE_BUCKETS.findIndex(([lo, hi]) => a >= lo && a <= hi);
const bucketLabel = ([lo, hi]) => (hi >= 120 ? `${lo}+` : lo === 0 ? `<${hi + 1}` : `${lo}–${hi}`);

// ---------------------------------------------------------------- reference data

async function loadPopulation() {
  // S3R167_M3010214: residents at the start of the year by municipality and urban/rural.
  const d = await getJson("https://osp-rs.stat.gov.lt/rest_json/data/S3R167_M3010214/?startPeriod=2021");
  const dims = d.structure.dimensions.observation;
  const munis = dims[0].values, place = dims[1].values, periods = dims.at(-1).values;
  const totalIdx = place.findIndex((v) => v.name === "Miestas ir kaimas");
  const out = {}; // code -> {name, pop: {year: n}}
  for (const [key, val] of Object.entries(d.dataSets[0].observations)) {
    const idx = key.split(":").map(Number);
    if (idx[1] !== totalIdx) continue;
    const m = munis[idx[0]];
    if (!/sav\.$/.test(m.name)) continue;
    const year = periods[idx.at(-1)].name;
    (out[m.id] ??= { name: m.name, pop: {} }).pop[year] = val[0];
  }
  return out;
}

async function loadAgePopulation() {
  // S3R167_M3010205: residents by single year of age (whole country, both sexes).
  const d = await getJson("https://osp-rs.stat.gov.lt/rest_json/data/S3R167_M3010205/?startPeriod=2025&endPeriod=2025");
  const dims = d.structure.dimensions.observation;
  const ix = (id) => dims.findIndex((x) => x.id.startsWith(id));
  const iPlace = ix("Vietove"), iAge = ix("Demogr_amzius"), iSex = ix("Lytis");
  const placeAll = dims[iPlace].values.findIndex((v) => v.name === "Miestas ir kaimas");
  const sexAll = dims[iSex].values.findIndex((v) => v.name === "Vyrai ir moterys");
  const buckets = AGE_BUCKETS.map(() => 0);
  for (const [key, val] of Object.entries(d.dataSets[0].observations)) {
    const idx = key.split(":").map(Number);
    if (idx[iPlace] !== placeAll || idx[iSex] !== sexAll) continue;
    const age = parseInt(dims[iAge].values[idx[iAge]].name, 10);
    if (Number.isNaN(age)) continue; // "Iš viso"
    const b = ageBucket(age);
    if (b >= 0) buckets[b] += val[0];
  }
  return buckets;
}

async function loadBoundaries() {
  const url = "https://osp-sdg.stat.gov.lt/arcgis/rest/services/sav_11_2_1/FeatureServer/0/query"
    + "?where=type%3D%27SAV%27&outFields=lau1,lau1_name&outSR=4326&maxAllowableOffset=0.003&geometryPrecision=4&f=geojson";
  const gj = await getJson(url);
  return gj.features.map((f) => ({ code: f.properties.lau1, name: f.properties.lau1_name, geometry: f.geometry }));
}

// Regitra spells makes inconsistently ("VW", "VOLKSWAGEN AG", "KIA MOTORS"), so count by
// prefix and add known short aliases.
const REGITRA_EXTRA = { VOLKSWAGEN: ["VW"], "MERCEDES-BENZ": ["MERCEDES BENZ"] };
async function regitraCount(make) {
  const base = "https://get.data.gov.lt/datasets/gov/regitra/ktpr/ValstybinisNumeris/:format/json";
  const filters = [`marke.startswith(${JSON.stringify(make)})`, ...(REGITRA_EXTRA[make] ?? []).map((a) => `marke=${JSON.stringify(a)}`)];
  let total = 0;
  for (const f of filters) {
    try {
      const d = await getJson(`${base}?${encodeURIComponent(f).replace(/%28/g, "(").replace(/%29/g, ")")}&count()`);
      total += d._data?.[0]?.["count()"] ?? 0;
    } catch (e) {
      console.warn("  Regitra failed for", make, e.message);
      return null;
    }
  }
  return total;
}

// ---------------------------------------------------------------- main

async function main() {
  const years = process.argv.slice(2).map(Number).filter(Boolean);
  const wanted = years.length ? years : Object.keys(OFFICIAL).map(Number);
  await fs.mkdir(OUT, { recursive: true });

  console.log("Gyventojai, ribos…");
  const [population, agePop, boundaries] = await Promise.all([loadPopulation(), loadAgePopulation(), loadBoundaries()]);
  // Statistics Lithuania lists all 60 municipalities; the boundary layer misses Visaginas.
  const nameToCode = Object.fromEntries([
    ...Object.entries(population).map(([code, p]) => [p.name, code]),
    ...boundaries.map((b) => [b.name, b.code]),
  ]);

  // Aggregates over all years.
  const muniStats = {}; // code -> year -> {all, counted, killed, injured, bike}
  const makeStats = {}; // make -> {all, culprit, killed, byYear}
  const ageStats = AGE_BUCKETS.map(() => ({ drivers: 0, culprits: 0, killed: 0, drunk: 0 }));
  const streetStats = {}; // "code|street" -> {...}
  const hourWeek = Array.from({ length: 7 }, () => Array(24).fill(0));
  const yearTotals = {};
  const busStops = []; // fun counter
  const fun = { drunkCulprits: 0, culprits: 0, fled: 0, friday13: 0, animals: 0, scooters: 0, bikes: 0, busStops: 0 };
  const busStopMakes = {};
  const topAddresses = {};

  for (const year of wanted) {
    const file = path.join(CACHE, `ei_${year}.json`);
    console.log(`${year}: atsisiunčiama / skaitoma…`);
    await download(`https://data.gov.lt/datasets/509/distribution/${OFFICIAL[year]}/download/`, file);
    const rows = JSON.parse(await fs.readFile(file, "utf8"));

    const dict = { muni: [], street: [], kind: [] };
    const index = { muni: new Map(), street: new Map(), kind: new Map() };
    const intern = (k, v) => {
      if (v == null || v === "") return -1;
      let i = index[k].get(v);
      if (i === undefined) { i = dict[k].length; dict[k].push(v); index[k].set(v, i); }
      return i;
    };
    const cols = { lat: [], lng: [], t: [], k: [], i: [], m: [], s: [], r: [], f: [], id: [] };
    let skipped = 0;
    const unmatched = new Set();

    for (const r of rows) {
      const t = toMinutes(r.dataLaikas);
      const ry = r.dataLaikas?.slice(0, 4);
      // Snapshots include a few late-registered events from the previous year; keep only this year.
      if (t == null || +ry !== year || !r.ilguma || !r.platuma) { skipped++; continue; }
      const [lat, lng] = lks94ToWgs84(r.platuma, r.ilguma);
      if (lat < 53.8 || lat > 56.5 || lng < 20.8 || lng > 26.9) { skipped++; continue; }

      const muniName = normMuni(r.savivaldybe);
      const code = nameToCode[muniName] ?? null;
      if (muniName && !code) unmatched.add(muniName);

      const people = r.eismoDalyviai ?? [];
      const vehicles = r.eismoTranspPreimone ?? [];
      let flags = 0;
      const cats = people.map((p) => p.kategorija ?? "");
      const vcats = vehicles.map((v) => v.kategorija ?? "");
      if (cats.some((c) => c.startsWith("Dviračio")) || vcats.includes("Dviratis") || r.rusis === "Susidūrimas su dviračiu") flags |= F.BIKE;
      if (cats.includes("Pėsčiasis") || r.rusis === "Užvažiavimas ant pėsčiojo") flags |= F.PEDESTRIAN;
      if (cats.some((c) => c.includes("paspirtuk")) || vcats.includes("Elektrinis paspirtukas")) flags |= F.SCOOTER;
      if (cats.some((c) => /Motociklo|Mopedo/.test(c)) || vcats.some((c) => /Motociklas|Mopedas/.test(c))) flags |= F.MOTO;
      if (r.neblaivusKaltininkai === "Taip" || r.apsvaigeKaltininkai === "Taip" || r.atsisakeTikrintisKaltininkai === "Taip") flags |= F.DRUNK;
      if ((r.zuvVaiku ?? 0) + (r.suzeistaVaiku ?? 0) > 0) flags |= F.CHILD;
      if (r.iskaitinis === 1) flags |= F.COUNTED;
      const elements = [r.kelioElementas1, r.kelioElementas2];
      if (elements.includes("Keleivinio transporto sustojimo vieta")) flags |= F.BUS_STOP;
      if (elements.includes("Pėsčiųjų perėja") || /perėjoje/.test(r.schema1 ?? "")) flags |= F.CROSSING;
      const makes = vehicles.map((v) => normMake(v.marke));
      if (makes.includes("BMW")) flags |= F.BMW;
      if (vcats.some((c) => c.startsWith("Krovininis"))) flags |= F.TRUCK;
      if (people.some((p) => p.pasisalino === "Taip") || vehicles.some((v) => v.pasisalino === "Taip")) flags |= F.FLED;
      if (r.rusis === "Užvažiavimas ant gyvūno") flags |= F.ANIMAL;

      const killed = r.zuvusiuSkaicius ?? 0, injured = r.suzeistuSkaicius ?? 0;
      const street = r.gatve || r.kelioPavadinimas || null;

      cols.lat.push(Math.round(lat * 1e5));
      cols.lng.push(Math.round(lng * 1e5));
      cols.t.push(t);
      cols.k.push(killed);
      cols.i.push(injured);
      cols.m.push(intern("muni", code));
      cols.s.push(intern("street", street));
      cols.r.push(intern("kind", r.rusis));
      cols.f.push(flags);
      cols.id.push(r.registrokodas ?? "");

      // ---- aggregates
      const yt = (yearTotals[year] ??= { all: 0, counted: 0, killed: 0, injured: 0 });
      yt.all++; yt.killed += killed; yt.injured += injured; if (flags & F.COUNTED) yt.counted++;
      if (code) {
        const ms = ((muniStats[code] ??= {})[year] ??= { all: 0, counted: 0, killed: 0, injured: 0, bike: 0 });
        ms.all++; ms.killed += killed; ms.injured += injured;
        if (flags & F.COUNTED) ms.counted++;
        if (flags & F.BIKE) ms.bike++;
      }
      if (street && code) {
        const st = (streetStats[`${code}|${street}`] ??= { all: 0, counted: 0, killed: 0, injured: 0 });
        st.all++; st.killed += killed; st.injured += injured; if (flags & F.COUNTED) st.counted++;
      }
      const d = new Date(EPOCH + t * 60000);
      hourWeek[(d.getUTCDay() + 6) % 7][d.getUTCHours()]++;
      if (d.getUTCDate() === 13 && d.getUTCDay() === 5) fun.friday13++;
      if (flags & F.FLED) fun.fled++;
      if (flags & F.ANIMAL) fun.animals++;
      if (flags & F.SCOOTER) fun.scooters++;
      if (flags & F.BIKE) fun.bikes++;
      if (r.ivykioVieta) topAddresses[r.ivykioVieta] = (topAddresses[r.ivykioVieta] ?? 0) + 1;

      const culpritTp = new Set(people.filter((p) => p.kaltininkas === "Taip").map((p) => p.tpId));
      vehicles.forEach((v, idx) => {
        const mk = makes[idx];
        if (!mk || v.kategorija !== "Keleivinis automobilis") return;
        const s = (makeStats[mk] ??= { all: 0, culprit: 0, killed: 0, byYear: {} });
        s.all++;
        s.byYear[year] = (s.byYear[year] ?? 0) + 1;
        if (culpritTp.has(v.tpId)) s.culprit++;
        if (killed) s.killed++;
      });

      for (const p of people) {
        if (!/vairuotojas$/.test(p.kategorija ?? "") || p.amzius == null) continue;
        const b = ageBucket(p.amzius);
        if (b < 0) continue;
        ageStats[b].drivers++;
        if (p.kaltininkas === "Taip") {
          ageStats[b].culprits++;
          fun.culprits++;
          if (p.busena && p.busena !== "Blaivus") { ageStats[b].drunk++; fun.drunkCulprits++; }
        }
        if (p.bukle === "Žuvo") ageStats[b].killed++;
      }

      if (flags & F.BUS_STOP) {
        fun.busStops++;
        for (const mk of new Set(makes.filter(Boolean))) busStopMakes[mk] = (busStopMakes[mk] ?? 0) + 1;
      }
      if ((flags & F.BUS_STOP) && (flags & F.BMW)) {
        const bmw = vehicles.find((v) => normMake(v.marke) === "BMW");
        busStops.push({ date: r.dataLaikas, place: r.ivykioVieta, model: bmw?.modelis ?? null, lat: +lat.toFixed(5), lng: +lng.toFixed(5) });
      }
    }

    if (unmatched.size) console.warn("  Nesuderintos savivaldybės:", [...unmatched]);
    const payload = { year, n: cols.t.length, dict, ...cols };
    await fs.writeFile(path.join(OUT, `accidents-${year}.json`), JSON.stringify(payload));
    console.log(`  ${cols.t.length} įvykių (praleista ${skipped})`);
  }

  console.log("Regitra markės…");
  const topMakes = Object.entries(makeStats).sort((a, b) => b[1].all - a[1].all).slice(0, 30).map(([m]) => m);
  const registered = {};
  for (const mk of topMakes) registered[mk] = await regitraCount(mk);

  const municipalities = Object.entries(population)
    .filter(([, p]) => Object.values(p.pop).some((n) => n > 0)) // drop abolished units (e.g. Marijampolės r.)
    .map(([code, p]) => ({
    code,
    name: p.name,
    population: p.pop,
    years: muniStats[code] ?? {},
  }));

  const streets = Object.entries(streetStats)
    .map(([key, v]) => {
      const [code, street] = key.split("|");
      return { code, street, ...v };
    })
    .sort((a, b) => b.counted - a.counted || b.all - a.all)
    .slice(0, 60);

  const stats = {
    generatedAt: new Date().toISOString(),
    years: wanted,
    yearTotals,
    municipalities,
    makes: topMakes.map((m) => ({ make: m, ...makeStats[m], registered: registered[m] })),
    ages: AGE_BUCKETS.map((b, i) => ({ label: bucketLabel(b), population: agePop[i], ...ageStats[i] })),
    streets,
    hourWeek,
    busStopsBmw: busStops.sort((a, b) => (a.date < b.date ? 1 : -1)),
    fun: {
      ...fun,
      busStopMakes: Object.entries(busStopMakes).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([make, n]) => ({ make, n })),
      topAddresses: Object.entries(topAddresses).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([place, n]) => ({ place, n })),
    },
    sources: [
      { name: "Policijos departamentas – Eismo įvykių duomenys (EĮIS)", url: "https://data.gov.lt/datasets/509/" },
      { name: "Valstybės duomenų agentūra – gyventojai (SDMX API)", url: "https://osp.stat.gov.lt/rdb-rest" },
      { name: "Valstybės duomenų agentūra – savivaldybių ribos", url: "https://osp-sdg.stat.gov.lt/arcgis/rest/services/sav_11_2_1/FeatureServer" },
      { name: "Regitra – transporto priemonės pagal markę", url: "https://get.data.gov.lt/datasets/gov/regitra/ktpr/ValstybinisNumeris" },
    ],
  };

  await fs.writeFile(path.join(OUT, "stats.json"), JSON.stringify(stats));
  await fs.writeFile(
    path.join(OUT, "municipalities.geojson"),
    JSON.stringify({
      type: "FeatureCollection",
      features: boundaries.map((b) => ({ type: "Feature", properties: { code: b.code, name: b.name }, geometry: b.geometry })),
    }),
  );
  console.log("Baigta →", path.relative(ROOT, OUT));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
