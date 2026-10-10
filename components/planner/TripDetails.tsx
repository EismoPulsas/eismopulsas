"use client";

import { useState } from "react";
import { isHybridId, type ModeSummary } from "@/lib/metrics";
import type { PlanResponse } from "@/lib/plan-types";
import { CarDriveDetails } from "./CarDriveDetails";
import { fmtClock, fmtCo2, fmtDur, fmtDurShort, fmtEur, fmtKm, fmtNum } from "./format";
import { BikeIcon, BikeshareIcon, BusIcon, CarIcon, ChevronIcon, FerryIcon, ScooterIcon, TrolleyIcon, WalkIcon } from "./icons";
import { TONE, type Tone } from "./Options";
import { ParkingChoice, Row, type ParkingChoiceProps } from "./Results";
import { fmtPrice, tripOf, type AnyOption, type Stage, type StageIcon } from "./stages";

// The chosen way, whatever it is, shown the same: its stages one under another (time, what to
// do, a few facts, a button opening that stage in Waze or Google Maps), then the price.

const GLYPH: Record<Exclude<StageIcon, "park">, (p: { size?: number }) => React.ReactNode> = {
  car: CarIcon,
  walk: WalkIcon,
  bus: BusIcon,
  train: BusIcon,
  trolley: TrolleyIcon,
  ferry: FerryIcon,
  bikeshare: BikeshareIcon,
  bike: BikeIcon,
  scooter: ScooterIcon,
};

const NOTE_TONE: Record<NonNullable<Stage["note"]>["tone"], Tone> = { warn: "wait", info: "muted", demo: "pink", charge: "cyan" };

function StageMark({ s }: { s: Stage }) {
  const Glyph = s.icon === "park" ? null : GLYPH[s.icon];
  return (
    <span className="z-10 grid h-[22px] w-[22px] place-items-center rounded-full text-white ring-[3px] ring-[var(--panel)]" style={{ background: s.walk ? "#64748b" : s.color }}>
      {Glyph ? <Glyph size={13} /> : <b className="font-display text-[11px] leading-none">P</b>}
    </span>
  );
}

function NavPill({ nav, title }: { nav: NonNullable<Stage["nav"]>; title: string }) {
  const waze = nav.app === "Waze";
  return (
    <a
      href={nav.href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${title} – atidaryti ${nav.app}`}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap transition ${
        waze ? "bg-[var(--sign-blue)] text-white hover:brightness-110" : "border border-[var(--line)] bg-[var(--panel)] hover:bg-[var(--chip)]"
      }`}
    >
      {waze ? "Waze" : "Maps"}
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M7 17 17 7M9 7h8v8" />
      </svg>
    </a>
  );
}

function StageRow({ s, children }: { s: Stage; children?: React.ReactNode }) {
  const note = s.note ? TONE[NOTE_TONE[s.note.tone]] : null;
  return (
    <li className="grid grid-cols-[40px_22px_minmax(0,1fr)_auto] gap-x-2.5">
      <span className="tnum pt-[3px] text-right text-xs font-semibold">{fmtClock(s.at)}</span>
      <span className="relative flex justify-center">
        <StageMark s={s} />
        <span
          className="absolute top-[22px] -bottom-[2px] w-[3px] rounded-full"
          style={{ background: s.walk ? "repeating-linear-gradient(180deg, #94a3b8 0 4px, transparent 4px 8px)" : s.color }}
          aria-hidden
        />
      </span>
      <div className="min-w-0 pb-4">
        <div className="flex min-w-0 items-start gap-1.5">
          {s.badge && (
            <span className="mt-px shrink-0 rounded px-1.5 text-xs leading-[18px] font-bold text-white" style={{ background: s.badge.color }}>
              {s.badge.text}
            </span>
          )}
          <span className="text-sm leading-snug font-semibold">{s.title}</span>
        </div>
        <p className="mt-0.5 text-xs leading-snug text-[var(--muted)]">{s.facts.join(" · ")}</p>
        {s.note && note && (
          <p className="mt-1.5 inline-block rounded-md border px-2 py-0.5 text-xs" style={{ background: note.bg, borderColor: note.border, color: note.text }}>
            {s.note.text}
          </p>
        )}
        {children}
      </div>
      <span className="pt-px">{s.nav && <NavPill nav={s.nav} title={s.title} />}</span>
    </li>
  );
}

