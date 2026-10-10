"use client";

import { useCallback, useEffect, useState } from "react";
import { haversine, type LatLng } from "@/lib/geo";
import { stayBucket, type StayHabits, type StayRecord } from "@/lib/stay";

// What the planner learns about the user, kept only in this browser (like the profile):
// stay lengths they corrected, and stays observed from consecutive trips (A of a later
// trip that day ≈ B of an earlier one). Nothing leaves the device.

const KEY = "ep-habits-v1";
const MAX = 200;
const SAME_PLACE_M = 250;

/** A trip the user acted on (opened an option or handed it to Waze). */
export type TripRecord = { from: LatLng; to: LatLng; toLabel: string; date: string; weekday: number; departSec: number; arriveSec: number };
export type Habits = StayHabits & { trips: TripRecord[] };

const EMPTY: Habits = { overrides: [], observed: [], trips: [] };

function load(): Habits {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...EMPTY, ...JSON.parse(raw) };
  } catch {}
  return EMPTY;
}

function save(h: Habits) {
  try {
    localStorage.setItem(KEY, JSON.stringify(h));
  } catch {}
}

const today = () => new Date().toISOString();

export function useHabits() {
  const [habits, setHabits] = useState<Habits>(EMPTY);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHabits(load());
  }, []);

  /** The user corrected the stay for this place and time of the week: remember it. */
  const rememberStay = useCallback((to: LatLng, weekday: number, arriveSec: number, hours: number) => {
    const bucket = stayBucket(weekday, arriveSec);
    const h = load();
    const overrides = h.overrides.filter((r) => !(r.bucket === bucket && haversine(r.pos, to) <= SAME_PLACE_M));
    const next = { ...h, overrides: [...overrides, { pos: to, bucket, hours, at: today() }].slice(-MAX) };
    save(next);
    setHabits(next);
  }, []);

  /** Log a trip; a later trip leaving from where an earlier one ended that day reveals the stay. */
  const logTrip = useCallback((t: TripRecord) => {
    const h = load();
    const last = h.trips.at(-1);
    if (last && last.date === t.date && haversine(last.to, t.to) < 50 && haversine(last.from, t.from) < 50) return; // same trip again
    const observed: StayRecord[] = [...h.observed];
    const before = [...h.trips].reverse().find((p) => p.date === t.date && p.arriveSec < t.departSec && haversine(p.to, t.from) <= SAME_PLACE_M);
    if (before) {
      const hours = Math.round(((t.departSec - before.arriveSec) / 3600) * 2) / 2;
      if (hours >= 0.25 && hours <= 24) observed.push({ pos: before.to, bucket: stayBucket(before.weekday, before.arriveSec), hours, at: today() });
    }
    const next = { ...h, trips: [...h.trips, t].slice(-MAX), observed: observed.slice(-MAX) };
    save(next);
    setHabits(next);
  }, []);

  return { habits, rememberStay, logTrip };
}

/**
 * Waze-like: a trip the user often makes from about here at about this time of the week
 * (≥ 3 times, ± 60 min), as a one-tap suggestion when B is still empty.
 */
export function usualTrip(trips: TripRecord[], from: LatLng, weekday: number, sec: number): { to: LatLng; label: string; departSec: number; count: number } | null {
  const weekend = weekday === 0 || weekday === 6;
  const similar = trips.filter((t) => (t.weekday === 0 || t.weekday === 6) === weekend && Math.abs(t.departSec - sec) <= 3600 && haversine(t.from, from) <= SAME_PLACE_M);
  const groups: TripRecord[][] = [];
  for (const t of similar) {
    const g = groups.find((x) => haversine(x[0].to, t.to) <= SAME_PLACE_M);
    if (g) g.push(t);
    else groups.push([t]);
  }
  const best = groups.sort((a, b) => b.length - a.length)[0];
  if (!best || best.length < 3) return null;
  const times = best.map((t) => t.departSec).sort((a, b) => a - b);
  return { to: best.at(-1)!.to, label: best.at(-1)!.toLabel, departSec: times[times.length >> 1], count: best.length };
}
