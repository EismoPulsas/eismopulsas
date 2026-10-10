import { wazeNavigationUrl } from "@/lib/driving";
import type { LatLng } from "@/lib/geo";
import { isHybridId, type HybridSummary, type ModeId, type ModeSummary, type ParkingEval } from "@/lib/metrics";
import type { BikeshareResult, PlanResponse, ScooterResult, TransitLeg } from "@/lib/plan-types";
import { fmtDur, fmtEur, fmtKm, MODE_META } from "./format";

// Every way of making the trip – a single mode or car + a second leg – described the same
// way: a list of stages (drive, park, walk, ride…), each with its clock time, a few short
// facts and a link that opens that stage in Waze or Google Maps.

export type StageIcon = "car" | "park" | "walk" | "bus" | "trolley" | "ferry" | "train" | "bikeshare" | "bike" | "scooter";

export type Stage = {
  icon: StageIcon;
  /** Starts at, seconds after local midnight of the departure day. */
  at: number;
  dur: number;
  title: string;
  /** Short facts, shown joined with " · ". */
  facts: string[];
  color: string;
  walk?: boolean;
  /** Public transport line, e.g. "3G". */
  badge?: { text: string; color: string };
  nav?: { app: "Waze" | "Google Maps"; href: string };
  note?: { text: string; tone: "warn" | "info" | "demo" | "charge" };
  /** The car-only trip: traffic details under the drive, the parking choice under the parking. */
  extra?: "drive" | "parking";
};

export type Trip = { stages: Stage[]; arrive: number };

export type AnyOption = ModeSummary | HybridSummary;

const WALK_COLOR = "#94a3b8";
const PARK_COLOR = "#2f6fdf";
const WALK_SPEED = 1.25; // m/s, as in the planner's other walking estimates
const walkSec = (m: number) => Math.round(m / WALK_SPEED);

type GMode = "walking" | "transit" | "bicycling" | "driving";
export const gmapsUrl = (from: LatLng, to: LatLng, mode: GMode) =>
  `https://www.google.com/maps/dir/?api=1&origin=${from.join(",")}&destination=${to.join(",")}&travelmode=${mode}`;
const gmaps = (from: LatLng, to: LatLng, mode: GMode): Stage["nav"] => ({ app: "Google Maps", href: gmapsUrl(from, to, mode) });
const waze = (to: LatLng): Stage["nav"] => ({ app: "Waze", href: wazeNavigationUrl({ to }) });

function walk(at: number, from: LatLng, to: LatLng, metres: number, sec: number, title: string, facts: string[] = []): Stage {
  return { icon: "walk", at, dur: sec, title, facts: [fmtKm(metres), fmtDur(sec), ...facts], color: WALK_COLOR, walk: true, nav: gmaps(from, to, "walking") };
}

export const fmtPrice = (cost: number | null, unknown?: boolean) =>
  cost == null ? "kaina nežinoma" : `${unknown ? "≥ " : ""}${cost < 0.005 ? "0 €" : fmtEur(cost)}`;

/** "nemokama", "1,00 € su VT visai dienai", "3,50 €" or "kaina nežinoma". */
function parkPrice(p: ParkingEval): string {
  if (p.cost == null) return "kaina nežinoma";
  if (p.option.lot?.t.flat) return `${fmtEur(p.cost)} su VT visai dienai`;
  return p.cost < 0.005 ? "nemokama" : fmtEur(p.cost);
}

/** The chance of a space in two or three words; the full sentence stays in the parking list. */
function parkChance(p: ParkingEval): string | null {
  if (p.option.live) return `laisva ${p.option.live.vacant} iš ${p.option.live.capacity}`;
  return p.chance ? { high: "vietų paprastai yra", mid: "vietų būna ne visada", low: "vietų dažnai trūksta" }[p.chance] : null;
}

function parkStage(at: number, p: ParkingEval, title: string, extra?: Stage["extra"]): Stage {
  const chance = parkChance(p);
  const facts = [parkPrice(p), ...(chance ? [chance] : []), ...(p.searchSec >= 60 ? [`~${Math.round(p.searchSec / 60)} min vietai rasti`] : [])];
  return {
    icon: "park",
    at,
    dur: p.searchSec,
    title,
    facts,
    color: PARK_COLOR,
    extra,
    note: p.charge ? { text: `Kol stovi, įkrausite ~${p.charge.kWh} kWh (≈ ${p.charge.km} km), ${p.charge.plug.kW} kW ${p.charge.plug.std}`, tone: "charge" } : undefined,
  };
}

const rideIcon = (type: number): StageIcon => (type === 11 ? "trolley" : type === 4 ? "ferry" : type === 2 ? "train" : "bus");

