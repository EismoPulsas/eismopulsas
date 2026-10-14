import "server-only";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { Grid, haversine, type LatLng } from "../geo";

// Address search over the national address register (data/addresses.json.gz, built by
// scripts/build-addresses.mjs): every town, street and house number in Lithuania, in memory,
// plus named places from OpenStreetMap (data/places.json.gz): districts, malls, schools,
// stations. A search takes a few milliseconds and never leaves the country, unlike the public
// geocoders, which take seconds when they are busy and rank foreign places too.

type Raw = {
  townTypes: string[];
  streetTypes: string[];
  sav: string[];
  towns: { n: string[]; g: string[]; t: number[]; s: number[]; y: number[]; x: number[]; c: number[] };
  streets: { n: string[]; t: number[]; w: number[]; y: number[]; x: number[]; a: number[] };
  addr: { h: string; y: number[]; x: number[] };
};

type RawPlaces = { cats: string[]; n: string[]; c: number[]; y: number[]; x: number[] };

export type AddressHit = {
  lat: number;
  lng: number;
  label: string;
  sub: string;
  kind: "address" | "street" | "place" | "poi";
  /** OpenStreetMap key=value of a named place (shop=mall…): the planner guesses the stay from it. */
  cat?: string;
  /** What goes into the search box when chosen ("Gedimino pr. 9, Vilnius"). */
  pick: string;
};

/** Lower case, no accents, letters and digits only: "Saulėtekio al. 9" -> "sauletekio al 9". */
export const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Words people type for each street type, besides the abbreviation itself. */
const TYPE_WORDS: Record<string, string[]> = {
  "g.": ["gatve", "gatv"],
  "pr.": ["prospektas", "prosp"],
  "al.": ["aleja"],
  "pl.": ["plentas"],
  "kel.": ["kelias"],
  "skg.": ["skersgatvis"],
  "tak.": ["takas"],
  "aklg.": ["akligatvis"],
  "a.": ["aikste"],
  "skv.": ["skveras"],
  "aplinkl.": ["aplinkkelis"],
  "krant.": ["krantine"],
  "vieškl.": ["vieskelis"],
  "bul.": ["bulvaras"],
};
const TOWN_WORDS = ["miestas", "m", "kaimas", "k", "mstl", "miestelis", "vs", "r", "raj", "rajonas", "sav", "savivaldybe"];
const TOWN_TYPE_NAME = ["miestas", "miestelis", "kaimas", "kaimo dalis", "viensėdis", "geležinkelio stotis", "mikrorajonas", "gyvenvietė"];

type Index = {
  raw: Raw;
  townWords: string[][];
  townLabel: string[];
  savWords: string[];
  streetWords: string[][];
  typeWords: string[][];
  /** Every word that names a street type: typed, it rules out streets of other types. */
  anyType: string[];
  /** First address of each street; the last entry is the total. */
  start: Int32Array;
  lat: Int32Array;
  lng: Int32Array;
  numbers: string[];
  /** Streets with no name: the house numbers of a village without streets. */
  bareStreet: Map<number, number>;
  grid: Grid<number> | null;
  streetOf: Int32Array | null;
  places: { raw: RawPlaces; words: string[][]; town: Int32Array; weight: number[] };
  /** Every word of every name, by first letter, for typos; built on the first typo. */
  vocab: Map<string, string[]> | null;
};

/** How much a kind of place stands out: a district or a mall is searched for like a town. */
const PLACE_WEIGHT: [RegExp, number][] = [
  [/^aeroway=aerodrome|^place=suburb|^shop=mall|^amenity=university|^amenity=hospital/, 3.5],
  [/^place=|^railway=station|^amenity=bus_station|^leisure=stadium|^aeroway=|^amenity=(theatre|cinema|townhall|college)|^tourism=(museum|zoo|theme_park|attraction)|^historic=castle/, 2.8],
  [/^shop=(supermarket|department_store|doityourself|furniture|electronics|hardware)|^amenity=(clinic|library|marketplace|courthouse|swimming_pool|ferry_terminal|arts_centre|events_venue|conference_centre)|^leisure=/, 2.2],
];

let index: Index | null = null;

