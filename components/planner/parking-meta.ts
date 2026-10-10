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
  | { type: "charger"; charger: Charger };

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
  free: { color: "#2fd17c", label: "Nemokama" },
  paid: { color: "#4b8bff", label: "Mokama" },
  pr: { color: "#ffd23f", label: "P+R" },
  unknown: { color: "#8f98aa", label: "Taisyklės nežinomos" },
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
