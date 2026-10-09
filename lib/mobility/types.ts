// Mobile ↔ BFF contract for POST /api/mobility/plan (ROUTING.md § 9, version 1).
//
// This file is the single source of truth for the contract. The Expo app in
// mobile/ imports it type-only (ADR-0003), so keep it free of imports and
// runtime code: types only. Change ROUTING.md § 9 in the same PR.

export type LatLng = { lat: number; lng: number };
export type Place = LatLng & { label?: string };

export type FuelType = "petrol" | "diesel" | "lpg" | "hybrid" | "electric";
export type Preference = "fastest" | "cheapest" | "greener" | "balanced";
export type Strategy = "car" | "transit" | "park_and_ride";

export type MobilityProfile = {
  car: {
    available: boolean;
    fuel: FuelType;
    /** l/100 km, or kWh/100 km for "electric". */
    consumption: number;
    /** Optional own price (€/l or €/kWh). Without it a labelled default is used. */
    fuelPriceEur?: number;
  };
  /** Holds a periodic public-transport pass: marginal fare is €0. */
  transitPass: boolean;
  maxWalkMin: number;
  preference: Preference;
};

export type PlanRequest = {
  origin: Place;
  destination: Place;
  /** ISO-8601 with an offset, e.g. "2026-10-12T08:45:00+03:00". */
  arriveBy: string;
  /** How long the car stays parked at the destination. Optional; a labelled default is used. */
  stayMinutes?: number;
  /** Optional; defaults are used and listed in `assumptions` when absent. */
  profile?: MobilityProfile;
};

/**
 * How far a value can be trusted, weakest first:
 * - "demo":     synthetic, from DemoRoutingProvider. Never real.
 * - "estimate": our model or a labelled assumption applied to real inputs.
 * - "official": published static data (JUDU tariffs and fares, P+R list, GTFS timetable).
 * - "live":     fetched now from a real-time source.
 * A metric's basis is the weakest basis of everything it was computed from.
 */
export type Basis = "demo" | "estimate" | "official" | "live";

/** "demo": all route legs are synthetic. "live": none are. "mixed": some are. */
export type DataMode = "demo" | "live" | "mixed";

/** "transit" is a public-transport ride whose vehicle type is unknown (demo data). */
export type LegMode = "car" | "park" | "walk" | "transit" | "bus" | "trolleybus";

/** GeoJSON LineString; coordinates are [lng, lat]. */
export type LineString = { type: "LineString"; coordinates: [number, number][] };

export type Leg = {
  mode: LegMode;
  from: Place;
  to: Place;
  departAt: string;
  arriveAt: string;
  durationMin: number;
  distanceKm: number | null;
  /** Public-transport line; null when unknown (always null for demo data). */
  line: { name: string; color?: string } | null;
  geometry: LineString | null;
  /** Lithuanian instruction for the leg, e.g. "Palikite automobilį P+R aikštelėje". */
  note: string;
  basis: Basis;
};

export type CostItem = {
  kind: "energy" | "parking" | "fare" | "park_and_ride";
  label: string;
  /** null = unknown (never shown as €0). */
  eur: number | null;
  basis: Basis;
};

export type ParkingInfo = {
  kind: "street_zone" | "park_and_ride";
  /** "Raudona zona", "Ukmergės g. 246", or "Nemokama gatvėje". */
  name: string;
  costEur: number | null;
  paidMinutes: number | null;
  /** Real-time free spaces; null until a live occupancy provider is connected. */
  availability: { vacant: number; capacity: number; observedAt: string } | null;
  basis: Basis;
};

export type OptionStatus = "recommended" | "alternative" | "dominated";

export type RouteOption = {
  id: string;
  strategy: Strategy;
  /** Lithuanian name, e.g. "Automobiliu". */
  title: string;
  departAt: string;
  arriveAt: string;
  metrics: {
    durationMin: number;
    /** null = unknown, e.g. parking tariff could not be determined. */
    costEur: number | null;
    co2Kg: number | null;
    walkMin: number;
    transfers: number;
    distanceKm: number;
  };
  basis: { duration: Basis; cost: Basis; co2: Basis };
  cost: CostItem[];
  legs: Leg[];
  parking: ParkingInfo | null;
  feasibility: { lateMin: number; overWalk: boolean };
  status: OptionStatus;
  /** Set when status = "dominated": the option that is at least as good on time, cost and CO₂. */
  dominatedBy?: string;
  /** One Lithuanian sentence: for the recommended option its reason, otherwise how it compares. */
  summary: string;
  /** Ids into PlanResponse.sources. */
  sources: string[];
};

export type Reason =
  | { kind: "time"; deltaMin: number; vs: Strategy }
  | { kind: "cost"; deltaEur: number; vs: Strategy }
  | { kind: "co2"; deltaPct: number; deltaKg: number; vs: Strategy }
  | { kind: "parking"; code: "avoids_paid_parking"; vs: Strategy; zone: string; eur: number }
  | { kind: "feasibility"; code: "all_late"; lateMin: number }
  | { kind: "feasibility"; code: "others_over_walk" | "others_late" };

export type Recommendation = {
  optionId: string;
  preference: Preference;
  state: "recommended" | "all_late";
  /** Lithuanian sentence built only from the reasons below. */
  sentence: string;
  /** Signed differences: deltaMin > 0 = slower, deltaEur > 0 = cheaper, deltaPct > 0 = less CO₂. */
  reasons: Reason[];
  /** Which rule chose the option (ROUTING.md § 6), e.g. "balanced:tolerance". */
  rule: string;
};

export type SourceRef = {
  id: string;
  name: string;
  basis: Basis;
  url?: string;
  licence?: string;
  fetchedAt?: string;
  note?: string;
};

export type Assumption = { id: string; text: string };
export type PlanWarning = { code: string; text: string };
export type Unavailable = { strategy: Strategy; code: string; text: string };

export type PlanResponse = {
  version: 1;
  generatedAt: string;
  dataMode: DataMode;
  trip: { origin: Place; destination: Place; arriveBy: string; stayMinutes: number; stayAssumed: boolean };
  /** Recommended first, then alternatives by duration, then dominated options. */
  options: RouteOption[];
  recommendation: Recommendation | null;
  unavailable: Unavailable[];
  assumptions: Assumption[];
  sources: SourceRef[];
  warnings: PlanWarning[];
};

export type PlanError = { error: string; code: string };
