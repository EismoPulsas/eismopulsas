"use client";

import { wazeNavigationUrl, wazeUrl } from "@/lib/driving";
import type { LatLng } from "@/lib/geo";
import type { HybridSummary, ModeSummary } from "@/lib/metrics";
import type { ParkingOption, PlanResponse, TransitLeg } from "@/lib/plan-types";
import { DEMO } from "./demo";
import { fmtClock, fmtCo2, fmtDurShort, fmtEur, fmtKm, fmtNum, ROUTE_TYPE } from "./format";
import { HybridIcons } from "./HybridCard";
import { ClockIcon, CoinIcon, LeafIcon, ModeBadge } from "./icons";

// The chosen way, as one card: what it is and when you arrive, a bar of its legs, three numbers,
// then a timeline where every leg is a small card (times, what to do, live availability, app links).
// Single modes and car + second-leg combinations are turned into the same list of legs first.

type Tone = "go" | "wait" | "stop" | "blue" | "muted";
const TONE: Record<Tone, { bg: string; border: string; text: string }> = {
  go: { bg: "#ecfdf5", border: "#a7f3d0", text: "#047857" },
  wait: { bg: "#fff7ed", border: "#fed7aa", text: "#c2410c" },
  stop: { bg: "#fef2f2", border: "#fecaca", text: "#dc2626" },
  blue: { bg: "#eff6ff", border: "#bfdbfe", text: "#1d4ed8" },
  muted: { bg: "var(--chip)", border: "var(--line)", text: "var(--muted)" },
};

/** Leg colours on the bar and the timeline. */
const C = { car: "#f97316", park: "#2563eb", walk: "#94a3b8", bike: "#10b981", bikeshare: "#06b6d4", scooter: "#10b981", transit: "#2563eb", end: "#0f172a" };

type Leg = {
  color: string;
  /** Seconds after local midnight. */
  at: number;
  dur: number;
  /** "16:42 · Pradžia" – the part after the time. */
  head: string;
  badge?: { text: string; tone: Tone };
  /** The bold line: from → to, or the place. */
  what?: string;
  sub?: string;
  /** Live / known availability, in a framed row. */
  box?: { dot: string; text: React.ReactNode; right?: string };
  note?: string;
  status?: { dot: string; text: string };
  actions?: { label: string; href: string }[];
  /** Highlighted (where the car is left). */
  hub?: boolean;
  /** Short label for the bar legend; none = not listed. */
  legend?: string;
  /** Last row: arrival. */
  end?: boolean;
};

export type Trip = {
  icons: React.ReactNode;
  title: string;
  duration: number;
  subtitle: string;
  legs: Leg[];
  cost: number;
  co2: number;
  kcal: number;
  nav: { href: string; label: string } | null;
};

const walkSec = (m: number) => m / 1.25;
const gmaps = (from: LatLng, to: LatLng, mode: string) => `https://www.google.com/maps/dir/?api=1&origin=${from.join(",")}&destination=${to.join(",")}&travelmode=${mode}`;
const min = (sec: number) => `${Math.max(1, Math.round(sec / 60))} min`;

/** The car park's availability as one framed row: live free spaces, else the usual chance. */
function parkBox(o: ParkingOption, chanceText: string | null): Leg["box"] {
  const cap = o.live?.capacity ?? o.lot?.cap ?? null;
  if (o.live) {
    const used = cap ? Math.round(((cap - o.live.vacant) / cap) * 100) : null;
    return {
      dot: o.live.vacant === 0 ? "#ef4444" : o.live.vacant < 10 ? "#f59e0b" : "#10b981",
      text: (
        <>
          Laisva: <b>{o.live.vacant}</b>
          {cap ? ` iš ${cap} vietų` : " vietų"}
        </>
      ),
      right: used != null ? `${used} % užimta` : undefined,
    };
  }
  return chanceText ? { dot: "#94a3b8", text: chanceText } : undefined;
}

