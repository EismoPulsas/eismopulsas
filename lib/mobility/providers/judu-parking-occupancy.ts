import "server-only";

import { createParkingAvailabilityProvider, OCCUPANCY_SOURCE } from "./judu-parking-occupancy-data";

export const juduParkingOccupancy = createParkingAvailabilityProvider(async () => {
  const params = new URLSearchParams({
    where: "1=1",
    outFields: "pavadinimas,capacity,occupied,vacant,status,timestamp_ms",
    returnGeometry: "false",
    f: "json",
  });
  const res = await fetch(`${OCCUPANCY_SOURCE.url}/query?${params}`, {
    headers: { "User-Agent": "EismoPulsas/0.1 (https://github.com/EismoPulsas/eismopulsas)" },
    cache: "no-store",
    signal: AbortSignal.timeout(2500),
  });
  if (!res.ok) throw new Error(`JUDU occupancy ${res.status}`);
  return res.json();
});
