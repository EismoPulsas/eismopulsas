// Shapes shared by /api/plan and the browser. Distances in metres, durations in
// seconds, clock times in seconds since local (Europe/Vilnius) midnight.

import type { LatLng } from "./geo";

export type FareKey =
  | "vilnius"
  | "kaunas"
  | "klaipeda"
  | "siauliai"
  | "panevezys"
  | "alytus"
  | "intercity"
  | "regional"
  | "ferry";

export type ParkingRule = { season: [number, number] | null; days: number[]; hours: [number, number][] };

export type ParkingZone = {
  city: string;
  zone: string;
  /** €/h */
  price: number;
  /** €/h for the first paid hour, when it differs (Vilnius blue zone). */
  firstHour?: number;
  text: string;
  rules: ParkingRule[] | null;
};

/**
 * A car park's prices, as far as they are known. `text` is always the published
 * wording; the structured fields drive the cost estimate (lib/metrics.ts › lotCost).
 */
export type LotTariff = {
  /** false: we could not read the rules, so the cost is unknown (never assumed 0). */
  known: boolean;
  text: string[];
  free?: boolean;
  /** P+R: one price for the day, public transport included. */
  flat?: { price: number; per: "day" };
  /** Free minutes at the start of a stay… */
  freeMin?: number;
  /** …only when arriving inside these rules (e.g. store hours). */
  freeRules?: ParkingRule[];
  /** €/h; the first whose rules match the moment applies, none = free at that moment. */
  rates?: { rules: ParkingRule[] | null; perHour: number }[];
  /** €/h by time already parked (overrides `rates`). */
  tiers?: { fromMin: number; perHour: number }[];
  /** Most you pay per 24 h. */
  dayCap?: number;
  /** Billing step in minutes: every started step is paid in full. */
  step?: number;
  maxStayMin?: number;
  /** Monthly subscription from, €. */
  monthly?: number;
  /** An assumption the estimate relies on, shown to the user. */
  assumed?: string;
  charging?: boolean;
};

export type LotSource = "judu" | "unipark" | "curated" | "osm";
export type LotAccess = "public" | "customers" | "pr" | "unknown";

export type Lot = {
  id: string;
  src: LotSource;
  name: string | null;
  addr: string | null;
  city: string | null;
  pos: LatLng;
  poly?: LatLng[][][];
  /** OSM parking=* (surface, underground, multi-storey, rooftop…). */
  kind?: string;
  gated?: boolean;
  access: LotAccess;
  cap: number | null;
  op?: string | null;
  url?: string | null;
  /** Whose customers an unnamed lot serves (nearest shop). */
  near?: string;
  /** Resident permits valid (JUDU). */
  res?: boolean;
  t: LotTariff;
  /** Key into lot-occupancy.json and the live feed (JUDU gated lots). */
  occ?: string;
  code?: string | null;
  charging?: boolean;
  checked?: string;
};

/** Weekday (0 = Monday) × hour (0–23), Europe/Vilnius. */
export type OccupancyProfile = {
  cap: number;
  /** Typical free spaces (median of hourly means). */
  free: (number | null)[][];
  /** % of days with at least one space free for the whole hour. */
  p: (number | null)[][];
  /** Days observed. */
  n: number[][];
};

export type LiveLot = { vacant: number; capacity: number; at: string };

export type Connector = "T2" | "CCS" | "CHADEMO" | "T1" | "SCHUKO" | "OTHER";

export type Charger = {
  id: string;
  name: string;
  pos: LatLng;
  address: string | null;
  city: string | null;
  operator: string | null;
  /** Connector groups: standard, AC/DC, kW, how many, and their published price (€, VAT as published). */
  plugs: ChargerPlug[];
  /** true: open around the clock; null: not stated. */
  open24: boolean | null;
  /** The car park it stands in, if any (lots.json id). */
  lotId?: string;
};

export type ChargerPlug = {
  std: Connector;
  dc: boolean;
  kW: number;
  n: number;
  perKwh?: number;
  perMin?: number;
  parkingPerMin?: number;
  start?: number;
  priceText?: string;
};

