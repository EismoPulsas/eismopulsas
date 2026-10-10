// Constants for the mobility engine. Every value names its source and status;
// DATA.md › A6 lists them. Do not add a number without a source — label team
// assumptions as such ("assumption") so they surface in the API response.
//
// status:
//   "official"   — published by JUDU / Vilnius, verified on the given date
//   "proxy"      — an official figure from another authority used as a stand-in
//   "assumption" — a team assumption; replace when a source is found

import type { FuelType } from "./types";

export type ConstantStatus = "official" | "proxy" | "assumption";
type Sourced = { source: string; url?: string; verifiedOn?: string; status: ConstantStatus };

// ── Public-transport fares (JUDU) ────────────────────────────────────────────
// Unlimited transfers within the ticket's validity.
export const FARES: Sourced & { single30: number; single60: number } = {
  single30: 1.0,
  single60: 1.25,
  source: "JUDU „Bilietų rūšys ir kainos“ (įprasta kaina)",
  url: "https://judu.lt/viesojo-transporto-keleiviams/bilietu-rusys-ir-kainos/",
  verifiedOn: "2026-10-10",
  status: "official",
};

// One ticket = parking for one car + public transport for one person until the end of the day.
export const PARK_AND_RIDE_TICKET: Sourced & { eur: number } = {
  eur: 1.0,
  source: "JUDU „Statyk ir važiuok“ aikštelės",
  url: "https://judu.lt/vairuotojams/statyk-ir-vaziuok-aiksteles/",
  verifiedOn: "2026-10-10",
  status: "official",
};

// ── Street parking zones (JUDU ArcGIS layer rinkliavos_zonos_2025_07) ────────
// Values transcribed from the layer's Zona / Mokama / Rinkliava / Pastaba fields.
// days: 1 = Monday … 7 = Sunday; hours are local (Europe/Vilnius), [from, to).
export type ZoneTariff = {
  label: string;
  hourlyEur: number;
  firstHourEur?: number;
  paid: { days: number[]; from: number; to: number } | "24/7";
  /** Months (1–12) when the zone is paid; absent = all year. */
  months?: number[];
};

export const PARKING_ZONES_SOURCE: Sourced & { licence: string } = {
  source: "JUDU / SĮ „Susisiekimo paslaugos“ – ArcGIS sluoksnis „Rinkliavos zonos 2025-07“",
  url: "https://services1.arcgis.com/vVI5TNykiYD9EhM5/arcgis/rest/services/rinkliavos_zonos_2025_07/FeatureServer/5",
  verifiedOn: "2026-10-10",
  status: "official",
  licence: "CC BY-NC 4.0, © JUDU",
};

const WEEKDAYS = [1, 2, 3, 4, 5];
export const PARKING_ZONES: Record<string, ZoneTariff> = {
  "Mėlyna": { label: "Mėlyna zona", hourlyEur: 4.0, firstHourEur: 3.5, paid: "24/7" },
  Raudona: { label: "Raudona zona", hourlyEur: 2.5, paid: { days: [1, 2, 3, 4, 5, 6], from: 8, to: 22 } },
  Geltona: { label: "Geltona zona", hourlyEur: 1.0, paid: { days: WEEKDAYS, from: 8, to: 20 } },
  Geltona1: {
    label: "Geltona zona (paplūdimys)",
    hourlyEur: 1.0,
    paid: { days: [1, 2, 3, 4, 5, 6, 7], from: 8, to: 20 },
    months: [5, 6, 7, 8, 9],
  },
  "Žalia": { label: "Žalia zona", hourlyEur: 0.5, paid: { days: WEEKDAYS, from: 8, to: 18 } },
};
/** When a point lies in several zones, the first in this list wins. */
export const ZONE_PRIORITY = ["Mėlyna", "Raudona", "Geltona", "Geltona1", "Žalia"];

