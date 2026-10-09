// Request validation for POST /api/mobility/plan (ROUTING.md § 9). Pure.
// Error texts are Lithuanian (shown to users), codes are for machines.

import { CITY_CENTRE, ORIGIN_RADIUS_KM } from "./config";
import { haversineKm, insideServiceArea } from "./geo";
import type { FuelType, MobilityProfile, Place, PlanRequest, Preference } from "./types";

export const DEFAULT_PROFILE: MobilityProfile = {
  car: { available: false, fuel: "petrol", consumption: 7 },
  transitPass: false,
  maxWalkMin: 15,
  preference: "balanced",
};

const FUELS: FuelType[] = ["petrol", "diesel", "lpg", "hybrid", "electric"];
const PREFERENCES: Preference[] = ["fastest", "cheapest", "greener", "balanced"];
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

export type ValidRequest = Required<Pick<PlanRequest, "origin" | "destination" | "arriveBy" | "profile">> & {
  stayMinutes?: number;
  arriveByDate: Date;
  profileAssumed: boolean;
};
export type ParseResult = { ok: true; value: ValidRequest } | { ok: false; error: string; code: string };

const fail = (code: string, error: string): ParseResult => ({ ok: false, code, error });
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function place(v: unknown): Place | null {
  if (!isObj(v) || !isNum(v.lat) || !isNum(v.lng)) return null;
  const label = typeof v.label === "string" ? v.label.trim().slice(0, 200) : undefined;
  return { lat: v.lat, lng: v.lng, ...(label ? { label } : {}) };
}

function profile(v: unknown): MobilityProfile | string {
  if (!isObj(v) || !isObj(v.car)) return "car";
  const car = v.car;
  if (typeof car.available !== "boolean") return "car.available";
  if (!FUELS.includes(car.fuel as FuelType)) return "car.fuel";
  if (!isNum(car.consumption) || car.consumption < 1 || car.consumption > 40) return "car.consumption";
  if (car.fuelPriceEur !== undefined && (!isNum(car.fuelPriceEur) || car.fuelPriceEur < 0.05 || car.fuelPriceEur > 5)) return "car.fuelPriceEur";
  if (v.transitPass !== undefined && typeof v.transitPass !== "boolean") return "transitPass";
  if (!isNum(v.maxWalkMin) || v.maxWalkMin < 0 || v.maxWalkMin > 60) return "maxWalkMin";
  if (!PREFERENCES.includes(v.preference as Preference)) return "preference";
  return {
    car: {
      available: car.available,
      fuel: car.fuel as FuelType,
      consumption: car.consumption,
      ...(car.fuelPriceEur !== undefined ? { fuelPriceEur: car.fuelPriceEur as number } : {}),
    },
    transitPass: v.transitPass === true,
    maxWalkMin: v.maxWalkMin,
    preference: v.preference as Preference,
  };
}

export function parsePlanRequest(body: unknown, now: Date): ParseResult {
  if (!isObj(body)) return fail("invalid_body", "Užklausa turi būti JSON objektas");
  const origin = place(body.origin);
  const destination = place(body.destination);
  if (!origin || !destination) return fail("invalid_place", "Nurodykite pradžios ir tikslo koordinates (lat, lng)");
  if (!insideServiceArea(destination)) return fail("out_of_service_area", "Kol kas palyginame tik keliones, kurių tikslas – Vilniuje");
  if (haversineKm(origin, CITY_CENTRE) > ORIGIN_RADIUS_KM) {
    return fail("out_of_service_area", `Pradžios taškas turi būti ne toliau kaip ${ORIGIN_RADIUS_KM} km nuo Vilniaus centro`);
  }
  if (haversineKm(origin, destination) < 0.1) return fail("same_place", "Pradžios ir tikslo vietos sutampa");

  if (typeof body.arriveBy !== "string" || !ISO_WITH_OFFSET.test(body.arriveBy)) {
    return fail("invalid_arrive_by", "Nurodykite atvykimo laiką ISO 8601 formatu su laiko juosta");
  }
  const arriveByDate = new Date(body.arriveBy);
  if (Number.isNaN(arriveByDate.getTime())) return fail("invalid_arrive_by", "Neteisingas atvykimo laikas");
  const hoursFromNow = (arriveByDate.getTime() - now.getTime()) / 3_600_000;
  if (hoursFromNow < -12 || hoursFromNow > 30 * 24) {
    return fail("arrive_by_out_of_range", "Atvykimo laikas turi būti ne ankstesnis kaip prieš 12 val. ir ne vėlesnis kaip po 30 d.");
  }

  let stayMinutes: number | undefined;
  if (body.stayMinutes !== undefined) {
    if (!isNum(body.stayMinutes) || body.stayMinutes < 5 || body.stayMinutes > 1440) {
      return fail("invalid_stay", "Stovėjimo trukmė turi būti nuo 5 iki 1440 min.");
    }
    stayMinutes = Math.round(body.stayMinutes);
  }

  let parsedProfile = DEFAULT_PROFILE;
  if (body.profile !== undefined) {
    const p = profile(body.profile);
    if (typeof p === "string") return fail("invalid_profile", `Neteisingi profilio duomenys: ${p}`);
    parsedProfile = p;
  }

  return {
    ok: true,
    value: {
      origin,
      destination,
      arriveBy: body.arriveBy,
      arriveByDate,
      ...(stayMinutes !== undefined ? { stayMinutes } : {}),
      profile: parsedProfile,
      profileAssumed: body.profile === undefined,
    },
  };
}
