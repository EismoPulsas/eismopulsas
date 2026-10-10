"use client";

import { useEffect, useMemo, useState } from "react";
import { samePoint, withDrive } from "@/lib/driving";
import type { CarLeg, ParkingOption, PlanResponse } from "@/lib/plan-types";

type DriveResponse = CarLeg & { parkingOptions?: ParkingOption[] };

/** Fetch only the chosen car leg; never request every parking alternative. */
export function useCarDrive(plan: PlanResponse | null, option: ParkingOption | undefined, refresh: number, maxWalkMin: number, enabled: boolean) {
  const [result, setResult] = useState<{ key: string; leg: DriveResponse | null; error: string | null } | null>(null);
  const target = option ? option.navigationPos ?? option.pos : plan?.to;
  const origin = plan?.from;
  const at = plan?.car?.drive.departureAt;
  const curb = !!option?.curb;
  const key = origin && target && at ? JSON.stringify([origin, target, at, refresh, maxWalkMin, curb]) : "";
  const reuse = !!plan?.car && !!target && samePoint(plan.car.drive.to, target);
  useEffect(() => {
    if (!enabled || !plan?.car || !origin || !target || !at || reuse) return;
    let active = true;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      const q = new URLSearchParams({ from: origin.join(","), to: target.join(","), depart: at, parkingFor: plan.to.join(","), walk: String(maxWalkMin) });
      if (curb) q.set("curb", "1");
      fetch(`/api/drive?${q}`, { signal: ctrl.signal, cache: "no-store" }).then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Nepavyko atnaujinti važiavimo laiko.");
        if (active) setResult({ key, leg: d, error: null });
      }).catch((err) => {
        if (active && err.name !== "AbortError") setResult({ key, leg: null, error: err.message });
      });
    }, 300);
    return () => { active = false; clearTimeout(timer); ctrl.abort(); };
    // The key includes coordinates, departure and refresh; labels and parking metadata never trigger routing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reuse, enabled]);
  const matching = result?.key === key ? result : null;
  const projected = useMemo(() => {
    if (!plan?.car || reuse || !matching?.leg) return plan;
    const car = withDrive(plan.car, matching.leg, plan.depart.date);
    if (matching.leg.parkingOptions) car.parkingOptions = matching.leg.parkingOptions;
    return { ...plan, car };
  }, [plan, reuse, matching]);
  return { plan: projected, pending: !!key && !reuse && !matching, error: matching?.error ?? null };
}
