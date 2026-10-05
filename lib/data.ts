// Shared types and helpers for the official accident data produced by
// scripts/build-data.mjs (public/data/accidents-YYYY.json).

export const YEARS = [2021, 2022, 2023, 2024, 2025] as const;

// Bit flags, kept in sync with scripts/build-data.mjs.
export const FLAG = {
  BIKE: 1,
  PEDESTRIAN: 2,
  SCOOTER: 4,
  MOTO: 8,
  DRUNK: 16,
  CHILD: 32,
  COUNTED: 64,
  BUS_STOP: 128,
  BMW: 256,
  CROSSING: 512,
  TRUCK: 1024,
  FLED: 2048,
  ANIMAL: 4096,
} as const;

export type Severity = "fatal" | "injury" | "damage";

export const SEVERITY: Record<Severity, { color: string; label: string; short: string }> = {
  fatal: { color: "#ff4d5e", label: "Žuvusieji", short: "Žuvo" },
  injury: { color: "#ffb020", label: "Sužeistieji", short: "Sužeista" },
  damage: { color: "#7d8db0", label: "Tik materialinė žala", short: "Žala" },
};

// Participant categories users can filter by. `flag: 0` means "everything".
export const CATEGORIES = [
  { id: "all", label: "Visi", icon: "◎", flag: 0 },
  { id: "bike", label: "Dviratininkai", icon: "🚲", flag: FLAG.BIKE },
  { id: "pedestrian", label: "Pėstieji", icon: "🚶", flag: FLAG.PEDESTRIAN },
  { id: "scooter", label: "Paspirtukai", icon: "🛴", flag: FLAG.SCOOTER },
  { id: "moto", label: "Motociklai", icon: "🏍️", flag: FLAG.MOTO },
  { id: "drunk", label: "Neblaivūs", icon: "🍺", flag: FLAG.DRUNK },
  { id: "child", label: "Vaikai", icon: "🧒", flag: FLAG.CHILD },
] as const;
export type CategoryId = (typeof CATEGORIES)[number]["id"];

export const MONTHS = ["Sausis", "Vasaris", "Kovas", "Balandis", "Gegužė", "Birželis", "Liepa", "Rugpjūtis", "Rugsėjis", "Spalis", "Lapkritis", "Gruodis"];
export const MONTHS_SHORT = ["Sau", "Vas", "Kov", "Bal", "Geg", "Bir", "Lie", "Rgp", "Rgs", "Spa", "Lap", "Gru"];

export type Accident = {
  id: string;
  lat: number;
  lng: number;
  /** Minutes since 2020-01-01 00:00 local time. */
  t: number;
  year: number;
  /** 0-based month. */
  month: number;
  /** Months since Jan 2020, for the timeline. */
  monthIndex: number;
  killed: number;
  injured: number;
  muni: string | null;
  street: string | null;
  kind: string | null;
  flags: number;
  severity: Severity;
};

type YearFile = {
  year: number;
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

export function accidentDate(a: Pick<Accident, "t">): Date {
  // Local wall-clock time stored as UTC; read it back with getUTC* methods.
  return new Date(EPOCH + a.t * 60000);
}

export function formatDate(a: Pick<Accident, "t">, withTime = true): string {
  const d = accidentDate(a);
  const p = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
  return withTime ? `${date} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}` : date;
}

function decode(file: YearFile): Accident[] {
  const out: Accident[] = new Array(file.n);
  for (let j = 0; j < file.n; j++) {
    const t = file.t[j];
    const d = new Date(EPOCH + t * 60000);
    const killed = file.k[j];
    const injured = file.i[j];
    out[j] = {
      id: file.id[j],
      lat: file.lat[j] / 1e5,
      lng: file.lng[j] / 1e5,
      t,
      year: d.getUTCFullYear(),
      month: d.getUTCMonth(),
      monthIndex: (d.getUTCFullYear() - 2020) * 12 + d.getUTCMonth(),
      killed,
      injured,
      muni: file.m[j] >= 0 ? file.dict.muni[file.m[j]] : null,
      street: file.s[j] >= 0 ? file.dict.street[file.s[j]] : null,
      kind: file.r[j] >= 0 ? file.dict.kind[file.r[j]] : null,
      flags: file.f[j],
      severity: killed > 0 ? "fatal" : injured > 0 ? "injury" : "damage",
    };
  }
  return out;
}

const cache = new Map<number, Promise<Accident[]>>();

/** Loads (and memoises) one year of official accidents. */
export function loadYear(year: number): Promise<Accident[]> {
  let p = cache.get(year);
  if (!p) {
    p = fetch(`/data/accidents-${year}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`Nepavyko įkelti ${year} m. duomenų (${r.status})`);
        return r.json();
      })
      .then(decode);
    p.catch(() => cache.delete(year));
    cache.set(year, p);
  }
  return p;
}

export type Filters = {
  yearFrom: number;
  yearTo: number;
  months: number[]; // empty = all
  muni: string | null;
  category: CategoryId;
  severities: Severity[];
};

export function matches(a: Accident, f: Filters, ignoreSeverity = false): boolean {
  if (a.year < f.yearFrom || a.year > f.yearTo) return false;
  if (f.months.length && !f.months.includes(a.month)) return false;
  if (f.muni && a.muni !== f.muni) return false;
  const cat = CATEGORIES.find((c) => c.id === f.category);
  if (cat && cat.flag && !(a.flags & cat.flag)) return false;
  if (!ignoreSeverity && !f.severities.includes(a.severity)) return false;
  return true;
}

/** Strip street-type words so "Savanorių prospektas" matches "Savanorių pr.". */
export function streetKey(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/[„“"]/g, "")
    .replace(/\b(gatvė|g\.|prospektas|pr\.|alėja|al\.|plentas|pl\.|skersgatvis|skg\.|aikštė|a\.|kelias|kel\.|krantinė|krant\.|takas|tak\.)(?=\s|$)/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .pop()!;
}

/** Haversine distance in metres. */
export function distance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLng = (lng2 - lng1) * toRad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export const nf = new Intl.NumberFormat("lt-LT");
