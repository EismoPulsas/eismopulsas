"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { wazeNavigationUrl } from "@/lib/driving";
import type { LatLng } from "@/lib/geo";
import type { ModeId, ModeSummary } from "@/lib/metrics";
import type { PlanResponse } from "@/lib/plan-types";
import { DEMO } from "./demo";
import { fmtClock, fmtCo2, fmtDur, fmtDurShort, fmtEur, fmtKm, fmtNum, ROUTE_TYPE } from "./format";
import { ChevronIcon, ClockIcon, CoinIcon, FlameIcon, LeafIcon, ModeBadge } from "./icons";
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

function Chip({ text, tone, dot, mono }: { text: string; tone: Tone; dot?: boolean; mono?: boolean }) {
  const t = TONE[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${mono ? "font-mono" : ""}`}
      style={{ background: t.bg, borderColor: t.border, color: t.text }}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: t.dot }} />}
      {text}
    </span>
  );
}

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
            title={m.feasible ? undefined : m.why}
            className={`flex min-w-[124px] shrink-0 snap-start flex-col items-start rounded-2xl bg-[var(--panel)] text-left transition lg:min-w-0 ${
              on ? "border-2 border-[var(--marking)] p-[11px] shadow-[0_4px_14px_rgba(5,150,105,0.15)]" : "border border-[var(--line)] p-3 hover:border-[#cbd5e1]"
            } ${m.feasible ? "" : "opacity-50"}`}
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
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ impact tiles */

function Tile({ label, value, tone, icon }: { label: string; value: string; tone: Tone; icon: React.ReactNode }) {
  const t = TONE[tone];
  return (
    <div className="flex items-center gap-3 rounded-2xl border p-3.5" style={{ background: t.bg, borderColor: t.border }}>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/70" style={{ color: t.dot }}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold tracking-wide text-[var(--muted)] uppercase">{label}</span>
        <span className="block font-mono text-[13px] leading-tight font-semibold sm:text-[15px]" style={{ color: t.text }}>
          {value}
        </span>
      </span>
    </div>
  );
}

/** What the chosen way does for the climate and for you, against driving. */
export function ImpactTiles({ modes, sel }: { modes: ModeSummary[]; sel: ModeSummary }) {
  const car = modes.find((m) => m.id === "car" && m.feasible);
  const co2 =
    sel.id === "car"
      ? { label: "Išmesite CO₂", value: `${fmtCo2(sel.co2)} CO₂`, tone: "wait" as Tone }
      : car && car.co2 > sel.co2
        ? { label: "Sutaupyta CO₂", value: `−${fmtCo2(car.co2 - sel.co2)} CO₂`, tone: "go" as Tone }
        : { label: "CO₂", value: `${sel.co2 < 0.001 ? "0 g" : fmtCo2(sel.co2)} CO₂`, tone: "go" as Tone };
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <Tile {...co2} icon={<LeafIcon size={20} />} />
      {sel.kcal >= 5 ? (
        <Tile label="Sudeginsite" value={`≈ ${fmtNum(sel.kcal)} kcal`} tone="wait" icon={<FlameIcon size={20} />} />
      ) : (
        <Tile label="Kaina" value={sel.cost < 0.005 ? "0 €" : fmtEur(sel.cost)} tone="blue" icon={<CoinIcon size={20} />} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ steps */

type Chip = { text: string; tone: Tone; dot?: boolean; mono?: boolean };
type Step = { title: string; sub?: string; dur?: number; chips?: Chip[] };

const walkSec = (m: number) => m / 1.25;

function buildSteps(plan: PlanResponse, m: ModeSummary, toLabel: string): Step[] {
  const arrive: Step = { title: "Atvykimas", sub: toLabel };
  switch (m.id) {
    case "car": {
      const c = plan.car!;
      const p = m.parking;
      const d = c.drive.traffic.delaySeconds;
      return [
        {
          title: "Važiuoti automobiliu",
          sub: `${fmtKm(c.drive.distance)}${p ? ` iki „${p.option.name}“` : ""}`,
          dur: c.drive.duration,
          chips: [d !== null && d > 60 ? { text: `Spūstys +${fmtDur(d)}`, tone: "stop", dot: true } : { text: "Eismas laisvas", tone: "go", dot: true }],
        },
        p
          ? {
              title: `Pastatyti: ${p.option.name}`,
              sub: p.costNote || undefined,
              dur: p.searchSec,
              chips: [
                { text: p.cost == null ? "Kaina nežinoma" : p.cost === 0 ? "Nemokamai" : fmtEur(p.cost), tone: p.cost ? "wait" : "go", dot: true },
                ...(p.chanceText ? [{ text: p.chanceText, tone: "muted" as Tone }] : []),
              ],
            }
          : { title: "Rasti vietą automobiliui", dur: Math.max(0, c.overhead - 120) },
        { title: "Eiti iki tikslo", sub: p && p.option.walk > 0 ? `${fmtKm(p.option.walk)} pėsčiomis` : toLabel, dur: p?.walkSec },
      ];
    }
    case "transit": {
      const steps: Step[] = [];
      for (const l of plan.transit!.legs) {
        if (l.kind === "walk") {
          if (l.distance < 30) continue;
          steps.push({ title: l.toName ? `Eiti iki „${l.toName}“` : "Eiti iki tikslo", sub: fmtKm(l.distance), dur: l.end - l.start });
        } else {
          steps.push({
            title: `${ROUTE_TYPE[l.route.type] ?? "Maršrutas"} ${l.route.short} → ${l.headsign || l.route.long}`,
            sub: `${l.from.name} → ${l.to.name} · išvyksta ${fmtClock(l.dep)}`,
            dur: l.arr - l.dep,
            chips: [
              { text: `${l.stops} st.`, tone: "blue", mono: true },
              { text: `Išlipti ${fmtClock(l.arr)}`, tone: "muted", mono: true },
              ...(l.laneMeters > 100 ? [{ text: `A juosta ${fmtKm(l.laneMeters)}`, tone: "go" as Tone, dot: true }] : []),
            ],
          });
        }
      }
      return [...steps, arrive];
    }
    case "bikeshare": {
      const b = plan.bikeshare!;
      return [
        {
          title: `Paimti dviratį stotelėje „${b.from.name}“`,
          sub: `Cyclocity stotelė · ${fmtKm(b.walkTo)} pėsčiomis`,
          dur: walkSec(b.walkTo),
          chips: [{ text: b.from.bikes == null ? "Dviračių skaičius nežinomas" : `${b.from.bikes} laisvi dviračiai`, tone: "wait", dot: true }],
        },
        { title: `${fmtKm(b.ride)} dviračiu`, sub: DEMO.bikeRideNote, dur: b.rideDuration, chips: DEMO.bikeRideChips.map((text) => ({ text, tone: "muted" as Tone, mono: true })) },
        {
          title: `Pastatyti stotelėje „${b.to.name}“`,
          sub: `Tada ${fmtKm(b.walkFrom)} pėsčiomis iki tikslo`,
          dur: walkSec(b.walkFrom),
          chips: [{ text: b.to.docks == null ? "Vietų skaičius nežinomas" : `${b.to.docks} laisvos vietos`, tone: "go", dot: true }],
        },
      ];
    }
    case "scooter": {
      const s = plan.scooter!;
      const v = s.vehicle;
      return [
        v
          ? {
              title: "Eiti iki paspirtuko",
              sub: `${fmtKm(v.walk)}${s.operator ? ` · ${s.operator}` : ""}`,
              dur: walkSec(v.walk),
              chips: [...(v.battery !== null ? [{ text: `Baterija ${v.battery} %`, tone: (v.battery < 25 ? "stop" : "go") as Tone, dot: true }] : []), ...(s.source === "demo" ? [{ text: "DEMO", tone: "pink" as Tone }] : [])],
            }
          : { title: "Rasti ir atrakinti paspirtuką", sub: "Artimiausio paspirtuko vieta nežinoma", dur: 180 },
        { title: `${fmtKm(s.distance)} paspirtuku`, sub: DEMO.scooterRideNote, dur: s.rideDuration },
        { title: "Pastatyti paspirtuką", sub: toLabel, dur: 60 },
      ];
    }
    case "bike":
      return [{ title: `${fmtKm(m.distance)} dviračiu`, sub: DEMO.bikeRideNote, dur: m.duration, chips: DEMO.bikeRideChips.map((text) => ({ text, tone: "muted" as Tone, mono: true })) }, arrive];
    case "walk":
      return [{ title: `${fmtKm(m.distance)} pėsčiomis`, dur: m.duration }, arrive];
  }
}

const STEP_COLOR = (i: number, n: number) => (i === 0 ? "#f59e0b" : i === n - 1 ? "#ef4444" : "#10b981");

/** The chosen way, leg by leg. */
export function RouteSteps({ plan, mode, toLabel }: { plan: PlanResponse; mode: ModeSummary; toLabel: string }) {
  const [open, setOpen] = useState(true);
  const steps = buildSteps(plan, mode, toLabel);
  return (
    <section className="flex flex-col gap-3">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex items-center gap-2 text-left">
        <ChevronIcon className={`shrink-0 text-[var(--marking)] transition ${open ? "" : "-rotate-90"}`} />
        <span className="font-display text-[15px] font-bold tracking-wide uppercase">Maršruto etapai</span>
        <span className="ml-auto font-mono text-sm text-[var(--muted)]">
          {fmtKm(mode.distance)} • {fmtDurShort(mode.duration)}
        </span>
      </button>
      {open && (
        <ol className="flex flex-col">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <div className="flex w-6 shrink-0 flex-col items-center">
                <span className="grid h-6 w-6 place-items-center rounded-full text-xs font-bold text-white ring-4 ring-[var(--panel)]" style={{ background: STEP_COLOR(i, steps.length) }}>
                  {i + 1}
                </span>
                {i < steps.length - 1 && <span className="w-0.5 flex-1 bg-[var(--go)]/40" />}
              </div>
              <div className="mb-3 min-w-0 flex-1 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-3.5 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
                <div className="flex items-baseline justify-between gap-3">
                  <b className="min-w-0 text-[15px] font-semibold">{s.title}</b>
                  {s.dur != null && <span className="shrink-0 font-mono text-xs text-[var(--muted)]">{fmtDurShort(s.dur)}</span>}
                </div>
                {s.sub && <p className="mt-1 text-sm text-[var(--muted)]">{s.sub}</p>}
                {s.chips && s.chips.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {s.chips.map((c, j) => (
                      <Chip key={j} {...c} />
                    ))}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ weather */

type Conditions = { place: string; temp: number; wind: number; precip: number; code: string; text: string };
const ACTIVE: ModeId[] = ["bike", "bikeshare", "scooter", "walk"];

function verdict(mode: ModeId, c: Conditions): { text: string; tone: Tone } {
  const active = ACTIVE.includes(mode);
  if (c.precip >= 0.3 || /rain|thunder|sleet|snow|hail/.test(c.code)) return { text: active ? "Pasiimkite lietpaltį" : "Šlapia kelio danga", tone: "wait" };
  if (c.temp <= 0) return { text: "Gali būti slidu", tone: "wait" };
  if (c.wind >= 10) return { text: "Stiprus vėjas", tone: "wait" };
  return { text: active ? (mode === "walk" ? "Puikus oras pasivaikščioti" : "Idealu važiavimui") : "Geros sąlygos", tone: "go" };
}

/** Weather at the start of the trip (meteo.lt), with a one-line verdict for the chosen way. */
export function WeatherRow({ from, at, mode }: { from: LatLng; at: string; mode: ModeId }) {
  const [state, setState] = useState<{ key: string; c: Conditions | null } | null>(null);
  const key = `${from.join(",")}|${at}`;
  useEffect(() => {
    let alive = true;
    fetch(`/api/weather?lat=${from[0]}&lng=${from[1]}&at=${encodeURIComponent(at)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => alive && setState({ key, c }))
      .catch(() => alive && setState({ key, c: null }));
    return () => {
      alive = false;
    };
  }, [key, from, at]);
  const c = state?.key === key ? state.c : null;
  if (!c) return null;
  const v = verdict(mode, c);
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--chip)] px-3.5 py-3 text-sm">
      <ClockIcon size={16} />
      <span className="min-w-0 flex-1 text-[var(--muted)]">
        Orai: <span className="text-[var(--ink)]">{c.temp > 0 ? "+" : ""}{Math.round(c.temp)}°C</span>
        {c.text && ` • ${c.text}`} • vėjas {Math.round(c.wind)} m/s
      </span>
      <span className="shrink-0 text-sm font-semibold" style={{ color: TONE[v.tone].text }}>
        {v.text}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ navigation */

