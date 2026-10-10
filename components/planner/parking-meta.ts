import type { LatLng } from "@/lib/geo";
import type { Charger, Lot, ParkingZone } from "@/lib/plan-types";

// Shared by the map (Leaflet, browser-only) and the panels; keep Leaflet out of here.

export type Zone = ParkingZone & { poly: LatLng[][][] };
export type Area = { name: string; spaces: number | null; occupancy: number | null; poly: LatLng[][][] };

/** What the user clicked on the map; ParkingCard shows it. */
export type MapPick =
  | { type: "lot"; lot: Lot }
  | {
      type: "street";
      name: string | null;
      what: string;
      src: "osm" | "judu";
      zone: Zone | null;
      area: Area | null;
      fee?: string | null;
      maxStayMin?: number;
      spaces?: number | null;
      note?: string | null;
    }
  | { type: "noparking"; name: string | null }
  | { type: "charger"; charger: Charger }
  | { type: "bikeshare"; station: BikeStation }
  | { type: "sensor"; sensor: Sensor };

/** Cyclocity station with live availability (/api/bikeshare). */
export type BikeStation = { id: string; name: string; address: string; pos: LatLng; capacity: number; bikes: number; docks: number; open: boolean };
/** Via Lietuva road sensor (/api/traffic). */
export type Sensor = { name: string; road: string; pos: LatLng; speed: number; limit: number; vehicles: number };

/** One status palette for every marker: the same traffic-light meaning as the trip cards. */
export const STATUS = { go: "#10b981", wait: "#f59e0b", stop: "#ef4444", off: "#94a3b8" } as const;

export function bikeStatus(s: BikeStation): string {
  if (!s.open) return STATUS.off;
  return s.bikes === 0 ? STATUS.stop : s.bikes < 3 ? STATUS.wait : STATUS.go;
}

export function speedStatus(s: Sensor): string {
  const ratio = s.limit ? s.speed / s.limit : 1;
  return ratio >= 0.85 ? STATUS.go : ratio >= 0.6 ? STATUS.wait : STATUS.stop;
}

export const ZONE_COLOR: Record<string, string> = {
  "Mėlynoji zona": "#3b82f6",
  "Raudonoji zona": "#ef4444",
  "Geltonoji zona": "#facc15",
  "Geltonoji zona (paplūdimys)": "#fde68a",
  "Žalioji zona": "#22c55e",
};
export const FREE_STREET = "#aab3c3";
/** Violet, not red: red already means the red zone's streets. */
export const NO_PARKING = "#c084fc";

/** Car park classes on the map; the legend uses the same list. */
export const LOT_CLASS = {
  free: { color: "#10b981", label: "Nemokama" },
  paid: { color: "#2563eb", label: "Mokama" },
  pr: { color: "#f59e0b", label: "P+R" },
  unknown: { color: "#94a3b8", label: "Taisyklės nežinomos" },
} as const;
export const lotClass = (l: Lot): keyof typeof LOT_CLASS => (l.access === "pr" ? "pr" : !l.t.known ? "unknown" : l.t.free ? "free" : "paid");

export const SOURCE_LABEL: Record<Lot["src"], string> = {
  judu: "JUDU",
  unipark: "UNIPARK svetainė",
  curated: "prekybos centro svetainė",
  osm: "OpenStreetMap",
};

export const KIND_LABEL: Record<string, string> = {
  surface: "atvira aikštelė",
  underground: "požeminė",
  "multi-storey": "daugiaaukštė",
  rooftop: "ant stogo",
  lane: "juosta gatvėje",
  street_side: "prie gatvės",
};
