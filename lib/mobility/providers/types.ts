// Provider interfaces (ROUTING.md § 8). The planning pipeline depends only on these;
// a real routing engine (e.g. OpenTripPlanner, ADR-0002) replaces DemoRoutingProvider
// by implementing RoutingProvider. Providers never see the user's profile.

import type { Basis, LatLng, Leg, LineString, ParkingInfo, Place, SourceRef } from "../types";

export type StreetPath = { distanceKm: number; durationMin: number; geometry: LineString | null; basis: Basis };

export type TransitItinerary = {
  /** Walk and ride legs with absolute times; the last leg arrives no later than arriveBy. */
  legs: Leg[];
  /** First boarding → last alighting, for the fare rule. */
  rideSpanMin: number;
  /** Distance travelled on vehicles, for CO₂. */
  ridePassengerKm: number;
  transfers: number;
};

export interface RoutingProvider {
  readonly source: SourceRef;
  /** Driving path; `at` is the approximate time of travel (traffic-aware providers use it). */
  drive(from: Place, to: Place, at: Date): Promise<StreetPath>;
  /** Public transport arriving no later than `arriveBy`; null when there is no connection. */
  transit(from: Place, to: Place, arriveBy: Date): Promise<TransitItinerary | null>;
}

export interface ParkingZoneProvider {
  readonly source: SourceRef;
  /** Paid street-parking zone name at the point ("Raudona", …), or null outside paid zones. Throws on failure. */
  zoneAt(point: LatLng): Promise<string | null>;
}

export type ParkRideSite = {
  id: string;
  name: string;
  landmark?: string;
  lat: number;
  lng: number;
  capacity: number | null;
};

export type ParkingAvailabilitySnapshot = {
  source: SourceRef;
  /** Official P+R site ids; null = missing, invalid, stale or unavailable. */
  bySiteId: Record<string, ParkingInfo["availability"]>;
};

export interface ParkingAvailabilityProvider {
  /** Current observations, not a prediction for the requested arrival time. */
  snapshot(): Promise<ParkingAvailabilitySnapshot>;
}

export type PlanDeps = {
  routing: RoutingProvider;
  parkingZones: ParkingZoneProvider;
  parkRide: { source: SourceRef; sites: ParkRideSite[] };
  /** Optional enricher; omitting it keeps deterministic offline/demo planning. */
  parkingAvailability?: ParkingAvailabilityProvider;
  now: () => Date;
};
