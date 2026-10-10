"use client";

import { fmtStay, parkingEvals, type ModeSummary, type ParkingEval, type Settings } from "@/lib/metrics";
import type { PlanResponse, RideLeg, TransitResult } from "@/lib/plan-types";
import { fmtClock, fmtDur, fmtEur, fmtKm, fmtNum, ROUTE_TYPE } from "./format";
import { BusIcon, FerryIcon, TrolleyIcon, WalkIcon } from "./icons";
import { LOT_CLASS, lotClass, ZONE_COLOR } from "./parking-meta";
import { CarDriveDetails } from "./CarDriveDetails";

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

export function Metric({ icon, value, signal, label }: { icon: React.ReactNode; value: string; signal?: Signal; label: string }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5" title={label}>
      {signal ? <span className={`signal ${signal}`} aria-hidden /> : <span className="w-2" />}
      <span className="hidden text-[var(--muted)] sm:inline">{icon}</span>
      <span className="tnum truncate text-sm font-semibold">{value}</span>
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** What the steps don't show for the chosen way: driving details and parking choice, notes, the price breakdown. */
export function ModeExtras({ plan, mode: m, parking }: { plan: PlanResponse; mode: ModeSummary; parking: ParkingChoiceProps }) {
  const hasCost = m.costLines.length > 0 && !(m.id === "car" && (parking.updating || parking.error));
  if (!m.feasible && m.why) return <div className="rounded-2xl border border-dashed border-[var(--line)] p-3 text-sm text-[var(--muted)]">{m.why}</div>;
  return (
    <div className="flex flex-col gap-3">
      {m.weatherWarning && <div className="rounded-2xl border border-[#fecaca] bg-[#fef2f2] p-3 text-sm text-[#b91c1c]">{m.weatherWarning}</div>}
      {m.id === "car" && plan.car && (
        <div className="rounded-2xl border border-[var(--line)] p-3.5">
          <CarDetails plan={plan} mode={m} parking={parking} />
        </div>
      )}
      {m.id === "transit" && plan.transit && <TransitSummary t={plan.transit} />}
      {m.id === "bikeshare" && plan.bikeshare && <BikeshareNote plan={plan} />}
      {m.id === "scooter" && plan.scooter && <ScooterNote plan={plan} />}
      {hasCost && (
        <div className="flex flex-col gap-1 rounded-2xl bg-[var(--chip)] p-3">
          {m.costLines.map((l, i) => (
            <Row
              key={i}
              label={
                <span>
                  {l.label}
                  {l.note && <span className="text-xs text-[var(--muted)]"> · {l.note}</span>}
                </span>
              }
              value={l.unknown ? "nežinoma" : `${l.approx ? "≈ " : ""}${fmtEur(l.value)}`}
            />
          ))}
          {m.costLines.length > 1 && (
            <Row label={<b>Iš viso</b>} value={<b>{`${m.costLines.some((l) => l.unknown) ? "≥ " : ""}${fmtEur(m.cost)}`}</b>} />
          )}
        </div>
      )}
      {m.id === "transit" && m.kcal > 5 && (
        <div className="text-xs text-[var(--muted)]">Bonusas: pėsčiomis sudeginsite ≈ {fmtNum(m.kcal)} kcal.</div>
      )}
    </div>
  );
}

function ScooterNote({ plan }: { plan: PlanResponse }) {
  const sc = plan.scooter!;
  if (sc.source === "demo")
    return (
      <p className="rounded-xl border border-[#f472b6]/50 bg-[#fdf2f8] p-2.5 text-xs">
        <b className="mr-1 rounded bg-[#f472b6] px-1 text-white">DEMO</b>
        Paspirtuko vieta išgalvota – tai bandomieji duomenys, kol negauta prieiga prie tikro operatoriaus srauto.
      </p>
    );
  if (sc.source === "estimate")
    return (
      <p className="rounded-xl bg-[var(--chip)] p-2.5 text-xs text-[var(--muted)]">
        Vertinimas: Bolt ir kiti operatoriai Lietuvoje neskelbia atvirų (GBFS) duomenų, todėl nežinome, kur stovi artimiausias paspirtukas. Kainą galite pasikeisti nustatymuose.
      </p>
    );
  return null;
}

function BikeshareNote({ plan }: { plan: PlanResponse }) {
  const b = plan.bikeshare!;
  return (
    <div className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
      <span className={`signal ${b.live ? "go" : "wait"}`} />
      {b.live ? `Gyvi Cyclocity duomenys${b.updated ? `, ${new Date(b.updated).toLocaleTimeString("lt-LT", { hour: "2-digit", minute: "2-digit" })}` : ""}` : "Kitam laikui – užimtumas gali skirtis"}
    </div>
  );
}

function CarDetails({ plan, mode, parking }: { plan: PlanResponse; mode: ModeSummary; parking: ParkingChoiceProps }) {
  const c = plan.car!;
  const park = mode.parking;
  return (
    <div className="flex flex-col gap-1.5">
      <CarDriveDetails leg={c.drive} parking={park?.option} searchSec={park?.searchSec ?? Math.max(0, c.overhead - 120)} walkSec={park?.walkSec} updating={parking.updating} error={parking.error} />
      {c.parkingOptions?.length ? (
        <ParkingChoice plan={plan} chosen={park ?? null} {...parking} />
      ) : c.parking ? (
        <div className="mt-1 rounded-xl border border-[var(--line)] p-2.5 text-xs">
          <b className="text-sm">P · {c.parking.city}, {c.parking.zone.toLowerCase()}</b>
          <div className="mt-0.5 text-[var(--muted)]">{c.parking.text}</div>
        </div>
      ) : (
        <div className="text-xs text-[var(--muted)]">Tikslas ne savivaldybės mokamoje parkavimo zonoje (pagal atvirus Vilniaus ir Klaipėdos duomenis).</div>
      )}
    </div>
  );
}

const CHANCE_SIGNAL = { high: "go", mid: "wait", low: "stop" } as const;

/** Where to leave the car near B: price for the stay, walk, chance of a space; one is chosen. */
function ParkingChoice({ plan, chosen, settings, parkingId, onParking }: ParkingChoiceProps & { plan: PlanResponse; chosen: ParkingEval | null }) {
  const evals = parkingEvals(plan, settings);
  const auto = parkingId == null;
  // The chosen place first, then the rest by walking distance; at most 7 rows.
  const rows = [...evals].sort((a, b) => (a.option.id === chosen?.option.id ? -1 : b.option.id === chosen?.option.id ? 1 : a.option.walk - b.option.walk)).slice(0, 7);
  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">Kur palikti automobilį</span>
        <span className="text-[11px] text-[var(--muted)]">{fmtStay(settings.parkingHours * 60)} stovėjimas</span>
      </div>
      <ul className="flex flex-col gap-1" role="radiogroup" aria-label="Kur palikti automobilį">
        {rows.map((e) => {
          const o = e.option;
          const on = o.id === chosen?.option.id;
          const dot =
            o.kind === "lot" && o.lot
              ? LOT_CLASS[lotClass(o.lot)].color
              : o.kind === "charger"
                ? "#22d3ee"
                : o.zone
                  ? (ZONE_COLOR[o.zone.zone] ?? "#999")
                  : "#aab3c3";
          return (
            <li key={o.id}>
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
        })}
      </ul>
      <p className="text-[11px] leading-relaxed text-[var(--muted)]">
        {auto ? "Parinkta pagal prioritetą: kaina, ėjimas ir tikimybė rasti vietą. " : ""}
        Kainos – pagal paskelbtus tarifus (JUDU, UNIPARK, prekybos centrai, OpenStreetMap). „?“ – taisyklės nežinomos, tokia vieta automatiškai nesiūloma.
      </p>
    </div>
  );
}

export function TransitSummary({ t }: { t: TransitResult }) {
  return (
    <div className="flex flex-col gap-2">
      {t.laneMeters > 150 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="lane-badge">
            <b>A</b> {fmtKm(t.laneMeters)} gatvėmis su A juosta
          </span>
          <span className="text-xs text-[var(--muted)]">{Math.round((t.laneMeters / Math.max(1, t.rideDistance)) * 100)} % kelionės aplenkiant spūstis</span>
        </div>
      )}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
        <span>
          Išeiti {fmtClock(t.leave)} · atvyksite {fmtClock(t.arrive)}
        </span>
        <span>{t.transfers ? `${t.transfers} persėdimas(-ai)` : "Be persėdimų"}</span>
        <span>Pėsčiomis {fmtKm(t.walkDistance)}</span>
        {t.next && <span>Kitas reisas – išeiti {fmtClock(t.next)}</span>}
      </div>
    </div>
  );
}

