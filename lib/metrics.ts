import { fareOf, type FareLine } from "./fares";
import type { Charger, ChargerPlug, Connector, HybridOption, Lot, LotTariff, ParkingOption, ParkingRule, ParkingZone, PlanResponse, RideLeg, ScooterResult, SecondKind } from "./plan-types";
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
/** Own e-scooter, life cycle: no collection vans, a longer life (ITF 2020). */
export const OWN_SCOOTER_CO2_KM = 0.042;
/** E-scooter in town: 25 km/h cap, crossings and pavements in between. */
export const SCOOTER_SPEED = 17 / 3.6;
/** Own scooter: unfold it at the start, fold and lock it at the end, seconds. */
export const OWN_SCOOTER_HANDLING = 90;
/** A walk this short is always offered: it needs no vehicle at all. */
export const SHORT_WALK_MAX = 15 * 60;
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

/** Vehicles the user picks under A and B; walking is part of every trip and is not picked. */
export type TravelMode = "car" | "transit" | "scooter" | "bike";
export const TRAVEL_MODES: TravelMode[] = ["car", "transit", "scooter", "bike"];

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
  /** The vehicles the user wants to travel by: only options using nothing else are shown. */
  travel: TravelMode[];
  /** Rides their own e-scooter (from A, or from wherever the car is left) instead of renting one. */
  ownScooter: boolean;
  /** Rides their own bike instead of Cyclocity (a bike does not fit in the car: combinations stay Cyclocity). */
  ownBike: boolean;
  /** EV: prefer leaving the car at a charger when it stands for long. */
  chargeWhenParked: boolean;
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
  travel: [...TRAVEL_MODES],
  ownScooter: false,
  ownBike: false,
  chargeWhenParked: true,
};

/** Charging points are shown and counted only for cars that can use them. */
export const isEv = (s: Settings) => s.fuel === "electric" || (s.fuel === "hybrid" && s.plugIn);
/** JUDU issues the EV permit for fully electric cars only, not hybrids. */
const hasEvPermit = (s: Settings) => s.fuel === "electric" && s.evPermit;

export type ModeId = "car" | "transit" | "bikeshare" | "scooter" | "bike" | "walk";

/** Does the user's choice of vehicles allow making the whole trip this way? */
export function modeAllowed(m: { id: ModeId; duration: number }, s: Settings): boolean {
  const t = s.travel;
  switch (m.id) {
    case "car":
      return s.hasCar && t.includes("car");
    case "transit":
      return t.includes("transit");
    case "scooter":
      return t.includes("scooter");
    case "bike":
      return t.includes("bike") && s.ownBike;
    case "bikeshare":
      return t.includes("bike") && !s.ownBike;
    case "walk":
      return m.duration <= SHORT_WALK_MAX;
  }
}

/** How the user accepts to continue from a parked car: only with the car and that vehicle picked. */
export function hybridKinds(s: Settings): SecondKind[] {
  if (!s.hasCar || !s.travel.includes("car")) return [];
  const out: SecondKind[] = [];
  if (s.travel.includes("transit")) out.push("transit");
  if (s.travel.includes("bike")) out.push("bikeshare");
  if (s.travel.includes("scooter")) out.push("scooter");
  return out;
}

/** With the user's own scooter the ride starts at A along the bike route: no walk to a vehicle, nothing to rent. */
export function withOwnScooter(plan: PlanResponse): PlanResponse {
  if (!plan.bike) return { ...plan, scooter: null };
  const rideDuration = Math.round(plan.bike.distance / SCOOTER_SPEED);
  const scooter: ScooterResult = {
    city: null,
    source: "own",
    operator: null,
    vehicle: null,
    distance: plan.bike.distance,
    rideDuration,
    duration: rideDuration + OWN_SCOOTER_HANDLING,
    geometry: plan.bike.geometry,
  };
  return { ...plan, scooter };
}

