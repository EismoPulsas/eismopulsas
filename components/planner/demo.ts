// HARDCODE: placeholders for things the design shows but no data source gives us yet.
// Everything here is shown as-is for every route; replace with real data when a source exists
// (e.g. share of separated cycle paths and elevation from OpenStreetMap / a DEM).

export const DEMO = {
  /** Under the "ride" step of bike and Cyclocity trips. */
  bikeRideNote: "Važiuokite dviračių takais link tikslo, vengdami intensyvaus eismo gatvių.",
  bikeRideChips: ["94 % atskirti takai", "Lygus reljefas"],
  /** Under the "ride" step of scooter trips. */
  scooterRideNote: "Važiuokite dviračių takais ar šaligatviais, kur leidžiama.",
} as const;