/** Where to leave the car near B; costs are worked out in the browser from the user's settings. */
export type ParkingOption = {
  kind: "zone" | "street" | "lot" | "charger";
  id: string;
  name: string;
  pos: LatLng;
  /** Verified vehicle entrance, when the source supplies one. */
  navigationPos?: LatLng;
  /** Street parking on one side: route so the driver arrives with it on the right (kerb) side. */
  curb?: boolean;
  /** Walking distance to B, metres (straight line × 1.3). */
  walk: number;
  lot?: Omit<Lot, "poly">;
  /** Street parking: the municipal zone it lies in (null = outside any paid zone). */
  zone?: ParkingZone | null;
  /** Street parking: OSM fee tag outside zones ("yes"/"no"), if any. */
  fee?: string | null;
  maxStayMin?: number;
  /** Street parking: how full streets in this resident area usually are, %. */
  streetOccupancy?: number | null;
  /** At the arrival weekday and hour, from 12 weeks of JUDU history. */
  typical?: { free: number | null; p: number | null; days: number } | null;
  live?: LiveLot | null;
  chargers?: Charger[];
};

export type TrafficInfo = {
  /** "live" = eismoinfo.lt sensors on the route; "typical" = time-of-day estimate only. */
  source: "live" | "typical";
  provider: "tomtom" | "osrm";
  mode: "live" | "predicted" | "approximate";
  calculatedAt: string;
  observedAt: string | null;
  partialCoverage: boolean;
  fallbackReason: "missing-key" | "quota" | "authentication" | "timeout" | "provider-error" | "invalid-response" | null;
  /** Included in driving duration; never added again. */
  delaySeconds: number | null;
  sensors: { name: string; road: string; speed: number; limit: number; vehicles: number; observedAt: string }[];
  /** Seconds added by city peak-hour estimate. */
  urbanDelay: number;
  /** Seconds added (or saved) by live sensor speeds. */
  liveDelay: number;
  city: string | null;
  peak: "peak" | "day" | "night";
};

export type DriveWarning = { kind: "traffic" | "weather"; text: string; at?: string };

/** A reusable driving-only leg; access, parking and walking are separate. */
export type CarLeg = {
  kind: "car";
  from: LatLng;
  to: LatLng;
  duration: number;
  distance: number;
  geometry: LatLng[];
  departureAt: string;
  arrivalAt: string;
  baseDuration: number | null;
  traffic: TrafficInfo;
  warnings: DriveWarning[];
  weather: { status: "available" | "partial" | "unavailable"; forecastCreatedAt: string | null };
};

export type CarResult = {
  drive: CarLeg;
  distance: number;
  /** Free-flow driving time from OSRM. */
  baseDuration: number | null;
  traffic: TrafficInfo;
  /** Getting to the car + finding a spot + walking from it. */
  overhead: number;
  duration: number;
  geometry: LatLng[];
  parking: ParkingZone | null;
  /** Arrival at B, seconds since local midnight of the departure day. */
  arrive: number;
  /** Car parks, street-side parking and (for EVs) chargers within walking distance of B. */
  parkingOptions: ParkingOption[];
};

export type ActiveResult = { distance: number; duration: number; geometry: LatLng[] };

/** Station-based shared bikes (Cyclocity Vilnius, live GBFS). */
export type BikeshareResult = {
  system: string;
  from: { name: string; pos: LatLng; bikes: number | null };
  to: { name: string; pos: LatLng; docks: number | null };
  walkTo: number;
  walkFrom: number;
  /** Ride distance between the stations. */
  ride: number;
  rideDuration: number;
  duration: number;
  geometry: LatLng[];
  /** Availability checked against the live feed (only when leaving now). */
  live: boolean;
  updated: string | null;
};

/**
 * Shared e-scooter. With a fleet feed (real GBFS or demo) we walk to the nearest
 * scooter; otherwise it is an estimate with a typical walk to one.
 */
