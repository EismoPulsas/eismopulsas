// Explanation generation (ROUTING.md § 7). Deterministic Lithuanian templates built
// only from the metric differences between options — never from a score, never a
// fixed sentence. Pure; formatting helpers in format.ts.

import { EXPLAIN_THRESHOLDS as T } from "./config";
import { capitalize, eur, joinLt, minutes, pct, times } from "./format";
import type { ParkingInfo, Preference, Reason, Strategy } from "./types";

export type Explainable = {
  id: string;
  strategy: Strategy;
  metrics: { durationMin: number; costEur: number | null; co2Kg: number | null; walkMin: number };
  parking: ParkingInfo | null;
  feasibility: { lateMin: number; overWalk: boolean };
};

/** "… nei <phrase>" / "… kaip <phrase>". */
const VS: Record<Strategy, string> = {
  car: "važiuojant automobiliu",
  transit: "viešuoju transportu",
  park_and_ride: "su „Statyk ir važiuok“",
};

/** A rule's headline and the metric it claims to minimise — used only if the claim holds against ALL options. */
const RULE_PREFIX: Record<string, { text: string; metric: (e: Explainable) => number }> = {
  "fastest:min_time": { text: "Greičiausias variantas", metric: (e) => e.metrics.durationMin },
  "balanced:fastest": { text: "Greičiausias variantas", metric: (e) => e.metrics.durationMin },
  "cheapest:min_cost": { text: "Pigiausias variantas", metric: (e) => e.metrics.costEur ?? Infinity },
  "greener:min_co2": { text: "Mažiausiai CO₂", metric: (e) => e.metrics.co2Kg ?? Infinity },
};

/** The metric each preference cares about most (balanced: money — it trades time for savings). */
const PREFERENCE_METRIC: Record<Preference, (e: Explainable) => number> = {
  fastest: (e) => e.metrics.durationMin,
  cheapest: (e) => e.metrics.costEur ?? Infinity,
  greener: (e) => e.metrics.co2Kg ?? Infinity,
  balanced: (e) => e.metrics.costEur ?? Infinity,
};

/** Which reason is mentioned first for each preference. */
const ORDER: Record<Preference, Reason["kind"][]> = {
  fastest: ["time", "cost", "co2"],
  cheapest: ["cost", "time", "co2"],
  greener: ["co2", "time", "cost"],
  balanced: ["time", "cost", "co2"],
};

/** null when the difference is below the threshold ("about the same time"). */
function timePhrase(deltaMin: number, softSlower: boolean): string | null {
  if (Math.abs(deltaMin) < T.min) return null;
  return deltaMin > 0 ? `${softSlower && deltaMin <= 10 ? "tik " : ""}${minutes(deltaMin)} lėčiau` : `${minutes(-deltaMin)} greičiau`;
}
const costPhrase = (savedEur: number) => (savedEur > 0 ? `${eur(savedEur)} pigiau` : `${eur(-savedEur)} brangiau`);
/** ratio = (other − this) / other; positive = this emits less. */
function co2Phrase(thisKg: number, otherKg: number): string {
  if (thisKg <= otherKg) return `~${pct((otherKg - thisKg) / otherKg)} mažiau CO₂`;
  const r = thisKg / otherKg;
  return r >= 2 ? `~${times(r)} daugiau CO₂` : `~${pct((thisKg - otherKg) / otherKg)} daugiau CO₂`;
}

/** The option the recommendation is compared with: driving if it is not the car, otherwise the next best by preference. */
function reference(rec: Explainable, others: Explainable[], preference: Preference): Explainable | null {
  if (others.length === 0) return null;
  const car = others.find((o) => o.strategy === "car");
  if (rec.strategy !== "car" && car) return car;
  const key = (o: Explainable) =>
    preference === "cheapest" ? (o.metrics.costEur ?? Infinity) : preference === "greener" ? (o.metrics.co2Kg ?? Infinity) : o.metrics.durationMin;
  return [...others].sort((a, b) => key(a) - key(b) || a.metrics.durationMin - b.metrics.durationMin)[0];
}

