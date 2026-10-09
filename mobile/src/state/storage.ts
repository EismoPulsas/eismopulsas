// On-device persistence. Personal data (profile, saved trips) never leaves the phone
// except as part of a planning request, which the BFF does not store (ADR-0001).

import AsyncStorage from "@react-native-async-storage/async-storage";

import type { MobilityProfile } from "@/api/contract";
import { DEFAULT_PROFILE, type SavedTrip } from "@/domain/trip";

const KEYS = { profile: "eismopulsas.profile.v1", trips: "eismopulsas.savedTrips.v1" } as const;

async function read<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function write(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable: the app keeps working with in-memory state.
  }
}

export async function loadProfile(): Promise<MobilityProfile> {
  const p = await read<Partial<MobilityProfile>>(KEYS.profile);
  // Merge so that fields added in later versions get their defaults.
  return { ...DEFAULT_PROFILE, ...p, car: { ...DEFAULT_PROFILE.car, ...p?.car } };
}
export const saveProfile = (p: MobilityProfile) => write(KEYS.profile, p);

export async function loadTrips(): Promise<SavedTrip[]> {
  const t = await read<SavedTrip[]>(KEYS.trips);
  return Array.isArray(t) ? t : [];
}
export const saveTrips = (t: SavedTrip[]) => write(KEYS.trips, t);
