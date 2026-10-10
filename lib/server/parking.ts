import "server-only";
import fs from "node:fs";
import path from "node:path";
import { inPolygon, type LatLng } from "../geo";
import type { ParkingZone } from "../plan-types";

type Zone = ParkingZone & { poly: LatLng[][][] };
let zones: Zone[] | null = null;

/** The municipal paid-parking zone at p, if any (Vilnius, Klaipėda). */
export function parkingZoneAt(p: LatLng): ParkingZone | null {
  if (!zones) {
    const file = path.join(process.cwd(), "public", "data", "parking.json");
    zones = (JSON.parse(fs.readFileSync(file, "utf8")) as { zones: Zone[] }).zones;
  }
  // Overlapping zones: the dearest one applies at the exact spot.
  const hits = zones.filter((z) => z.poly.some((rings) => inPolygon(p, rings))).sort((a, b) => b.price - a.price);
  if (!hits.length) return null;
  const { city, zone, price, text, rules } = hits[0];
  return { city, zone, price, text, rules };
}