function load(): Index {
  if (index) return index;
  const file = path.join(process.cwd(), "data", "addresses.json.gz");
  const raw: Raw = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString("utf8"));
  const T = raw.towns;
  const S = raw.streets;
  const townWords = T.n.map((n, i) => [...new Set(fold(`${n} ${T.g[i]}`).split(" "))]);
  // Cities are known by name alone; anywhere else the municipality tells two villages apart.
  const townLabel = T.n.map((n, i) => (T.t[i] === 0 ? n : `${n}, ${raw.sav[T.s[i]]}`));
  const typeWords = raw.streetTypes.map((t) => (t ? [fold(t), ...(TYPE_WORDS[t] ?? [])] : []));
  const start = new Int32Array(S.n.length + 1);
  for (let i = 0; i < S.n.length; i++) start[i + 1] = start[i] + S.a[i];
  const n = raw.addr.y.length;
  const lat = new Int32Array(n);
  const lng = new Int32Array(n);
  let y = 0;
  let x = 0;
  for (let i = 0; i < n; i++) {
    lat[i] = y += raw.addr.y[i];
    lng[i] = x += raw.addr.x[i];
  }
  const bareStreet = new Map<number, number>();
  S.n.forEach((name, i) => !name && bareStreet.set(S.w[i], i));
  const placesFile = path.join(process.cwd(), "data", "places.json.gz");
  const places: RawPlaces = fs.existsSync(placesFile) ? JSON.parse(zlib.gunzipSync(fs.readFileSync(placesFile)).toString("utf8")) : { cats: [], n: [], c: [], y: [], x: [] };
  index = {
    raw,
    townWords,
    townLabel,
    savWords: raw.sav.map(fold),
    streetWords: S.n.map((name) => (name ? fold(name).split(" ") : [])),
    typeWords,
    anyType: [...new Set(typeWords.flat())],
    start,
    lat,
    lng,
    numbers: raw.addr.h.split("\n"),
    bareStreet,
    grid: null,
    streetOf: null,
    places: {
      raw: places,
      words: places.n.map((n) => fold(n).split(" ")),
      town: new Int32Array(0),
      weight: places.c.map((c) => PLACE_WEIGHT.find(([re]) => re.test(places.cats[c]))?.[1] ?? 1.6),
    },
    vocab: null,
  };
  // Each place's town (from the nearest address), so "Akropolis Kaunas" works and the list says where it is.
  const town = new Int32Array(places.n.length).fill(-1);
  for (let i = 0; i < places.n.length; i++) {
    const p: LatLng = [places.y[i] / 1e5, places.x[i] / 1e5];
    town[i] = (nearest(index, p, 300) ?? nearest(index, p, 3000))?.town ?? -1;
  }
  index.places.town = town;
  return index;
}

/** The address nearest to p within `radius` m, with its street and town. */
function nearest(I: Index, p: LatLng, radius: number): { i: number; d: number; s: number; town: number } | null {
  if (!I.grid || !I.streetOf) {
    const grid = new Grid<number>(0.002);
    const streetOf = new Int32Array(I.lat.length);
    for (let s = 0; s < I.raw.streets.n.length; s++) streetOf.fill(s, I.start[s], I.start[s + 1]);
    for (let i = 0; i < I.lat.length; i++) grid.add(pos(I, i), i);
    I.grid = grid;
    I.streetOf = streetOf;
  }
  let best = -1;
  let bd = Infinity;
  for (const i of I.grid.near(p, radius)) {
    const d = haversine(p, pos(I, i));
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  if (best < 0 || bd > radius) return null;
  const s = I.streetOf[best];
  return { i: best, d: bd, s, town: I.raw.streets.w[s] };
}

const streetName = (I: Index, s: number) => {
  const type = I.raw.streetTypes[I.raw.streets.t[s]];
  return type ? `${I.raw.streets.n[s]} ${type}` : I.raw.streets.n[s];
};

/** Splits "gedimino pr 9 a k2" into words and a house number ("9a", block 2). */
function parse(q: string): { words: string[]; house: string | null; block: string | null } {
  const tokens = fold(q).split(" ").filter(Boolean);
  const words: string[] = [];
  let house: string | null = null;
  let block: string | null = null;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    // A number after the street name is the house; later numbers are flats (Gedimino pr. 9-12).
    if (house === null && /^\d+[a-z]?$/.test(t) && words.length) {
      house = t;
      if (/^\d+$/.test(t) && /^[a-z]$/.test(tokens[i + 1] ?? "") && tokens[i + 1] !== "k") house += tokens[++i];
      continue;
    }
    if (house !== null) {
      const k = /^k(\d+)$/.exec(t) ?? (t === "k" && /^\d+$/.test(tokens[i + 1] ?? "") ? [t, tokens[++i]] : null);
      if (k) block = k[1];
      // The town may follow the number ("Laisvės al. 50 Kaunas"); flat numbers are dropped.
      if (k || /^\d/.test(t)) continue;
    }
    words.push(t);
  }
  return { words, house, block };
}