/** `unknown`: the price could not be worked out; `value` is then 0 and must not be shown as a price. */
/** `info`: shown for context but not part of the trip's price (e.g. energy charged while parked). */
export type CostLine = { label: string; value: number; approx?: boolean; unknown?: boolean; note?: string; info?: boolean };

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
  /** Part of the price is unknown (parking without published rules): `cost` is then a lower bound. */
  costUnknown?: boolean;
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
export function ruleAt(rules: ParkingRule[] | null | undefined, date: string, sec: number): boolean {
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

/** Does the zone charge at that moment (sec after local midnight of `date`)? */
export const zonePaidAt = (z: ParkingZone, date: string, sec: number) => ruleAt(z.rules, date, sec);

/**
 * €/h a car park charges at that moment: 0 = free then, null = unknown or not hourly (P+R day ticket).
 * Rates by time already parked count from the first one.
 */
export function lotRateAt(t: LotTariff, date: string, sec: number): number | null {
  if (!t.known || t.flat) return null;
  if (t.free) return 0;
  if (t.tiers) return t.tiers[0]?.perHour ?? 0;
  return t.rates?.find((r) => ruleAt(r.rules, date, sec))?.perHour ?? 0;
}

/**
 * OpenStreetMap volunteers tag some public car parks inside municipal paid zones as free,
 * often from before the zone reached them. The zone's price applies there, so such a car
 * park takes the zone's tariff. Shop car parks (customers) and P+R keep their own rules.
 */
export function zoneLot<L extends Pick<Lot, "src" | "access" | "t">>(l: L, zone: ParkingZone | null): L {
  if (!zone || l.src !== "osm" || !l.t.free || (l.access !== "public" && l.access !== "unknown")) return l;
  return {
    ...l,
    t: {
      known: true,
      rates: [{ rules: zone.rules, perHour: zone.price }],
      zone,
      maxStayMin: l.t.maxStayMin,
      text: [`${zone.city}, ${zone.zone.toLowerCase()}: ${zone.text}`, ...l.t.text.filter((x) => !x.startsWith("Nemokama"))],
      assumed: "OpenStreetMap žymi kaip nemokamą, bet aikštelė yra mokamoje zonoje – skaičiuojame zonos kainą. Vadovaukitės ženklais vietoje.",
    },
  };
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
  return evalParkingAt(o, plan.depart.date, plan.car ? localSecondsAt(plan.car.drive.arrivalAt, plan.depart.date) : plan.depart.sec, s);
}

/**
 * The same for an arrival at `arriveSec` (seconds after local midnight of `date`), e.g. a hybrid
 * trip's hub, where the car stands longer than the stay at B (`hours`).
 */
export function evalParkingAt(o: ParkingOption, date: string, arriveSec: number, s: Settings, hours = s.parkingHours): ParkingEval {
  let start = arriveSec;
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
    } else if (o.zoneUnknown && o.fee !== "no") {
      base.costNote = "galimai mokama zona – šio miesto kainų neturime";
    } else {
      base.cost = 0;
      base.costNote = o.fee === "no" ? "nemokama (pagal OpenStreetMap)" : "ne mokamoje zonoje";
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
    if (o.zone !== undefined) {
      // A charging point on the street: the zone's price applies (free with the JUDU EV permit).
      const z = o.zone ? zoneCost(o.zone, date, start + base.searchSec, hours, s) : { cost: 0, note: "ne mokamoje zonoje" };
      base.cost = z.cost;
      base.costNote = z.note;
    } else base.costNote = "stovėjimo kaina – pagal vietos taisykles";
    return base;
  }

  // Car park.
  const l = o.lot!;
  base.searchSec = l.gated ? 90 : 60;
  start += base.searchSec;
  if (l.t.zone) {
    // The zone's price, with its EV-permit rules and dearer first hour.
    const z = zoneCost(l.t.zone, date, start, hours, s);
    base.cost = z.cost;
    base.costNote = z.note;
  } else if (hasEvPermit(s) && l.src === "judu" && !l.gated && l.t.known && !l.t.flat) {
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
export const MINUTE_EUR = { balanced: 0.15, fast: 1, cheap: 0.02, green: 0.15 } satisfies Record<Priority, number>;

/**
 * The place to leave the car that suits the priority best; never one with an unknown price.
 * `preferCharge`: an EV charging while parked saves a separate charging stop (as for combinations).
 */
export function bestParking(evals: ParkingEval[], p: Priority, preferCharge = false): ParkingEval | null {
  const ok = evals.filter((e) => e.usable && e.cost != null && e.chance !== "low");
  const pool = ok.length ? ok : evals.filter((e) => e.usable && e.cost != null);
  if (!pool.length) return null;
  // Prices tagged by OpenStreetMap volunteers can be out of date: a small penalty keeps
  // official and operator-published prices ahead when the difference is small.
  const score = (e: ParkingEval) =>
    e.cost! +
    ((e.walkSec + e.searchSec - (preferCharge && e.charge && e.charge.kWh >= 10 ? CHARGE_BONUS_SEC : 0)) / 60) * MINUTE_EUR[p] +
    (e.chance === "mid" ? 0.5 : 0) +
    (e.option.lot?.src === "osm" && e.cost! > 0 ? 0.5 : 0);
  return [...pool].sort((a, b) => score(a) - score(b))[0];
}

/** Charging while parked counts in the choice of a place only when the profile asks for it. */
export const prefersCharge = (s: Settings) => isEv(s) && s.chargeWhenParked;

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
    // No place with a known price: still park at B, with the price shown as unknown (never as free).
    const park = evals.find((e) => e.option.id === parkingId) ?? bestParking(evals, s.priority, prefersCharge(s)) ?? evals.find((e) => e.usable && e.option.kind === "zone") ?? null;
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
      costUnknown: lines.some((l) => l.unknown),
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
    const own = sc.source === "own";
    const minutes = Math.ceil(sc.rideDuration / 60);
    const cost = own ? 0 : s.scooterUnlock + minutes * s.scooterPerMin;
    out.push({
      id: "scooter",
      duration: sc.duration,
      distance: sc.distance,
      cost,
      costLines: own
        ? [{ label: "Savas paspirtukas", value: 0, note: "nuomoti nereikia" }]
        : [{ label: "Paspirtuko nuoma", value: cost, approx: true, note: `${s.scooterUnlock.toFixed(2)} € + ${minutes} min × ${s.scooterPerMin.toFixed(2)} €` }],
      co2: (sc.distance / 1000) * (own ? OWN_SCOOTER_CO2_KM : SCOOTER_CO2_KM),
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

type Rankable = { id: string; feasible: boolean; duration: number; cost: number; co2: number; weatherWarning?: string; rankBias?: number };

/**
 * Weighted score per option (0 = best on everything); the lowest feasible one wins.
 * `rankBias` (seconds) only nudges the time used for ranking: a change of vehicle costs
 * comfort, charging while parked saves a separate stop.
 */
export function rank<T extends Rankable>(modes: T[], p: Priority): { best: T["id"] | null; scores: Map<T["id"], number> } {
  const feasible = modes.filter((m) => m.feasible);
  // Bad weather rules riding out, unless nothing else is left.
  const dry = feasible.filter((m) => !m.weatherWarning);
  const ok = dry.length ? dry : feasible;
  const scores = new Map<T["id"], number>();
  if (!ok.length) return { best: null, scores };
  const value = (m: T, key: "duration" | "cost" | "co2") => (key === "duration" ? m.duration + (m.rankBias ?? 0) : m[key]);
  const norm = (key: "duration" | "cost" | "co2", m: T) => {
    const vals = ok.map((x) => value(x, key));
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    return hi - lo < 1e-9 ? 0 : (value(m, key) - lo) / (hi - lo);
  };
  const w = WEIGHTS[p];
  for (const m of ok) scores.set(m.id, w.time * norm("duration", m) + w.cost * norm("cost", m) + w.co2 * norm("co2", m));
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

// ---------------------------------------------------------------- car + second leg

export type HybridId = `h:${string}`;
/** Any card in the comparison: a single mode or a car + second-leg combination. */
export type OptionId = ModeId | HybridId;
export const isHybridId = (id: string | null | undefined): id is HybridId => !!id?.startsWith("h:");

export type HybridSummary = Omit<ModeSummary, "id" | "parking"> & {
  id: HybridId;
  hybrid: HybridOption;
  parking: ParkingEval;
  /** Seconds added (or taken off) only for ranking; see rank(). */
  rankBias: number;
};

/** One change of vehicle feels like ~4 minutes (as in the public transport router). */
export const SWITCH_PENALTY_SEC = 240;
/** Leaving an EV charging while you work saves a separate charging stop later. */
export const CHARGE_BONUS_SEC = 600;

const scooterPrice = (rideSec: number, s: Settings) => s.scooterUnlock + Math.ceil(rideSec / 60) * s.scooterPerMin;

/** Hours the car stands at a hub: the stay at B plus the second leg there and back. */
export function hubStayHours(h: Pick<HybridOption, "arrive" | "parkedAt" | "searchSec">, s: Settings): number {
  const away = Math.max(0, h.arrive - h.parkedAt - h.searchSec);
  return s.parkingHours + (2 * away) / 3600;
}
const bikesharePrice = (rideSec: number) => Math.max(0, Math.ceil((rideSec / 60 - BIKESHARE_FREE_MIN) / 30)) * BIKESHARE_EXTRA_PER_30;

/**
 * Cost, CO₂ and feasibility of each combination under this profile. The car stays at the
 * hub, so getting back to it (the same second leg in reverse) is part of the price.
 */
export function summarizeHybrids(plan: PlanResponse, hybrids: HybridOption[], s: Settings): HybridSummary[] {
  const out: HybridSummary[] = [];
  const badWeather = plan.weather?.risk === "bad" ? `Nerekomenduojama: ${plan.weather.reasons.join(", ")}` : undefined;
  const kinds = hybridKinds(s);
  for (const h of hybrids) {
    if (!kinds.includes(h.second.kind)) continue;
    // The car stands at the hub for the stay at B and both ways of the second leg.
    const park = evalParkingAt(h.hub, plan.depart.date, h.parkedAt, s, hubStayHours(h, s));
    if (!park.usable || park.cost == null) continue;
    const km = h.car.distance / 1000;
    const units = (km * s.consumption) / 100;
    const lines: CostLine[] = [
      { label: FUELS[s.fuel].label, value: units * s.fuelPrice, note: `${units.toFixed(1)} ${FUELS[s.fuel].unit}` },
      { label: `Parkavimas: ${h.hub.name}`, value: park.cost, note: park.costNote },
    ];
    let co2 = units * FUELS[s.fuel].co2;
    let kcal = 0;
    let distance = h.car.distance;
    let feasible = s.hasCar;
    let why: string | undefined = s.hasCar ? undefined : "Profilyje nurodyta, kad automobilio neturite";
    let weatherWarning: string | undefined;
    const sec = h.second;
    if (sec.kind === "transit") {
      const t = sec.transit;
      const rides = t.legs.filter((l): l is RideLeg => l.kind === "ride");
      const fare = fareOf(rides, s);
      // JUDU P+R: one ticket covers the car park and Vilnius public transport all day.
      const covered = !!h.hub.lot?.t.flat && rides.every((r) => r.route.fare === "vilnius");
      if (covered) {
        lines.push({ label: "VT bilietas", value: 0, note: "įskaičiuotas į P+R bilietą" });
        lines.push({ label: "Grįžtant iki automobilio", value: 0, note: "P+R bilietas galioja visą dieną" });
      } else {
        for (const l of fare.lines) lines.push({ label: l.name, value: l.price, approx: l.approx, note: l.note });
        lines.push({ label: "Grįžtant iki automobilio", value: fare.total, approx: true, note: "tas pats bilietas atgal" });
      }
      co2 += rides.reduce((a, r) => a + (r.distance / 1000) * rideCo2(r), 0);
      kcal = (t.walkDistance / 1000) * 55;
      distance += t.rideDistance + t.walkDistance;
    } else if (sec.kind === "bikeshare") {
      const b = sec.bikeshare;
      const price = bikesharePrice(b.rideDuration);
      lines.push({ label: b.system, value: price, approx: price > 0, note: price ? `${Math.round(b.rideDuration / 60)} min, virš 30 nemokamų` : "pirmos 30 min nemokamai su bilietu (nuo 2,90 € / 3 d.)" });
      lines.push({ label: "Grįžtant iki automobilio", value: price, approx: true, note: "Cyclocity atgal" });
      kcal = (b.ride / 1000) * 28 + ((b.walkTo + b.walkFrom) / 1000) * 55;
      distance += b.walkTo + b.ride + b.walkFrom;
      if (b.rideDuration > 60 * 60) [feasible, why] = [false, "Per toli dviračiu"];
      weatherWarning = badWeather;
    } else if (sec.scooter.source === "own") {
      const sc = sec.scooter;
      lines.push({ label: "Savas paspirtukas", value: 0, note: "iš bagažinės – nuomoti nereikia, atgal juo pačiu" });
      co2 += (sc.distance / 1000) * OWN_SCOOTER_CO2_KM;
      distance += sc.distance;
      if (sc.rideDuration > 45 * 60) [feasible, why] = [false, "Per toli paspirtukui"];
      weatherWarning = badWeather;
    } else {
      const sc = sec.scooter;
      const price = scooterPrice(sc.rideDuration, s);
      const note = `${s.scooterUnlock.toFixed(2)} € + ${Math.ceil(sc.rideDuration / 60)} min × ${s.scooterPerMin.toFixed(2)} €`;
      lines.push({ label: "Paspirtuko nuoma", value: price, approx: true, note });
      lines.push({ label: "Grįžtant iki automobilio", value: price, approx: true, note: "paspirtuku atgal" });
      co2 += (sc.distance / 1000) * SCOOTER_CO2_KM;
      kcal = (((sc.vehicle?.walk ?? 0) + (sc.endSpot?.walk ?? 0)) / 1000) * 55;
      distance += sc.distance;
      if (sc.rideDuration > 45 * 60) [feasible, why] = [false, "Per toli paspirtukui"];
      weatherWarning = badWeather;
    }
    const charge = isEv(s) && s.chargeWhenParked ? park.charge : null;
    if (charge)
      lines.push({
        label: `Įkrovimas ~${charge.kWh} kWh (≈ ${charge.km} km)`,
        value: charge.cost ?? 0,
        info: true,
        note: `${charge.cost == null ? "kaina nežinoma; " : ""}energija kitoms kelionėms – į sumą neįskaičiuota`,
      });
    out.push({
      id: `h:${h.id}`,
      hybrid: h,
      duration: h.duration,
      distance,
      cost: lines.reduce((a, l) => a + (l.info ? 0 : l.value), 0),
      costLines: lines,
      co2,
      kcal,
      feasible,
      why,
      weatherWarning,
      parking: { ...park, charge },
      rankBias: SWITCH_PENALTY_SEC - (charge && charge.kWh >= 10 ? CHARGE_BONUS_SEC : 0),
    });
  }
  return out;
}
