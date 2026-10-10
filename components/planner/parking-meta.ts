import type { LatLng } from "@/lib/geo";
import { lotRateAt } from "@/lib/metrics";
import type { Charger, Lot, ParkingZone } from "@/lib/plan-types";

// Shared by the map (Leaflet, browser-only) and the panels; keep Leaflet out of here.

/**
 * The moment prices and spaces are shown for: arrival at B once a trip is planned, else the
 * chosen departure time, else now. `sec` counts from local midnight of `date` (may pass 24 h).
 */
export type When = { date: string; sec: number; isNow: boolean };

/** Weekday (0 = Monday) and hour of a moment, as in the occupancy profiles. */
export function slotOf(w: When): [number, number] {
  const wd = (new Date(`${w.date}T00:00:00Z`).getUTCDay() + 6 + Math.floor(w.sec / 86400)) % 7;
  return [wd, Math.floor((((w.sec % 86400) + 86400) % 86400) / 3600)];
}

const WD_SHORT = ["Pr", "An", "Tr", "Kt", "Pn", "Š", "S"];
/** "Tr 18:36" */
export function whenLabel(w: When): string {
  const s = ((w.sec % 86400) + 86400) % 86400;
  return `${WD_SHORT[slotOf(w)[0]]} ${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;
}

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
/** With a moment: a car park whose rates do not apply then (evening, weekend) is free then. */
export function lotClass(l: Pick<Lot, "access" | "t">, when?: When | null): keyof typeof LOT_CLASS {
  if (l.access === "pr") return "pr";
  if (!l.t.known) return "unknown";
  if (l.t.free) return "free";
  return when && lotRateAt(l.t, when.date, when.sec) === 0 ? "free" : "paid";
}

/** Price as a plate label at that moment, when the rules are simple enough to say in one number. */
export function lotLabel(l: Pick<Lot, "t">, when?: When | null): string | null {
  const t = l.t;
  if (!t.known) return null;
  if (t.flat) return `${t.flat.price.toLocaleString("lt-LT")} €`;
  const h = when ? lotRateAt(t, when.date, when.sec) : t.free ? 0 : (t.tiers?.[0]?.perHour ?? t.rates?.[0]?.perHour);
  if (h == null) return null;
  return h === 0 ? "0 €" : `${h.toLocaleString("lt-LT", { maximumFractionDigits: 2 })} €/h`;
}

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
