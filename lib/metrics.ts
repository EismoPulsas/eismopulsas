import { fareOf, type FareLine } from "./fares";
import type { Charger, ChargerPlug, Connector, LotTariff, ParkingOption, ParkingRule, ParkingZone, PlanResponse, RideLeg } from "./plan-types";
import { localSecondsAt } from "./departure";

// Money, time, CO₂ and calories for each way of making the trip. Everything here
// runs in the browser so changing a setting updates the comparison instantly.

export type Fuel = "petrol" | "diesel" | "lpg" | "hybrid" | "electric";

/**
 * Defaults: LEA average pump prices (2026 m. rugpjūtis), consumption typical for
 * Lithuania's fairly old car fleet. CO₂ per litre / kWh burned or drawn.
 */
export const FUELS: Record<Fuel, { label: string; unit: string; consumption: number; price: number; co2: number }> = {
  petrol: { label: "Benzinas", unit: "l", consumption: 7.5, price: 1.77, co2: 2.31 },
  diesel: { label: "Dyzelinas", unit: "l", consumption: 6.5, price: 2.02, co2: 2.68 },
  lpg: { label: "Dujos", unit: "l", consumption: 9.5, price: 0.85, co2: 1.66 },
  hybrid: { label: "Hibridas", unit: "l", consumption: 5.0, price: 1.77, co2: 2.31 },
  electric: { label: "Elektra", unit: "kWh", consumption: 18, price: 0.25, co2: 0.15 },
};

/** Tyres, servicing and depreciation per km (optional, off by default). */
export const WEAR_PER_KM = 0.12;
/** kg CO₂ one grown tree absorbs per year. */
export const TREE_KG_YEAR = 22;
/** In bad weather a walk longer than this (s) is not recommended either. */
export const WET_WALK_MAX = 15 * 60;
/** Weeks a year a commuter actually travels (holidays off). */
export const WEEKS_PER_YEAR = 46;
/** Shared e-scooter, life cycle incl. collection vans and battery swaps (ITF 2020, newer fleets). */
export const SCOOTER_CO2_KM = 0.067;
/** Cyclocity: first 30 min of each ride free with any pass (3-day pass 2,90 €), then ≈ 1 € per 30 min. */
export const BIKESHARE_FREE_MIN = 30;
export const BIKESHARE_EXTRA_PER_30 = 1;

/** kg CO₂ per passenger-km, by vehicle. */
function rideCo2(r: RideLeg): number {
  if (r.route.type === 11) return 0.02; // trolleybus, grid electricity
  if (r.route.type === 4) return 0.12; // ferry
  if (r.route.fare === "intercity" || r.route.fare === "regional") return 0.035; // coach, well filled
  return 0.075; // city bus at average occupancy
}

export type Priority = "balanced" | "fast" | "cheap" | "green";

/** The user's profile (kept in the browser only). */
export type Settings = {
  /** false: the car option is shown as not available. */
  hasCar: boolean;
  fuel: Fuel;
  consumption: number;
  fuelPrice: number;
  /** A hybrid that charges from a plug (counts as an EV for charging, not for JUDU permits). */
  plugIn: boolean;
  /** EV: the connectors the car takes. */
  connectors: Connector[];
  /** EV: the most the car accepts, kW. */
  acKw: number;
  dcKw: number;
  /** EV: usable battery, kWh (caps what a long stop can charge). */
  batteryKwh: number;
  /** Holds JUDU's (free) electric-vehicle parking permit. */
  evPermit: boolean;
  parkingHours: number;
  /** Longest acceptable walk from the car to B, minutes. */
  maxWalkMin: number;
  wear: boolean;
  ticket: "single" | "pass";
  discount: 0 | 50 | 80;
  tripsPerWeek: number;
  priority: Priority;
  /** Shared scooter price: unlock + per minute (no open tariff data, editable). */
  scooterUnlock: number;
  scooterPerMin: number;
};

export const DEFAULT_SETTINGS: Settings = {
  hasCar: true,
  fuel: "petrol",
  consumption: FUELS.petrol.consumption,
  fuelPrice: FUELS.petrol.price,
  plugIn: false,
  connectors: ["T2", "CCS"],
  acKw: 11,
  dcKw: 100,
  batteryKwh: 60,
  evPermit: false,
  parkingHours: 2,
  maxWalkMin: 10,
  wear: false,
  ticket: "single",
  discount: 0,
  tripsPerWeek: 10,
  priority: "balanced",
  scooterUnlock: 0.5,
  scooterPerMin: 0.15,
};

