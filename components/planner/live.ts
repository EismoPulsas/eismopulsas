"use client";

import { useEffect, useState } from "react";
import type { LiveLot } from "@/lib/plan-types";

export type LiveParking = {
  at: string;
  lots: Record<string, LiveLot> | null;
  chargers?: Record<string, [number, number]> | null;
};

/** Live free spaces (and, for EV drivers, charger status), refreshed every minute while shown; sooner after a miss. */
export function useLiveParking(enabled: boolean, withChargers: boolean): LiveParking | null {
  const [live, setLive] = useState<LiveParking | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = () =>
      fetch(`/api/parking${withChargers ? "?chargers=1" : ""}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
        .then((d: LiveParking | null) => {
          if (!alive) return;
          if (d) setLive(d);
          timer = setTimeout(load, d?.lots ? 60_000 : 15_000);
        });
    load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [enabled, withChargers]);
  return live;
}
