// On-device persistence. Personal data (profile, saved trips) never leaves the phone
// except as part of a planning request, which the BFF does not store (ADR-0001).

import AsyncStorage from "@react-native-async-storage/async-storage";

import type { MobilityProfile } from "@/api/contract";
import { isPlace } from "@/api/validate-response";
import { DEFAULT_PROFILE, type SavedTrip } from "@/domain/trip";

const KEYS = { profile: "eismopulsas.profile.v1", trips: "eismopulsas.savedTrips.v1" } as const;
const writes = new Map<string, Promise<void>>();
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const inRange = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;

async function read<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): Promise<void> {
  // Keep rapid changes in order even if a previous native write is still pending.
  const next = (writes.get(key) ?? Promise.resolve()).then(async () => {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage full or unavailable: the app keeps working with in-memory state.
    }
  });
  writes.set(key, next);
  return next;
}

export async function loadProfile(): Promise<MobilityProfile> {
  const stored = await read<unknown>(KEYS.profile);
  const p = object(stored) ? stored : {};
  const car = object(p.car) ? p.car : {};
  const fuel = ["petrol", "diesel", "lpg", "hybrid", "electric"].includes(car.fuel as string)
    ? car.fuel as MobilityProfile["car"]["fuel"] : DEFAULT_PROFILE.car.fuel;
  const preference = ["balanced", "fastest", "cheapest", "greener"].includes(p.preference as string)
    ? p.preference as MobilityProfile["preference"] : DEFAULT_PROFILE.preference;
  return {
    car: {
      available: typeof car.available === "boolean" ? car.available : DEFAULT_PROFILE.car.available,
      fuel,
      consumption: inRange(car.consumption, 1, 40) ? car.consumption : DEFAULT_PROFILE.car.consumption,
      ...(inRange(car.fuelPriceEur, 0.05, 5) ? { fuelPriceEur: car.fuelPriceEur } : {}),
    },
    transitPass: typeof p.transitPass === "boolean" ? p.transitPass : DEFAULT_PROFILE.transitPass,
    maxWalkMin: inRange(p.maxWalkMin, 0, 60) ? p.maxWalkMin : DEFAULT_PROFILE.maxWalkMin,
    preference,
  };
}
export const saveProfile = (p: MobilityProfile) => write(KEYS.profile, p);

export async function loadTrips(): Promise<SavedTrip[]> {
  const t = await read<unknown>(KEYS.trips);
  if (!Array.isArray(t)) return [];
  const seen = new Set<string>();
  return t.flatMap((trip: unknown): SavedTrip[] => {
    if (!object(trip) || typeof trip.id !== "string" || seen.has(trip.id) || typeof trip.name !== "string"
      || !isPlace(trip.origin) || !isPlace(trip.destination) || typeof trip.arriveByTime !== "string"
      || !/^([01]\d|2[0-3]):[0-5]\d$/.test(trip.arriveByTime)
      || typeof trip.createdAt !== "string" || !Number.isFinite(Date.parse(trip.createdAt))) return [];
    seen.add(trip.id);
    const last = trip.last;
    return [{
      id: trip.id, name: trip.name, origin: trip.origin, destination: trip.destination,
      arriveByTime: trip.arriveByTime, createdAt: trip.createdAt,
      ...(inRange(trip.stayMinutes, 5, 1440) ? { stayMinutes: trip.stayMinutes } : {}),
      ...(object(last) && typeof last.at === "string" && Number.isFinite(Date.parse(last.at))
        && typeof last.title === "string" && inRange(last.durationMin, 0, Number.MAX_SAFE_INTEGER)
        ? { last: { at: last.at, title: last.title, durationMin: last.durationMin } } : {}),
    }];
  });
}
export const saveTrips = (t: SavedTrip[]) => write(KEYS.trips, t);
