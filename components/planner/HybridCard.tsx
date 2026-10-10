"use client";

import { useState } from "react";
import { wazeUrl } from "@/lib/driving";
import type { HybridSummary, ModeSummary } from "@/lib/metrics";
import type { HybridOption, PlanResponse } from "@/lib/plan-types";
import { fmtStayHours, STAY_CHOICES, type StayEstimate } from "@/lib/stay";
import { fmtClock, fmtCo2, fmtDur, fmtDurShort, fmtEur, fmtKm, MODE_META } from "./format";
import { ChevronIcon, ClockIcon, CoinIcon, LeafIcon, ModeBadge, WalkIcon } from "./icons";
import { Metric, Row, TransitTimeline, type Signals } from "./Results";

// Car + second leg ("deriniai"): the card ranks in the same list as the single modes.
// Anatomy: icon trio (car · where the car stays · next vehicle), title, hub + arrival,
// a leg bar whose widths follow the minutes, then the same time / price / CO₂ row.

const CHANCE_SIGNAL = { high: "go", mid: "wait", low: "stop" } as const;
const SECOND_LABEL = { transit: "autobusas", bikeshare: "Cyclocity", scooter: "paspirtukas" } as const;
const SECOND_MODE = { transit: "transit", bikeshare: "bikeshare", scooter: "scooter" } as const;

/** "P+R", "⚡" (the car charges there) or "P". */
function hubTag(h: HybridSummary): "P+R" | "⚡" | "P" {
  if (h.hybrid.hub.lot?.t.flat || h.hybrid.hub.lot?.access === "pr") return "P+R";
  if (h.parking.charge) return "⚡";
  return "P";
}

export function hybridTitle(h: HybridSummary): string {
  const s = h.hybrid.second;
  const tag = hubTag(h);
  const next = s.kind === "transit" && s.transit.legs.some((l) => l.kind === "ride" && l.route.type === 11) ? "troleibusas" : SECOND_LABEL[s.kind];
  return `Auto + ${tag === "P+R" ? "P+R + " : tag === "⚡" ? "įkrovimas + " : ""}${next}`;
}

/** Car · P (or ⚡ / P+R) · next vehicle. */
export function HybridIcons({ h, size = 26 }: { h: HybridSummary; size?: number }) {
  const tag = hubTag(h);
  return (
    <span className="flex shrink-0 items-center gap-0.5" aria-hidden>
      <ModeBadge mode="car" size={size} />
      <span
        className="grid place-items-center rounded-[5px] font-display font-extrabold text-white"
        style={{ width: size * 0.8, height: size * 0.8, fontSize: tag === "P+R" ? size * 0.3 : size * 0.45, background: tag === "⚡" ? "#0e7490" : "var(--sign-blue)", boxShadow: "inset 0 0 0 1.5px rgba(255,255,255,.9)" }}
      >
        {tag}
      </span>
      <ModeBadge mode={SECOND_MODE[h.hybrid.second.kind]} size={size} />
    </span>
  );
}

type Piece = { sec: number; color: string; walk?: boolean; wait?: boolean };

