const eur = new Intl.NumberFormat("lt-LT", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const eur0 = new Intl.NumberFormat("lt-LT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const num1 = new Intl.NumberFormat("lt-LT", { maximumFractionDigits: 1 });
const num0 = new Intl.NumberFormat("lt-LT", { maximumFractionDigits: 0 });

export const fmtEur = (v: number) => eur.format(v);
export const fmtEur0 = (v: number) => eur0.format(v);
export const fmtNum = (v: number, digits = 0) => (digits ? num1 : num0).format(v);

export function fmtDur(sec: number): string {
  const m = Math.round(Math.abs(sec) / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} val. ${r} min` : `${h} val.`;
}

/** Compact form for tight spots: "34 min", "1 h 05 min". */
export function fmtDurShort(sec: number): string {
  const m = Math.round(Math.abs(sec) / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}

export function fmtClock(sec: number): string {
  const s = ((Math.round(sec / 60) * 60) % 86400 + 86400) % 86400;
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;
}

export function fmtKm(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${num1.format(m / 1000)} km`;
}

export function fmtCo2(kg: number): string {
  const a = Math.abs(kg);
  if (a < 1) return `${Math.round(a * 1000)} g`;
  if (a < 1000) return `${num1.format(a)} kg`;
  return `${num1.format(a / 1000)} t`;
}

export const MODE_META = {
  car: { label: "Automobiliu", short: "Automobilis", color: "#ff5d6c" },
  transit: { label: "Viešuoju transportu", short: "Viešasis transportas", color: "#4b8bff" },
  bike: { label: "Dviračiu", short: "Dviratis", color: "#ffc53d" },
  walk: { label: "Pėsčiomis", short: "Pėsčiomis", color: "#b69cff" },
} as const;

export const ROUTE_TYPE: Record<number, string> = { 3: "Autobusas", 11: "Troleibusas", 4: "Keltas", 2: "Traukinys" };