function RideIcon({ leg }: { leg: RideLeg }) {
  if (leg.route.type === 11) return <TrolleyIcon size={16} />;
  if (leg.route.type === 4) return <FerryIcon size={16} />;
  return <BusIcon size={16} />;
}

export function TransitTimeline({ t }: { t: TransitResult }) {
  return (
    <div className="flex flex-col">
      {t.laneMeters > 150 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="lane-badge">
            <b>A</b> {fmtKm(t.laneMeters)} gatvėmis su A juosta
          </span>
          <span className="text-xs text-[var(--muted)]">{Math.round((t.laneMeters / Math.max(1, t.rideDistance)) * 100)} % kelionės aplenkiant spūstis</span>
        </div>
      )}
      <ol className="relative flex flex-col">
        {t.legs.map((l, i) => (
          <li key={i} className="relative flex gap-3 pb-3 last:pb-0">
            <div className="flex w-12 shrink-0 flex-col items-end pt-0.5">
              <span className="tnum text-xs font-semibold">{fmtClock(l.kind === "ride" ? l.dep : l.start)}</span>
            </div>
            <div className="relative flex w-4 shrink-0 justify-center">
              {l.kind === "ride" ? (
                <span className="absolute top-1 bottom-[-4px] w-1.5 rounded-full" style={{ background: l.route.color || "var(--transit)" }} />
              ) : (
                <span className="lane-vertical absolute top-1 bottom-[-4px]" />
              )}
              <span className="relative z-10 mt-1 h-3 w-3 rounded-full border-2 border-white bg-[var(--panel)]" />
            </div>
            <div className="min-w-0 flex-1 pb-1">
              {l.kind === "walk" ? (
                <div className="flex items-center gap-1.5 text-sm text-[var(--muted)]">
                  <WalkIcon size={15} />
                  Eiti {fmtKm(l.distance)} · {fmtDur(l.end - l.start)}
                  {l.toName && <span className="truncate">iki „{l.toName}“</span>}
                  {l.tight && <span className="shrink-0 font-medium text-[var(--wait)]">· persėsti spėsite tik paskubėję</span>}
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-sm font-bold text-white"
                      style={{ background: l.route.color || "var(--transit)" }}
                    >
                      <RideIcon leg={l} />
                      {l.route.short || ROUTE_TYPE[l.route.type]}
                    </span>
                    <span className="truncate text-sm">→ {l.headsign || l.route.long}</span>
                  </div>
                  <div className="text-sm">
                    <b>{l.from.name}</b> <span className="text-[var(--muted)]">→</span> <b>{l.to.name}</b>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-[var(--muted)]">
                    <span>
                      {l.stops} st. · {fmtDur(l.arr - l.dep)} · {fmtKm(l.distance)}
                    </span>
                    <span>išlipti {fmtClock(l.arr)}</span>
                    {l.laneMeters > 100 && <span className="text-[var(--lane)]">A juosta {fmtKm(l.laneMeters)}</span>}
                  </div>
                  <div className="text-[11px] text-[var(--muted)]/80">{l.route.agency}</div>
                </div>
              )}
            </div>
          </li>
        ))}
        <li className="flex gap-3">
          <div className="flex w-12 shrink-0 justify-end">
            <span className="tnum text-xs font-semibold">{fmtClock(t.arrive)}</span>
          </div>
          <div className="flex w-4 justify-center">
            <span className="h-3 w-3 rounded-full bg-[#b4232f] ring-2 ring-white" />
          </div>
          <span className="text-sm font-semibold">Atvykimas</span>
        </li>
      </ol>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
        <span>{t.transfers ? `${t.transfers} persėdimas(-ai)` : "Be persėdimų"}</span>
        <span>Pėsčiomis {fmtKm(t.walkDistance)}</span>
        {t.next && <span>Kitas reisas – išeiti {fmtClock(t.next)}</span>}
      </div>
    </div>
  );
}