export function explainRecommendation(
  rec: Explainable,
  others: Explainable[],
  preference: Preference,
  rule: string,
  state: "recommended" | "all_late",
): { sentence: string; reasons: Reason[] } {
  if (state === "all_late") {
    const late = rec.feasibility.lateMin;
    return {
      sentence: `Laiku atvykti nepavyks. Šis variantas vėluoja mažiausiai – ${minutes(late)}`,
      reasons: [{ kind: "feasibility", code: "all_late", lateMin: late }],
    };
  }
  const ref = reference(rec, others, preference);
  if (!ref) return { sentence: "Vienintelis šiai kelionei tinkamas variantas.", reasons: [] };

  const reasons: Reason[] = [];
  const phrases = new Map<Reason["kind"], string>();
  const a = rec.metrics;
  const b = ref.metrics;

  const dMin = a.durationMin - b.durationMin;
  reasons.push({ kind: "time", deltaMin: dMin, vs: ref.strategy });
  const tp = timePhrase(dMin, true);
  if (tp) phrases.set("time", tp);

  if (a.costEur !== null && b.costEur !== null) {
    const saved = Math.round((b.costEur - a.costEur) * 100) / 100;
    reasons.push({ kind: "cost", deltaEur: saved, vs: ref.strategy });
    if (Math.abs(saved) >= T.eur) phrases.set("cost", costPhrase(saved));
  }
  if (a.co2Kg !== null && b.co2Kg !== null && b.co2Kg > 0) {
    const ratio = (b.co2Kg - a.co2Kg) / b.co2Kg;
    reasons.push({ kind: "co2", deltaPct: Math.round(ratio * 100), deltaKg: Math.round((b.co2Kg - a.co2Kg) * 10) / 10, vs: ref.strategy });
    if (Math.abs(ratio) >= T.co2Ratio) phrases.set("co2", co2Phrase(a.co2Kg, b.co2Kg));
  }

  // Facts that matter for this preference first; at most three in the sentence.
  const facts = ORDER[preference].map((k) => phrases.get(k)).filter((p): p is string => !!p);
  // Never claim "cheapest" etc. when a better option was excluded for feasibility.
  const claim = RULE_PREFIX[rule];
  const claimHolds = !!claim && others.every((o) => claim.metric(rec) <= claim.metric(o));
  const prefix = claimHolds ? claim.text : undefined;
  const sameTime = tp === null ? ", o kelionės laikas beveik toks pat" : "";
  let sentence =
    facts.length === 0
      ? `Laikas, kaina ir CO₂ panašūs kaip ${VS[ref.strategy]}.`
      : prefix
        ? `${prefix}: ${joinLt(facts.slice(0, 3))} nei ${VS[ref.strategy]}${sameTime}.`
        : `${capitalize(joinLt(facts.slice(0, 3)))} nei ${VS[ref.strategy]}${sameTime}.`;

  const refParking = ref.parking;
  if (rec.strategy !== "car" && ref.strategy === "car" && refParking?.kind === "street_zone" && refParking.costEur && refParking.costEur > 0) {
    reasons.push({ kind: "parking", code: "avoids_paid_parking", vs: "car", zone: refParking.name, eur: refParking.costEur });
    sentence += ` Nereikės mokėti už stovėjimą (${refParking.name}, ~${eur(refParking.costEur)}).`;
  }
  // Why an option that is better on the user's priority was not chosen. When that is the
  // deciding reason (the rule's claim does not hold), it leads the explanation.
  const key = PREFERENCE_METRIC[preference];
  const betterExcluded = others.filter((o) => key(o) < key(rec));
  const notes: string[] = [];
  if (betterExcluded.some((o) => o.feasibility.overWalk) && !rec.feasibility.overWalk) {
    reasons.push({ kind: "feasibility", code: "others_over_walk" });
    notes.push("Kitiems variantams reikėtų eiti pėsčiomis ilgiau, nei nurodėte profilyje.");
  }
  if (betterExcluded.some((o) => o.feasibility.lateMin > 0) && rec.feasibility.lateMin === 0) {
    reasons.push({ kind: "feasibility", code: "others_late" });
    notes.push("Kiti variantai laiku nespėtų.");
  }
  if (notes.length) sentence = claim && !claimHolds ? `${notes.join(" ")} ${sentence}` : `${sentence} ${notes.join(" ")}`;
  return { sentence, reasons };
}

/** "neither slower, nor dearer, nor dirtier" — for a dominated option, against the option that dominates it. */
const NOMINATIVE: Record<Strategy, string> = {
  car: "važiuoti automobiliu",
  transit: "viešasis transportas",
  park_and_ride: "„Statyk ir važiuok“",
};
export function summarizeDominated(alt: Explainable, by: Explainable): string {
  // Every difference counts for dominance, so no thresholds here.
  const facts: string[] = [];
  const dMin = alt.metrics.durationMin - by.metrics.durationMin;
  if (dMin > 0) facts.push(`${minutes(dMin)} greičiau`);
  const [ac, bc] = [alt.metrics.costEur, by.metrics.costEur];
  if (ac !== null && bc !== null && ac > bc) facts.push(`${eur(Math.round((ac - bc) * 100) / 100)} pigiau`);
  const [ak, bk] = [alt.metrics.co2Kg, by.metrics.co2Kg];
  if (ak !== null && bk !== null && ak > bk) facts.push(`~${pct((ak - bk) / ak)} mažiau CO₂`);
  return `Nerekomenduojame: ${NOMINATIVE[by.strategy]} nėra prastesnis nė pagal vieną rodiklį (${joinLt(facts)}).`;
}

/** One line for a non-recommended option, relative to the recommended one. */
export function summarizeAlternative(alt: Explainable, rec: Explainable): string {
  const parts: string[] = [];
  const tp = timePhrase(alt.metrics.durationMin - rec.metrics.durationMin, false);
  if (tp) parts.push(tp);
  const [ac, rc] = [alt.metrics.costEur, rec.metrics.costEur];
  if (ac !== null && rc !== null && Math.abs(ac - rc) >= T.eur) parts.push(costPhrase(Math.round((rc - ac) * 100) / 100));
  const [ak, rk] = [alt.metrics.co2Kg, rec.metrics.co2Kg];
  if (ak !== null && rk !== null && rk > 0 && Math.abs(ak - rk) / rk >= T.co2Ratio) parts.push(co2Phrase(ak, rk));

  const body = parts.length > 0 ? `${joinLt(parts)} nei rekomenduojamas variantas.` : "panašus į rekomenduojamą variantą.";
  let s = capitalize(body);
  if (ac === null) s += " Kaina nežinoma.";
  if (alt.feasibility.lateMin > 0) s += ` Vėluosite ${minutes(alt.feasibility.lateMin)}`;
  if (alt.feasibility.overWalk) s += ` Pėsčiomis ${minutes(alt.metrics.walkMin)} – daugiau nei nurodėte.`;
  return s;
}
