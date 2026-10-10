import type { LatLng } from "./geo";
import type { CarLeg, CarResult } from "./plan-types";
import { localSecondsAt } from "./departure";

export function parsePoint(raw: string | null): LatLng | null {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(raw ?? "");
  const p: LatLng | null = m ? [+m[1], +m[2]] : null;
  return p?.every(Number.isFinite) ? p : null;
}

function navigationPoint(point: LatLng): string {
  const [lat, lng] = point;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error("Invalid navigation coordinates");
  return `${lat},${lng}`;
}

/** Waze Live Map's route permalink: preview the planned origin and destination. */
export function wazeUrl(leg: Pick<CarLeg, "from" | "to">): string {
  return `https://www.waze.com/live-map/directions?${new URLSearchParams({
    from: `ll.${navigationPoint(leg.from)}`, to: `ll.${navigationPoint(leg.to)}`, utm_source: "eismopulsas",
  })}`;
}

/** The native app's supported deep link starts navigation from the driver's GPS location. */
export function wazeNavigationUrl(leg: Pick<CarLeg, "to">): string {
  return `https://waze.com/ul?${new URLSearchParams({ ll: navigationPoint(leg.to), navigate: "yes", utm_source: "eismopulsas" })}`;
}

export function samePoint(a: LatLng, b: LatLng): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

export function withDrive(car: CarResult, drive: CarLeg, date: string): CarResult {
  return { ...car, drive, distance: drive.distance, geometry: drive.geometry, baseDuration: drive.baseDuration,
    traffic: drive.traffic, duration: drive.duration + car.overhead,
    arrive: localSecondsAt(Date.parse(drive.arrivalAt) + (car.overhead - 120) * 1000, date) };
}