/** Known words a typed word may be a typo of, with the number of edits. */
type Typos = Map<string, number>;

/**
 * How well `word` matches one of `list`: 2 = the whole word, 1 = its beginning, 0.5 = with one
 * typo, 0.25 = with two (see `typos`), 0 = no. One letter only matches itself (an initial, "J.").
 */
function wordMatch(word: string, list: string[], typos?: Typos | null): number {
  let best = 0;
  for (const w of list) {
    if (w === word) return 2;
    if (best < 1 && word.length > 1 && w.startsWith(word)) best = 1;
    else if (best < 0.5 && typos?.has(w)) best = Math.max(best, typos.get(w) === 1 ? 0.5 : 0.25);
  }
  return best;
}

/** Typos in a match, for the score: one edit costs 2 points, two cost 4. */
const typoCost = (m: number) => (m === 0.5 ? 2 : m === 0.25 ? 4 : 0);

/** The first word of a name that is not an initial: "J. Basanavičiaus" -> "basanaviciaus". */
const firstWord = (name: string[]) => name.find((t) => t.length > 1) ?? name[0] ?? "";

/** Does the name start with what was typed first ("ged" -> Gedimino pr., not Juozo Gedimino Morkūno g.)? */
const startsWith = (name: string[], w: string, typos: Typos | null | undefined) => {
  const f = firstWord(name);
  return f.startsWith(w) || !!typos?.has(f);
};

/**
 * Edits (a swap of two letters counts as one) that turn `w` into the beginning of `t`; anything
 * over `k` is reported as k + 1. "gedemino" is one edit from "gedimino".
 */
function prefixEdits(w: string, t: string, k: number): number {
  const n = w.length;
  const m = Math.min(t.length, n + k);
  let before: number[] | null = null;
  let prev = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const cur = [i];
    let low = i;
    for (let j = 1; j <= m; j++) {
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (w[i - 1] === t[j - 1] ? 0 : 1));
      if (before && j > 1 && w[i - 1] === t[j - 2] && w[i - 2] === t[j - 1]) v = Math.min(v, before[j - 2] + 1);
      cur[j] = v;
      if (v < low) low = v;
    }
    if (low > k) return k + 1;
    before = prev;
    prev = cur;
  }
  let best = k + 1;
  for (let j = Math.max(0, n - k); j <= m; j++) best = Math.min(best, prev[j]);
  return best;
}

/**
 * Known words a typed word may be a typo of: same first letter (people rarely miss that one),
 * one edit for words up to 6 letters, two for longer ones.
 */
function typosOf(I: Index, w: string): Typos | null {
  if (w.length < 4 || /\d/.test(w)) return null;
  if (!I.vocab) {
    const byLetter = new Map<string, string[]>();
    const seen = new Set<string>();
    for (const list of [...I.streetWords, ...I.townWords, ...I.places.words])
      for (const t of list)
        if (t.length >= 3 && !seen.has(t)) {
          seen.add(t);
          const l = byLetter.get(t[0]) ?? [];
          l.push(t);
          byLetter.set(t[0], l);
        }
    I.vocab = byLetter;
  }
  const k = w.length <= 6 ? 1 : 2;
  const out: Typos = new Map();
  for (const t of I.vocab.get(w[0]) ?? []) {
    if (t.startsWith(w)) continue;
    const e = prefixEdits(w, t, k);
    if (e <= k) out.set(t, e);
  }
  return out.size ? out : null;
}

type Scored = { s: number; score: number; town: boolean };

/** Streets every typed word fits: the street's name, its type (g., pr. …) or its town. */
/** Typed words, each with the known words it may be a typo of (none on the first, exact pass). */
type Typed = { words: string[]; typos: (Typos | null)[]; short: boolean };