function transitLegs(legs: TransitLeg[], to: string): Leg[] {
  const out: Leg[] = [];
  for (const l of legs) {
    if (l.kind === "walk") {
      if (l.distance < 30) continue;
      out.push({
        color: C.walk,
        at: l.start,
        dur: l.end - l.start,
        head: "Pėsčiomis",
        badge: { text: fmtKm(l.distance), tone: "muted" },
        what: l.toName ? `Iki stotelės „${l.toName}“` : `Iki ${to}`,
        status: l.tight ? { dot: "#f59e0b", text: "Persėsti spėsite tik paskubėję" } : undefined,
      });
    } else {
      const kind = ROUTE_TYPE[l.route.type] ?? "Maršrutas";
      out.push({
        color: l.route.color || C.transit,
        at: l.dep,
        dur: l.arr - l.dep,
        head: `${kind} ${l.route.short}`,
        badge: { text: `${l.stops} st. · ${min(l.arr - l.dep)}`, tone: "blue" },
        what: `${l.from.name} → ${l.to.name}`,
        sub: `Kryptis: ${l.headsign || l.route.long}. Išlipti ${fmtClock(l.arr)}.`,
        note: l.laneMeters > 100 ? `${fmtKm(l.laneMeters)} A juosta – aplenkia spūstis` : undefined,
        legend: `${l.route.short} (${min(l.arr - l.dep)})`,
      });
    }
  }
  return out;
}

function arrival(at: number, to: string): Leg {
  return { color: C.end, at, dur: 0, head: to, end: true };
}

