// Guard the fields consumed by the alpha UI before putting untrusted JSON in state.
// This is a client boundary check; the canonical contract remains types-only.
import type { GeocodeResult } from "./client";
import type { Place, PlanResponse } from "./contract";

type ObjectValue = Record<string, unknown>;
const object = (v: unknown): v is ObjectValue => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string";
const number = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const nullableNumber = (v: unknown) => v === null || number(v);
const date = (v: unknown) => text(v) && Number.isFinite(Date.parse(v));
const basis = (v: unknown) => ["demo", "estimate", "official", "live"].includes(v as string);
const strategy = (v: unknown) => ["car", "transit", "park_and_ride"].includes(v as string);
const optionalText = (v: unknown) => v === undefined || text(v);
const list = (v: unknown, valid: (item: unknown) => boolean): boolean => Array.isArray(v) && v.every(valid);
const coordinate = (v: unknown, limit: number): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= limit;
export const isPlace = (v: unknown): v is Place => object(v) && coordinate(v.lat, 90) && coordinate(v.lng, 180) && optionalText(v.label);
const place = isPlace;

export function isGeocodeResponse(v: unknown): v is GeocodeResult[] {
  return list(v, (r) => object(r) && (r.street === null || text(r.street)) && (r.city === null || text(r.city)) && place(r) && text(r.label));
}

function leg(v: unknown): boolean {
  if (!object(v)) return false;
  const geometry = v.geometry;
  return ["car", "park", "walk", "transit", "bus", "trolleybus"].includes(v.mode as string)
    && place(v.from) && place(v.to) && date(v.departAt) && date(v.arriveAt)
    && number(v.durationMin) && nullableNumber(v.distanceKm) && text(v.note) && basis(v.basis)
    && (v.line === null || (object(v.line) && text(v.line.name) && optionalText(v.line.color)))
    && (geometry === null || (object(geometry) && geometry.type === "LineString"
      && list(geometry.coordinates, (p) => Array.isArray(p) && p.length === 2 && coordinate(p[0], 180) && coordinate(p[1], 90))));
}

function option(v: unknown): boolean {
  if (!object(v) || !object(v.metrics) || !object(v.basis) || !object(v.feasibility)) return false;
  const m = v.metrics;
  return text(v.id) && strategy(v.strategy) && text(v.title) && text(v.summary)
    && date(v.departAt) && date(v.arriveAt)
    && number(m.durationMin) && nullableNumber(m.costEur) && nullableNumber(m.co2Kg)
    && number(m.walkMin) && number(m.transfers) && number(m.distanceKm)
    && basis(v.basis.duration) && basis(v.basis.cost) && basis(v.basis.co2)
    && number(v.feasibility.lateMin) && typeof v.feasibility.overWalk === "boolean"
    && ["recommended", "alternative", "dominated"].includes(v.status as string)
    && Array.isArray(v.legs) && v.legs.length > 0 && v.legs.every(leg)
    && list(v.cost, (c) => object(c) && text(c.label) && nullableNumber(c.eur) && basis(c.basis));
}

export function isPlanResponse(v: unknown): v is PlanResponse {
  if (!object(v) || !object(v.trip) || !Array.isArray(v.options)) return false;
  const r = v.recommendation;
  return v.version === 1 && date(v.generatedAt) && ["demo", "mixed", "live"].includes(v.dataMode as string)
    && place(v.trip.origin) && place(v.trip.destination) && date(v.trip.arriveBy)
    && number(v.trip.stayMinutes) && typeof v.trip.stayAssumed === "boolean"
    && v.options.every(option)
    && new Set(v.options.map((o) => o.id)).size === v.options.length
    && (r === null || (object(r) && text(r.optionId) && v.options.some((o) => o.id === r.optionId)
      && ["recommended", "all_late"].includes(r.state as string) && text(r.sentence)))
    && list(v.assumptions, (a) => object(a) && text(a.id) && text(a.text))
    && list(v.sources, (s) => object(s) && text(s.id) && text(s.name) && basis(s.basis) && optionalText(s.note))
    && list(v.warnings, (w) => object(w) && text(w.code) && text(w.text))
    && list(v.unavailable, (u) => object(u) && strategy(u.strategy) && text(u.code) && text(u.text));
}