function matchStreets(I: Index, { words, typos, short }: Typed): Scored[] {
  const S = I.raw.streets;
  const out: Scored[] = [];
  for (let s = 0; s < S.n.length; s++) {
    const name = I.streetWords[s];
    if (!name.length) continue;
    const starts = startsWith(name, words[0], typos[0]);
    // Two or three letters only find names that begin with them.
    if (short && !starts) continue;
    let named = 0;
    let typo = 0;
    let whole = 0;
    let typed = false;
    let town = false;
    let unfinished = false;
    let ok = true;
    for (let k = 0; k < words.length; k++) {
      const w = words[k];
      const m = wordMatch(w, name, typos[k]);
      if (m) {
        // An initial alone ("G.") does not make a street fit: "Vilniaus g" is not G. Žemkalnio g. in Vilnius.
        if (w.length > 1) named++;
        if (m === 2) whole++;
        typo += typoCost(m);
      } else if (wordMatch(w, I.typeWords[S.t[s]]) || (w.length === 1 && I.typeWords[S.t[s]].some((t) => t.startsWith(w)))) typed = true;
      else if (w.length >= 3 && wordMatch(w, I.townWords[S.w[s]], typos[k])) town = true;
      else if (TOWN_WORDS.includes(w)) continue;
      // The last word may still be being typed ("Saulėtekio a…").
      else if (k === words.length - 1 && k > 0 && w.length <= 2 && !I.anyType.some((t) => t.startsWith(w))) unfinished = true;
      else {
        ok = false;
        break;
      }
    }
    if (!ok || !named) continue;
    // All of the name typed out beats a street that only starts like it; the type typed ("pr.") and the town count too.
    const complete = whole === name.length ? 3 : whole ? 1.5 : 0;
    out.push({ s, score: complete + whole + named * 0.5 + (starts ? 1.5 : 0) + (typed ? 1.5 : 0) + (town ? 4 : 0) - (unfinished ? 2 : 0) - typo, town });
  }
  return out;
}

function matchTowns(I: Index, { words, typos, short }: Typed): Scored[] {
  const T = I.raw.towns;
  const out: Scored[] = [];
  for (let t = 0; t < T.n.length; t++) {
    if (short && !startsWith(I.townWords[t], words[0], typos[0])) continue;
    let whole = 0;
    let named = 0;
    let typo = 0;
    let ok = true;
    for (let k = 0; k < words.length; k++) {
      const w = words[k];
      const m = wordMatch(w, I.townWords[t], typos[k]);
      if (m) {
        named++;
        if (m === 2) whole++;
        typo += typoCost(m);
      } else if (!TOWN_WORDS.includes(w) && !(w.length >= 3 && I.savWords[T.s[t]].startsWith(w))) {
        ok = false;
        break;
      }
    }
    if (!ok || !named) continue;
    out.push({ s: t, score: (whole ? 3 : 0) + whole + named * 0.5 - typo, town: true });
  }
  return out;
}

/** Named places (districts, malls, schools…) every typed word fits: the name or the town. */
function matchPlaces(I: Index, { words, typos, short }: Typed): Scored[] {
  const P = I.places;
  const out: Scored[] = [];
  for (let i = 0; i < P.words.length; i++) {
    const starts = startsWith(P.words[i], words[0], typos[0]);
    if (short && !starts) continue;
    let named = 0;
    let whole = 0;
    let typo = 0;
    let town = false;
    let ok = true;
    for (let k = 0; k < words.length; k++) {
      const w = words[k];
      const m = wordMatch(w, P.words[i], typos[k]);
      if (m) {
        if (w.length > 1) named++;
        if (m === 2) whole++;
        typo += typoCost(m);
      } else if (w.length >= 3 && P.town[i] >= 0 && wordMatch(w, I.townWords[P.town[i]], typos[k])) town = true;
      else {
        ok = false;
        break;
      }
    }
    if (!ok || !named) continue;
    const complete = whole === P.words[i].length ? 3 : 0;
    out.push({ s: i, score: complete + whole + named * 0.5 + (starts ? 1.5 : 0) + (town ? 4 : 0) - typo, town });
  }
  return out;
}

/**
 * Bigger towns first; with a point to search near, the closer the better. A street far away is
 * rarely meant, a city often is (people do drive from Vilnius to Kaunas), a small village is not.
 */
function placeWeight(I: Index, town: number, pos: LatLng, near: LatLng | null, isTown = false): number {
  const size = Math.log10(I.raw.towns.c[town] + 1);
  const city = isTown ? Math.min(3, Math.max(0, size - 2)) : 0;
  if (!near) return size * 1.2 + city;
  const km = haversine(near, pos) / 1000;
  return isTown ? size * 0.9 - (1.6 - 0.25 * city) * Math.log2(1 + km) + city : size * 0.35 - 1.6 * Math.log2(1 + km);
}

