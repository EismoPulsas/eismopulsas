"use client";

import { fmtStay, isEv, parkingEvals, prefersCharge, type ParkingEval, type Settings } from "@/lib/metrics";
import type { PlanResponse } from "@/lib/plan-types";
import { fmtEur } from "./format";
import { FREE_STREET, LOT_CLASS, lotClass, ZONE_COLOR } from "./parking-meta";

/** Parking choice for the car option, owned by the planner. */
export type ParkingChoiceProps = { settings: Settings; parkingId: string | null; onParking: (id: string) => void; updating?: boolean; error?: string | null };

export type Signal = "go" | "wait" | "stop";
/** Traffic-light colour per option id for time, price and CO₂. */
export type Signals = Record<"duration" | "cost" | "co2", Map<string, Signal>>;

/** Green for the best value, red for the worst, amber in between (single modes and car combinations alike). */
export function signals(modes: { id: string; feasible: boolean; duration: number; cost: number; co2: number }[], key: "duration" | "cost" | "co2"): Map<string, Signal> {
  const ok = modes.filter((m) => m.feasible);
  const vals = ok.map((m) => m[key]);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const out = new Map<string, Signal>();
  for (const m of ok) {
    const v = m[key];
    out.set(m.id, hi - lo < 1e-6 || v - lo <= (hi - lo) * 0.15 ? "go" : v >= hi - (hi - lo) * 0.15 ? "stop" : "wait");
  }
  return out;
}

export function Row({ label, value, muted }: { label: React.ReactNode; value: React.ReactNode; muted?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 text-sm ${muted ? "text-[var(--muted)]" : ""}`}>
      <span className="min-w-0">{label}</span>
      <span className="tnum shrink-0 font-medium">{value}</span>
    </div>
  );
}

const CHANCE_SIGNAL = { high: "go", mid: "wait", low: "stop" } as const;

/** The chosen place first, then the rest by walking distance. */
const byChoice = (chosenId: string | undefined) => (a: ParkingEval, b: ParkingEval) =>
  a.option.id === chosenId ? -1 : b.option.id === chosenId ? 1 : a.option.walk - b.option.walk;

/**
 * Where to leave the car near B: price for the stay, walk, chance of a space; one is chosen.
 * An EV sees two lists: places where it can also charge, and places just to park.
 */
export function ParkingChoice({ plan, chosen, settings, parkingId, onParking }: ParkingChoiceProps & { plan: PlanResponse; chosen: ParkingEval | null }) {
  const evals = parkingEvals(plan, settings);
  const auto = parkingId == null;
  const order = byChoice(chosen?.option.id);
  const groups: { title: string | null; rows: ParkingEval[] }[] = isEv(settings)
    ? [
        { title: "Galite ir pasikrauti", rows: evals.filter((e) => e.charge).sort(order).slice(0, 4) },
        // A charging point whose plugs do not fit is no place to park either.
        { title: "Tik pastatyti", rows: evals.filter((e) => !e.charge && e.option.kind !== "charger").sort(order).slice(0, 5) },
      ]
    : [{ title: null, rows: [...evals].sort(order).slice(0, 7) }];
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">Kur palikti automobilį</span>
        <span className="text-[11px] text-[var(--muted)]">{fmtStay(Math.round(settings.parkingHours * 60))} stovėjimas</span>
      </div>
      {groups.map((g) => (
        <div key={g.title ?? "all"} className="flex flex-col gap-1">
          {g.title && (
            <span className="mt-1 flex items-center gap-1 text-xs font-semibold">
              {g.title === "Galite ir pasikrauti" && <span aria-hidden>⚡</span>}
              {g.title}
            </span>
          )}
          {g.rows.length ? (
            <ul className="flex flex-col gap-1" role="radiogroup" aria-label={g.title ?? "Kur palikti automobilį"}>
              {g.rows.map((e) => (
                <ParkingRow key={e.option.id} e={e} on={e.option.id === chosen?.option.id} onParking={onParking} />
              ))}
            </ul>
          ) : (
            <p className="text-xs text-[var(--muted)]">Netoli tikslo jūsų jungčiai tinkančių įkrovimo vietų neradome.</p>
          )}
        </div>
      ))}
      <p className="text-[11px] leading-relaxed text-[var(--muted)]">
        {auto ? `Parinkta pagal prioritetą: kaina, ėjimas ir tikimybė rasti vietą${prefersCharge(settings) ? ", ilgiau stovint – ir įkrovimas" : ""}. ` : ""}
        Kainos – pagal paskelbtus tarifus (JUDU, UNIPARK, prekybos centrai, OpenStreetMap). „?“ – taisyklės nežinomos, tokia vieta automatiškai nesiūloma.
      </p>
    </div>
  );
}

function ParkingRow({ e, on, onParking }: { e: ParkingEval; on: boolean; onParking: (id: string) => void }) {
  const o = e.option;
  // The colour says what the stay costs here and now: free places are never drawn as paid, nor the reverse.
  const dot =
    o.kind === "lot" && o.lot
      ? e.cost === 0
        ? LOT_CLASS.free.color
        : LOT_CLASS[lotClass(o.lot)].color
      : o.kind === "charger"
        ? "#22d3ee"
        : o.zone && e.cost !== 0
          ? (ZONE_COLOR[o.zone.zone] ?? "#999")
          : FREE_STREET;
  return (
    <li>
      <button
        type="button"
        role="radio"
        aria-checked={on}
        disabled={!e.usable}
        onClick={() => onParking(o.id)}
        className={`flex w-full items-start gap-2.5 rounded-xl border px-2.5 py-2 text-left transition ${on ? "border-[var(--car)] bg-[var(--chip)]" : "border-[var(--line)] hover:bg-[var(--chip)]"} ${e.usable ? "" : "opacity-50"}`}
      >
        <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: dot }} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {o.name}
            {e.charge && <span className="ml-1 text-xs text-[var(--muted)]">⚡ {e.charge.kW} kW</span>}
          </span>
          <span className="block text-xs text-[var(--muted)]">
            {o.walk > 0 ? `${Math.max(1, Math.round(e.walkSec / 60))} min pėsčiomis` : "prie pat tikslo"}
            {!e.usable && e.why ? ` · ${e.why}` : e.costNote ? ` · ${e.costNote}` : ""}
          </span>
          {e.chanceText && (
            <span className="mt-0.5 flex items-center gap-1.5 text-xs">
              {e.chance && <span className={`signal ${CHANCE_SIGNAL[e.chance]}`} aria-hidden />}
              {e.chanceText}
            </span>
          )}
          {e.charge && (
            <span className="block text-xs text-[var(--muted)]">
              Įkrausite iki ~{e.charge.kWh} kWh (≈ {e.charge.km} km){e.charge.cost != null ? `, ~${fmtEur(e.charge.cost)}` : ""}
            </span>
          )}
        </span>
        <span className="tnum shrink-0 text-sm font-semibold">{e.cost == null ? "?" : e.cost === 0 ? "0 €" : fmtEur(e.cost)}</span>
      </button>
    </li>
  );
}
