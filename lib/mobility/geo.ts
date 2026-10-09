// Small geometry and time helpers for lib/mobility (pure, no I/O).

import { SERVICE_AREA, TIMEZONE } from "./config";
import type { LatLng, LineString } from "./types";

/** Great-circle distance in km. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function insideServiceArea(p: LatLng): boolean {
  return p.lat >= SERVICE_AREA.minLat && p.lat <= SERVICE_AREA.maxLat && p.lng >= SERVICE_AREA.minLng && p.lng <= SERVICE_AREA.maxLng;
}

export function straightLine(a: LatLng, b: LatLng): LineString {
  return { type: "LineString", coordinates: [[a.lng, a.lat], [b.lng, b.lat]] };
}

export const round1 = (n: number) => Math.round(n * 10) / 10;
export const round2 = (n: number) => Math.round(n * 100) / 100;

export const addMin = (d: Date, min: number) => new Date(d.getTime() + min * 60_000);
export const diffMin = (a: Date, b: Date) => (a.getTime() - b.getTime()) / 60_000;

/** ISO-8601 with the Europe/Vilnius offset, e.g. "2026-10-12T08:45:00+03:00". */
export function toVilniusIso(d: Date): string {
  const p = vilniusParts(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  const offsetMin = Math.round(
    (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(d.getTime() / 1000) * 1000) / 60_000,
  );
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

const partsFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
  weekday: "short",
  hourCycle: "h23",
});
const WEEKDAY: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Calendar parts of an instant in Europe/Vilnius. weekday: 1 = Monday … 7 = Sunday. */
export function vilniusParts(d: Date) {
  const parts = partsFormat.formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: WEEKDAY[get("weekday")] ?? 1,
  };
}

/** Deterministic 32-bit hash (FNV-1a) for demo data. */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