/** A quiet toggle under a stage for what most people never need to see. */
function More({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1.5">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex items-center gap-1 text-xs font-semibold text-[var(--marking)]">
        {label}
        <ChevronIcon size={14} className={`transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="mt-2 rounded-xl border border-[var(--line)] p-2.5">{children}</div>}
    </div>
  );
}

function Price({ o }: { o: AnyOption }) {
  const [open, setOpen] = useState(false);
  const lines = o.costLines;
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl bg-[var(--chip)] p-3">
      <button type="button" onClick={() => setOpen(!open)} disabled={!lines.length} aria-expanded={open} className="flex items-center justify-between gap-3 text-left">
        <span className="text-sm">
          Kaina
          <span className="text-xs text-[var(--muted)]">
            {" "}
            · CO₂ {o.co2 < 0.001 ? "0 g" : fmtCo2(o.co2)}
            {o.kcal >= 20 ? ` · ≈ ${fmtNum(o.kcal)} kcal` : ""}
          </span>
        </span>
        <span className="flex items-center gap-1 text-sm font-semibold tnum">
          {fmtPrice(o.cost, o.costUnknown)}
          {lines.length > 0 && <ChevronIcon size={14} className={`text-[var(--muted)] transition ${open ? "rotate-180" : ""}`} />}
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-1 border-t border-[var(--line)] pt-1.5">
          {lines.map((l, i) => (
            <Row
              key={i}
              muted={l.info}
              label={
                <span className="text-[13px]">
                  {l.label}
                  {l.note && <span className="text-xs text-[var(--muted)]"> · {l.note}</span>}
                </span>
              }
              value={l.unknown ? "nežinoma" : l.info ? `(${fmtEur(l.value)})` : `${l.approx ? "≈ " : ""}${fmtEur(l.value)}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Money, CO₂ and minutes against driving all the way, as three small chips. */
function VsCar({ o, car }: { o: AnyOption; car: ModeSummary }) {
  const money = car.cost - o.cost;
  const co2 = car.co2 - o.co2;
  const time = o.duration - car.duration;
  const chips: { text: string; good: boolean }[] = [];
  if (Math.abs(money) >= 0.5) chips.push({ text: `${money > 0 ? "−" : "+"}${fmtEur(Math.abs(money))}${car.costUnknown && money > 0 ? " ar daugiau" : ""}`, good: money > 0 });
  if (Math.abs(co2) >= 0.05) chips.push({ text: `${co2 > 0 ? "−" : "+"}${fmtCo2(Math.abs(co2))} CO₂`, good: co2 > 0 });
  chips.push(Math.abs(time) >= 60 ? { text: `${time > 0 ? "+" : "−"}${fmtDur(Math.abs(time))}`, good: time < 0 } : { text: "tiek pat laiko", good: true });
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-[var(--muted)]">Lyginant su automobiliu:</span>
      {chips.map((c) => (
        <span key={c.text} className="rounded-full border px-2 py-0.5 font-medium tnum" style={{ background: TONE[c.good ? "go" : "stop"].bg, borderColor: TONE[c.good ? "go" : "stop"].border, color: TONE[c.good ? "go" : "stop"].text }}>
          {c.text}
        </span>
      ))}
    </div>
  );
}

/** Small print for the chosen way: data freshness, the next departure, estimates. */
function notesFor(plan: PlanResponse, o: AnyOption, hybridNote: string | null): string[] {
  const out: string[] = [];
  if (isHybridId(o.id)) {
    out.push("Kaina apima ir grįžimą iki automobilio.");
    if (hybridNote) out.push(hybridNote);
  } else if (o.id === "transit" && plan.transit) {
    const t = plan.transit;
    out.push(`${t.transfers ? `Persėdimų: ${t.transfers}` : "Be persėdimų"}${t.next ? ` · kitas reisas – išeiti ${fmtClock(t.next)}` : ""}.`);
  } else if (o.id === "bikeshare" && plan.bikeshare) {
    out.push(plan.bikeshare.live ? "Laisvi dviračiai ir vietos – gyvi Cyclocity duomenys." : "Kitam laikui – laisvų dviračių ir vietų skaičius gali skirtis.");
  } else if (o.id === "scooter" && plan.scooter?.source === "estimate") {
    out.push("Paspirtuko vieta – vertinimas: operatoriai Lietuvoje neskelbia atvirų duomenų. Nuomos kainą galite pasikeisti nustatymuose.");
  }
  if (o.costUnknown) out.push("„≥“ – dalies kainos nežinome (pvz. stovėjimo vietos taisyklės neskelbiamos), todėl ji neįskaičiuota.");
  return out;
}

export function TripDetails({
  plan,
  option: o,
  car,
  toLabel,
  parking,
  hybridNote,
}: {
  plan: PlanResponse;
  option: AnyOption;
  /** Driving all the way, for the comparison (absent when the car is not an option). */
  car: ModeSummary | undefined;
  toLabel: string;
  parking: ParkingChoiceProps;
  hybridNote: string | null;
}) {
  const trip = tripOf(plan, o);
  const carMode = o.id === "car" ? (o as ModeSummary) : null;
  const notes = notesFor(plan, o, hybridNote);
  return (
    <section className="flex flex-col gap-3" aria-label="Maršruto etapai">
      <div className="flex items-baseline gap-2">
        <h2 className="font-display text-[15px] font-bold tracking-wide uppercase">Maršruto etapai</h2>
        <span className="ml-auto font-mono text-sm text-[var(--muted)]">
          {fmtKm(o.distance)} · {fmtDurShort(o.duration)}
        </span>
      </div>
      <ol className="flex flex-col">
        {trip.stages.map((s, i) => (
          <StageRow key={i} s={s}>
            {s.extra === "drive" && plan.car && (
              <More label="Eismo duomenys">
                <CarDriveDetails leg={plan.car.drive} parking={carMode?.parking?.option.kind === "zone" ? undefined : carMode?.parking?.option} updating={parking.updating} error={parking.error} />
              </More>
            )}
            {s.extra === "parking" && carMode && (plan.car?.parkingOptions.length ?? 0) > 1 && (
              <More label="Keisti vietą">
                <ParkingChoice plan={plan} chosen={carMode.parking ?? null} {...parking} />
              </More>
            )}
          </StageRow>
        ))}
        <li className="grid grid-cols-[40px_22px_minmax(0,1fr)] gap-x-2.5">
          <span className="tnum pt-[3px] text-right text-xs font-semibold">{fmtClock(trip.arrive)}</span>
          <span className="flex justify-center">
            <span className="grid h-[22px] w-[22px] place-items-center rounded-full bg-[#b4232f] font-display text-[11px] font-extrabold text-white ring-[3px] ring-[var(--panel)]">B</span>
          </span>
          <span className="min-w-0 truncate pt-[2px] text-sm font-semibold">
            Atvykimas <span className="font-normal text-[var(--muted)]">· {toLabel}</span>
          </span>
        </li>
      </ol>

      <Price o={o} />
      {car?.feasible && o.id !== "car" && <VsCar o={o} car={car} />}
      {notes.length > 0 && (
        <div className="flex flex-col gap-1 text-[11px] leading-relaxed text-[var(--muted)]">
          {notes.map((n) => (
            <p key={n}>{n}</p>
          ))}
        </div>
      )}
    </section>
  );
}
