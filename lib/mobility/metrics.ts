// Cost and CO₂ models (ROUTING.md § 4). Pure functions; constants come from config.ts.

import { CO2, CO2_KEY_BY_FUEL, DEFAULT_ENERGY_PRICE, FARES, PARKING_ZONES, type ZoneTariff } from "./config";
import { round2, vilniusParts } from "./geo";
import type { Basis, MobilityProfile } from "./types";

const ORDER: Basis[] = ["demo", "estimate", "official", "live"];
/** The weakest basis wins: a value is only as trustworthy as its weakest input. */
export function weakest(...bases: Basis[]): Basis {
  return bases.reduce((w, b) => (ORDER.indexOf(b) < ORDER.indexOf(w) ? b : w), "live" as Basis);
}

/** Energy cost and CO₂ of driving `distanceKm` with the user's car. */
export function carEnergy(distanceKm: number, car: MobilityProfile["car"]) {
  const units = (distanceKm * car.consumption) / 100; // litres or kWh
  const ownPrice = car.fuelPriceEur !== undefined;
  const price = ownPrice ? car.fuelPriceEur! : DEFAULT_ENERGY_PRICE[car.fuel].eur;
  return {
    eur: round2(units * price),
    co2Kg: units * CO2[CO2_KEY_BY_FUEL[car.fuel]].kgPerUnit,
    priceAssumed: !ownPrice,
  };
}

/**
 * Street parking cost for staying `stayMin` from `arrive` in the given zone.
 * Charged pro rata for the minutes that fall in paid hours. Returns null for an unknown zone.
 */
export function zoneParkingCost(zone: string, arrive: Date, stayMin: number): { eur: number; paidMinutes: number; tariff: ZoneTariff } | null {
  const tariff = PARKING_ZONES[zone];
  if (!tariff) return null;
  const start = vilniusParts(arrive);
  const startMinuteOfDay = start.hour * 60 + start.minute;
  let paidMinutes = 0;
  for (let i = 0; i < stayMin; i++) {
    const m = startMinuteOfDay + i;
    const weekday = ((start.weekday - 1 + Math.floor(m / 1440)) % 7) + 1;
    const hour = (m % 1440) / 60;
    if (tariff.months && !tariff.months.includes(start.month)) continue;
    if (tariff.paid === "24/7" || (tariff.paid.days.includes(weekday) && hour >= tariff.paid.from && hour < tariff.paid.to)) {
      paidMinutes++;
    }
  }
  const firstHour = Math.min(paidMinutes, 60);
  const eur =
    tariff.firstHourEur !== undefined
      ? (firstHour / 60) * tariff.firstHourEur + ((paidMinutes - firstHour) / 60) * tariff.hourlyEur
      : (paidMinutes / 60) * tariff.hourlyEur;
  return { eur: round2(eur), paidMinutes, tariff };
}

/**
 * Single-trip fare from first boarding to last alighting (transfers are free within a
 * ticket's validity). Longer rides are covered by several 60-minute tickets. Pass holders pay €0.
 */
export function transitFare(rideSpanMin: number, hasPass: boolean): number {
  if (hasPass) return 0;
  if (rideSpanMin <= 30) return FARES.single30;
  return round2(Math.ceil(rideSpanMin / 60) * FARES.single60);
}

/** CO₂ of riding public transport for `passengerKm` (UK local-bus proxy, see config.ts). */
export const transitCo2 = (passengerKm: number) => passengerKm * CO2.bus.kgPerUnit;