/** Minutes of each part, in order: drive, park, walks, rides, waits. */
function pieces(h: HybridOption): Piece[] {
  const out: Piece[] = [{ sec: 120 + h.car.duration, color: MODE_META.car.color }, { sec: h.searchSec, color: "var(--sign-blue)" }];
  const s = h.second;
  const start = h.parkedAt + h.searchSec;
  if (s.kind === "transit") {
    let t = start;
    for (const l of s.transit.legs) {
      const from = l.kind === "ride" ? l.dep : l.start;
      const to = l.kind === "ride" ? l.arr : l.end;
      if (from > t + 30) out.push({ sec: from - t, color: "transparent", wait: true });
      out.push(l.kind === "ride" ? { sec: to - from, color: l.route.color || MODE_META.transit.color } : { sec: to - from, color: "#c9cfdb", walk: true });
      t = to;
    }
  } else if (s.kind === "bikeshare") {
    const b = s.bikeshare;
    out.push({ sec: b.walkTo / 1.25 + 60, color: "#c9cfdb", walk: true }, { sec: b.rideDuration, color: MODE_META.bikeshare.color }, { sec: 60 + b.walkFrom / 1.25, color: "#c9cfdb", walk: true });
  } else {
    const sc = s.scooter;
    out.push({ sec: (sc.vehicle ? sc.vehicle.walk / 1.25 : 180) + 30, color: "#c9cfdb", walk: true }, { sec: sc.rideDuration, color: MODE_META.scooter.color });
    out.push({ sec: 60 + (sc.endSpot ? sc.endSpot.walk / 1.25 : 0), color: "#c9cfdb", walk: true });
  }
  return out.filter((p) => p.sec > 0);
}

function LegBar({ h }: { h: HybridOption }) {
  return (
    <div className="flex h-1.5 w-full gap-[2px] overflow-hidden rounded-full" aria-hidden>
      {pieces(h).map((p, i) => (
        <span
          key={i}
          className="min-w-[3px] rounded-full"
          style={{
            flexGrow: p.sec,
            background: p.walk ? `repeating-linear-gradient(90deg, ${p.color} 0 3px, transparent 3px 6px)` : p.wait ? "repeating-linear-gradient(90deg, var(--line) 0 2px, transparent 2px 5px)" : p.color,
          }}
        />
      ))}
    </div>
  );
}

export function HybridCard({
  plan,
  h,
  car,
  isBest,
  open,
  sig,
  onSelect,
  details = true,
}: {
  plan: PlanResponse;
  h: HybridSummary;
  /** false: the chosen combination is shown in the trip card instead. */
  details?: boolean;
  /** The car-only option, for "what this saves". */
  car: ModeSummary | undefined;
  isBest: boolean;
  open: boolean;
  sig: Signals;
  onSelect: () => void;
}) {
  const o = h.hybrid;
  const demo = o.second.kind === "scooter" && o.second.scooter.source === "demo";
  return (
    <div
      className={`overflow-hidden rounded-2xl border transition ${open ? "bg-[var(--panel)]" : "bg-[var(--panel)]/70 hover:bg-[var(--panel)]"} ${h.feasible && !h.weatherWarning ? "" : "opacity-60"}`}
      style={{ borderColor: open ? MODE_META.car.color : "var(--line)" }}
    >
      <button type="button" onClick={onSelect} className="flex w-full flex-col gap-2 p-3 text-left" aria-expanded={open}>
        <span className="flex w-full items-center gap-3">
          <HybridIcons h={h} />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="font-display text-[15px] font-semibold">{hybridTitle(h)}</span>
              {demo && <span className="rounded bg-[#f472b6] px-1 text-[10px] font-bold text-black">DEMO</span>}
              {isBest && (
                <span className="rounded-md bg-[var(--sign-green)] px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white uppercase ring-1 ring-white/80">Geriausia</span>
              )}
            </span>
            <span className="block truncate text-xs text-[var(--muted)]">
              {h.feasible ? `${o.hub.name} · atvyksite ${fmtClock(o.arrive)}` : h.why}
            </span>
            {h.weatherWarning && <span className="mt-0.5 block truncate text-xs font-medium text-[var(--stop)]">{h.weatherWarning}</span>}
          </span>
          <span className="hidden shrink-0 text-right sm:block">
            <span className="tnum block font-display text-xl leading-none font-bold">≈ {fmtDur(h.duration)}</span>
          </span>
          <ChevronIcon className={`shrink-0 text-[var(--muted)] transition ${open ? "rotate-180" : ""}`} />
        </span>
        <LegBar h={o} />
        {h.parking.charge && <span className="self-start rounded-full bg-[#0e7490]/25 px-2 py-0.5 text-[11px] font-semibold text-[#67e8f9]">⚡ +{h.parking.charge.kWh} kWh kol stovi</span>}
      </button>
      <div className="grid grid-cols-3 gap-2 border-t border-[var(--line)]/70 px-3 py-2">
        <Metric icon={<ClockIcon />} value={fmtDurShort(h.duration)} signal={sig.duration.get(h.id)} label="Laikas" />
        <Metric icon={<CoinIcon />} value={h.cost < 0.005 ? "0 €" : fmtEur(h.cost)} signal={sig.cost.get(h.id)} label="Kaina (su grįžimu iki automobilio)" />
        <Metric icon={<LeafIcon />} value={h.co2 < 0.001 ? "0 g" : fmtCo2(h.co2)} signal={sig.co2.get(h.id)} label="CO₂" />
      </div>
      {open && details && <HybridDetails plan={plan} h={h} car={car} />}
    </div>
  );
}