const pos = (I: Index, i: number): LatLng => [I.lat[i] / 1e5, I.lng[i] / 1e5];

/** House numbers of street `s` that fit what was typed: "9" first, then "9A", "9B", then "90"… */
function houses(I: Index, s: number, house: string, block: string | null): { i: number; nr: string; rank: number }[] {
  const list = I.numbers[s].split("|");
  const out: { i: number; nr: string; rank: number }[] = [];
  list.forEach((nr, k) => {
    const [num, kor] = nr.toLowerCase().split(" k");
    if (block && kor && kor !== block) return;
    const rank = num === house ? (kor ? 1 : 0) : num.startsWith(house) ? (/^\d+$/.test(house) && /^\d+[a-z]$/.test(num) && num.slice(0, -1) === house ? 2 : 3 + num.length) : -1;
    if (rank >= 0) out.push({ i: I.start[s] + k, nr, rank });
  });
  return out.sort((a, b) => a.rank - b.rank).slice(0, 4);
}

/** Towns, streets and addresses for what was typed, best first. */
export function searchAddresses(q: string, near: LatLng | null, limit = 8): AddressHit[] {
  const I = load();
  const { words, house, block } = parse(q);
  if (!words.length || words.join("").length < 2) return [];
  const S = I.raw.streets;
  const T = I.raw.towns;
  const short = words.join("").length <= 3;
  // Exactly as typed first; only when that finds next to nothing, allow for typos ("gedemino").
  let typed: Typed = { words, typos: words.map(() => null), short };
  let streetHits = matchStreets(I, typed);
  let townHits = matchTowns(I, typed);
  let placeHits = house ? [] : matchPlaces(I, typed);
  if (streetHits.length + townHits.length + placeHits.length < 3) {
    const typos = words.map((w) => typosOf(I, w));
    if (typos.some(Boolean)) {
      typed = { words, typos, short };
      streetHits = matchStreets(I, typed);
      townHits = matchTowns(I, typed);
      placeHits = house ? [] : matchPlaces(I, typed);
    }
  }

  const streets = streetHits
    .map((m) => {
      const p: LatLng = [S.y[m.s] / 1e5, S.x[m.s] / 1e5];
      return { ...m, p, rank: m.score + placeWeight(I, S.w[m.s], p, near) };
    })
    .sort((a, b) => b.rank - a.rank);
  const towns = townHits
    .map((m) => {
      const p: LatLng = [T.y[m.s] / 1e5, T.x[m.s] / 1e5];
      // A town is worth more than one of its streets: "Kauno" is Kaunas before Kauno g.
      // With a house number typed, a town only fits as a village without streets ("Abakai 5").
      return { ...m, p, rank: m.score + placeWeight(I, m.s, p, near, true) - (house ? 3 : 0) };
    })
    .sort((a, b) => b.rank - a.rank);

  const P = I.places;
  const places = placeHits
    .map((m) => {
      const p: LatLng = [P.raw.y[m.s] / 1e5, P.raw.x[m.s] / 1e5];
      const km = near ? haversine(near, p) / 1000 : 0;
      const size = P.town[m.s] >= 0 ? Math.log10(T.c[P.town[m.s]] + 1) : 0;
      // A street of that name is what most people mean; a library named after it comes next.
      const district = P.raw.cats[P.raw.c[m.s]].startsWith("place=");
      return { ...m, p, rank: m.score + P.weight[m.s] * (near ? 0.6 : 1.4) + (near ? -1.6 * Math.log2(1 + km) : size * 0.5) - (district ? 0 : 1.2) };
    })
    .sort((a, b) => b.rank - a.rank);

  const out: { h: AddressHit; rank: number }[] = [];
  const townOf = (s: number) => I.townLabel[S.w[s]];
  if (house) {
    for (const m of streets.slice(0, 6)) {
      for (const h of houses(I, m.s, house, block)) {
        const label = `${streetName(I, m.s)} ${h.nr}`;
        out.push({ h: hit(pos(I, h.i), label, townOf(m.s), "address"), rank: m.rank + 4 - h.rank * 0.8 });
      }
    }
    // Villages without streets: "Abakai 5".
    for (const m of towns.slice(0, 4)) {
      const bare = I.bareStreet.get(m.s);
      if (bare === undefined) continue;
      for (const h of houses(I, bare, house, block)) out.push({ h: hit(pos(I, h.i), `${T.n[m.s]} ${h.nr}`, I.townLabel[m.s], "address"), rank: m.rank + 3 - h.rank * 0.8 });
    }
  }
  for (const m of streets.slice(0, limit)) out.push({ h: hit(m.p, streetName(I, m.s), townOf(m.s), "street"), rank: m.rank });
  for (const m of towns.slice(0, 3)) {
    const t = m.s;
    out.push({ h: { ...hit(m.p, T.n[t], T.t[t] === 0 ? "miestas" : `${TOWN_TYPE_NAME[T.t[t]]}, ${I.raw.sav[T.s[t]]}`, "place"), pick: I.townLabel[t] }, rank: m.rank });
  }
  for (const m of places.slice(0, 4)) {
    const cat = P.raw.cats[P.raw.c[m.s]];
    const town = P.town[m.s] >= 0 ? I.townLabel[P.town[m.s]] : "";
    const h = hit(m.p, P.raw.n[m.s], town, cat.startsWith("place=") ? "place" : "poi");
    out.push({ h: { ...h, cat, pick: town ? h.pick : h.label }, rank: m.rank });
  }
  // The same place mapped twice (an airport and its terminal) is one suggestion.
  const seen = new Set<string>();
  return out
    .sort((a, b) => b.rank - a.rank)
    .filter(({ h }) => {
      const k = `${fold(h.label)}|${h.sub}`;
      return !seen.has(k) && !!seen.add(k);
    })
    .slice(0, limit)
    .map((o) => o.h);
}

