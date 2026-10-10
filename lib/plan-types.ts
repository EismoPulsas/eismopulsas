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
  text: string;
  rules: ParkingRule[] | null;
};

export type TrafficInfo = {
  /** "live" = eismoinfo.lt sensors on the route; "typical" = time-of-day estimate only. */
  source: "live" | "typical";
  sensors: { name: string; road: string; speed: number; limit: number; vehicles: number }[];
  /** Seconds added by city peak-hour estimate. */
  urbanDelay: number;
  /** Seconds added (or saved) by live sensor speeds. */
  liveDelay: number;
  city: string | null;
  peak: "peak" | "day" | "night";
};

export type CarResult = {
  distance: number;
  /** Free-flow driving time from OSRM. */
  baseDuration: number;
  traffic: TrafficInfo;
  /** Getting to the car + finding a spot + walking from it. */
  overhead: number;
  duration: number;
  geometry: LatLng[];
  parking: ParkingZone | null;
};

export type ActiveResult = { distance: number; duration: number; geometry: LatLng[] };

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

export type PlanResponse = {
  from: LatLng;
  to: LatLng;
  depart: { date: string; sec: number; weekday: number; isNow: boolean };
  straight: number;
  car: CarResult | null;
  bike: ActiveResult | null;
  walk: ActiveResult | null;
  transit: TransitResult | null;
  transitNote: string | null;
  timetable: { built: string; window: string; shifted: boolean };
};