function Step({ time, mark, children }: { time: number; mark: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="tnum w-12 shrink-0 pt-0.5 text-right text-xs font-semibold">{fmtClock(time)}</span>
      <span className="grid h-5 w-5 shrink-0 place-items-center">{mark}</span>
      <div className="min-w-0 flex-1 text-sm">{children}</div>
    </li>
  );
}

function HybridDetails({ plan, h, car }: { plan: PlanResponse; h: HybridSummary; car: ModeSummary | undefined }) {
  const o = h.hybrid;
  const s = o.second;
  const p = h.parking;
  const tag = hubTag(h);
  return (
    <div className="flex flex-col gap-3 border-t border-[var(--line)]/70 px-3 pt-3 pb-3.5">
      <ol className="flex flex-col gap-2.5">
        <Step time={plan.depart.sec} mark={<span className="h-3 w-3 rounded-full" style={{ background: MODE_META.car.color }} />}>
          <b>Važiuokite</b> {fmtKm(o.car.distance)} · ≈ {fmtDur(o.car.duration)}
          <div className="mt-1 flex flex-wrap gap-2">
            <a href={wazeUrl({ from: o.car.from, to: o.car.to })} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-[var(--sign-blue)] px-2.5 py-1 text-xs font-semibold text-white">
              Atidaryti Waze
            </a>
          </div>
          {o.hub.curb && <p className="mt-1 text-xs text-[var(--muted)]">↳ Privažiuosite iš tos pusės, kur stovėjimo vietos.</p>}
        </Step>
        <Step time={o.parkedAt} mark={<span className="grid h-5 w-5 place-items-center rounded bg-[var(--sign-blue)] text-[10px] font-extrabold text-white">{tag === "P+R" ? "P" : tag}</span>}>
          <b>Palikite automobilį:</b> {o.hub.name}
          <div className="text-xs text-[var(--muted)]">{p.costNote}</div>
          {p.chanceText && (
            <div className="mt-0.5 flex items-center gap-1.5 text-xs">
              {p.chance && <span className={`signal ${CHANCE_SIGNAL[p.chance]}`} aria-hidden />}
              {p.chanceText}
            </div>
          )}
          {p.charge && (
            <div className="mt-0.5 text-xs text-[#67e8f9]">
              ⚡ Kol stovi, įkrausite ~{p.charge.kWh} kWh (≈ {p.charge.km} km), {p.charge.plug.kW} kW {p.charge.plug.std}
            </div>
          )}
        </Step>
      </ol>

      {s.kind === "transit" && <TransitTimeline t={s.transit} />}
      {s.kind === "bikeshare" && (
        <div className="flex flex-col gap-1.5">
          <Row label={<span className="flex items-center gap-1.5"><WalkIcon size={15} /> Iki stotelės „{s.bikeshare.from.name}“</span>} value={`${fmtKm(s.bikeshare.walkTo)} · laisvų dviračių ${s.bikeshare.from.bikes ?? "?"}`} />
          <Row label={`Cyclocity ${fmtKm(s.bikeshare.ride)}`} value={fmtDur(s.bikeshare.rideDuration)} />
          <Row label={<span className="flex items-center gap-1.5"><WalkIcon size={15} /> Nuo „{s.bikeshare.to.name}“</span>} value={fmtKm(s.bikeshare.walkFrom)} />
          <Row label={<b>Atvykimas</b>} value={fmtClock(o.arrive)} />
        </div>
      )}
      {s.kind === "scooter" && (
        <div className="flex flex-col gap-1.5">
          <Row
            label={<span className="flex items-center gap-1.5"><WalkIcon size={15} /> {s.scooter.vehicle ? "Iki paspirtuko" : "Rasti paspirtuką"}</span>}
            value={s.scooter.vehicle ? fmtKm(s.scooter.vehicle.walk) : "≈ 3 min"}
          />
          <Row label={`Paspirtuku ${fmtKm(s.scooter.distance)}`} value={fmtDur(s.scooter.rideDuration)} />
          {s.scooter.endSpot && (
            <Row label={<span className="flex items-center gap-1.5"><WalkIcon size={15} /> Palikti „{s.scooter.endSpot.addr ?? "pažymėtoje vietoje"}“ (Senamiestyje – tik ten)</span>} value={fmtKm(s.scooter.endSpot.walk)} />
          )}
          <Row label={<b>Atvykimas</b>} value={fmtClock(o.arrive)} />
          {s.scooter.source === "demo" && <p className="rounded-lg border border-[#f472b6]/50 bg-[#f472b6]/10 p-2 text-xs">Paspirtukų vietos – DEMO duomenys, kol negauta prieiga prie operatoriaus srauto.</p>}
        </div>
      )}

      <HybridExtras h={h} car={car} />
    </div>
  );
}