function hit(p: LatLng, label: string, town: string, kind: AddressHit["kind"]): AddressHit {
  return { lat: p[0], lng: p[1], label, sub: town, kind, pick: `${label}, ${town}` };
}

/** The address at a map point: the building within ~40 m, else the street, else the town; `cat` when it is a known place. */
export function reverseAddress(p: LatLng): { label: string; sub: string; pick: string; cat?: string } | null {
  const I = load();
  const place = placeAt(I, p);
  if (place) return place;
  const n = nearest(I, p, 400);
  if (n) {
    const { s, town: t } = n;
    const nr = I.numbers[s].split("|")[n.i - I.start[s]];
    const town = I.townLabel[t];
    const street = I.raw.streets.n[s];
    if (n.d <= 40) return street ? named(`${streetName(I, s)} ${nr}`, town) : named(`${I.raw.towns.n[t]} ${nr}`, I.raw.sav[I.raw.towns.s[t]]);
    return street ? named(streetName(I, s), town) : named(I.raw.towns.n[t], I.raw.sav[I.raw.towns.s[t]]);
  }
  // Fields and forests: the nearest town or village.
  const T = I.raw.towns;
  let town = -1;
  let bd = Infinity;
  for (let t = 0; t < T.n.length; t++) {
    const d = haversine(p, [T.y[t] / 1e5, T.x[t] / 1e5]);
    if (d < bd) {
      bd = d;
      town = t;
    }
  }
  return town >= 0 && bd < 5000 ? named(`prie ${T.g[town] || T.n[town]}`, I.raw.sav[T.s[town]]) : null;
}

const named = (label: string, sub: string) => ({ label, sub, pick: `${label}, ${sub}` });

/** A mall, school or station clicked on the map, not a district: big places (malls, hospitals) within 120 m of their middle, the rest within 30 m. */
function placeAt(I: Index, p: LatLng) {
  const P = I.places;
  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < P.raw.n.length; i++) {
    if (Math.abs(P.raw.y[i] / 1e5 - p[0]) > 0.001 || Math.abs(P.raw.x[i] / 1e5 - p[1]) > 0.0016) continue;
    const cat = P.raw.cats[P.raw.c[i]];
    const d = haversine(p, [P.raw.y[i] / 1e5, P.raw.x[i] / 1e5]);
    if (d < bd && d <= (P.weight[i] >= 3.5 ? 120 : 30) && !cat.startsWith("place=")) {
      bd = d;
      best = i;
    }
  }
  if (best < 0) return null;
  const town = P.town[best] >= 0 ? I.townLabel[P.town[best]] : "";
  return { ...named(P.raw.n[best], town), ...(town ? {} : { pick: P.raw.n[best] }), cat: P.raw.cats[P.raw.c[best]] };
}
