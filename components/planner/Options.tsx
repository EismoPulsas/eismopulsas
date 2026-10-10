"use client";

import { useRef } from "react";
import { isHybridId, type HybridSummary, type ModeId, type ModeSummary } from "@/lib/metrics";
import type { PlanResponse } from "@/lib/plan-types";
import { fmtClock, fmtCo2, fmtDurShort } from "./format";
import { HybridIcons, hybridTitle } from "./HybridCard";
import { ChevronIcon, ModeBadge } from "./icons";
import type { Signals } from "./Results";
import { fmtPrice, tripOf, tripPieces, type AnyOption, type Trip } from "./stages";

// The ways to make the trip, all drawn the same: icon(s), name, time, price · CO₂ and a bar
// of the stages. Single modes sit side by side; car + second leg combinations share one
// wide card with arrows, so many combinations never push the rest of the page down.

export type Tone = "go" | "wait" | "stop" | "blue" | "pink" | "cyan" | "muted";

export const TONE: Record<Tone, { bg: string; border: string; text: string; dot: string }> = {
  go: { bg: "#ecfdf5", border: "#a7f3d0", text: "#047857", dot: "#10b981" },
  wait: { bg: "#fffbeb", border: "#fde68a", text: "#b45309", dot: "#f59e0b" },
  stop: { bg: "#fef2f2", border: "#fecaca", text: "#dc2626", dot: "#ef4444" },
  blue: { bg: "#eff6ff", border: "#bfdbfe", text: "#1d4ed8", dot: "#3b82f6" },
  pink: { bg: "#fdf2f8", border: "#fbcfe8", text: "#be185d", dot: "#ec4899" },
  cyan: { bg: "#ecfeff", border: "#a5f3fc", text: "#0e7490", dot: "#06b6d4" },
  muted: { bg: "var(--chip)", border: "var(--line)", text: "var(--ink)", dot: "var(--muted)" },
};

const CARD_NAME: Record<ModeId, string> = {
  car: "Automobilis",
  transit: "Viešasis tr.",
  bikeshare: "Cyclocity",
  scooter: "Paspirtukas",
  bike: "Dviratis",
  walk: "Pėsčiomis",
};
const ORDER: ModeId[] = ["car", "transit", "bikeshare", "scooter", "bike", "walk"];

export function optionName(plan: PlanResponse, o: AnyOption): string {
  if (isHybridId(o.id)) return hybridTitle(o as HybridSummary);
  if (o.id === "scooter" && plan.scooter?.source === "own") return "Savas paspirtukas";
  return CARD_NAME[o.id as ModeId];
}

function tagOf(plan: PlanResponse, o: AnyOption, best: boolean): { text: string; tone: Tone } | null {
  if (best) return { text: "TOP", tone: "go" };
  if (isHybridId(o.id)) {
    const h = o as HybridSummary;
    if (h.hybrid.second.kind === "scooter" && h.hybrid.second.scooter.source === "demo") return { text: "DEMO", tone: "pink" };
    return h.parking.charge ? { text: `+${h.parking.charge.kWh} kWh`, tone: "cyan" } : null;
  }
  if (o.id === "car" && plan.car) {
    const d = plan.car.drive.traffic.delaySeconds;
    return d !== null && d > 120 ? { text: "Spūstys", tone: "stop" } : null;
  }
  if (o.id === "transit") {
    const ride = plan.transit?.legs.find((l) => l.kind === "ride");
    return ride && ride.kind === "ride" && ride.route.short ? { text: ride.route.short, tone: "blue" } : null;
  }
  if (o.id === "scooter" && plan.scooter?.source === "demo") return { text: "DEMO", tone: "pink" };
  return null;
}

function Tag({ tag }: { tag: { text: string; tone: Tone } }) {
  return (
    <span className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold" style={{ background: TONE[tag.tone].bg, color: TONE[tag.tone].text }}>
      {tag.text}
    </span>
  );
}

/** Time, then price · CO₂ (red when the worst of all options). */
function Numbers({ o, sig, on, align = "left" }: { o: AnyOption; sig: Signals; on: boolean; align?: "left" | "right" }) {
  return (
    <span className={`flex flex-col ${align === "right" ? "items-end" : "items-start"}`}>
      <span className={`font-mono text-[15px] leading-tight font-semibold ${on ? "text-[var(--marking)]" : ""}`}>{fmtDurShort(o.duration)}</span>
      <span className="mt-0.5 font-mono text-[10.5px] whitespace-nowrap text-[var(--muted)]">
        <span style={{ color: sig.cost.get(o.id) === "stop" ? TONE.stop.text : undefined }}>{fmtPrice(o.cost, o.costUnknown)}</span>
        {" · "}
        <span style={{ color: sig.co2.get(o.id) === "stop" ? TONE.stop.text : undefined }}>{o.co2 < 0.001 ? "0 g" : fmtCo2(o.co2)}</span>
      </span>
    </span>
  );
}

/** The stages as one bar: widths follow the minutes, walks are dashed, waits are gaps. */
export function LegBar({ trip, className = "" }: { trip: Trip; className?: string }) {
  return (
    <span className={`flex h-1.5 w-full gap-[2px] overflow-hidden rounded-full ${className}`} aria-hidden>
      {tripPieces(trip).map((p, i) => (
        <span
          key={i}
          className="min-w-[3px] rounded-full"
          style={{
            flexGrow: p.sec,
            background: p.walk ? `repeating-linear-gradient(90deg, ${p.color} 0 3px, transparent 3px 6px)` : p.wait ? "repeating-linear-gradient(90deg, var(--line) 0 2px, transparent 2px 5px)" : p.color,
          }}
        />
      ))}
    </span>
  );
}