/** One of the single modes (car, public transport, Cyclocity, scooter, bike, walk). */
export function tripFromMode(plan: PlanResponse, m: ModeSummary, labels: { from: string; to: string }): Trip {
  const t0 = plan.depart.sec;
  const legs: Leg[] = [];
  let nav: Trip["nav"] = null;
  let subtitle = `Atvyksite ${fmtClock(t0 + m.duration)}`;
  switch (m.id) {
    case "car": {
      const c = plan.car!;
      const p = m.parking;
      const d = c.drive.traffic.delaySeconds;
      const jam = d !== null && d > 60;
      const target = p ? (p.option.navigationPos ?? p.option.pos) : plan.to;
      legs.push({
        color: C.car,
        at: t0,
        dur: 120 + c.drive.duration,
        head: "Pradžia",
        badge: { text: `Automobiliu (${fmtKm(c.drive.distance)})`, tone: "wait" },
        what: `${labels.from} → ${p ? p.option.name : labels.to}`,
        sub: `${min(c.drive.duration)} vairavimo${jam ? `, spūstys +${min(d!)}` : ""}. 2 min iki automobilio.`,
        status: { dot: jam ? "#ef4444" : "#10b981", text: jam ? "Eismas: spūstys" : "Eismas: normalus" },
        actions: [
          { label: "Waze", href: wazeNavigationUrl({ to: target }) },
          { label: "Maps", href: gmaps(plan.from, target, "driving") },
        ],
        legend: `${fmtKm(c.drive.distance)} Auto (${min(c.drive.duration)})`,
      });
      let at = t0 + 120 + c.drive.duration;
      if (p) {
        legs.push({
          color: C.park,
          at,
          dur: p.searchSec,
          head: "Parkavimas",
          badge: { text: p.cost == null ? "Kaina nežinoma" : p.cost === 0 ? "0,00 € Nemokama" : fmtEur(p.cost), tone: p.cost ? "blue" : "go" },
          what: p.option.name,
          sub: p.costNote || undefined,
          box: parkBox(p.option, p.chanceText),
          hub: true,
          legend: `${min(p.searchSec)} parkavimas`,
        });
        at += p.searchSec;
        if (p.walkSec > 30) {
          legs.push({ color: C.walk, at, dur: p.walkSec, head: "Pėsčiomis", badge: { text: fmtKm(p.option.walk), tone: "muted" }, what: `Iki ${labels.to}` });
          at += p.walkSec;
        }
      }
      legs.push(arrival(t0 + m.duration, labels.to));
      subtitle = `${p ? `Per ${p.option.name} · ` : ""}Atvyksite ${fmtClock(t0 + m.duration)}`;
      nav = { href: wazeNavigationUrl({ to: target }), label: "Pradėti navigaciją (Waze)" };
      break;
    }
    case "transit": {
      const t = plan.transit!;
      legs.push(...transitLegs(t.legs, labels.to), arrival(t.arrive, labels.to));
      subtitle = `Išeiti ${fmtClock(t.leave)} · Atvyksite ${fmtClock(t.arrive)}`;
      nav = { href: gmaps(plan.from, plan.to, "transit"), label: "Pradėti navigaciją" };
      break;
    }
    case "bikeshare": {
      const b = plan.bikeshare!;
      let at = t0;
      legs.push({ color: C.walk, at, dur: walkSec(b.walkTo), head: "Pėsčiomis", badge: { text: fmtKm(b.walkTo), tone: "muted" }, what: `Iki stotelės „${b.from.name}“` });
      at += walkSec(b.walkTo);
      legs.push({
        color: C.bikeshare,
        at,
        dur: b.rideDuration,
        head: "Cyclocity dviratis",
        badge: { text: `${fmtKm(b.ride)} · ${min(b.rideDuration)}`, tone: "go" },
        what: `${b.from.name} → ${b.to.name}`,
        box: { dot: b.from.bikes ? "#10b981" : "#ef4444", text: <>Paimti: <b>{b.from.bikes ?? "?"}</b> laisvi dviračiai</>, right: b.live ? "gyvai" : "kitam laikui" },
        sub: DEMO.bikeRideNote,
        legend: `${fmtKm(b.ride)} Cyclocity (${min(b.rideDuration)})`,
      });
      at += b.rideDuration;
      legs.push({
        color: C.walk,
        at,
        dur: walkSec(b.walkFrom),
        head: "Palikti dviratį",
        badge: { text: fmtKm(b.walkFrom), tone: "muted" },
        what: `Stotelė „${b.to.name}“`,
        box: { dot: b.to.docks ? "#10b981" : "#ef4444", text: <>Laisvos vietos: <b>{b.to.docks ?? "?"}</b></> },
      });
      legs.push(arrival(t0 + m.duration, labels.to));
      nav = { href: gmaps(plan.from, plan.to, "bicycling"), label: "Pradėti navigaciją" };
      break;
    }
    case "scooter": {
      const s = plan.scooter!;
      const v = s.vehicle;
      let at = t0;
      const w = v ? walkSec(v.walk) : 180;
      legs.push({ color: C.walk, at, dur: w, head: "Pėsčiomis", what: v ? "Iki artimiausio paspirtuko" : "Rasti ir atrakinti paspirtuką", badge: v ? { text: fmtKm(v.walk), tone: "muted" } : undefined });
      at += w;
      legs.push({
        color: C.scooter,
        at,
        dur: s.rideDuration,
        head: s.operator ? `${s.operator} paspirtukas` : "Paspirtukas",
        badge: { text: `${fmtKm(s.distance)} · ${min(s.rideDuration)}`, tone: "go" },
        what: `${labels.from} → ${labels.to}`,
        box: v?.battery != null ? { dot: v.battery < 25 ? "#ef4444" : "#10b981", text: "Paimti šalia jūsų", right: `${v.battery} % bat.` } : undefined,
        sub: s.source === "demo" ? "DEMO: paspirtuko vieta išgalvota." : DEMO.scooterRideNote,
        legend: `${fmtKm(s.distance)} paspirtukas (${min(s.rideDuration)})`,
      });
      legs.push(arrival(t0 + m.duration, labels.to));
      nav = { href: gmaps(plan.from, plan.to, "bicycling"), label: "Pradėti navigaciją" };
      break;
    }
    case "bike":
    case "walk": {
      const bike = m.id === "bike";
      legs.push({
        color: bike ? C.bike : C.walk,
        at: t0,
        dur: m.duration,
        head: bike ? "Dviračiu" : "Pėsčiomis",
        badge: { text: `${fmtKm(m.distance)} · ${min(m.duration)}`, tone: bike ? "go" : "muted" },
        what: `${labels.from} → ${labels.to}`,
        sub: bike ? DEMO.bikeRideNote : undefined,
        legend: `${fmtKm(m.distance)} ${bike ? "dviračiu" : "pėsčiomis"} (${min(m.duration)})`,
      });
      legs.push(arrival(t0 + m.duration, labels.to));
      nav = { href: gmaps(plan.from, plan.to, bike ? "bicycling" : "walking"), label: "Pradėti navigaciją" };
      break;
    }
  }
  if (legs.length) legs[0] = { ...legs[0], head: legs[0].head === "Pėsčiomis" ? "Pradžia · pėsčiomis" : legs[0].head };
  return {
    icons: <ModeBadge mode={m.id} size={34} />,
    title: { car: "Automobilis", transit: "Viešasis transportas", bikeshare: "Cyclocity dviratis", scooter: "Paspirtukas", bike: "Dviratis", walk: "Pėsčiomis" }[m.id],
    duration: m.duration,
    subtitle,
    legs,
    cost: m.cost,
    co2: m.co2,
    kcal: m.kcal,
    nav,
  };
}

