import "server-only";

// Provider selection (ROUTING.md § 8, ADR-0002). MOBILITY_ROUTING_PROVIDER picks the
// routing engine; only "demo" exists today, so it is also the default. An unknown
// value is a configuration error and fails loudly instead of silently serving demo data.

import { demoRouting } from "./demo";
import { PARK_AND_RIDE_SITES, PARK_AND_RIDE_SOURCE } from "./judu-park-ride";
import { juduParkingZones } from "./judu-parking-zones";
import type { PlanDeps, RoutingProvider } from "./types";

const ROUTING: Record<string, RoutingProvider> = {
  demo: demoRouting,
  // otp: otpRouting,  // next step, ADR-0002
};

export function getProviders(): PlanDeps {
  const name = process.env.MOBILITY_ROUTING_PROVIDER?.trim() || "demo";
  const routing = ROUTING[name];
  if (!routing) throw new Error(`Unknown MOBILITY_ROUTING_PROVIDER "${name}" (known: ${Object.keys(ROUTING).join(", ")})`);
  return {
    routing,
    parkingZones: juduParkingZones,
    parkRide: { source: PARK_AND_RIDE_SOURCE, sites: PARK_AND_RIDE_SITES },
    now: () => new Date(),
  };
}
