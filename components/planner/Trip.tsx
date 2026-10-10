"use client";

import { useSyncExternalStore } from "react";
import { TRAVEL_KINDS, type ModeId, type ModeSummary, type TravelKind } from "@/lib/metrics";
import type { PlanResponse } from "@/lib/plan-types";
import { fmtCo2, fmtDurShort, fmtEur } from "./format";
import { ClockIcon, ModeBadge } from "./icons";
import { signals } from "./Results";

type Tone = "go" | "wait" | "stop" | "blue" | "pink" | "cyan" | "muted";

const TONE: Record<Tone, { bg: string; border: string; text: string; dot: string }> = {
  go: { bg: "#ecfdf5", border: "#a7f3d0", text: "#047857", dot: "#10b981" },
  wait: { bg: "#fffbeb", border: "#fde68a", text: "#b45309", dot: "#f59e0b" },
  stop: { bg: "#fef2f2", border: "#fecaca", text: "#dc2626", dot: "#ef4444" },
  blue: { bg: "#eff6ff", border: "#bfdbfe", text: "#1d4ed8", dot: "#3b82f6" },
  pink: { bg: "#fdf2f8", border: "#fbcfe8", text: "#be185d", dot: "#ec4899" },
  cyan: { bg: "#ecfeff", border: "#a5f3fc", text: "#0e7490", dot: "#06b6d4" },
  muted: { bg: "var(--chip)", border: "var(--line)", text: "var(--ink)", dot: "var(--muted)" },
};

/* ------------------------------------------------------------------ matrix */

const CARD_NAME: Record<ModeId, string> = {
  car: "Automobilis",
  transit: "Viešasis tr.",
  bikeshare: "Cyclocity",
  scooter: "Paspirtukas",
  bike: "Dviratis",
  walk: "Pėsčiomis",
};
const ORDER: ModeId[] = ["car", "transit", "bikeshare", "scooter", "bike", "walk"];

function cardTag(plan: PlanResponse, m: ModeSummary, best: boolean): { text: string; tone: Tone } | null {
  if (m.weatherWarning) return { text: "Orai", tone: "stop" };
  if (best) return { text: "TOP", tone: "go" };
  if (m.id === "car" && plan.car) {
    const d = plan.car.drive.traffic.delaySeconds;
    return d !== null && d > 120 ? { text: "Spūstys", tone: "stop" } : null;
  }
  if (m.id === "transit") {
    const ride = plan.transit?.legs.find((l) => l.kind === "ride");
    return ride && ride.kind === "ride" && ride.route.short ? { text: ride.route.short, tone: "blue" } : null;
  }
  if (m.id === "bikeshare") return { text: "GBFS", tone: "cyan" };
  if (m.id === "scooter" && plan.scooter) {
    if (plan.scooter.source === "demo") return { text: "DEMO", tone: "pink" };
    return plan.scooter.operator ? { text: plan.scooter.operator, tone: "pink" } : null;
  }
  return null;
}