/** Car to a hub, then public transport, Cyclocity or a scooter. */
export function tripFromHybrid(plan: PlanResponse, h: HybridSummary, title: string, labels: { from: string; to: string }): Trip {
  const o = h.hybrid;
  const p = h.parking;
  const s = o.second;
  const pr = o.hub.lot?.t.flat || o.hub.lot?.access === "pr";
  const legs: Leg[] = [
    {
      color: C.car,
      at: plan.depart.sec,
      dur: 120 + o.car.duration,
      head: "Pradžia",
      badge: { text: `Automobiliu (${fmtKm(o.car.distance)})`, tone: "wait" },
      what: `${labels.from} → ${o.hub.name}`,
      sub: `≈ ${min(o.car.duration)} vairavimo pagal dabartinį eismą. 2 min iki automobilio.`,
      status: { dot: "#10b981", text: o.hub.curb ? "Privažiuokite iš stovėjimo vietų pusės" : "Eismas: įvertintas" },
      actions: [
        { label: "Waze", href: wazeUrl({ from: o.car.from, to: o.car.to }) },
        { label: "Maps", href: gmaps(o.car.from, o.car.to, "driving") },
      ],
      legend: `${fmtKm(o.car.distance)} Auto (${min(o.car.duration)})`,
    },
    {
      color: C.park,
      at: o.parkedAt,
      dur: o.searchSec,
      head: pr ? "Park & Ride" : p.charge ? "Parkavimas ir įkrovimas" : "Parkavimas",
      badge: { text: p.cost == null ? "Kaina nežinoma" : p.cost === 0 ? "0,00 € Nemokama" : fmtEur(p.cost), tone: p.cost ? "blue" : "go" },
      what: `${o.hub.lot ? "Aikštelė" : "Vieta"}: ${o.hub.name}`,
      box: parkBox(o.hub, p.chanceText),
      note: p.charge ? `⚡ Kol stovi, įkrausite ~${p.charge.kWh} kWh (≈ ${p.charge.km} km)` : p.costNote || undefined,
      hub: true,
      legend: `${min(o.searchSec)} ${pr ? "P+R" : "parkavimas"}`,
    },
  ];
  const at = o.parkedAt + o.searchSec;
  if (s.kind === "transit") legs.push(...transitLegs(s.transit.legs, labels.to));
  else if (s.kind === "bikeshare") {
    const b = s.bikeshare;
    const w = walkSec(b.walkTo) + 60;
    legs.push({
      color: C.bikeshare,
      at: at + w,
      dur: b.rideDuration,
      head: "Cyclocity dviratis",
      badge: { text: `${fmtKm(b.ride)} · ${min(b.rideDuration)}`, tone: "go" },
      what: `Paimti stotelėje „${b.from.name}“`,
      box: { dot: b.from.bikes ? "#10b981" : "#ef4444", text: <><b>{b.from.bikes ?? "?"}</b> laisvi dviračiai</>, right: `${fmtKm(b.walkTo)} nuo automobilio` },
      sub: `Palikti stotelėje „${b.to.name}“ (laisvų vietų ${b.to.docks ?? "?"}), tada ${fmtKm(b.walkFrom)} pėsčiomis.`,
      legend: `${fmtKm(b.ride)} Cyclocity (${min(b.rideDuration)})`,
    });
  } else {
    const sc = s.scooter;
    const w = (sc.vehicle ? walkSec(sc.vehicle.walk) : 180) + 30;
    legs.push({
      color: C.scooter,
      at: at + w,
      dur: sc.rideDuration,
      head: sc.operator ? `${sc.operator} paspirtukas` : "Paspirtukas",
      badge: { text: `${fmtKm(sc.distance)} · ${min(sc.rideDuration)}`, tone: "go" },
      what: "Paimti šalia aikštelės",
      box: sc.vehicle ? { dot: sc.vehicle.battery != null && sc.vehicle.battery < 25 ? "#ef4444" : "#10b981", text: `${fmtKm(sc.vehicle.walk)} nuo automobilio`, right: sc.vehicle.battery != null ? `${sc.vehicle.battery} % bat.` : undefined } : undefined,
      sub: sc.endSpot ? `Palikti „${sc.endSpot.addr ?? "pažymėtoje vietoje"}“ (Senamiestyje – tik ten), ${fmtKm(sc.endSpot.walk)} iki tikslo.` : sc.source === "demo" ? "DEMO: paspirtukų vietos išgalvotos." : undefined,
      legend: `${fmtKm(sc.distance)} paspirtukas (${min(sc.rideDuration)})`,
    });
  }
  legs.push(arrival(o.arrive, labels.to));
  return {
    icons: <HybridIcons h={h} size={30} />,
    title,
    duration: h.duration,
    subtitle: `Per ${o.hub.name} · Atvyksite ${fmtClock(o.arrive)}`,
    legs,
    cost: h.cost,
    co2: h.co2,
    kcal: h.kcal,
    nav: { href: wazeNavigationUrl({ to: o.car.to }), label: "Pradėti kombinuotą navigaciją" },
  };
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: Tone }) {
  const t = tone ? TONE[tone] : null;
  return (
    <div className="flex items-center gap-2.5 rounded-xl border p-2.5" style={{ background: t?.bg ?? "var(--panel)", borderColor: t?.border ?? "var(--line)" }}>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--line)] bg-white" style={{ color: t?.text ?? "var(--ink)" }}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] text-[var(--muted)]">{label}</span>
        <span className="block truncate text-sm font-bold">{value}</span>
      </span>
    </div>
  );
}