// ── CO₂ factors ──────────────────────────────────────────────────────────────
// UK Government GHG Conversion Factors for Company Reporting 2025 (DESNZ), flat file,
// "GHG Conversion Factor 2025", kg CO2e. No Lithuania-specific set was verified, so
// these are proxies (DATA.md › A6).
const DESNZ_2025 = {
  url: "https://www.gov.uk/government/publications/greenhouse-gas-reporting-conversion-factors-2025",
  verifiedOn: "2026-10-10",
};
export const CO2: Record<"petrol" | "diesel" | "lpg" | "electricity" | "bus", Sourced & { kgPerUnit: number; unit: string }> = {
  // Scope 1 · Fuels · Liquid fuels · Petrol (average biofuel blend) · litres
  petrol: { kgPerUnit: 2.06916, unit: "kg CO2e/l", source: "DESNZ 2025: Petrol (average biofuel blend)", ...DESNZ_2025, status: "proxy" },
  // Scope 1 · Fuels · Liquid fuels · Diesel (average biofuel blend) · litres
  diesel: { kgPerUnit: 2.57082, unit: "kg CO2e/l", source: "DESNZ 2025: Diesel (average biofuel blend)", ...DESNZ_2025, status: "proxy" },
  // Scope 1 · Fuels · Gaseous fuels · LPG · litres
  lpg: { kgPerUnit: 1.55713, unit: "kg CO2e/l", source: "DESNZ 2025: LPG", ...DESNZ_2025, status: "proxy" },
  // Scope 2 · UK electricity · Electricity generated · kWh — UK grid, NOT the Lithuanian grid.
  electricity: { kgPerUnit: 0.177, unit: "kg CO2e/kWh", source: "DESNZ 2025: Electricity: UK (Lietuvos tinklo koeficientas nepatikrintas)", ...DESNZ_2025, status: "proxy" },
  // Scope 3 · Business travel – land · Bus · Average local bus · passenger.km (UK occupancy).
  // Used for every Vilnius bus/trolleybus ride until a local factor is sourced.
  bus: { kgPerUnit: 0.10385, unit: "kg CO2e/pkm", source: "DESNZ 2025: Average local bus", ...DESNZ_2025, status: "proxy" },
};

export const CO2_KEY_BY_FUEL: Record<FuelType, "petrol" | "diesel" | "lpg" | "electricity"> = {
  petrol: "petrol",
  hybrid: "petrol", // the user's own consumption already reflects the hybrid drivetrain
  diesel: "diesel",
  lpg: "lpg",
  electric: "electricity",
};

// ── Energy prices (team assumption) ─────────────────────────────────────────
// No primary source verified on 2026-10-10. A third-party republication of the EU
// Weekly Oil Bulletin showed ~1,80 €/l petrol and ~2,00 €/l diesel for Lithuania in
// August 2026; LPG and electricity are rough team assumptions. Users can override
// with profile.car.fuelPriceEur. Replace with the Commission's Oil Bulletin.
export const DEFAULT_ENERGY_PRICE: Record<FuelType, Sourced & { eur: number; unit: string }> = {
  petrol: { eur: 1.8, unit: "€/l", source: "Komandos prielaida", status: "assumption" },
  hybrid: { eur: 1.8, unit: "€/l", source: "Komandos prielaida", status: "assumption" },
  diesel: { eur: 2.0, unit: "€/l", source: "Komandos prielaida", status: "assumption" },
  lpg: { eur: 0.85, unit: "€/l", source: "Komandos prielaida", status: "assumption" },
  electric: { eur: 0.25, unit: "€/kWh", source: "Komandos prielaida", status: "assumption" },
};

// ── Model parameters (team assumptions, tune on the demo scenarios) ─────────
export const MODEL = {
  /** Car: find a space and walk to the door — longer inside paid (central) zones. */
  carParkAndWalkMin: { paidZone: 8, other: 4 },
  /** P+R: drive in, take the ticket, park (the walk to the stop is a separate leg). */
  parkAndRideParkMin: 3,
  /** Parking stay when the request does not give one. */
  defaultStayMin: 120,
  /** P+R site is "on the way" when origin→site→destination ≤ ratio × origin→destination (straight lines). */
  parkAndRideDetourRatio: 1.4,
  /** …and the site is at least this far from the destination (P+R is for outside the centre). */
  parkAndRideMinKmFromDestination: 2,
} as const;

/** Balanced preference (ROUTING.md § 6): tolerance rule, no hidden score. */
export const BALANCED = {
  maxExtraMin: 10,
  maxExtraRatio: 0.2,
  minSavingEur: 1.5,
  minSavingCo2Ratio: 0.3,
} as const;

/** A difference is mentioned in an explanation only from these sizes (ROUTING.md § 7). */
export const EXPLAIN_THRESHOLDS = { min: 2, eur: 0.5, co2Ratio: 0.1 } as const;

/**
 * Approximate bounding box of Vilnius city municipality. The destination must be inside it,
 * and public transport (the JUDU network) is offered only when both ends are inside it.
 */
export const SERVICE_AREA = { minLat: 54.55, maxLat: 54.85, minLng: 24.95, maxLng: 25.5 } as const;
/** Origins may lie outside the city (commuters driving in, the core P+R case) within this radius. */
export const ORIGIN_RADIUS_KM = 40;
export const CITY_CENTRE = { lat: 54.6858, lng: 25.2877 } as const; // Katedros aikštė

export const TIMEZONE = "Europe/Vilnius";
