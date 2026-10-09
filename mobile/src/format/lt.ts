// Lithuanian formatting (DESIGN.md › A2): lt-LT decimals, € after the number,
// 24-hour time, "~" for estimates. One place for the whole app.

import type { Basis } from "@/api/contract";

const NBSP = " ";

function decimal(n: number, digits: number): string {
  try {
    return new Intl.NumberFormat("lt-LT", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
  } catch {
    return n.toFixed(digits).replace(".", ",");
  }
}

/** "~" when the value is not a published or live figure. */
export const approx = (basis: Basis) => (basis === "demo" || basis === "estimate" ? "~" : "");

export const formatEur = (n: number | null, basis: Basis = "official") =>
  n === null ? "nežinoma" : `${approx(basis)}${decimal(n, 2)}${NBSP}€`;

export const formatKg = (n: number | null, basis: Basis = "estimate") =>
  n === null ? "—" : `${approx(basis)}${decimal(n, 1)}${NBSP}kg`;

/** 47 → "47 min", 72 → "1 val. 12 min". */
export function formatDuration(min: number): string {
  if (min < 60) return `${min}${NBSP}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}${NBSP}val. ${m}${NBSP}min` : `${h}${NBSP}val.`;
}

const pad = (n: number) => String(n).padStart(2, "0");
/** ISO instant → "07:58" in the phone's time zone. */
export function formatClock(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Local date + "HH:mm" → ISO-8601 with the phone's UTC offset ("…T08:45:00+03:00"). */
export function toIsoWithOffset(day: Date, hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0, 0);
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(h)}:${pad(m)}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

export const clockOf = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Lithuanian plural: [1 minutė, 2 minutės, 10 minučių]. */
export function plural(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 9 && (mod100 < 11 || mod100 > 19)) return forms[1];
  return forms[2];
}

/** Accepts "7,5" or "7.5". */
export function parseDecimal(text: string): number | null {
  const n = Number(text.replace(",", ".").trim());
  return text.trim() && Number.isFinite(n) ? n : null;
}
