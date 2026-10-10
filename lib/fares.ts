import type { FareKey, RideLeg } from "./plan-types";

// Public transport fares. City systems sell time tickets (transfers included);
// intercity and district buses charge by distance, which we approximate.
// `approx` fares are shown with "≈" in the UI.

type TimeFare = {
  kind: "time";
  name: string;
  /** [minutes, €] – the cheapest tier covering the ride wins. */
  tiers: [number, number][];
  /** 30-day pass, € */
  pass: number | null;
  approx: boolean;
  source?: string;
};
type DistanceFare = { kind: "distance"; name: string; perKm: number; min: number; approx: true };

export const FARES: Record<FareKey, TimeFare | DistanceFare> = {
  vilnius: {
    kind: "time",
    name: "Vilnius (JUDU)",
    tiers: [
      [30, 1.0],
      [60, 1.25],
    ],
    pass: 38,
    approx: false,
    source: "https://judu.lt/viesojo-transporto-keleiviams/bilietu-rusys-ir-kainos-3/",
  },
  kaunas: {
    kind: "time",
    name: "Kaunas (Žiogas)",
    tiers: [[30, 0.7]],
    pass: 28,
    approx: false,
    source: "https://www.kaunas.lt/transportas/viesasis-transportas/",
  },
  klaipeda: { kind: "time", name: "Klaipėda", tiers: [[30, 0.7]], pass: 26, approx: true },
  siauliai: { kind: "time", name: "Šiauliai", tiers: [[30, 0.7]], pass: 25, approx: true },
  panevezys: { kind: "time", name: "Panevėžys", tiers: [[30, 0.7]], pass: 25, approx: true },
  alytus: { kind: "time", name: "Alytus", tiers: [[30, 0.7]], pass: 25, approx: true },
  ferry: { kind: "time", name: "Smiltynės perkėla", tiers: [[60, 1.2]], pass: null, approx: true },
  intercity: { kind: "distance", name: "Tarpmiestinis autobusas", perKm: 0.075, min: 1.5, approx: true },
  regional: { kind: "distance", name: "Priemiestinis / rajono autobusas", perKm: 0.075, min: 1.0, approx: true },
};

export type FareOptions = { ticket: "single" | "pass"; discount: 0 | 50 | 80; tripsPerWeek: number };

export type FareLine = { name: string; price: number; approx: boolean; note: string };

/** Ticket cost of one itinerary, split by fare system. */
export function fareOf(rides: RideLeg[], opt: FareOptions): { total: number; lines: FareLine[] } {
  const lines: FareLine[] = [];
  const factor = 1 - opt.discount / 100;
  let i = 0;
  while (i < rides.length) {
    const key = rides[i].route.fare;
    const fare = FARES[key];
    if (fare.kind === "distance") {
      const km = rides[i].distance / 1000;
      lines.push({
        name: fare.name,
        price: Math.max(fare.min, km * fare.perKm) * factor,
        approx: true,
        note: `${km.toFixed(0)} km`,
      });
      i++;
      continue;
    }
    // Consecutive rides in the same city system share time tickets.
    let j = i;
    while (j + 1 < rides.length && rides[j + 1].route.fare === key) j++;
    const minutes = (rides[j].arr - rides[i].dep) / 60;
    if (opt.ticket === "pass" && fare.pass) {
      // A month has ≈ 4.33 weeks; spread the pass over the trips actually made.
      const perTrip = fare.pass / Math.max(1, opt.tripsPerWeek * 4.33);
      lines.push({ name: fare.name, price: perTrip * factor, approx: fare.approx, note: `30 d. bilietas ${fare.pass} € / ${Math.round(opt.tripsPerWeek * 4.33)} kel.` });
    } else {
      const tier = fare.tiers.find(([m]) => minutes <= m);
      const [maxMin, maxPrice] = fare.tiers.at(-1)!;
      const price = tier ? tier[1] : Math.ceil(minutes / maxMin) * maxPrice;
      const label = tier ? `${tier[0]} min bilietas` : `${Math.ceil(minutes / maxMin)} × ${maxMin} min`;
      lines.push({ name: fare.name, price: price * factor, approx: fare.approx, note: label });
    }
    i = j + 1;
  }
  return { total: lines.reduce((a, l) => a + l.price, 0), lines };
}