/** Every way to make the trip, side by side: the recommended one first. */
export function ModeMatrix({
  plan,
  modes,
  best,
  selected,
  onSelect,
}: {
  plan: PlanResponse;
  modes: ModeSummary[];
  best: ModeId | null;
  selected: ModeId | null;
  onSelect: (m: ModeId) => void;
}) {
  const co2 = signals(modes, "co2");
  const cost = signals(modes, "cost");
  const sorted = [...modes].sort((a, b) => (a.id === best ? -1 : b.id === best ? 1 : ORDER.indexOf(a.id) - ORDER.indexOf(b.id)));
  return (
    <div
      className={`-mx-3 flex snap-x gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] lg:mx-0 lg:grid lg:overflow-visible lg:px-0 lg:pb-0 ${sorted.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}
    >
      {sorted.map((m) => {
        const on = m.id === selected;
        const tag = cardTag(plan, m, m.id === best);
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onSelect(m.id)}
            aria-pressed={on}
            title={m.feasible ? m.weatherWarning : m.why}
            className={`flex min-w-[124px] shrink-0 snap-start flex-col items-start rounded-2xl bg-[var(--panel)] text-left transition lg:min-w-0 ${
              on ? "border-2 border-[var(--marking)] p-[11px] shadow-[0_4px_14px_rgba(5,150,105,0.15)]" : "border border-[var(--line)] p-3 hover:border-[#cbd5e1]"
            } ${m.feasible && !m.weatherWarning ? "" : "opacity-50"}`}
          >
            <span className="flex w-full items-start justify-between gap-1">
              <ModeBadge mode={m.id} size={26} />
              {tag && (
                <span className="rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold" style={{ background: TONE[tag.tone].bg, color: TONE[tag.tone].text }}>
                  {tag.text}
                </span>
              )}
            </span>
            <span className="mt-2 text-sm font-semibold">{CARD_NAME[m.id]}</span>
            <span className={`font-mono text-[15px] font-semibold ${on ? "text-[var(--marking)]" : ""}`}>{m.feasible ? fmtDurShort(m.duration) : "—"}</span>
            <span className="mt-0.5 font-mono text-[10.5px] text-[var(--muted)]">
              <span style={{ color: cost.get(m.id) === "stop" ? TONE.stop.text : undefined }}>{m.cost < 0.005 ? "0 €" : fmtEur(m.cost)}</span>
              {" · "}
              <span style={{ color: co2.get(m.id) === "stop" ? TONE.stop.text : undefined }}>{m.co2 < 0.001 ? "0 g" : fmtCo2(m.co2)}</span>
            </span>
            {m.weatherWarning && <span className="mt-0.5 text-[10.5px] font-semibold" style={{ color: TONE.stop.text }}>Ne dėl oro</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ header bits */

const subscribeMinute = (cb: () => void) => {
  const t = setInterval(cb, 15000);
  return () => clearInterval(t);
};
const nowHHMM = () => new Intl.DateTimeFormat("lt-LT", { timeZone: "Europe/Vilnius", hour: "2-digit", minute: "2-digit" }).format(new Date());

/** Current Vilnius time; empty during server render so hydration matches. */
export function NowClock({ departAt }: { departAt: string | null }) {
  const now = useSyncExternalStore(subscribeMinute, nowHHMM, () => "");
  const shown = departAt ? departAt.slice(11, 16) : now;
  if (!shown) return null;
  return (
    <span className="flex items-center gap-1.5 font-mono text-sm text-[var(--muted)]">
      <ClockIcon size={14} />
      {shown}
    </span>
  );
}

export function LiveStatus({ departAt }: { departAt: string | null }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-xs whitespace-nowrap text-[var(--muted)]">
      <span className={`h-2 w-2 shrink-0 rounded-full ${departAt ? "bg-[var(--wait)]" : "bg-[var(--go)]"}`} />
      {/* The one part of the header that may shrink (with "…") when space runs out. */}
      <span className="min-w-0 truncate">
        {departAt ? (
          <>
            Planuojama: <b className="text-[var(--ink)]">{departAt.replace("T", " ").slice(5)}</b>
          </>
        ) : (
          <>
            Realiu laiku: <b className="text-[var(--marking)]">Aktyvu</b>
          </>
        )}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ my transport */

const TRAVEL_META: Record<TravelKind, { icon: string; label: string }> = {
  car: { icon: "🚗", label: "Automobilis" },
  transit: { icon: "🚌", label: "Viešasis tr." },
  bike: { icon: "🚲", label: "Dviratis" },
  scooter: { icon: "🛴", label: "Paspirtukas" },
  walk: { icon: "🚶", label: "Pėsčiomis" },
};
const ECO: TravelKind[] = TRAVEL_KINDS.filter((k) => k !== "car");
const same = (a: TravelKind[], b: TravelKind[]) => a.length === b.length && a.every((k) => b.includes(k));

/** "Mano transportas": which ways to compare and combine. The way on the chosen card is filled. */
export function TransportPicker({ value, current, onChange }: { value: TravelKind[]; current: TravelKind | null; onChange: (t: TravelKind[]) => void }) {
  const toggle = (k: TravelKind) => {
    const next = value.includes(k) ? value.filter((x) => x !== k) : TRAVEL_KINDS.filter((x) => x === k || value.includes(x));
    if (next.length) onChange(next); // at least one way stays on
  };
  const preset = (label: string, kinds: TravelKind[]) => (
    <button type="button" onClick={() => onChange(kinds)} className={`font-semibold ${same(value, kinds) ? "text-[var(--marking)]" : "text-[var(--muted)] hover:text-[var(--ink)]"}`} aria-pressed={same(value, kinds)}>
      {label}
    </button>
  );
  return (
    <section aria-label="Mano transportas" className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-3">
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <span className="eyebrow">Mano transportas</span>
        <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--marking)]">{value.length} aktyvūs</span>
        <span className="ml-auto flex items-center gap-2 text-xs">
          {preset("Visi", TRAVEL_KINDS)}
          <span className="text-[var(--line)]">•</span>
          {preset("Tik ekologiški", ECO)}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {TRAVEL_KINDS.map((k) => {
          const on = value.includes(k);
          const chosen = on && current === k;
          return (
            <button
              key={k}
              type="button"
              role="switch"
              aria-checked={on}
              onClick={() => toggle(k)}
              title={on ? "Neįtraukti" : "Įtraukti"}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-semibold transition ${
                chosen
                  ? "border-[var(--marking)] bg-[var(--marking)] text-white"
                  : on
                    ? "border-[#a7f3d0] bg-[var(--accent-soft)] text-[var(--ink)]"
                    : "border-[var(--line)] bg-[var(--panel)] text-[var(--muted)] line-through decoration-1 opacity-70"
              }`}
            >
              <span aria-hidden>{TRAVEL_META[k].icon}</span>
              {TRAVEL_META[k].label}
              {on && <span className={`h-1.5 w-1.5 rounded-full ${chosen ? "bg-white" : "bg-[var(--go)]"}`} />}
            </button>
          );
        })}
      </div>
    </section>
  );
}
