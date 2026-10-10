import { fareOf, type FareLine } from "./fares";
import type { ParkingZone, PlanResponse, RideLeg } from "./plan-types";

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
/** Weeks a year a commuter actually travels (holidays off). */
export const WEEKS_PER_YEAR = 46;

/** kg CO₂ per passenger-km, by vehicle. */
function rideCo2(r: RideLeg): number {
  if (r.route.type === 11) return 0.02; // trolleybus, grid electricity
  if (r.route.type === 4) return 0.12; // ferry
  if (r.route.fare === "intercity" || r.route.fare === "regional") return 0.035; // coach, well filled
  return 0.075; // city bus at average occupancy
}

export type Priority = "balanced" | "fast" | "cheap" | "green";

export type Settings = {
  fuel: Fuel;
  consumption: number;
  fuelPrice: number;
  parkingHours: number;
  wear: boolean;
  ticket: "single" | "pass";
  discount: 0 | 50 | 80;
  tripsPerWeek: number;
  priority: Priority;
};

export const DEFAULT_SETTINGS: Settings = {
  fuel: "petrol",
  consumption: FUELS.petrol.consumption,
  fuelPrice: FUELS.petrol.price,
  parkingHours: 2,
  wear: false,
  ticket: "single",
  discount: 0,
  tripsPerWeek: 10,
  priority: "balanced",
};

export type ModeId = "car" | "transit" | "bike" | "walk";

export type CostLine = { label: string; value: number; approx?: boolean; note?: string };

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

export function summarize(plan: PlanResponse, s: Settings): ModeSummary[] {
  const out: ModeSummary[] = [];

  if (plan.car) {
    const c = plan.car;
    const km = c.distance / 1000;
    const units = (km * s.consumption) / 100;
    const lines: CostLine[] = [{ label: FUELS[s.fuel].label, value: units * s.fuelPrice, note: `${units.toFixed(1)} ${FUELS[s.fuel].unit}` }];
    if (c.parking) {
      const arrive = plan.depart.sec + c.duration;
      const hours = paidParkingHours(c.parking, plan.depart.date, arrive, s.parkingHours);
      lines.push({
        label: `Parkavimas, ${c.parking.zone.toLowerCase()}`,
        value: hours * c.parking.price,
        note: hours ? `${hours.toFixed(1)} val. × ${c.parking.price.toFixed(2)} €` : "šiuo metu nemokama",
      });
    }
    if (s.wear) lines.push({ label: "Nusidėvėjimas, padangos, servisas", value: km * WEAR_PER_KM, approx: true, note: `${WEAR_PER_KM} €/km` });
    out.push({
      id: "car",
      duration: c.duration,
      distance: c.distance,
      cost: lines.reduce((a, l) => a + l.value, 0),
      costLines: lines,
      co2: units * FUELS[s.fuel].co2,
      kcal: 0,
      feasible: true,
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
  const ok = modes.filter((m) => m.feasible);
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