/** Public transport legs with their timetable times; walks shorter than 30 m are left out. */
function transitStages(legs: TransitLeg[]): Stage[] {
  const out: Stage[] = [];
  let free = legs[0] ? (legs[0].kind === "walk" ? legs[0].start : legs[0].dep) : 0;
  legs.forEach((l, i) => {
    if (l.kind === "walk") {
      if (l.distance >= 30) {
        const next = legs[i + 1];
        const title = next?.kind === "ride" ? `Eikite iki stotelės „${next.from.name}“` : l.toName && i < legs.length - 1 ? `Eikite iki „${l.toName}“` : "Eikite iki tikslo";
        const s = walk(l.start, l.from, l.to, l.distance, l.end - l.start, title);
        if (l.tight) s.note = { text: "Persėsti spėsite tik paskubėję", tone: "warn" };
        out.push(s);
      }
      free = l.end;
      return;
    }
    const wait = l.dep - free;
    out.push({
      icon: rideIcon(l.route.type),
      at: l.dep,
      dur: l.arr - l.dep,
      title: `→ ${l.headsign || l.route.long}`,
      badge: { text: l.route.short || "VT", color: l.route.color || MODE_META.transit.color },
      facts: [
        `${l.from.name} → ${l.to.name}`,
        `${l.stops} st. · ${fmtDur(l.arr - l.dep)}`,
        ...(wait >= 120 ? [`laukti ${fmtDur(wait)}`] : []),
        ...(l.laneMeters > 100 ? [`A juosta ${fmtKm(l.laneMeters)}`] : []),
      ],
      color: l.route.color || MODE_META.transit.color,
      nav: gmaps(l.from.pos, l.to.pos, "transit"),
    });
    free = l.arr;
  });
  return out;
}

/** Cyclocity from `from`: walk to the station, take a bike (1 min), ride, dock it (1 min), walk to B. */
function bikeshareStages(at: number, from: LatLng, to: LatLng, b: BikeshareResult): Stage[] {
  const out: Stage[] = [];
  let t = at;
  if (b.walkTo >= 30) {
    out.push(walk(t, from, b.from.pos, b.walkTo, walkSec(b.walkTo), `Eikite iki Cyclocity stotelės „${b.from.name}“`, [b.from.bikes == null ? "dviračių skaičius nežinomas" : `laisvų dviračių ${b.from.bikes}`]));
    t += walkSec(b.walkTo);
  }
  out.push({
    icon: "bikeshare",
    at: t,
    dur: b.rideDuration + 120,
    title: `Cyclocity dviračiu iki „${b.to.name}“`,
    facts: [fmtKm(b.ride), fmtDur(b.rideDuration), b.to.docks == null ? "vietų skaičius nežinomas" : `laisvų vietų ${b.to.docks}`],
    color: MODE_META.bikeshare.color,
    nav: gmaps(b.from.pos, b.to.pos, "bicycling"),
  });
  t += b.rideDuration + 120;
  if (b.walkFrom >= 30) out.push(walk(t, b.to.pos, to, b.walkFrom, walkSec(b.walkFrom), "Eikite iki tikslo"));
  return out;
}

/** Scooter from `from`: own (straight away), or walk to a shared one (or find one), ride, maybe walk from a marked spot. */
function scooterStages(at: number, from: LatLng, to: LatLng, sc: ScooterResult): Stage[] {
  const out: Stage[] = [];
  let t = at;
  const own = sc.source === "own";
  const demo = sc.source === "demo";
  if (!own) {
    if (sc.vehicle) {
      const s = walk(t, from, sc.vehicle.pos, sc.vehicle.walk, walkSec(sc.vehicle.walk) + 30, "Eikite iki paspirtuko", [
        ...(sc.vehicle.battery != null ? [`baterija ${sc.vehicle.battery} %`] : []),
        ...(sc.operator && !demo ? [sc.operator] : []),
      ]);
      if (demo) s.note = { text: "DEMO – paspirtuko vieta išgalvota, kol negauta operatoriaus duomenų", tone: "demo" };
      out.push(s);
      t += s.dur;
    } else {
      out.push({ icon: "walk", at: t, dur: 180, title: "Raskite paspirtuką šalia", facts: ["≈ 3 min", "tiksli vieta nežinoma"], color: WALK_COLOR, walk: true });
      t += 180;
    }
  }
  const start = own ? from : (sc.vehicle?.pos ?? from);
  const end = sc.endSpot?.pos ?? to;
  const dur = sc.rideDuration + (own ? 90 : 60);
  out.push({
    icon: "scooter",
    at: t,
    dur,
    title: `${own ? "Savu paspirtuku" : "Paspirtuku"} iki ${sc.endSpot ? "stovėjimo vietos" : "tikslo"}`,
    facts: [fmtKm(sc.distance), fmtDur(sc.rideDuration), ...(sc.endSpot?.addr ? [sc.endSpot.addr] : [])],
    color: MODE_META.scooter.color,
    nav: gmaps(start, end, "bicycling"),
    note: sc.endSpot ? { text: "Senamiestyje nuomojamą paspirtuką galima palikti tik pažymėtoje vietoje", tone: "info" } : undefined,
  });
  t += dur;
  if (sc.endSpot && sc.endSpot.walk >= 30) out.push(walk(t, sc.endSpot.pos, to, sc.endSpot.walk, walkSec(sc.endSpot.walk), "Eikite iki tikslo"));
  return out;
}

function trafficFact(plan: PlanResponse): string | null {
  const d = plan.car?.drive.traffic.delaySeconds;
  return d != null && d > 60 ? `spūstys +${fmtDur(d)}` : null;
}