const cardClass = (on: boolean) =>
  on ? "border-2 border-[var(--marking)] shadow-[0_4px_14px_rgba(5,150,105,0.15)]" : "border border-[var(--line)] hover:border-[#cbd5e1]";

/** Every single way to make the trip, side by side: the recommended one first. */
export function OptionTiles({
  plan,
  modes,
  best,
  selected,
  sig,
  onSelect,
}: {
  plan: PlanResponse;
  modes: ModeSummary[];
  best: string | null;
  selected: string | null;
  sig: Signals;
  onSelect: (m: ModeId) => void;
}) {
  const sorted = [...modes].sort((a, b) => (a.id === best ? -1 : b.id === best ? 1 : ORDER.indexOf(a.id) - ORDER.indexOf(b.id)));
  const cols = sorted.length === 4 ? "lg:grid-cols-4" : sorted.length <= 2 ? "lg:grid-cols-2" : "lg:grid-cols-3";
  return (
    <div className={`-mx-3 flex snap-x gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] lg:mx-0 lg:grid lg:overflow-visible lg:px-0 lg:pb-0 ${cols}`}>
      {sorted.map((m) => {
        const on = m.id === selected;
        const tag = tagOf(plan, m, m.id === best);
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onSelect(m.id)}
            aria-pressed={on}
            className={`flex min-w-[124px] shrink-0 snap-start flex-col items-start gap-2 rounded-2xl bg-[var(--panel)] text-left transition lg:min-w-0 ${cardClass(on)} ${on ? "p-[11px]" : "p-3"}`}
          >
            <span className="flex w-full items-start justify-between gap-1">
              <ModeBadge mode={m.id} size={26} />
              {tag && <Tag tag={tag} />}
            </span>
            <span className="flex flex-col">
              <span className="text-sm font-semibold">{optionName(plan, m)}</span>
              <Numbers o={m} sig={sig} on={on} />
            </span>
            <LegBar trip={tripOf(plan, m)} />
          </button>
        );
      })}
    </div>
  );
}

/** Car part of the way + something else: one card, arrows to flip through the combinations. */
export function HybridCarousel({
  plan,
  items,
  index,
  onIndex,
  best,
  selected,
  sig,
  onSelect,
}: {
  plan: PlanResponse;
  items: HybridSummary[];
  index: number;
  onIndex: (i: number) => void;
  best: string | null;
  selected: string | null;
  sig: Signals;
  onSelect: (h: HybridSummary) => void;
}) {
  const touch = useRef<number | null>(null);
  if (!items.length) return null;
  const i = Math.min(index, items.length - 1);
  const h = items[i];
  const on = h.id === selected;
  const tag = tagOf(plan, h, h.id === best);
  const go = (d: number) => onIndex((i + d + items.length) % items.length);
  const many = items.length > 1;
  return (
    <section
      aria-roledescription="karuselė"
      aria-label="Deriniai su automobiliu"
      className={`rounded-2xl bg-[var(--panel)] transition ${cardClass(on)}`}
      onKeyDown={(e) => {
        if (!many) return;
        if (e.key === "ArrowRight") go(1);
        if (e.key === "ArrowLeft") go(-1);
      }}
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        const x0 = touch.current;
        touch.current = null;
        const dx = x0 == null ? 0 : e.changedTouches[0].clientX - x0;
        if (many && Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
      }}
    >
      <div className={`flex items-center gap-2 px-3 ${on ? "pt-[9px]" : "pt-2.5"}`}>
        <span className="text-[11px] font-semibold tracking-wide text-[var(--muted)] uppercase">Dalį kelio automobiliu</span>
        {many && (
          <span className="ml-auto flex items-center gap-0.5">
            <button type="button" onClick={() => go(-1)} className="grid h-7 w-7 place-items-center rounded-full text-[var(--muted)] hover:bg-[var(--chip)] hover:text-[var(--ink)]" aria-label="Ankstesnis derinys">
              <ChevronIcon className="rotate-90" />
            </button>
            <span className="tnum min-w-[34px] text-center text-xs text-[var(--muted)]" aria-live="polite">
              {i + 1} / {items.length}
            </span>
            <button type="button" onClick={() => go(1)} className="grid h-7 w-7 place-items-center rounded-full text-[var(--muted)] hover:bg-[var(--chip)] hover:text-[var(--ink)]" aria-label="Kitas derinys">
              <ChevronIcon className="-rotate-90" />
            </button>
          </span>
        )}
      </div>
      <button type="button" onClick={() => onSelect(h)} aria-pressed={on} className={`flex w-full flex-col gap-2 px-3 pt-1.5 text-left ${on ? "pb-[11px]" : "pb-3"}`}>
        <span className="flex w-full items-center gap-2.5">
          <HybridIcons h={h} size={22} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold">{hybridTitle(h)}</span>
              {tag && <Tag tag={tag} />}
            </span>
            <span className="block truncate text-xs text-[var(--muted)]">
              {h.hybrid.hub.name} · atvyksite {fmtClock(h.hybrid.arrive)}
            </span>
          </span>
          <Numbers o={h} sig={sig} on={on} align="right" />
        </span>
        <LegBar trip={tripOf(plan, h)} />
      </button>
    </section>
  );
}
