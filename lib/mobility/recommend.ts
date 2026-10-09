// Recommendation rules (ROUTING.md § 5–6). Pure and deterministic; no scores are
// exposed. Order of operations:
//   1. feasibility: on time and within the walking limit (fallbacks below);
//   2. dominance: an option at least as good on time, cost and CO₂ (and better on one)
//      removes the other from the candidate pool;
//   3. preference: fastest / cheapest / greener pick the minimum of their metric;
//      balanced uses the tolerance rule in BALANCED (config.ts).

import { BALANCED } from "./config";
import type { Preference, Strategy } from "./types";

export type Candidate = {
  id: string;
  strategy: Strategy;
  durationMin: number;
  costEur: number | null;
  co2Kg: number | null;
  lateMin: number;
  overWalk: boolean;
};

export type Ranking = {
  optionId: string;
  state: "recommended" | "all_late";
  rule: string;
  /** option id → id of an option that dominates it (same feasibility class only). */
  dominatedBy: Record<string, string>;
};

/** a dominates b: no worse on time, cost and CO₂, strictly better on at least one. Unknown values never dominate. */
export function dominates(a: Candidate, b: Candidate): boolean {
  if (a.costEur === null || b.costEur === null || a.co2Kg === null || b.co2Kg === null) return false;
  const noWorse = a.durationMin <= b.durationMin && a.costEur <= b.costEur && a.co2Kg <= b.co2Kg;
  const better = a.durationMin < b.durationMin || a.costEur < b.costEur || a.co2Kg < b.co2Kg;
  return noWorse && better;
}

const feasible = (c: Candidate) => c.lateMin === 0 && !c.overWalk;
const orInf = (n: number | null) => (n === null ? Number.POSITIVE_INFINITY : n);

function byKeys(...keys: ((c: Candidate) => number)[]) {
  return (a: Candidate, b: Candidate) => {
    for (const k of keys) {
      const d = k(a) - k(b);
      if (d !== 0) return d;
    }
    return 0;
  };
}
const time = (c: Candidate) => c.durationMin;
const cost = (c: Candidate) => orInf(c.costEur);
const co2 = (c: Candidate) => orInf(c.co2Kg);

export function rank(options: Candidate[], preference: Preference): Ranking | null {
  if (options.length === 0) return null;

  const dominatedBy: Record<string, string> = {};
  for (const b of options) {
    const winner = options.find((a) => a !== b && feasible(a) === feasible(b) && dominates(a, b));
    if (winner) dominatedBy[b.id] = winner.id;
  }

  let pool = options.filter(feasible);
  const state: Ranking["state"] = "recommended";
  if (pool.length === 0) pool = options.filter((c) => c.lateMin === 0); // over the walking limit, but on time
  if (pool.length === 0) {
    const leastLate = [...options].sort(byKeys((c) => c.lateMin, time))[0];
    return { optionId: leastLate.id, state: "all_late", rule: "all_late:least_late", dominatedBy };
  }
  const undominated = pool.filter((c) => !dominatedBy[c.id]);
  if (undominated.length > 0) pool = undominated;

  const pick = (rule: string, ...keys: ((c: Candidate) => number)[]): Ranking => ({
    optionId: [...pool].sort(byKeys(...keys))[0].id,
    state,
    rule,
    dominatedBy,
  });

  switch (preference) {
    case "fastest":
      return pick("fastest:min_time", time, cost, co2);
    case "cheapest":
      return pick("cheapest:min_cost", cost, time);
    case "greener":
      return pick("greener:min_co2", co2, time);
    case "balanced": {
      const fastest = [...pool].sort(byKeys(time, cost, co2))[0];
      const allowedExtra = Math.max(BALANCED.maxExtraMin, BALANCED.maxExtraRatio * fastest.durationMin);
      let best: { c: Candidate; benefit: number; extra: number } | null = null;
      for (const c of pool) {
        if (c === fastest || c.co2Kg === null || fastest.co2Kg === null) continue;
        const extra = c.durationMin - fastest.durationMin;
        // Unknown cost on either side: decide on CO₂ alone (the explanation then omits cost).
        const saveEur = c.costEur !== null && fastest.costEur !== null ? fastest.costEur - c.costEur : 0;
        const saveCo2 = fastest.co2Kg > 0 ? (fastest.co2Kg - c.co2Kg) / fastest.co2Kg : 0;
        // Slower but no more expensive and no dirtier, and clearly better on at least one.
        const qualifies =
          extra <= allowedExtra &&
          saveEur >= 0 &&
          saveCo2 >= 0 &&
          (saveEur >= BALANCED.minSavingEur || saveCo2 >= BALANCED.minSavingCo2Ratio);
        if (!qualifies) continue;
        const benefit = saveEur / BALANCED.minSavingEur + saveCo2 / BALANCED.minSavingCo2Ratio;
        if (!best || benefit > best.benefit || (benefit === best.benefit && extra < best.extra)) best = { c, benefit, extra };
      }
      return best
        ? { optionId: best.c.id, state, rule: "balanced:tolerance", dominatedBy }
        : { optionId: fastest.id, state, rule: "balanced:fastest", dominatedBy };
    }
  }
}