export function TripCard({
  trip,
  car,
  live,
  alt,
}: {
  trip: Trip;
  /** Driving all the way, for "you save". */
  car: ModeSummary | undefined;
  live: boolean;
  alt: { label: string; duration: number; onPick: () => void } | null;
}) {
  const vsCar = car?.feasible && trip.title !== "Automobilis" ? car.duration - trip.duration : null;
  const co2Saved = car?.feasible && trip.title !== "Automobilis" ? car.co2 - trip.co2 : null;
  const barLegs = trip.legs.filter((l) => !l.end && l.dur > 0);
  const legend = barLegs.filter((l) => l.legend).slice(0, 4);

  return (
    <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--panel)] shadow-[0_8px_30px_rgba(15,23,42,0.08)]" aria-label="Pasirinkta kelionė">
      <div className="flex flex-col gap-3 p-4 pb-3.5">
        <div className="flex items-start gap-3">
          {trip.icons}
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] leading-tight font-bold">{trip.title}</h2>
            <p className="mt-0.5 truncate text-[13px] text-[var(--muted)]">{trip.subtitle}</p>
          </div>
          <div className="shrink-0 text-right">
            <span className="font-display text-[26px] leading-none font-extrabold">{Math.round(trip.duration / 60)}</span>
            <span className="ml-1 text-sm text-[var(--muted)]">min</span>
            {vsCar !== null && Math.abs(vsCar) >= 60 && (
              <div className={`mt-1 text-xs font-semibold ${vsCar > 0 ? "text-[#047857]" : "text-[var(--muted)]"}`}>
                {vsCar > 0 ? `● Sutaupote ${min(vsCar)}` : `+${min(-vsCar)} nei automobiliu`}
              </div>
            )}
          </div>
        </div>

        {/* Each leg as long as its minutes. */}
        <div className="flex h-2 gap-1" aria-hidden>
          {barLegs.map((l, i) => (
            <span key={i} className="min-w-[6px] rounded-full" style={{ flexGrow: Math.max(l.dur, 30), background: l.color }} />
          ))}
        </div>
        {legend.length > 0 && (
          <div className="-mt-1 flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-[11px] font-medium" style={{ color: "var(--muted)" }}>
            {legend.map((l, i) => (
              <span key={i} className="flex items-center gap-1.5" style={{ color: l.color === C.walk ? undefined : l.color }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: l.color }} />
                {l.legend}
              </span>
            ))}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          <Stat icon={<ClockIcon size={16} />} label="Trukmė" value={fmtDurShort(trip.duration)} />
          <Stat icon={<CoinIcon size={16} />} label="Kaina" value={trip.cost < 0.005 ? "0 €" : fmtEur(trip.cost)} tone={trip.cost < 0.005 ? "go" : undefined} />
          <Stat
            icon={<LeafIcon size={16} />}
            label="CO₂ pėdsakas"
            value={co2Saved !== null && co2Saved > 0.001 ? `−${fmtCo2(co2Saved)}` : trip.co2 < 0.001 ? "0 g" : fmtCo2(trip.co2)}
            tone={co2Saved !== null && co2Saved > 0.001 ? "go" : trip.co2 >= 1 ? "wait" : undefined}
          />
        </div>
        {trip.kcal >= 5 && <p className="-mt-1 text-xs text-[var(--muted)]">Bonusas: sudeginsite ≈ {fmtNum(trip.kcal)} kcal.</p>}
      </div>

      <div className="border-t border-[var(--line)] p-4 pt-3.5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="eyebrow">Kelionės planas</span>
          <span className="rounded-full border px-2.5 py-0.5 text-[11px] font-medium" style={{ background: live ? TONE.go.bg : TONE.muted.bg, borderColor: live ? TONE.go.border : TONE.muted.border, color: live ? TONE.go.text : TONE.muted.text }}>
            {live ? "Gyvi duomenys" : "Pagal tvarkaraštį"}
          </span>
        </div>
        <ol className="flex flex-col">
          {trip.legs.map((l, i) => {
            const last = i === trip.legs.length - 1;
            return (
              <li key={i} className="flex gap-3">
                <div className="flex w-3 shrink-0 flex-col items-center pt-4">
                  <span className="h-3 w-3 shrink-0 rounded-full ring-4 ring-[var(--panel)]" style={{ background: l.color }} />
                  {!last && <span className="w-0.5 flex-1" style={{ background: l.color === C.walk ? "repeating-linear-gradient(180deg, #cbd5e1 0 4px, transparent 4px 8px)" : l.color, opacity: 0.6 }} />}
                </div>
                <div
                  className={`mb-2.5 min-w-0 flex-1 rounded-2xl border p-3 ${l.end ? "flex items-center justify-between gap-2" : ""}`}
                  style={l.hub ? { background: TONE.blue.bg, borderColor: TONE.blue.border } : { background: "var(--panel)", borderColor: "var(--line)" }}
                >
                  {l.end ? (
                    <>
                      <span className="min-w-0">
                        <b className="block text-sm">
                          {fmtClock(l.at)} · {l.head}
                        </b>
                        <span className="text-xs text-[var(--muted)]">Tikslas pasiektas</span>
                      </span>
                      <span className="shrink-0 rounded-lg border px-2.5 py-1 text-xs font-semibold" style={{ background: TONE.go.bg, borderColor: TONE.go.border, color: TONE.go.text }}>
                        Prie pat durų
                      </span>
                    </>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <b className="text-sm">
                          {fmtClock(l.at)} · {l.head}
                        </b>
                        {l.badge && (
                          <span className="shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-semibold" style={{ background: TONE[l.badge.tone].bg, borderColor: TONE[l.badge.tone].border, color: TONE[l.badge.tone].text }}>
                            {l.badge.text}
                          </span>
                        )}
                      </div>
                      {l.what && <p className="mt-1 text-sm font-semibold">{l.what}</p>}
                      {l.sub && <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted)]">{l.sub}</p>}
                      {l.box && (
                        <div className="mt-2 flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-2.5 py-2 text-sm">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: l.box.dot }} />
                          <span className="min-w-0 flex-1">{l.box.text}</span>
                          {l.box.right && <span className="shrink-0 text-xs font-semibold text-[var(--muted)]">{l.box.right}</span>}
                        </div>
                      )}
                      {l.note && <p className="mt-2 text-xs font-medium text-[#1d4ed8]">{l.note}</p>}
                      {(l.status || l.actions) && (
                        <div className="mt-2.5 flex items-center gap-2 border-t border-[var(--line)] pt-2.5">
                          {l.status && (
                            <span className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-[var(--muted)]">
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: l.status.dot }} />
                              <span className="truncate">{l.status.text}</span>
                            </span>
                          )}
                          {l.actions?.map((a) => (
                            <a key={a.label} href={a.href} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-lg border border-[var(--line)] bg-[var(--chip)] px-2.5 py-1 text-xs font-semibold hover:bg-white">
                              {a.label}
                            </a>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Stays at the bottom of the panel while the timeline scrolls. */}
      <div className="sticky bottom-0 z-10 border-t border-[var(--line)] bg-[var(--panel)]/95 p-4 pt-3 backdrop-blur">
        {trip.nav && (
          <a
            href={trip.nav.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-2xl bg-[#0f172a] py-3.5 text-[15px] font-semibold text-white shadow-[0_8px_20px_rgba(15,23,42,0.25)] transition hover:bg-[#1e293b]"
          >
            {trip.nav.label} <span aria-hidden>→</span>
          </a>
        )}
        <div className="mt-2.5 flex items-center justify-between gap-2 text-xs">
          {alt ? (
            <button type="button" onClick={alt.onPick} className="truncate text-[var(--muted)] hover:text-[var(--ink)]">
              Alternatyva: {alt.label} ({min(alt.duration)})
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => document.getElementById("ep-matrix")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="shrink-0 font-semibold text-[var(--marking)]"
          >
            Keisti keliavimo būdą
          </button>
        </div>
      </div>
    </section>
  );
}
