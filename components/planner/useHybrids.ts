"use client";

import { useEffect, useState } from "react";
import { isEv, type Settings } from "@/lib/metrics";
import type { HybridOption, HybridResponse, PlanResponse } from "@/lib/plan-types";

/** How long the "Geriausia" badge waits for combinations before ranking without them. */
const WAIT_MS = 2500;

/**
 * Car + second-leg combinations for the current trip, fetched once the comparison is in.
 * `settled`: the answer arrived, failed, timed out, or there is nothing to ask for.
 */
export function useHybrids(plan: PlanResponse | null, s: Settings, enabled: boolean): { options: HybridOption[]; settled: boolean; note: string | null; factor: number | null } {
  const applicable = enabled && !!plan?.car && s.hasCar && s.hybridModes.length > 0 && plan.straight >= 1500;
  const ev = isEv(s);
  const q = applicable && plan?.car
    ? new URLSearchParams({
        from: plan.from.join(","),
        to: plan.to.join(","),
        depart: plan.depart.at,
        car: String(plan.car.drive.duration),
        stay: String(s.parkingHours),
        prio: s.priority,
        modes: s.hybridModes.join(","),
        su: String(s.scooterUnlock),
        sm: String(s.scooterPerMin),
        ...(ev && s.chargeWhenParked ? { ev: "1", conn: s.connectors.join(","), ac: String(s.acKw), dc: String(s.dcKw), bat: String(s.batteryKwh) } : {}),
        ...(s.evPermit ? { permit: "1" } : {}),
      }).toString()
    : "";
  const [result, setResult] = useState<{ key: string; body: HybridResponse | null } | null>(null);
  const [expired, setExpired] = useState("");

  useEffect(() => {
    if (!q) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => setExpired(q), WAIT_MS);
    fetch(`/api/hybrid?${q}`, { signal: ctrl.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: HybridResponse | null) => setResult({ key: q, body }))
      .catch((err) => err.name !== "AbortError" && setResult({ key: q, body: null }));
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q]);

  const current = q && result?.key === q ? result.body : null;
  return {
    options: current?.options ?? [],
    settled: !q || result?.key === q || expired === q,
    note: current?.note ?? null,
    factor: current?.trafficFactor ?? null,
  };
}