/** Price breakdown, the comparison with driving all the way and the assumptions. */
export function HybridExtras({ h, car }: { h: HybridSummary; car: ModeSummary | undefined }) {
  const o = h.hybrid;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1 rounded-xl bg-[var(--chip)] p-2.5">
        {h.costLines.map((l, i) => (
          <Row
            key={i}
            muted={l.info}
            label={
              <span>
                {l.label}
                {l.note && <span className="text-xs text-[var(--muted)]"> · {l.note}</span>}
              </span>
            }
            value={l.info ? `(${fmtEur(l.value)})` : `${l.approx ? "≈ " : ""}${fmtEur(l.value)}`}
          />
        ))}
        <Row label={<b>Iš viso</b>} value={<b>{fmtEur(h.cost)}</b>} />
      </div>

      {car?.feasible && <WhyLine h={h} car={car} />}
      <p className="text-[11px] leading-relaxed text-[var(--muted)]">
        ≈ Važiavimas iki persėdimo vietos įvertintas pagal OSRM maršrutą ir dabartinį eismą kelyje A → B. Automobilis liks „{o.hub.name}“ – grįždami iki jo, tą pačią atkarpą
        įveiksite atgal (įskaičiuota į kainą).
      </p>
    </div>
  );
}

/** One line on why this beats (or not) driving all the way. */
function WhyLine({ h, car }: { h: HybridSummary; car: ModeSummary }) {
  const money = car.cost - h.cost;
  const co2 = car.co2 - h.co2;
  const time = h.duration - car.duration;
  const parts = [
    Math.abs(money) >= 0.5 ? `${money > 0 ? "−" : "+"}${fmtEur(Math.abs(money))}` : null,
    Math.abs(co2) >= 0.05 ? `${co2 > 0 ? "−" : "+"}${fmtCo2(Math.abs(co2))} CO₂` : null,
    Math.abs(time) >= 60 ? `${time > 0 ? "+" : "−"}${fmtDur(Math.abs(time))}` : "tiek pat laiko",
  ].filter(Boolean);
  return (
    <p className="rounded-lg border border-[var(--line)] px-2.5 py-2 text-xs">
      <b>Palyginti su automobiliu iki pat tikslo:</b> {parts.join(" · ")}
      {h.parking.charge ? " · automobilis bus įkrautas" : ""}
    </p>
  );
}