const GMAPS_MODE: Record<Exclude<ModeId, "car">, string> = { transit: "transit", bikeshare: "bicycling", scooter: "bicycling", bike: "bicycling", walk: "walking" };

/** Hands the chosen way to a navigation app: Waze for driving, Google Maps for the rest. */
export function NavButton({ plan, mode, className = "" }: { plan: PlanResponse; mode: ModeId; className?: string }) {
  const href =
    mode === "car"
      ? plan.car
        ? wazeNavigationUrl(plan.car.drive)
        : null
      : `https://www.google.com/maps/dir/?api=1&origin=${plan.from.join(",")}&destination=${plan.to.join(",")}&travelmode=${GMAPS_MODE[mode]}`;
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center justify-center gap-2.5 rounded-2xl bg-[var(--marking)] py-4 text-base font-semibold text-white shadow-[0_8px_20px_rgba(5,150,105,0.3)] transition hover:brightness-110 ${className}`}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 11l19-9-9 19-2-8-8-2z" />
      </svg>
      Pradėti navigaciją
      <span className="sr-only">{mode === "car" ? "(Waze)" : "(Google Maps)"}</span>
    </a>
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
    <span className="flex items-center gap-1.5 text-xs whitespace-nowrap text-[var(--muted)]">
      <span className={`h-2 w-2 rounded-full ${departAt ? "bg-[var(--wait)]" : "bg-[var(--go)]"}`} />
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
  );
}