export type ScooterResult = {
  city: string | null;
  source: "gbfs" | "demo" | "estimate";
  operator: string | null;
  /** The scooter we would take, if the fleet is known. */
  vehicle: { id: string; pos: LatLng; battery: number | null; walk: number } | null;
  distance: number;
  rideDuration: number;
  duration: number;
  geometry: LatLng[];
  /** Where the ride ends when B is in a zone with designated scooter spots (Vilnius Old Town). */
  endSpot?: { pos: LatLng; addr: string | null; walk: number } | null;
};

export type WalkLeg = {
  kind: "walk";
  from: LatLng;
  to: LatLng;
  toName: string | null;
  distance: number;
  start: number;
  end: number;
};

export type RideLeg = {
  kind: "ride";
  route: { short: string; long: string; type: number; color: string; agency: string; fare: FareKey };
  headsign: string;
  from: { name: string; pos: LatLng };
  to: { name: string; pos: LatLng };
  dep: number;
  arr: number;
  stops: number;
  distance: number;
  /** Metres driven along streets with a bus (A / A+) lane. */
  laneMeters: number;
  geometry: LatLng[];
};

export type TransitLeg = WalkLeg | RideLeg;

export type TransitResult = {
  legs: TransitLeg[];
  /** When to leave the start point. */
  leave: number;
  arrive: number;
  duration: number;
  walkDistance: number;
  rideDistance: number;
  laneMeters: number;
  transfers: number;
  /** Leave time of the following departure, if any. */
  next: number | null;
};

/** Forecast for the start of the trip (Meteo.lt + Open-Meteo rain chance). */
export type TripWeather = {
  /** Meteo.lt forecast place the numbers come from. */
  place: string | null;
  /** Meteo.lt condition code (clear, light-rain, rain, snow…). */
  condition: string | null;
  label: string;
  temp: number | null;
  feelsLike: number | null;
  /** m/s */
  wind: number | null;
  gust: number | null;
  /** mm/h, the wettest hour of the trip */
  precip: number;
  /** %, highest during the trip */
  rainChance: number | null;
  /** "bad": do not recommend riding a bike or scooter. */
  risk: "ok" | "caution" | "bad";
  reasons: string[];
  forecastCreatedAt: string | null;
};

export type PlanResponse = {
  from: LatLng;
  to: LatLng;
  depart: { date: string; sec: number; weekday: number; isNow: boolean; at: string };
  straight: number;
  car: CarResult | null;
  bike: ActiveResult | null;
  walk: ActiveResult | null;
  bikeshare: BikeshareResult | null;
  bikeshareNote: string | null;
  scooter: ScooterResult | null;
  transit: TransitResult | null;
  transitNote: string | null;
  timetable: { built: string; window: string; shifted: boolean };
  weather: TripWeather | null;
};

/** What carries the traveller on from where the car is left. */
export type SecondKind = "transit" | "bikeshare" | "scooter";

export type HybridSecond =
  | { kind: "transit"; transit: TransitResult }
  | { kind: "bikeshare"; bikeshare: BikeshareResult }
  | { kind: "scooter"; scooter: ScooterResult };

/**
 * Drive part of the way, leave the car (P+R, a cheap car park or street, a charger) and
 * continue by public transport, Cyclocity or scooter. Times are seconds after local midnight
 * of the departure day; the car leg is an OSRM estimate scaled to the TomTom A → B time.
 */
export type HybridOption = {
  id: string;
  /** Where the car stays; `walk` = metres from it to where the second leg starts. */
  hub: ParkingOption;
  car: { from: LatLng; to: LatLng; duration: number; distance: number; geometry: LatLng[]; estimated: true };
  /** The car is parked (arrival at the hub). */
  parkedAt: number;
  /** Finding a space / getting in, seconds (as in the car option). */
  searchSec: number;
  second: HybridSecond;
  /** Arrival at B. */
  arrive: number;
  /** Door to door, including the 2 minutes to get to the car. */
  duration: number;
};

export type HybridResponse = {
  options: HybridOption[];
  /** TomTom (or traffic-adjusted) A → B time divided by OSRM free-flow, applied to hub legs. */
  trafficFactor: number | null;
  note: string | null;
};
