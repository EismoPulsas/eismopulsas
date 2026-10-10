// Official JUDU "Statyk ir važiuok" (P+R) sites — static, verified 2026-10-10.
// Names and coordinates: https://judu.lt/vairuotojams/statyk-ir-vaziuok-aiksteles/
// (coordinates from the page's Google Maps links). Capacity: the `capacity` field of
// JUDU's public occupancy layer aiksteliu_uzimtumas_actual on 2026-10-10 (DATA.md › A2).
// The P+R ticket price is in config.ts (PARK_AND_RIDE_TICKET).

import type { SourceRef } from "../types";
import type { ParkRideSite } from "./types";

export const PARK_AND_RIDE_SOURCE: SourceRef = {
  id: "judu-park-ride",
  name: "JUDU „Statyk ir važiuok“ aikštelės ir bilietas",
  basis: "official",
  url: "https://judu.lt/vairuotojams/statyk-ir-vaziuok-aiksteles/",
  note: "Sąrašas ir bilieto kaina patikrinti 2026-10-10.",
};

export const PARK_AND_RIDE_SITES: ParkRideSite[] = [
  { id: "ukmerges-246", name: "Ukmergės g. 246", landmark: "šalia PC „Senukai“", lat: 54.7232424, lng: 25.2426627, capacity: 94 },
  { id: "savanoriu-124", name: "Savanorių pr. 124", lat: 54.6602247, lng: 25.2349708, capacity: 100 },
  { id: "pociuno-8", name: "V. Pociūno g. 8", landmark: "šalia PC „Vilnius Outlet“", lat: 54.7020718, lng: 25.2067528, capacity: 250 },
];