function modeTrip(plan: PlanResponse, m: ModeSummary): Trip {
  const t0 = plan.depart.sec;
  const A = plan.from;
  const B = plan.to;
  switch (m.id) {
    case "car": {
      const c = plan.car!;
      const p = m.parking ?? null;
      const atB = !p || p.option.kind === "zone";
      const target = p && !atB ? (p.option.navigationPos ?? p.option.pos) : c.drive.to;
      const traffic = trafficFact(plan);
      const stages: Stage[] = [
        {
          icon: "car",
          at: t0 + 120,
          dur: c.drive.duration,
          title: atB ? "Važiuokite iki tikslo" : "Važiuokite iki stovėjimo vietos",
          facts: [fmtKm(c.drive.distance), fmtDur(c.drive.duration), ...(traffic ? [traffic] : [])],
          color: MODE_META.car.color,
          nav: waze(target),
          extra: "drive",
        },
      ];
      let t = t0 + 120 + c.drive.duration;
      if (p) {
        stages.push(parkStage(t, p, atB ? "Palikite automobilį gatvėje prie tikslo" : `Palikite automobilį: ${p.option.name}`, "parking"));
        t += p.searchSec;
        if (p.option.walk >= 30) stages.push(walk(t, p.option.pos, B, p.option.walk, p.walkSec, "Eikite iki tikslo"));
      }
      return { stages, arrive: t0 + m.duration };
    }
    case "transit": {
      const tr = plan.transit!;
      return { stages: transitStages(tr.legs), arrive: tr.arrive };
    }
    case "bikeshare":
      return { stages: bikeshareStages(t0, A, B, plan.bikeshare!), arrive: t0 + m.duration };
    case "scooter":
      return { stages: scooterStages(t0, A, B, plan.scooter!), arrive: t0 + m.duration };
    case "bike":
      return {
        stages: [{ icon: "bike", at: t0, dur: m.duration, title: "Dviračiu iki tikslo", facts: [fmtKm(m.distance), fmtDur(m.duration)], color: MODE_META.bike.color, nav: gmaps(A, B, "bicycling") }],
        arrive: t0 + m.duration,
      };
    case "walk":
      return { stages: [walk(t0, A, B, m.distance, m.duration, "Eikite pėsčiomis iki tikslo")], arrive: t0 + m.duration };
  }
}

function hybridTrip(plan: PlanResponse, h: HybridSummary): Trip {
  const o = h.hybrid;
  const hub = o.hub.navigationPos ?? o.hub.pos;
  const stages: Stage[] = [
    {
      icon: "car",
      at: plan.depart.sec + 120,
      dur: o.car.duration,
      title: "Važiuokite iki stovėjimo vietos",
      facts: [fmtKm(o.car.distance), `≈ ${fmtDur(o.car.duration)}`, ...(o.hub.curb ? ["privažiuosite iš stovėjimo pusės"] : [])],
      color: MODE_META.car.color,
      nav: waze(hub),
    },
    parkStage(o.parkedAt, h.parking, `Palikite automobilį: ${o.hub.name}`),
  ];
  const leave = o.parkedAt + o.searchSec;
  const s = o.second;
  if (s.kind === "transit") stages.push(...transitStages(s.transit.legs));
  else if (s.kind === "bikeshare") stages.push(...bikeshareStages(leave, hub, plan.to, s.bikeshare));
  else stages.push(...scooterStages(leave, hub, plan.to, s.scooter));
  return { stages, arrive: o.arrive };
}

export function tripOf(plan: PlanResponse, o: AnyOption): Trip {
  return isHybridId(o.id) ? hybridTrip(plan, o as HybridSummary) : modeTrip(plan, o as ModeSummary);
}

/** Pieces of the trip for the bar under each option: widths follow the minutes, waits are gaps. */
export function tripPieces(trip: Trip): { sec: number; color: string; walk?: boolean; wait?: boolean }[] {
  const out: { sec: number; color: string; walk?: boolean; wait?: boolean }[] = [];
  let t = trip.stages[0]?.at ?? 0;
  for (const s of trip.stages) {
    if (s.at - t > 60) out.push({ sec: s.at - t, color: "transparent", wait: true });
    if (s.dur > 0) out.push({ sec: s.dur, color: s.color, walk: s.walk });
    t = Math.max(t, s.at + s.dur);
  }
  return out;
}

const GMAPS_MODE: Record<Exclude<ModeId, "car">, GMode> = { transit: "transit", bikeshare: "bicycling", scooter: "bicycling", bike: "bicycling", walk: "walking" };

/** What "Pradėti navigaciją" opens: the drive in Waze (to the parking), otherwise the whole trip in Google Maps. */
export function tripNav(plan: PlanResponse, o: AnyOption, trip: Trip): { href: string; app: "Waze" | "Google Maps" } | null {
  if (isHybridId(o.id) || o.id === "car") return trip.stages[0]?.nav ?? null;
  return { app: "Google Maps", href: gmapsUrl(plan.from, plan.to, GMAPS_MODE[o.id as Exclude<ModeId, "car">]) };
}
