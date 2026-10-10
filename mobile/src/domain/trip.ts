// Trip input, saved trips and request building (ROUTING.md § 10: on-device data model).

import type { MobilityProfile, Place, PlanRequest, Preference } from "@/api/contract";
import { clockOf, toIsoWithOffset } from "@/format/lt";

export type Day = "today" | "tomorrow";

export type TripDraft = {
  origin: Place | null;
  destination: Place | null;
  day: Day;
  /** "HH:mm", local time. */
  arriveByTime: string;
  /** Parking stay; undefined = let the server use (and state) its default. */
  stayMinutes?: number;
};

export type SavedTrip = {
  id: string;
  name: string;
  origin: Place;
  destination: Place;
  arriveByTime: string;
  stayMinutes?: number;
  createdAt: string;
  /** Last recommendation, shown on the list (offline-friendly summary only). */
  last?: { at: string; title: string; durationMin: number };
};

/** Defaults shown and editable on the profile screen. */
export const DEFAULT_PROFILE: MobilityProfile = {
  car: { available: true, fuel: "petrol", consumption: 7 },
  transitPass: false,
  maxWalkMin: 15,
  preference: "balanced",
};

/** Next full quarter-hour plus one hour, e.g. 07:20 → 08:30. */
export function defaultArriveTime(now = new Date()): string {
  const d = new Date(now);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15 + 60, 0, 0);
  return clockOf(d);
}

/** Today if there are still at least 15 minutes before the time, otherwise tomorrow. */
export function nextDayFor(time: string, now = new Date()): Day {
  const [h, m] = time.split(":").map(Number);
  const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
  return at.getTime() - now.getTime() >= 15 * 60_000 ? "today" : "tomorrow";
}

export function dayDate(day: Day, now = new Date()): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (day === "tomorrow") d.setDate(d.getDate() + 1);
  return d;
}

export function emptyDraft(): TripDraft {
  const time = defaultArriveTime();
  return { origin: null, destination: null, day: nextDayFor(time), arriveByTime: time };
}

export function buildRequest(draft: TripDraft, profile: MobilityProfile, preference?: Preference): PlanRequest | null {
  if (!draft.origin || !draft.destination) return null;
  return {
    origin: draft.origin,
    destination: draft.destination,
    arriveBy: toIsoWithOffset(dayDate(draft.day), draft.arriveByTime),
    ...(draft.stayMinutes ? { stayMinutes: draft.stayMinutes } : {}),
    profile: { ...profile, preference: preference ?? profile.preference },
  };
}

export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