/** The other combinations, folded behind one line; a picked one opens as a full card. */
export function MoreHybrids({ items, render, selected, onSelect }: { items: HybridSummary[]; render: (h: HybridSummary) => React.ReactNode; selected: string | null; onSelect: (id: HybridSummary["id"]) => void }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  const shown = open || items.some((h) => h.id === selected);
  return (
    <div className="flex flex-col gap-1.5">
      <button type="button" onClick={() => setOpen(!shown)} className="flex items-center gap-1.5 self-start text-sm font-semibold text-[var(--muted)] hover:text-[var(--ink)]" aria-expanded={shown}>
        <ChevronIcon className={`transition ${shown ? "" : "-rotate-90"}`} />
        Kiti deriniai su automobiliu ({items.length})
      </button>
      {shown &&
        items.map((h) =>
          h.id === selected ? (
            <div key={h.id}>{render(h)}</div>
          ) : (
            <button
              key={h.id}
              type="button"
              onClick={() => onSelect(h.id)}
              className={`flex items-center gap-2.5 rounded-xl border border-[var(--line)] px-2.5 py-2 text-left hover:bg-[var(--chip)] ${h.feasible ? "" : "opacity-60"}`}
            >
              <HybridIcons h={h} size={20} />
              <span className="min-w-0 flex-1 truncate text-sm">{h.hybrid.hub.name}</span>
              <span className="tnum shrink-0 text-sm font-semibold">
                {fmtDurShort(h.duration)} · {h.cost < 0.005 ? "0 €" : fmtEur(h.cost)}
              </span>
            </button>
          ),
        )}
    </div>
  );
}

/** Phones: the best combination as one more chip in the strip. */
export function HybridChip({ h, best, selected, onSelect }: { h: HybridSummary; best: boolean; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`relative flex shrink-0 snap-start items-center gap-2 rounded-2xl border px-2.5 py-2 text-left ${h.feasible && !h.weatherWarning ? "" : "opacity-50"}`}
      style={{ borderColor: selected ? MODE_META.car.color : "var(--line)", background: "var(--panel)" }}
    >
      <HybridIcons h={h} size={18} />
      <span>
        <span className="tnum block font-display text-[15px] leading-tight font-bold">{fmtDurShort(h.duration)}</span>
        <span className="tnum block text-[11px] text-[var(--muted)]">{h.cost < 0.005 ? "0 €" : fmtEur(h.cost)} · Derinys</span>
      </span>
      {best && <span className="absolute -top-1.5 right-2 rounded bg-[var(--sign-green)] px-1 text-[9px] font-bold text-white uppercase ring-1 ring-white/80">Geriausia</span>}
    </button>
  );
}

/** How long the car will stand at B, as one quiet line; "keisti" reveals the choices. */
export function StayLine({ stay, onPick }: { stay: StayEstimate; onPick: (hours: number) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-sm">
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-[var(--sign-blue)] text-[11px] font-extrabold text-white" aria-hidden>
          P
        </span>
        <span className="min-w-0 flex-1 truncate">
          Automobilis stovės <b>~{fmtStayHours(stay.hours)}</b> <span className="text-[var(--muted)]">· {stay.reason}</span>
        </span>
        <button type="button" onClick={() => setOpen(!open)} className="shrink-0 text-xs font-semibold text-[var(--marking)]" aria-expanded={open}>
          {open ? "gerai" : "keisti"}
        </button>
      </div>
      {open && (
        <div className="seg">
          {STAY_CHOICES.map((c) => (
            <button
              key={c.hours}
              type="button"
              aria-pressed={Math.abs(stay.hours - c.hours) < 0.01}
              onClick={() => {
                onPick(c.hours);
                setOpen(false);
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
