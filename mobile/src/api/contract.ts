// The mobile ↔ BFF contract (ROUTING.md § 9). Imported type-only from the canonical
// file in the Next.js project so the two sides cannot drift (ADR-0003). Babel strips
// these imports, so Metro never bundles anything from outside mobile/.
// Only `export type` here — a value import would break the Metro build on purpose.

export type {
  Assumption,
  Basis,
  CostItem,
  DataMode,
  FuelType,
  Leg,
  LegMode,
  MobilityProfile,
  ParkingInfo,
  Place,
  PlanError,
  PlanRequest,
  PlanResponse,
  Preference,
  Recommendation,
  RouteOption,
  SourceRef,
  Strategy,
  Unavailable,
} from "../../../lib/mobility/types";