/** Charging points are shown and counted only for cars that can use them. */
export const isEv = (s: Settings) => s.fuel === "electric" || (s.fuel === "hybrid" && s.plugIn);
/** JUDU issues the EV permit for fully electric cars only, not hybrids. */
const hasEvPermit = (s: Settings) => s.fuel === "electric" && s.evPermit;

export type ModeId = "car" | "transit" | "bikeshare" | "scooter" | "bike" | "walk";

/** `unknown`: the price could not be worked out; `value` is then 0 and must not be shown as a price. */
export type CostLine = { label: string; value: number; approx?: boolean; unknown?: boolean; note?: string };

export type ModeSummary = {
  id: ModeId;
  duration: number;
  distance: number;
  cost: number;
  costLines: CostLine[];
  co2: number;
  kcal: number;
  feasible: boolean;
  why?: string;
  /** Possible, but the weather says no (rain, ice, gale): never picked as best. */
  weatherWarning?: string;
  /** Car: where it is left at B. */
  parking?: ParkingEval | null;
};

/** Paid parking hours in [start, start + hours] under the zone's rules. */
export function paidParkingHours(zone: ParkingZone, date: string, start: number, hours: number): number {
  if (!zone.rules) return hours; // unknown schedule: assume it is paid
  const d = new Date(`${date}T00:00:00Z`);
  const wd = d.getUTCDay() || 7;
  const md = (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  const a = start / 3600;
  const b = a + hours;
  let paid = 0;
  for (const r of zone.rules) {
    if (r.season) {
      const [from, to] = r.season;
      const inSeason = from <= to ? md >= from && md <= to : md >= from || md <= to;
      if (!inSeason) continue;
    }
    if (!r.days.includes(wd)) continue;
    for (const [h0, h1] of r.hours) paid += Math.max(0, Math.min(b, h1) - Math.max(a, h0));
  }
  return Math.min(hours, paid);
}

const fmt2 = (v: number) => `${v.toFixed(2).replace(".", ",")} €`;

/** Street parking in a municipal zone, with the Vilnius EV rules (JUDU EV permit). */
export function zoneCost(z: ParkingZone, date: string, start: number, hours: number, s: Settings): { cost: number; note: string } {
  const paid = paidParkingHours(z, date, start, hours);
  if (!paid) return { cost: 0, note: "šiuo metu nemokama" };
  const first = z.firstHour ?? z.price;
  if (hasEvPermit(s) && z.city === "Vilnius") {
    // Blue zone: the first hour is free for EVs, then 3,50 € and 4 €/h; elsewhere free with the permit.
    if (!z.zone.startsWith("Mėlyn")) return { cost: 0, note: "nemokama su JUDU elektromobilio leidimu" };
    const cost = Math.min(Math.max(paid - 1, 0), 1) * first + Math.max(paid - 2, 0) * z.price;
    return { cost, note: "elektromobiliui pirma valanda nemokama" };
  }
  const cost = Math.min(paid, 1) * first + Math.max(paid - 1, 0) * z.price;
  return { cost, note: `${paid.toFixed(1).replace(".", ",")} val. mokamo laiko × ${fmt2(z.price)}${z.firstHour ? ` (pirma ${fmt2(z.firstHour)})` : ""}` };
}

/** Is the moment (sec after local midnight of `date`) inside the rules? null = always. */
function ruleAt(rules: ParkingRule[] | null | undefined, date: string, sec: number): boolean {
  if (!rules) return true;
  const d = new Date(Date.parse(`${date}T00:00:00Z`) + Math.floor(sec / 86400) * 86400000);
  const wd = d.getUTCDay() || 7;
  const md = (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  const h = (((sec % 86400) + 86400) % 86400) / 3600;
  return rules.some((r) => {
    if (r.season) {
      const [from, to] = r.season;
      if (!(from <= to ? md >= from && md <= to : md >= from || md <= to)) return false;
    }
    return r.days.includes(wd) && r.hours.some(([a, b]) => h >= a && h < b);
  });
}

/**
 * What staying `hours` from `start` (sec after local midnight of `date`) costs in a car
 * park, or null when its rules are unknown. Every started billing step is paid at the
 * rate in force when it starts.
 */
export function lotCost(t: LotTariff, date: string, start: number, hours: number): number | null {
  if (!t.known) return null;
  if (t.free) return 0;
  const total = hours * 60;
  if (t.flat) {
    // P+R: valid until the end of the day; each further day costs another ticket.
    const days = Math.floor((start + total * 60) / 86400) - Math.floor(start / 86400) + 1;
    return t.flat.price * days;
  }
  const step = t.step ?? 1;
  const freeMin = t.freeMin && ruleAt(t.freeRules, date, start) ? t.freeMin : 0;
  let cost = 0;
  for (let m = freeMin; m < total; m += step) {
    let perHour = 0;
    if (t.tiers) perHour = [...t.tiers].reverse().find((x) => m >= x.fromMin)?.perHour ?? 0;
    else perHour = t.rates?.find((r) => ruleAt(r.rules, date, start + m * 60))?.perHour ?? 0;
    cost += (perHour * step) / 60;
  }
  if (t.dayCap) cost = Math.min(cost, t.dayCap * Math.ceil(total / 1440));
  return Math.round(cost * 100) / 100;
}

export type Chance = "high" | "mid" | "low";

export type ParkingEval = {
  option: ParkingOption;
  /** € for the stay; null = unknown. */
  cost: number | null;
  costNote: string;
  /** Seconds: walking from the car to B, and finding a space / getting in. */
  walkSec: number;
  searchSec: number;
  chance: Chance | null;
  chanceText: string | null;
  /** EV: what charging during the stay could give. */
  charge: { kW: number; kWh: number; km: number; cost: number | null; plug: ChargerPlug; charger: Charger } | null;
  usable: boolean;
  why?: string;
};

const WEEKDAY_LT = ["pirmadienį", "antradienį", "trečiadienį", "ketvirtadienį", "penktadienį", "šeštadienį", "sekmadienį"];
const fmtH = (sec: number) => `${String(Math.floor((((sec % 86400) + 86400) % 86400) / 3600)).padStart(2, "0")}:00`;
const pct = (p: number) => (p >= 95 ? "beveik visada" : p >= 75 ? "dažniausiai" : p >= 40 ? "kartais" : "retai");
export const fmtStay = (min: number) => (min % 60 ? `${min} min.` : `${min / 60} val.`);

/** The best plug for this car at a charger, and what it could charge during the stay. */
function bestCharge(chargers: Charger[] | undefined, s: Settings, hours: number): ParkingEval["charge"] {
  if (!chargers?.length || !isEv(s)) return null;
  let best: ParkingEval["charge"] = null;
  for (const c of chargers)
    for (const plug of c.plugs) {
      if (!s.connectors.includes(plug.std)) continue;
      const kW = Math.min(plug.kW, plug.dc ? s.dcKw : s.acKw);
      if (!kW || (best && kW <= best.kW)) continue;
      // Energy the car could take in the time parked, at most 20 → 90 % of the battery.
      const kWh = Math.round(Math.min(kW * hours * 0.9, s.batteryKwh * 0.7));
      const cost = plug.perKwh != null ? kWh * plug.perKwh + (plug.perMin ?? 0) * hours * 60 + (plug.start ?? 0) : null;
      best = { kW, kWh, km: Math.round((kWh / s.consumption) * 100), cost, plug, charger: c };
    }
  return best;
}

/** Cost, time and chance of a space for one place to leave the car, under this profile. */
export function evalParking(o: ParkingOption, plan: PlanResponse, s: Settings): ParkingEval {
  const date = plan.depart.date;
  let start = plan.car ? localSecondsAt(plan.car.drive.arrivalAt, date) : plan.depart.sec;
  const hours = s.parkingHours;
  const walkSec = Math.round(o.walk / 1.3);
  const base: ParkingEval = { option: o, cost: null, costNote: "", walkSec, searchSec: 0, chance: null, chanceText: null, charge: bestCharge(o.chargers, s, hours), usable: true };

  if (o.kind === "zone" || o.kind === "street") {
    // Looking for a free space on the street takes longer where streets are full.
    const busy = (o.streetOccupancy ?? 0) >= 85;
    base.searchSec = o.kind === "zone" ? (o.zone ? 360 : 180) : busy ? 300 : 180;
    start += base.searchSec;
    if (o.streetOccupancy != null) {
      base.chance = o.streetOccupancy >= 90 ? "low" : o.streetOccupancy >= 75 ? "mid" : "high";
      base.chanceText = `Šios zonos gatvėse paprastai užimta ~${o.streetOccupancy} % vietų`;
    }
    if (o.zone) {
      const z = zoneCost(o.zone, date, start, hours, s);
      base.cost = z.cost;
      base.costNote = z.note;
    } else if (o.fee === "yes") {
      base.costNote = "mokama, kaina nežinoma";
    } else {
      base.cost = 0;
      base.costNote = "ne mokamoje zonoje";
    }
    if (o.maxStayMin && o.maxStayMin < hours * 60) {
      base.usable = false;
      base.why = `Ilgiausiai ${fmtStay(o.maxStayMin)}`;
    }
    return base;
  }

  if (o.kind === "charger") {
    if (!isEv(s)) return { ...base, usable: false, why: "Tik elektromobiliams" };
    if (!base.charge) return { ...base, usable: false, why: "Netinka jūsų automobilio jungtis" };
    base.searchSec = 60;
    base.costNote = "stovėjimo kaina – pagal vietos taisykles";
    return base;
  }

  // Car park.
  const l = o.lot!;
  base.searchSec = l.gated ? 90 : 60;
  start += base.searchSec;
  if (hasEvPermit(s) && l.src === "judu" && !l.gated && l.t.known && !l.t.flat) {
    // JUDU's EV permit covers its car parks without a barrier.
    base.cost = 0;
    base.costNote = "nemokama su JUDU elektromobilio leidimu";
  } else {
    base.cost = lotCost(l.t, date, start, hours);
    base.costNote = base.cost == null ? "taisyklės nežinomos" : l.t.flat ? "parkavimas + viešasis transportas visai dienai" : base.cost === 0 ? "nemokama" : (l.t.text[0] ?? "");
  }
  if (l.t.maxStayMin && l.t.maxStayMin < hours * 60) {
    base.usable = false;
    base.why = `Ilgiausiai ${fmtStay(l.t.maxStayMin)}`;
  }
  if (o.live) {
    base.chance = o.live.vacant >= 5 ? "high" : o.live.vacant > 0 ? "mid" : "low";
    base.chanceText = `Dabar laisva ${o.live.vacant} iš ${o.live.capacity}`;
  } else if (o.typical?.p != null) {
    const p = o.typical.p;
    const wd = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6 + Math.floor(start / 86400)) % 7;
    base.chance = p >= 90 ? "high" : p >= 60 ? "mid" : "low";
    base.chanceText = `${WEEKDAY_LT[wd][0].toUpperCase()}${WEEKDAY_LT[wd].slice(1)} ${fmtH(start)} vietą rasite ${pct(p)} (${p} % dienų${o.typical.free != null ? `, ~${o.typical.free} laisvų` : ""})`;
  }
  return base;
}

/** € a minute of the user's time is worth when weighing price against walking ("balanced"). */
const MINUTE_EUR = { balanced: 0.15, fast: 1, cheap: 0.02, green: 0.15 } satisfies Record<Priority, number>;

/** The place to leave the car that suits the priority best; never one with an unknown price. */
export function bestParking(evals: ParkingEval[], p: Priority): ParkingEval | null {
  const ok = evals.filter((e) => e.usable && e.cost != null && e.chance !== "low");
  const pool = ok.length ? ok : evals.filter((e) => e.usable && e.cost != null);
  if (!pool.length) return null;
  // Prices tagged by OpenStreetMap volunteers can be out of date: a small penalty keeps
  // official and operator-published prices ahead when the difference is small.
  const score = (e: ParkingEval) =>
    e.cost! + ((e.walkSec + e.searchSec) / 60) * MINUTE_EUR[p] + (e.chance === "mid" ? 0.5 : 0) + (e.option.lot?.src === "osm" && e.cost! > 0 ? 0.5 : 0);
  return [...pool].sort((a, b) => score(a) - score(b))[0];
}

/** All options under this profile; chargers only for cars that can charge. */
export function parkingEvals(plan: PlanResponse, s: Settings): ParkingEval[] {
  return (plan.car?.parkingOptions ?? []).filter((o) => o.kind !== "charger" || isEv(s)).map((o) => evalParking(o, plan, s));
}

export function summarize(plan: PlanResponse, s: Settings, parkingId?: string | null): ModeSummary[] {
  const out: ModeSummary[] = [];

  if (plan.car) {
    const c = plan.car;
    const km = c.distance / 1000;
    const units = (km * s.consumption) / 100;
    const lines: CostLine[] = [{ label: FUELS[s.fuel].label, value: units * s.fuelPrice, note: `${units.toFixed(1)} ${FUELS[s.fuel].unit}` }];
    const evals = parkingEvals(plan, s);
    const park = evals.find((e) => e.option.id === parkingId) ?? bestParking(evals, s.priority);
    let duration = c.duration;
    if (park) {
      // Replace the server's default "find a spot and walk" allowance with this place's.
      duration = c.drive.duration + 120 + park.searchSec + park.walkSec;
      lines.push(
        park.cost == null
          ? { label: `Parkavimas: ${park.option.name}`, value: 0, unknown: true, note: park.costNote }
          : { label: `Parkavimas: ${park.option.name}`, value: park.cost, note: park.costNote },
      );
    } else if (c.parking) {
      const { cost, note } = zoneCost(c.parking, plan.depart.date, c.arrive, s.parkingHours, s);
      lines.push({ label: `Parkavimas, ${c.parking.zone.toLowerCase()}`, value: cost, note });
    }
    if (s.wear) lines.push({ label: "Nusidėvėjimas, padangos, servisas", value: km * WEAR_PER_KM, approx: true, note: `${WEAR_PER_KM} €/km` });
    out.push({
      id: "car",
      duration,
      distance: c.distance,
      cost: lines.reduce((a, l) => a + l.value, 0),
      costLines: lines,
      co2: units * FUELS[s.fuel].co2,
      kcal: 0,
      feasible: s.hasCar,
      why: s.hasCar ? undefined : "Profilyje nurodyta, kad automobilio neturite",
      parking: park,
    });
  }

  if (plan.transit) {
    const t = plan.transit;
    const rides = t.legs.filter((l): l is RideLeg => l.kind === "ride");
    const fare = fareOf(rides, s);
    out.push({
      id: "transit",
      duration: t.duration,
      distance: t.rideDistance + t.walkDistance,
      cost: fare.total,
      costLines: fare.lines.map((l: FareLine) => ({ label: l.name, value: l.price, approx: l.approx, note: l.note })),
      co2: rides.reduce((a, r) => a + (r.distance / 1000) * rideCo2(r), 0),
      kcal: (t.walkDistance / 1000) * 55,
      feasible: true,
    });
  }

  if (plan.bikeshare) {
    const b = plan.bikeshare;
    const extra = Math.max(0, Math.ceil((b.rideDuration / 60 - BIKESHARE_FREE_MIN) / 30));
    out.push({
      id: "bikeshare",
      duration: b.duration,
      distance: b.walkTo + b.ride + b.walkFrom,
      cost: extra * BIKESHARE_EXTRA_PER_30,
      costLines: [
        {
          label: b.system,
          value: extra * BIKESHARE_EXTRA_PER_30,
          approx: extra > 0,
          note: extra ? `${Math.round(b.rideDuration / 60)} min, virš 30 nemokamų` : "pirmos 30 min nemokamai su bilietu (nuo 2,90 € / 3 d.)",
        },
      ],
      co2: 0,
      kcal: (b.ride / 1000) * 28 + ((b.walkTo + b.walkFrom) / 1000) * 55,
      feasible: b.rideDuration <= 60 * 60,
    });
  }

  if (plan.scooter) {
    const sc = plan.scooter;
    const minutes = Math.ceil(sc.rideDuration / 60);
    const cost = s.scooterUnlock + minutes * s.scooterPerMin;
    out.push({
      id: "scooter",
      duration: sc.duration,
      distance: sc.distance,
      cost,
      costLines: [{ label: "Paspirtuko nuoma", value: cost, approx: true, note: `${s.scooterUnlock.toFixed(2)} € + ${minutes} min × ${s.scooterPerMin.toFixed(2)} €` }],
      co2: (sc.distance / 1000) * SCOOTER_CO2_KM,
      kcal: 0,
      feasible: sc.rideDuration <= 45 * 60,
      why: sc.rideDuration > 45 * 60 ? "Per toli paspirtukui" : undefined,
    });
  }

  if (plan.bike) {
    const b = plan.bike;
    out.push({
      id: "bike",
      duration: b.duration,
      distance: b.distance,
      cost: 0,
      costLines: [],
      co2: 0,
      kcal: (b.distance / 1000) * 28,
      feasible: b.duration <= 75 * 60,
      why: b.duration > 75 * 60 ? "Per toli kasdienei kelionei dviračiu" : undefined,
    });
  }

  if (plan.walk) {
    const w = plan.walk;
    out.push({
      id: "walk",
      duration: w.duration,
      distance: w.distance,
      cost: 0,
      costLines: [],
      co2: 0,
      kcal: (w.distance / 1000) * 55,
      feasible: w.duration <= 50 * 60,
      why: w.duration > 50 * 60 ? "Per toli eiti pėsčiomis" : undefined,
    });
  }

  // Rain, ice or a gale: riding a bike or scooter is not recommended, nor is a long walk.
  const wx = plan.weather;
  if (wx?.risk === "bad") {
    const why = `Nerekomenduojama: ${wx.reasons.join(", ")}`;
    for (const m of out) {
      if (m.id === "bike" || m.id === "bikeshare" || m.id === "scooter") m.weatherWarning = why;
      if (m.id === "walk" && m.duration > WET_WALK_MAX) m.weatherWarning = why;
    }
  }
  return out;
}

const WEIGHTS: Record<Priority, { time: number; cost: number; co2: number }> = {
  balanced: { time: 0.45, cost: 0.35, co2: 0.2 },
  fast: { time: 0.85, cost: 0.1, co2: 0.05 },
  cheap: { time: 0.2, cost: 0.7, co2: 0.1 },
  green: { time: 0.25, cost: 0.15, co2: 0.6 },
};

/** Weighted score per mode (0 = best on everything); the lowest feasible one wins. */
export function rank(modes: ModeSummary[], p: Priority): { best: ModeId | null; scores: Map<ModeId, number> } {
  const feasible = modes.filter((m) => m.feasible);
  // Bad weather rules riding out, unless nothing else is left.
  const dry = feasible.filter((m) => !m.weatherWarning);
  const ok = dry.length ? dry : feasible;
  const scores = new Map<ModeId, number>();
  if (!ok.length) return { best: null, scores };
  const norm = (key: "duration" | "cost" | "co2", v: number) => {
    const vals = ok.map((m) => m[key]);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    return hi - lo < 1e-9 ? 0 : (v - lo) / (hi - lo);
  };
  const w = WEIGHTS[p];
  for (const m of ok) scores.set(m.id, w.time * norm("duration", m.duration) + w.cost * norm("cost", m.cost) + w.co2 * norm("co2", m.co2));
  const best = [...scores].sort((a, b) => a[1] - b[1])[0][0];
  return { best, scores };
}

export type Savings = {
  perTrip: { money: number; time: number; co2: number };
  perYear: { money: number; hours: number; co2: number; trees: number; fuel: number; trips: number };
};

/** What switching from the car to `alt` saves (positive) or costs (negative). */
export function savingsVsCar(car: ModeSummary, alt: ModeSummary, s: Settings, carDistance: number): Savings {
  const trips = s.tripsPerWeek * WEEKS_PER_YEAR;
  const money = car.cost - alt.cost;
  const time = car.duration - alt.duration;
  const co2 = car.co2 - alt.co2;
  return {
    perTrip: { money, time, co2 },
    perYear: {
      money: money * trips,
      hours: (time * trips) / 3600,
      co2: co2 * trips,
      trees: (co2 * trips) / TREE_KG_YEAR,
      fuel: ((carDistance / 1000) * s.consumption * trips) / 100,
      trips,
    },
  };
}
