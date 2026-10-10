"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import type { StyleSpecification } from "maplibre-gl";
import { CircleMarker, MapContainer, ZoomControl, Marker, Polygon, Polyline, Popup, Tooltip, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "maplibre-gl/dist/maplibre-gl.css";
import "@maplibre/maplibre-gl-leaflet";
import { haversine, inRing, LT_BOUNDS, type LatLng } from "@/lib/geo";
import type { OptionId } from "@/lib/metrics";
import type { Charger, Connector, HybridOption, Lot, PlanResponse, RideLeg, TransitLeg } from "@/lib/plan-types";
import { fmtClock, MODE_META } from "./format";
import type { LiveParking } from "./live";
import { bikeStatus, FREE_STREET, LOT_CLASS, lotClass, NO_PARKING, speedStatus, STATUS, ZONE_COLOR, type Area, type BikeStation, type MapPick, type Sensor, type Zone } from "./parking-meta";

export type Layers = { lanes: boolean; traffic: boolean; parking: boolean; charging: boolean; bikeshare: boolean; scooters: boolean; stops: boolean };
/** What covers the map: the phone search card and sheet, or the desktop panel on the left. */
type Padding = { top: number; bottom: number; left?: number };

export type MapTheme = "dark" | "fiord" | "positron" | "liberty";
export const MAP_THEMES: { id: MapTheme; label: string; bg: string; light: boolean }[] = [
  { id: "dark", label: "Tamsus", bg: "#0c0c0c", light: false },
  { id: "fiord", label: "Mėlynas", bg: "#45516e", light: false },
  { id: "positron", label: "Šviesus", bg: "#f2f3f0", light: true },
  { id: "liberty", label: "Spalvotas", bg: "#f8f4f0", light: true },
];

type Lane = { k: "A" | "A+" | "OSM"; n: string; c: LatLng[] };
type ScooterFeed = { source: "gbfs" | "demo" | "none"; operator: string | null; total: number; vehicles: { id: string; pos: LatLng; battery: number | null }[] };
type ScooterState = { feed: ScooterFeed | null; tooFar: boolean };
type StreetRef = { zi?: number; ai?: number };
type StreetFile = {
  segments: (StreetRef & { src: "osm" | "judu"; line: LatLng[]; name: string | null; side?: string; orientation?: string | null; fee?: string | null; maxStayMin?: number; spaces?: number | null; note?: string | null })[];
  areas: (StreetRef & { pos: LatLng; poly: LatLng[][][] | null; name: string | null; kind: string; cap: number | null; fee: string | null; maxStayMin?: number })[];
  points: (StreetRef & { pos: LatLng; name: string | null; spaces: number | null })[];
  noParking: { line: LatLng[]; kind: string; name: string | null }[];
  noZones: { name: string | null; poly: LatLng[][][] }[];
};

const pin = (letter: string, color: string) =>
  L.divIcon({ className: "", html: `<div class="ep-pin" style="--c:${color}"><span>${letter}</span></div>`, iconSize: [34, 46], iconAnchor: [17, 46] });
const stopIcon = (color: string) => L.divIcon({ className: "", html: `<div class="ep-stop" style="--c:${color}"></div>`, iconSize: [12, 12], iconAnchor: [6, 6] });
const BIKE = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="17" r="3.5"/><circle cx="18.5" cy="17" r="3.5"/><path d="M5.5 17 9 9h6l3.5 8M9 9 7.5 6H6m9 3-3 8"/></svg>`;
const BOLT = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>`;
const GAUGE = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M4 18a8 8 0 1 1 16 0"/><path d="m12 18 4-6"/></svg>`;

/** One marker look for everything (see .ep-mk): status colour in the disc, a short label beside it. */
const iconCache = new Map<string, L.DivIcon>();
function mk(color: string, glyph: string, label?: string | number | null, cls = ""): { icon: L.DivIcon; w: number } {
  const text = label == null ? "" : String(label);
  const w = text ? Math.round(30 + text.length * 7.2) : 24;
  const key = `${color}|${glyph}|${text}|${cls}`;
  let icon = iconCache.get(key);
  if (!icon) {
    icon = L.divIcon({
      className: "",
      html: `<div class="ep-mk ${cls}" style="--c:${color}"><i>${glyph}</i>${text ? `<b>${text}</b>` : ""}</div>`,
      iconSize: [w, 24],
      iconAnchor: [w / 2, 12],
    });
    iconCache.set(key, icon);
  }
  return { icon, w };
}
const SPOT = mk("var(--marking)", "P", null, "sq chosen").icon;

/** Price for the first hour as a plate label, when the rules are simple enough to say in one number. */
function lotLabel(l: Lot): string | null {
  const t = l.t;
  if (!t.known) return null;
  if (t.free) return "0 €";
  if (t.flat) return `${t.flat.price.toLocaleString("lt-LT")} €`;
  const h = t.tiers?.[0]?.perHour ?? t.rates?.[0]?.perHour;
  return h != null ? `${h.toLocaleString("lt-LT", { maximumFractionDigits: 2 })} €/h` : null;
}

/** With a trip, each layer shows only where it matters (unless the user asks for the whole city):
 *  parking and charging around B, shared bikes at both ends and along the way, scooters near A. */
const NEAR_DEST_M = 600;
const NEAR_TRIP_M = 450;

type Poi = {
  key: string;
  pos: LatLng;
  color: string;
  /** Higher wins a crowded spot; the loser becomes a small dot. */
  rank: number;
  mark: { icon: L.DivIcon; w: number } | null;
  onClick?: (e: L.LeafletMouseEvent) => void;
  hover?: React.ReactNode;
};

/** Draws markers so none overlap: in a crowded spot the best one keeps its label, the rest shrink to dots. */
function Pois({ items, view }: { items: Poi[]; view: Viewport | null }) {
  const map = useMap();
  const placed = useMemo(() => {
    void view; // recompute after every move / zoom
    const boxes: { x: number; y: number; w: number }[] = [];
    return [...items]
      .sort((a, b) => b.rank - a.rank)
      .map((p) => {
        if (!p.mark) return { p, full: false };
        const pt = map.latLngToContainerPoint(p.pos);
        const w = p.mark.w;
        const hit = boxes.some((b) => Math.abs(b.x - pt.x) < (b.w + w) / 2 + 3 && Math.abs(b.y - pt.y) < 27);
        if (!hit) boxes.push({ x: pt.x, y: pt.y, w });
        return { p, full: !hit };
      });
  }, [items, map, view]);
  return (
    <>
      {placed.map(({ p, full }) =>
        full ? (
          <Marker key={p.key} position={p.pos} icon={p.mark!.icon} zIndexOffset={p.rank} eventHandlers={p.onClick ? { click: p.onClick } : undefined}>
            {p.hover && (
              <Tooltip className="ep-tooltip" direction="top" offset={[0, -12]}>
                {p.hover}
              </Tooltip>
            )}
          </Marker>
        ) : (
          <CircleMarker
            key={p.key}
            center={p.pos}
            radius={4}
            bubblingMouseEvents={false}
            pathOptions={{ color: "#ffffff", weight: 1.5, fillColor: p.color, fillOpacity: 1 }}
            eventHandlers={p.onClick ? { click: p.onClick } : undefined}
          >
            {p.hover && (
              <Tooltip className="ep-tooltip" direction="top" offset={[0, -4]}>
                {p.hover}
              </Tooltip>
            )}
          </CircleMarker>
        ),
      )}
    </>
  );
}
/** Where a car + second-leg trip leaves the car: P, or ⚡ when it charges there. */
const HUB = (charge: boolean) => mk(charge ? "#0e7490" : "var(--marking)", charge ? BOLT : "P", null, "sq chosen").icon;

// The stock dark style draws streets barely above the background; lift them so the street grid reads.
const DARK_ROADS: Record<string, string> = {
  highway_path: "#34353b",
  highway_minor: "#33343a",
  highway_major_casing: "rgba(120,122,130,0.9)",
  highway_major_inner: "#44454d",
  highway_major_subtle: "#4a4b53",
  highway_motorway_casing: "rgba(140,142,150,0.9)",
  highway_motorway_inner: "#5a5b64",
  highway_motorway_subtle: "#4a4b53",
};

// The stock styles prefer English names ("Old Town"); show the Lithuanian ones.
const LT_NAME = ["coalesce", ["get", "name:lt"], ["get", "name"]];

async function loadStyle(theme: MapTheme): Promise<StyleSpecification> {
  const style = (await fetch(`https://tiles.openfreemap.org/styles/${theme}`).then((r) => r.json())) as StyleSpecification;
  for (const l of style.layers) {
    if (l.type === "symbol" && JSON.stringify(l.layout?.["text-field"] ?? "").includes("name_en"))
      l.layout = { ...l.layout, "text-field": LT_NAME as never };
    if (theme === "dark" && l.type === "line" && DARK_ROADS[l.id]) l.paint = { ...l.paint, "line-color": DARK_ROADS[l.id] };
  }
  return style;
}

/** Vector basemap (OpenFreeMap, no key) drawn by MapLibre under the Leaflet layers.
 *  Vector tiles stop at z14 and are drawn on the GPU, so panning and zooming need far
 *  fewer downloads than raster tiles and never show grey squares at deeper zooms. */
function VectorBasemap({ theme }: { theme: MapTheme }) {
  const map = useMap();
  const layer = useRef<L.MaplibreGL | null>(null);
  useEffect(
    () => () => {
      layer.current?.remove();
      layer.current = null;
    },
    [map],
  );
  useEffect(() => {
    let alive = true;
    loadStyle(theme)
      .then((style) => {
        if (!alive) return;
        // Switching themes swaps the style in place; tiles already downloaded are reused.
        if (layer.current) layer.current.getMaplibreMap().setStyle(style);
        else
          layer.current = L.maplibreGL({
            style,
            padding: 0.3,
            attribution:
              '<a href="https://openfreemap.org">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/">OpenMapTiles</a>, <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          } as L.LeafletMaplibreGLOptions).addTo(map);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [map, theme]);
  return null;
}

const PIN_A = pin("A", "#1f2937");
const PIN_B = pin("B", "#b4232f");

function useJson<T>(url: string, enabled: boolean): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    if (!enabled || data) return;
    let alive = true;
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && setData(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [url, enabled, data]);
  return data;
}

function ClickHandler({ border, onPick, onOutside }: { border: LatLng[][] | null; onPick: (p: LatLng) => void; onOutside: () => void }) {
  useMapEvents({
    click: (e) => {
      const p: LatLng = [e.latlng.lat, e.latlng.lng];
      if (border && !border.some((ring) => inRing(p, ring))) onOutside();
      else onPick(p);
    },
  });
  return null;
}

type Viewport = { zoom: number; bounds: L.LatLngBounds };

/** Reports the zoom and (padded) bounds, so only what is in view gets drawn. */
function ViewportWatcher({ onChange }: { onChange: (v: Viewport) => void }) {
  const map = useMapEvents({
    moveend: () => onChange({ zoom: map.getZoom(), bounds: map.getBounds().pad(0.25) }),
  });
  useEffect(() => {
    onChange({ zoom: map.getZoom(), bounds: map.getBounds().pad(0.25) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);
  return null;
}

/** lots.json holds Vilnius in full; elsewhere the OSM car parks are in lots-lt.json. */
const VILNIUS = L.latLngBounds([54.56, 25.0], [54.84, 25.49]);

// Everything outside Lithuania is dimmed: a world-sized polygon with the country cut out.
const WORLD: LatLng[] = [
  [48, 10],
  [48, 36],
  [62, 36],
  [62, 10],
];

/** Re-frame the map when the trip changes, leaving room for whatever covers it (search card, sheet). */
function Framer({ points, nonce, padding }: { points: LatLng[]; nonce: string; padding: Padding }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    const pad = { paddingTopLeft: L.point(32 + (padding.left ?? 0), padding.top + 60), paddingBottomRight: L.point(32, padding.bottom + 24) };
    if (points.length === 1) map.flyToBounds(L.latLngBounds(points[0], points[0]).pad(0.01), { ...pad, maxZoom: 14, duration: 0.6 });
    else map.flyToBounds(L.latLngBounds(points), { ...pad, maxZoom: 15, duration: 0.6 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, map, padding.top, padding.bottom, padding.left]);
  return null;
}

const SCOOTER_MIN_ZOOM = 12;

// ---------------------------------------------------------------- public transport stops

type StopRoute = { short: string; color: string; type: number };
type MapStop = { id: number; name: string; pos: LatLng; routes: StopRoute[] };
type Departure = StopRoute & { route: string; headsign: string; time: number };

const STOPS_MIN_ZOOM = 15;
const routeColor = (r: { color: string }) => r.color || "#4b8bff";

function RouteChip({ short, color }: { short: string; color: string }) {
  return (
    <span className="inline-block rounded px-1 text-[11px] leading-[16px] font-bold text-white" style={{ background: color || "#4b8bff" }}>
      {short}
    </span>
  );
}

/** Next departures, loaded when the stop's popup opens (react-leaflet mounts popup content only then). */
function StopDepartures({ stop }: { stop: MapStop }) {
  const [data, setData] = useState<{ departures: Departure[] } | null | "error">(null);
  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/stops?id=${stop.id}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch((e) => e?.name !== "AbortError" && setData("error"));
    return () => ctrl.abort();
  }, [stop.id]);
  return (
    <div className="w-60">
      <div className="font-semibold">{stop.name}</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {stop.routes.map((r) => (
          <RouteChip key={r.short} short={r.short} color={r.color} />
        ))}
      </div>
      <div className="mt-2 text-[11px] font-semibold tracking-wide text-[var(--muted)] uppercase">Artimiausi išvykimai</div>
      {data === null && <div className="text-xs text-[var(--muted)]">Kraunama…</div>}
      {data === "error" && <div className="text-xs text-[var(--wait)]">Nepavyko gauti tvarkaraščio.</div>}
      {data && data !== "error" && !data.departures.length && <div className="text-xs text-[var(--muted)]">Per artimiausias 2 val. reisų nėra.</div>}
      {data && data !== "error" && (
        <ul className="mt-1 flex flex-col gap-0.5">
          {data.departures.map((d, i) => (
            <li key={i} className="flex items-center gap-1.5 text-xs">
              <span className="tnum w-9 shrink-0 font-semibold">{fmtClock(d.time)}</span>
              <RouteChip short={d.route} color={d.color} />
              <span className="truncate text-[var(--muted)]">→ {d.headsign}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-1.5 text-[10px] text-[var(--muted)]">Pagal tvarkaraštį (LTSA GTFS)</div>
    </div>
  );
}

/** Stops in the visible area once zoomed in to street level. */
function StopsLayer() {
  const map = useMap();
  const [stops, setStops] = useState<MapStop[]>([]);
  useEffect(() => {
    let ctrl: AbortController | null = null;
    const load = () => {
      ctrl?.abort();
      if (map.getZoom() < STOPS_MIN_ZOOM) {
        setStops([]);
        return;
      }
      const b = map.getBounds().pad(0.2);
      ctrl = new AbortController();
      fetch(`/api/stops?bbox=${[b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].map((v) => v.toFixed(4)).join(",")}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d: { stops: MapStop[] }) => setStops(d.stops ?? []))
        .catch(() => {});
    };
    load();
    map.on("moveend", load);
    return () => {
      ctrl?.abort();
      map.off("moveend", load);
    };
  }, [map]);
  return (
    <>
      {stops.map((st) => (
        <CircleMarker
          key={st.id}
          center={st.pos}
          radius={5}
          pathOptions={{ color: routeColor(st.routes[0]), weight: 2.5, fillColor: "#ffffff", fillOpacity: 1 }}
        >
          <Tooltip className="ep-tooltip" direction="top" offset={[0, -4]}>
            <b>{st.name}</b>
            <div className="mt-0.5 flex max-w-56 flex-wrap gap-1">
              {st.routes.slice(0, 12).map((r) => (
                <RouteChip key={r.short} short={r.short} color={r.color} />
              ))}
              {st.routes.length > 12 && <span className="text-xs">+{st.routes.length - 12}</span>}
            </div>
          </Tooltip>
          <Popup className="ep-popup" autoPan>
            <StopDepartures stop={st} />
          </Popup>
        </CircleMarker>
      ))}
    </>
  );
}

/** Loads scooters for the visible area whenever the map stops moving. */
function ScooterLayer({ onState, keep }: { onState: (s: ScooterState) => void; keep: (p: LatLng) => boolean }) {
  const map = useMap();
  const [feed, setFeed] = useState<ScooterFeed | null>(null);
  useEffect(() => {
    let ctrl: AbortController | null = null;
    const load = () => {
      ctrl?.abort();
      if (map.getZoom() < SCOOTER_MIN_ZOOM) {
        setFeed(null);
        onState({ feed: null, tooFar: true });
        return;
      }
      const b = map.getBounds();
      ctrl = new AbortController();
      fetch(`/api/scooters?bbox=${[b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].map((v) => v.toFixed(4)).join(",")}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d: ScooterFeed) => {
          setFeed(d);
          onState({ feed: d, tooFar: false });
        })
        .catch(() => {});
    };
    load();
    map.on("moveend", load);
    const t = setInterval(load, 60_000);
    return () => {
      ctrl?.abort();
      map.off("moveend", load);
      clearInterval(t);
      onState({ feed: null, tooFar: false });
    };
  }, [map, onState]);
  return (
    <>
      {feed?.vehicles.filter((v) => keep(v.pos)).map((v) => (
        <CircleMarker
          key={v.id}
          center={v.pos}
          radius={4}
          pathOptions={{ color: "#ffffff", weight: 1.5, fillColor: v.battery !== null && v.battery < 25 ? STATUS.off : "#ec4899", fillOpacity: 1 }}
        >
          <Tooltip className="ep-tooltip">
            <b>{feed.source === "demo" ? "DEMO paspirtukas" : `Paspirtukas${feed.operator ? ` · ${feed.operator}` : ""}`}</b>
            {v.battery !== null && <div className="text-xs">Baterija {v.battery} %</div>}
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  );
}

/** Geometry of the "simple" modes that are one line on the map. */
const LINE_MODES = ["car", "scooter", "bike", "walk"] as const;

/** Poll a live endpoint while its layer is on. */
function useLive<T>(url: string, enabled: boolean, everyMs: number): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = () =>
      fetch(url)
        .then((r) => r.json())
        .then((d) => alive && setData(d))
        .catch(() => {});
    load();
    const t = setInterval(load, everyMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [url, enabled, everyMs]);
  return data;
}

// The chosen map look is a per-browser preference. This component only renders in the
// browser (Planner loads it with ssr: false), so storage can be read on first render.
function savedTheme(): MapTheme {
  try {
    const t = localStorage.getItem("ep-map-theme");
    if (MAP_THEMES.some((m) => m.id === t)) return t as MapTheme;
  } catch {}
  return "positron";
}

/** Big, official or known car parks are shown first; small unknown ones only close up. */
function lotVisible(l: Lot, zoom: number): boolean {
  if (zoom >= 15) return true;
  const major = l.src !== "osm" || l.access === "pr" || (l.cap ?? 0) >= 100;
  if (zoom >= 13) return major || l.t.known || (l.cap ?? 0) >= 30 || !!l.name;
  return major && zoom >= 11;
}

const maxKw = (c: Charger) => Math.max(0, ...c.plugs.map((p) => p.kW));

export default function MapView({
  from,
  to,
  plan,
  selected,
  hybrid,
  layers,
  picking,
  live,
  ev,
  connectors,
  parkingSpot,
  picked,
  padding,
  onLayers,
  onPick,
  onOutside,
  onMove,
  onPickPlace,
}: {
  from: LatLng | null;
  to: LatLng | null;
  plan: PlanResponse | null;
  selected: OptionId | null;
  /** The car + second-leg trip being looked at, if a combination is selected. */
  hybrid?: HybridOption | null;
  layers: Layers;
  picking: boolean;
  live: LiveParking | null;
  /** The profile's car can charge: chargers are shown only then. */
  ev: boolean;
  connectors: Connector[];
  /** Where the car option leaves the car (drawn with the walk to B). */
  parkingSpot: { pos: LatLng; name: string } | null;
  picked: MapPick | null;
  padding: Padding;
  onLayers: (l: Layers) => void;
  onPick: (p: LatLng) => void;
  onOutside: () => void;
  onMove: (which: "from" | "to", p: LatLng) => void;
  onPickPlace: (p: MapPick) => void;
}) {
  const lanes = useJson<{ lanes: Lane[] }>("/data/bus-lanes.json", layers.lanes);
  const parking = useJson<{ zones: Zone[]; areas: Area[] }>("/data/parking.json", layers.parking);
  const lotsFile = useJson<{ lots: Lot[] }>("/data/lots.json", layers.parking);
  const street = useJson<StreetFile>("/data/street-parking.json", layers.parking);
  const chargersFile = useJson<{ chargers: Charger[] }>("/data/chargers.json", ev && layers.charging);
  const border = useJson<{ rings: LatLng[][] }>("/data/lithuania.json", true);
  const [scooterState, setScooterState] = useState<ScooterState>({ feed: null, tooFar: false });
  const traffic = useLive<{ time: string; sensors: Sensor[] }>("/api/traffic", layers.traffic, 5 * 60 * 1000);
  const bikeshare = useLive<{ stations: BikeStation[] }>("/api/bikeshare", layers.bikeshare, 60 * 1000);
  const [view, setView] = useState<Viewport | null>(null);
  // Thin street pieces are hard to hit, especially by finger: accept clicks 6 px around
  // them. One renderer per map: Leaflet cannot move a renderer to a new map instance.
  const [renderer] = useState(() => L.canvas({ tolerance: 6 }));
  // A click on a car park, street piece or charger opens its card and stops there:
  // reaching the map, it would also move A or B.
  const pickPlace = (e: L.LeafletMouseEvent, p: MapPick) => {
    L.DomEvent.stopPropagation(e); // Leaflet's own dispatch (markers)
    L.DomEvent.stopPropagation(e.originalEvent); // the DOM click on the canvas (lines, dots)
    onPickPlace(p);
  };

  const frame = useMemo(() => {
    if (plan) {
      const pts: LatLng[] = [plan.from, plan.to];
      const line = LINE_MODES.find((m) => m === selected);
      if (line) pts.push(...(plan[line]?.geometry ?? []));
      if (selected === "bikeshare" && plan.bikeshare) pts.push(...plan.bikeshare.geometry);
      if (selected === "transit" && plan.transit) for (const l of plan.transit.legs) if (l.kind === "ride") pts.push(...l.geometry);
      if (hybrid) pts.push(...hybrid.car.geometry, ...hybridPoints(hybrid));
      return { points: pts, nonce: `${plan.from}-${plan.to}-${selected}` };
    }
    const pts = [from, to].filter(Boolean) as LatLng[];
    return { points: pts, nonce: pts.join("|") };
  }, [plan, selected, hybrid, from, to]);

  const zoom = view?.zoom ?? 7;
  // With a trip on the map, show what is near it (A, B, the chosen route); the rest of the city on request.
  const [showAll, setShowAll] = useState(false);
  const corridor = useMemo(() => {
    if (!plan || showAll) return null;
    const step = Math.max(1, Math.ceil(frame.points.length / 150));
    const pts = frame.points.filter((_, i) => i % step === 0);
    pts.push(plan.from, plan.to);
    return pts;
  }, [plan, showAll, frame.points]);
  const near = useMemo(() => (p: LatLng) => !corridor || corridor.some((c) => haversine(c, p) < NEAR_TRIP_M), [corridor]);
  const dest = useMemo(() => (plan && !showAll ? [plan.to, ...(parkingSpot ? [parkingSpot.pos] : [])] : null), [plan, showAll, parkingSpot]);
  const nearDest = useMemo(() => (p: LatLng) => !dest || dest.some((c) => haversine(c, p) < NEAR_DEST_M), [dest]);
  const nearStart = useMemo(() => (p: LatLng) => !plan || showAll || haversine(plan.from, p) < NEAR_TRIP_M, [plan, showAll]);
  // The rest of Lithuania's car parks (OSM) load only when looking at somewhere else up close.
  const elsewhere = !!view && zoom >= 11 && !VILNIUS.contains(view.bounds.getCenter());
  const lotsLt = useJson<{ lots: Lot[] }>("/data/lots-lt.json", layers.parking && elsewhere);
  const inView = (p: LatLng) => !view || view.bounds.contains(p);
  const zoneOf = (i?: number) => (i !== undefined ? (parking?.zones[i] ?? null) : null);
  const areaOf = (i?: number) => (i !== undefined ? (parking?.areas[i] ?? null) : null);
  const streetColor = (zi?: number, fee?: string | null) => (zi !== undefined ? (ZONE_COLOR[parking?.zones[zi]?.zone ?? ""] ?? "#999") : fee === "yes" ? LOT_CLASS.paid.color : FREE_STREET);
  const quiet = { bubblingMouseEvents: false };

  const visibleLots = useMemo(
    () =>
      layers.parking
        ? [...(lotsFile?.lots ?? []), ...(lotsLt?.lots ?? [])].filter((l) => lotVisible(l, zoom) && (!view || view.bounds.contains(l.pos)) && nearDest(l.pos))
        : [],
    [layers.parking, lotsFile, lotsLt, zoom, view, nearDest],
  );
  const visibleChargers = useMemo(
    () =>
      ev && layers.charging && chargersFile
        ? chargersFile.chargers.filter((c) => (zoom >= 12 || c.plugs.some((p) => p.dc && p.kW >= 50)) && (!view || view.bounds.contains(c.pos)) && nearDest(c.pos))
        : [],
    [ev, layers.charging, chargersFile, zoom, view, nearDest],
  );

  // Car parks, chargers, Cyclocity and road sensors share one marker layer, so they never pile up.
  const pois = useMemo(() => {
    const out: Poi[] = [];
    for (const l of visibleLots) {
      const color = LOT_CLASS[lotClass(l)].color;
      const free = l.occ ? (live?.lots?.[l.occ]?.vacant ?? null) : null;
      const plate = (l.src === "judu" && zoom >= 13) || (zoom >= 15 && (l.t.known || (l.cap ?? 0) >= 50));
      out.push({
        key: `l${l.id}`,
        pos: l.pos,
        color,
        rank: (free != null ? 60 : l.src === "judu" ? 50 : l.t.known ? 30 : 10) + Math.min(9, (l.cap ?? 0) / 50),
        mark: plate ? mk(color, "P", free ?? lotLabel(l), "sq") : null,
        onClick: (e) => pickPlace(e, { type: "lot", lot: l }),
      });
    }
    for (const c of visibleChargers) {
      const status = live?.chargers?.[c.id];
      const fits = c.plugs.some((p) => connectors.includes(p.std));
      const color = !fits ? STATUS.off : status && status[0] === 0 ? STATUS.stop : STATUS.go;
      out.push({
        key: `c${c.id}`,
        pos: c.pos,
        color,
        rank: fits ? 40 + Math.min(9, maxKw(c) / 40) : 5,
        mark: zoom >= 13 ? mk(color, BOLT, zoom >= 15 ? `${maxKw(c)} kW` : null, fits ? "" : "off") : null,
        onClick: (e) => pickPlace(e, { type: "charger", charger: c }),
      });
    }
    if (layers.bikeshare)
      for (const st of bikeshare?.stations ?? []) {
        if (!near(st.pos)) continue;
        const color = bikeStatus(st);
        out.push({
          key: `b${st.id}`,
          pos: st.pos,
          color,
          rank: 45 + Math.min(9, st.bikes),
          mark: mk(color, BIKE, st.open ? st.bikes : "–", st.open ? "" : "off"),
          hover: <b>{st.name}</b>,
          onClick: (e) => pickPlace(e, { type: "bikeshare", station: st }),
        });
      }
    if (layers.traffic)
      for (const [i, se] of (traffic?.sensors ?? []).entries()) {
        const color = speedStatus(se);
        out.push({ key: `t${i}`, pos: se.pos, color, rank: 20, mark: mk(color, GAUGE, se.speed), hover: <b>{se.name}</b>, onClick: (e) => pickPlace(e, { type: "sensor", sensor: se }) });
      }
    return out;
    // pickPlace only wraps onPickPlace
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleLots, visibleChargers, live, connectors, zoom, layers.bikeshare, layers.traffic, bikeshare, traffic, near]);

  const bounds = L.latLngBounds(LT_BOUNDS).pad(0.15);
  const [theme, setTheme] = useState<MapTheme>(savedTheme);
  const pickTheme = (t: MapTheme) => {
    setTheme(t);
    try {
      localStorage.setItem("ep-map-theme", t);
    } catch {}
  };
  const look = MAP_THEMES.find((t) => t.id === theme) ?? MAP_THEMES[0];
  const rides = plan?.transit?.legs.filter((l): l is RideLeg => l.kind === "ride") ?? [];

  return (
    <div className={`relative h-full w-full ${picking ? "ep-picking" : ""}`}>
      <MapContainer
        center={[55.17, 23.9]}
        zoom={7}
        minZoom={7}
        maxZoom={19}
        maxBounds={bounds}
        maxBoundsViscosity={1}
        preferCanvas
        renderer={renderer}
        zoomControl={false}
        className="h-full w-full"
        style={{ background: look.bg }}
      >
        <VectorBasemap theme={theme} />
        <ZoomControl position="bottomright" zoomInTitle="Priartinti" zoomOutTitle="Nutolinti" />
        {border && (
          <>
            <Polygon positions={[WORLD, ...border.rings]} pathOptions={{ stroke: false, fillColor: look.light ? "#ffffff" : "#05060a", fillOpacity: look.light ? 0.65 : 0.78 }} interactive={false} />
            {border.rings.map((r, i) => (
              <Polygon key={i} positions={r} pathOptions={{ color: look.light ? "#c2410c" : "#ffd23f", weight: 1.5, opacity: look.light ? 0.7 : 0.5, dashArray: "6 6", fill: false }} interactive={false} />
            ))}
          </>
        )}
        <ClickHandler border={border?.rings ?? null} onPick={onPick} onOutside={onOutside} />
        <ViewportWatcher onChange={setView} />
        <Framer points={frame.points} nonce={frame.nonce} padding={padding} />

        {/* Paid street-parking zones: clicks pass through, so A/B can still be picked inside them. */}
        {layers.parking &&
          parking?.zones.map((z, i) =>
            z.poly.map((rings, j) => (
              <Polygon
                key={`${i}-${j}`}
                positions={rings}
                pathOptions={{
                  color: ZONE_COLOR[z.zone] ?? "#999",
                  weight: 1.5,
                  // Quiet unless the car is the way being looked at.
                  fillOpacity: plan && selected !== "car" ? 0.03 : zoom >= 15 ? 0.04 : 0.07,
                  opacity: plan && selected !== "car" ? 0.3 : 0.7,
                  dashArray: z.zone.includes("paplūdimys") ? "4 4" : undefined,
                }}
              >
                <Tooltip className="ep-tooltip" sticky>
                  <b>
                    {z.city}: {z.zone}
                  </b>
                  <div className="text-xs opacity-80">{z.text}</div>
                </Tooltip>
              </Polygon>
            )),
          )}

        {/* No-parking zones and street pieces where parking is not allowed. */}
        {layers.parking && street && zoom >= 15 &&
          street.noZones.filter((z) => nearDest(z.poly[0][0][0])).map((z, i) =>
            z.poly.map((rings, j) => (
              <Polygon
                key={`nz${i}-${j}`}
                positions={rings}
                {...quiet}
                pathOptions={{ color: NO_PARKING, weight: 1.5, dashArray: "4 4", fillColor: NO_PARKING, fillOpacity: 0.14 }}
                eventHandlers={{ click: (e) => pickPlace(e, { type: "noparking", name: z.name }) }}
              />
            )),
          )}
        {layers.parking && street && zoom >= 16 &&
          street.noParking
            .filter((s) => s.line.some(inView))
            .map((s, i) => <Polyline key={`np${i}`} positions={s.line} interactive={false} pathOptions={{ color: NO_PARKING, weight: 2, opacity: 0.7, dashArray: "2 6" }} />)}

        {/* Street-side parking, drawn along the curb in the colour of its zone. */}
        {layers.parking && street && zoom >= 15 && (
          <>
            {street.segments
              .filter((s) => s.line.some(inView) && nearDest(s.line[0]))
              .map((s, i) => (
                <Polyline
                  key={`ss${i}`}
                  positions={s.line}
                  {...quiet}
                  pathOptions={{ color: streetColor(s.zi, s.fee), weight: zoom >= 16 ? 5 : 4, opacity: 0.95, lineCap: "butt" }}
                  eventHandlers={{
                    click: (e) =>
                      pickPlace(e, {
                        type: "street",
                        name: s.name,
                        what: s.src === "judu" ? "įrengtos stovėjimo vietos gatvėje" : `gatvėje${s.orientation ? `, ${s.orientation}` : ""}`,
                        src: s.src,
                        zone: zoneOf(s.zi),
                        area: areaOf(s.ai),
                        fee: s.fee,
                        maxStayMin: s.maxStayMin,
                        spaces: s.spaces,
                        note: s.note,
                      }),
                  }}
                />
              ))}
            {street.areas
              .filter((a) => inView(a.pos) && nearDest(a.pos) && (a.poly || zoom >= 16))
              .map((a, i) => {
                const pick = (e: L.LeafletMouseEvent) => pickPlace(e, { type: "street", name: a.name, what: "stovėjimo vietos prie gatvės", src: "osm", zone: zoneOf(a.zi), area: areaOf(a.ai), fee: a.fee, maxStayMin: a.maxStayMin, spaces: a.cap });
                const color = streetColor(a.zi, a.fee);
                return a.poly ? (
                  a.poly.map((rings, j) => (
                    <Polygon key={`sa${i}-${j}`} positions={rings} {...quiet} pathOptions={{ color, weight: 1.5, fillColor: color, fillOpacity: 0.35 }} eventHandlers={{ click: pick }} />
                  ))
                ) : (
                  <CircleMarker key={`sa${i}`} center={a.pos} radius={3.5} {...quiet} pathOptions={{ color: "#ffffff", weight: 1, fillColor: color, fillOpacity: 1 }} eventHandlers={{ click: pick }} />
                );
              })}
            {zoom >= 16 && street.points
              .filter((p) => inView(p.pos) && nearDest(p.pos))
              .map((p, i) => (
                <CircleMarker
                  key={`sp${i}`}
                  center={p.pos}
                  radius={3.5}
                  {...quiet}
                  pathOptions={{ color: "#ffffff", weight: 1, fillColor: streetColor(p.zi), fillOpacity: 1 }}
                  eventHandlers={{ click: (e) => pickPlace(e, { type: "street", name: p.name, what: "vietos ant šaligatvio", src: "judu", zone: zoneOf(p.zi), area: areaOf(p.ai), spaces: p.spaces }) }}
                />
              ))}
          </>
        )}

        {/* Car parks: outlines close up, a coloured dot (or a live "P" plate) everywhere. */}
        {zoom >= 16 &&
          visibleLots
            .filter((l) => l.poly)
            .map((l) =>
              l.poly!.map((rings, j) => (
                <Polygon
                  key={`lp${l.id}-${j}`}
                  positions={rings}
                  {...quiet}
                  pathOptions={{ color: LOT_CLASS[lotClass(l)].color, weight: 1.5, fillOpacity: 0.12 }}
                  eventHandlers={{ click: (e) => pickPlace(e, { type: "lot", lot: l }) }}
                />
              )),
            )}
        <Pois items={pois} view={view} />

        {/* Highlight of the clicked place. */}
        {picked && (picked.type === "lot" || picked.type === "charger" || picked.type === "bikeshare" || picked.type === "sensor") && (
          <CircleMarker
            center={picked.type === "lot" ? picked.lot.pos : picked.type === "charger" ? picked.charger.pos : picked.type === "bikeshare" ? picked.station.pos : picked.sensor.pos}
            radius={18}
            interactive={false}
            pathOptions={{ color: "#059669", weight: 3, fill: false }}
          />
        )}

        {layers.lanes &&
          lanes?.lanes.map((l, i) => (
            <Polyline
              key={i}
              positions={l.c}
              pathOptions={{ color: l.k === "A+" ? "#10b981" : "#34d399", weight: 4, opacity: l.k === "OSM" ? 0.55 : 0.8, lineCap: "butt" }}
            >
              <Tooltip className="ep-tooltip" sticky>
                <b>{l.k === "OSM" ? "Autobusų juosta" : `${l.k} juosta`}</b>
                {l.n && <div className="text-xs opacity-80">{l.n}</div>}
                <div className="text-[10px] opacity-60">{l.k === "OSM" ? "OpenStreetMap" : "SĮ „Susisiekimo paslaugos“"}</div>
              </Tooltip>
            </Polyline>
          ))}

        {layers.stops && <StopsLayer />}
        {layers.scooters && <ScooterLayer onState={setScooterState} keep={nearStart} />}

        {/* Unselected routes first, faint. */}
        {plan &&
          LINE_MODES.map((m) => {
            const r = plan[m];
            if (!r || m === selected) return null;
            return <Polyline key={m} positions={r.geometry} pathOptions={{ color: MODE_META[m].color, weight: 3, opacity: 0.3 }} />;
          })}
        {plan?.bikeshare && selected !== "bikeshare" && (
          <Polyline positions={plan.bikeshare.geometry} pathOptions={{ color: MODE_META.bikeshare.color, weight: 3, opacity: 0.3 }} />
        )}
        {plan?.transit && selected !== "transit" &&
          rides.map((l, i) => <Polyline key={`t${i}`} positions={l.geometry} pathOptions={{ color: MODE_META.transit.color, weight: 3, opacity: 0.3 }} />)}

        {/* Selected route on top, with a dark casing like a road. */}
        {plan &&
          LINE_MODES.filter((m) => m === selected && plan[m]).map((m) => (
            <Fragment key={m}>
              <Polyline positions={plan[m]!.geometry} pathOptions={{ color: look.light ? "#ffffff" : "#05060a", weight: 9, opacity: look.light ? 1 : 0.85 }} />
              <Polyline positions={plan[m]!.geometry} pathOptions={{ color: MODE_META[m].color, weight: 5, opacity: 1, dashArray: m === "walk" ? "2 9" : undefined }} />
            </Fragment>
          ))}
        {plan?.scooter?.vehicle && selected === "scooter" && (
          <>
            <StreetWalk from={plan.from} to={plan.scooter.vehicle.pos} geometry={plan.scooter.vehicle.walkGeometry} />
            <Marker position={plan.scooter.vehicle.pos} icon={stopIcon(MODE_META.scooter.color)}>
              <Tooltip className="ep-tooltip" direction="top" offset={[0, -6]}>
                <b>{plan.scooter.source === "demo" ? "DEMO paspirtukas" : "Artimiausias paspirtukas"}</b>
                <div className="text-xs opacity-80">
                  {Math.round(plan.scooter.vehicle.walk)} m pėsčiomis{plan.scooter.vehicle.battery !== null ? ` · baterija ${plan.scooter.vehicle.battery} %` : ""}
                </div>
              </Tooltip>
            </Marker>
          </>
        )}
        {plan?.bikeshare && selected === "bikeshare" && (
          <>
            <StreetWalk from={plan.from} to={plan.bikeshare.from.pos} geometry={plan.bikeshare.walkToGeometry} />
            <StreetWalk from={plan.bikeshare.to.pos} to={plan.to} geometry={plan.bikeshare.walkFromGeometry} />
            <Polyline positions={plan.bikeshare.geometry} pathOptions={{ color: look.light ? "#ffffff" : "#05060a", weight: 9, opacity: look.light ? 1 : 0.85 }} />
            <Polyline positions={plan.bikeshare.geometry} pathOptions={{ color: MODE_META.bikeshare.color, weight: 5, opacity: 1 }} />
            {[
              { s: plan.bikeshare.from, text: `Paimti dviratį · laisvų ${plan.bikeshare.from.bikes ?? "?"}` },
              { s: plan.bikeshare.to, text: `Palikti · laisvų vietų ${plan.bikeshare.to.docks ?? "?"}` },
            ].map(({ s, text }, k) => (
              <Marker key={k} position={s.pos} icon={stopIcon(MODE_META.bikeshare.color)}>
                <Tooltip className="ep-tooltip" direction="top" offset={[0, -6]}>
                  <b>{s.name}</b>
                  <div className="text-xs opacity-80">{text}</div>
                </Tooltip>
              </Marker>
            ))}
          </>
        )}
        {plan?.transit && selected === "transit" && <TransitLegs legs={plan.transit.legs} light={look.light} />}
        {plan && hybrid && <HybridRoute h={hybrid} to={plan.to} light={look.light} />}

        {/* Where the car is left, and the walk from there to B. */}
        {selected === "car" && parkingSpot && to && (
          <>
            <StreetWalk from={parkingSpot.pos} to={to} />
            <Marker position={parkingSpot.pos} icon={SPOT}>
              <Tooltip className="ep-tooltip" direction="top" offset={[0, -10]}>
                <b>Paliksite automobilį</b>
                <div className="text-xs opacity-80">{parkingSpot.name}</div>
              </Tooltip>
            </Marker>
          </>
        )}

        {from && (
          <Marker position={from} icon={PIN_A} draggable eventHandlers={{ dragend: (e) => onMove("from", [e.target.getLatLng().lat, e.target.getLatLng().lng]) }} />
        )}
        {to && <Marker position={to} icon={PIN_B} draggable eventHandlers={{ dragend: (e) => onMove("to", [e.target.getLatLng().lat, e.target.getLatLng().lng]) }} />}
      </MapContainer>
      {layers.scooters && (scooterState.tooFar || scooterState.feed) && (
        <div
          className="pointer-events-none absolute z-[500] -translate-x-1/2 whitespace-nowrap rounded-full border border-[var(--line)] bg-[var(--panel)]/90 px-3 py-1.5 text-xs shadow-lg backdrop-blur"
          style={{ bottom: padding.bottom + (padding.bottom ? 56 : 70), left: `calc(50% + ${(padding.left ?? 0) / 2}px)` }}
        >
          {scooterState.tooFar ? (
            "Priartinkite – matysite paspirtukus"
          ) : scooterState.feed?.source === "demo" ? (
            <span>
              <b className="mr-1 rounded bg-[#f472b6] px-1 text-black">DEMO</b> {scooterState.feed.total} netikri paspirtukai<span className="hidden sm:inline"> – bandomieji duomenys</span>
            </span>
          ) : scooterState.feed?.source === "none" ? (
            "Paspirtukų duomenų šaltinis neprijungtas"
          ) : (
            `${scooterState.feed?.total} paspirtukai${scooterState.feed?.operator ? ` · ${scooterState.feed.operator}` : ""}`
          )}
        </div>
      )}
      {plan && (layers.parking || layers.bikeshare || layers.scooters || (ev && layers.charging)) && (
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          className={`absolute z-[500] flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--panel)]/95 px-3.5 py-2 text-xs font-medium whitespace-nowrap shadow-lg backdrop-blur hover:bg-[var(--panel)] ${padding.left ? "-translate-x-1/2" : "left-3"}`}
          style={{ top: padding.top + 12, left: padding.left ? `calc(50% + ${padding.left / 2}px)` : undefined }}
          aria-pressed={showAll}
        >
          <span className={`h-2 w-2 rounded-full ${showAll ? "bg-[var(--muted)]" : "bg-[var(--marking)]"}`} />
          {/* Phones: just the action, so it fits beside the layers button. */}
          <span className={padding.left ? "" : "hidden"}>{showAll ? "Rodomas visas miestas" : "Rodoma tik prie maršruto"}</span>
          <span className="text-[var(--marking)]">{showAll ? "Tik prie maršruto" : "Rodyti viską"}</span>
        </button>
      )}
      <LayersPanel layers={layers} onChange={onLayers} ev={ev} theme={theme} onTheme={pickTheme} zoom={zoom} top={padding.top} bottom={padding.bottom} stations={bikeshare?.stations ?? null} />
    </div>
  );
}

const LAYERS_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m12 3 9 5-9 5-9-5 9-5z" />
    <path d="m3 13 9 5 9-5" />
  </svg>
);

type LayerRow = { id: keyof Layers; label: string; sub: string; color: string; glyph: string; legend?: React.ReactNode };

function Swatch({ color, label, line }: { color: string; label: React.ReactNode; line?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={line ? "h-1 w-4 rounded-sm" : "h-2.5 w-2.5 rounded-full"} style={{ background: color }} />
      {label}
    </span>
  );
}

/** One place for everything about the map: which layers are on, what their colours mean, the map style. */
function LayersPanel({
  layers,
  onChange,
  ev,
  theme,
  onTheme,
  zoom,
  top,
  bottom,
  stations,
}: {
  layers: Layers;
  onChange: (l: Layers) => void;
  ev: boolean;
  theme: MapTheme;
  onTheme: (t: MapTheme) => void;
  zoom: number;
  top: number;
  bottom: number;
  stations: BikeStation[] | null;
}) {
  const [open, setOpen] = useState(false);
  const zones: [string, string][] = [
    ["Mėlynoji zona", "4 €"],
    ["Raudonoji zona", "2,5 €"],
    ["Geltonoji zona", "1 €"],
    ["Žalioji zona", "0,5 €"],
  ];
  const withBikes = stations?.filter((s) => s.open && s.bikes > 0).length;
  const groups: { title: string; rows: LayerRow[] }[] = [
    {
      title: "Automobiliui",
      rows: [
        {
          id: "parking",
          label: "Parkavimas",
          sub: "Zonos, aikštelės, vietos gatvėse",
          color: LOT_CLASS.paid.color,
          glyph: "P",
          legend: (
            <>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                {zones.map(([z, p]) => (
                  <Swatch key={z} color={ZONE_COLOR[z]} label={<>{z.split(" ")[0]} <span className="text-[var(--muted)]">{p}/val.</span></>} />
                ))}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                {Object.values(LOT_CLASS).map((c) => (
                  <Swatch key={c.label} color={c.color} label={c.label} />
                ))}
              </div>
              <div className="mt-1.5 text-[var(--muted)]">„P 92“ – laisvos vietos dabar, „P 1,5 €/h“ – kaina. {zoom < 15 && "Priartinkite – matysite vietas gatvėse."}</div>
            </>
          ),
        },
        ...(ev
          ? [
              {
                id: "charging" as const,
                label: "Įkrovimas",
                sub: "Tik jūsų jungtims tinkančios – ryškios",
                color: STATUS.go,
                glyph: "⚡",
                legend: (
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    <Swatch color={STATUS.go} label="Laisva" />
                    <Swatch color={STATUS.stop} label="Užimta" />
                    <Swatch color={STATUS.off} label="Netinka jungtis" />
                  </div>
                ),
              },
            ]
          : []),
        {
          id: "traffic",
          label: "Gyvas eismas",
          sub: "Via Lietuva jutikliai, km/h",
          color: STATUS.wait,
          glyph: "◔",
          legend: (
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <Swatch color={STATUS.go} label="Laisvai" />
              <Swatch color={STATUS.wait} label="Lėtėja" />
              <Swatch color={STATUS.stop} label="Spūstis" />
            </div>
          ),
        },
      ],
    },
    {
      title: "Mikromobilumas",
      rows: [
        {
          id: "bikeshare",
          label: "Cyclocity dviračiai",
          sub: withBikes != null ? `${withBikes} stotelės su dviračiais` : "Stotelės ir laisvi dviračiai",
          color: STATUS.go,
          glyph: "🚲",
          legend: (
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <Swatch color={STATUS.go} label="3 ir daugiau" />
              <Swatch color={STATUS.wait} label="1–2" />
              <Swatch color={STATUS.stop} label="Nėra" />
              <Swatch color={STATUS.off} label="Nedirba" />
            </div>
          ),
        },
        { id: "scooters", label: "Paspirtukai", sub: "Matomi priartinus", color: "#ec4899", glyph: "🛴" },
      ],
    },
    {
      title: "Viešasis transportas",
      rows: [
        { id: "stops", label: "VT stotelės", sub: "Priartinus; paspaudus – artimiausi reisai", color: "#2563eb", glyph: "🚏" },
        { id: "lanes", label: "A juostos", sub: "Autobusai aplenkia spūstis", color: "var(--lane)", glyph: "A", legend: <Swatch line color="var(--lane)" label="Gatvė su A / A+ juosta" /> },
      ],
    },
  ];
  const active = groups.flatMap((g) => g.rows).filter((r) => layers[r.id]);

  return (
    <div className="absolute right-3 z-[700] flex flex-col items-end gap-2" style={{ top: top + 12, maxHeight: `calc(100% - ${top + bottom + 24}px)` }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--panel)] px-3.5 py-2 text-sm font-semibold shadow-lg"
      >
        {LAYERS_ICON}
        Sluoksniai
        {active.length > 0 && (
          <span className="flex -space-x-1">
            {active.map((r) => (
              <span key={r.id} className="h-3 w-3 rounded-full ring-2 ring-[var(--panel)]" style={{ background: r.color }} />
            ))}
          </span>
        )}
      </button>
      {open && (
        <div className="w-[min(320px,calc(100vw-24px))] overflow-y-auto overscroll-contain rounded-[20px] border border-[var(--line)] bg-[var(--panel)] p-2 shadow-[0_20px_50px_rgba(15,23,42,0.2)]">
          {groups.map((g) => (
            <section key={g.title} className="mb-1">
              <h3 className="eyebrow px-2 pt-2 pb-1 !text-[11px]">{g.title}</h3>
              {g.rows.map((row) => {
                const on = layers[row.id];
                return (
                  <div key={row.id} className={`rounded-xl ${on ? "bg-[var(--chip)]" : ""}`}>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={on}
                      aria-label={row.label}
                      onClick={() => onChange({ ...layers, [row.id]: !on })}
                      className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-[var(--chip)]"
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm font-bold text-white" style={{ background: on ? row.color : "#cbd5e1" }}>
                        {row.glyph}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">{row.label}</span>
                        <span className="block truncate text-xs text-[var(--muted)]">{row.sub}</span>
                      </span>
                      <span className={`relative h-5 w-9 shrink-0 rounded-full transition ${on ? "bg-[var(--marking)]" : "bg-[#cbd5e1]"}`}>
                        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
                      </span>
                    </button>
                    {on && row.legend && <div className="px-3 pt-0.5 pb-2.5 pl-[52px] text-[11px] leading-snug">{row.legend}</div>}
                  </div>
                );
              })}
            </section>
          ))}
          <section className="border-t border-[var(--line)] px-2 pt-2.5 pb-1.5">
            <h3 className="eyebrow pb-2 !text-[11px]">Žemėlapio stilius</h3>
            <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Žemėlapio stilius">
              {MAP_THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={theme === t.id}
                  onClick={() => onTheme(t.id)}
                  className={`flex flex-col items-center gap-1 rounded-xl border p-1.5 text-[11px] ${theme === t.id ? "border-[var(--marking)] font-semibold" : "border-[var(--line)] text-[var(--muted)]"}`}
                >
                  <span className="h-7 w-full rounded-md border border-[var(--line)]" style={{ background: t.bg }} />
                  {t.label}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

/** A walk along streets (or the straight line when no path is known), dotted. */
const WALK_LINE = { color: "#94a3b8", weight: 3, dashArray: "2 8", opacity: 0.9 };

// Street paths fetched by the browser, shared by every StreetWalk on the page.
const walkCache = new Map<string, Promise<LatLng[] | null>>();
function streetPath(a: LatLng, b: LatLng): Promise<LatLng[] | null> {
  const key = `${a[0].toFixed(5)},${a[1].toFixed(5)}>${b[0].toFixed(5)},${b[1].toFixed(5)}`;
  let p = walkCache.get(key);
  if (!p) {
    p = fetch(`/api/walk?from=${a[0]},${a[1]}&to=${b[0]},${b[1]}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { coords: LatLng[]; routed: boolean } | null) => (d?.routed ? d.coords : null))
      .catch(() => null);
    walkCache.set(key, p);
  }
  return p;
}

/**
 * A walk drawn along streets. Uses the server's path when the plan has one;
 * otherwise asks /api/walk for just this leg. Draws nothing until the path is
 * known, so nobody is shown walking through buildings; if no router answers, the
 * straight line is the honest fallback.
 */
function StreetWalk({ from, to, geometry, color = WALK_LINE.color }: { from: LatLng; to: LatLng; geometry?: LatLng[]; color?: string }) {
  const known = geometry && geometry.length > 2 ? geometry : null;
  const [fetched, setFetched] = useState<{ key: string; path: LatLng[] } | null>(null);
  const key = `${from}|${to}`;
  useEffect(() => {
    if (known) return;
    let alive = true;
    streetPath(from, to).then((p) => alive && setFetched({ key, path: p ?? [from, to] }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, !!known]);
  const path = known ?? (fetched?.key === key ? fetched.path : null);
  if (!path) return null;
  return <Polyline positions={path} interactive={false} pathOptions={{ ...WALK_LINE, color }} />;
}
const casing = (light: boolean) => ({ color: light ? "#ffffff" : "#05060a", opacity: light ? 1 : 0.85 });

/** Rides in their route colours with boarding and alighting stops; walks dotted along streets. */
function TransitLegs({ legs, light }: { legs: TransitLeg[]; light: boolean }) {
  return legs.map((l, i) =>
    l.kind === "walk" ? (
      <StreetWalk key={i} from={l.from} to={l.to} geometry={l.geometry} color={l.tight ? STATUS.wait : WALK_LINE.color} />
    ) : (
      <Fragment key={i}>
        <Polyline positions={l.geometry} pathOptions={{ ...casing(light), weight: 10 }} />
        <Polyline positions={l.geometry} pathOptions={{ color: l.route.color || "#4b8bff", weight: 6, opacity: 1 }} />
        {[l.from, l.to].map((s, k) => (
          <Marker key={k} position={s.pos} icon={stopIcon(l.route.color || "#4b8bff")}>
            <Tooltip className="ep-tooltip" direction="top" offset={[0, -6]}>
              <b>{s.name}</b>
              <div className="text-xs opacity-80">
                {k === 0 ? `Įlipti ${fmtClock(l.dep)}` : `Išlipti ${fmtClock(l.arr)}`} · {l.route.short}
              </div>
            </Tooltip>
          </Marker>
        ))}
      </Fragment>
    ),
  );
}

/** Every point of a combination's second leg, for framing the map. */
function hybridPoints(h: HybridOption): LatLng[] {
  const s = h.second;
  if (s.kind === "transit") return s.transit.legs.flatMap((l) => (l.kind === "ride" ? l.geometry : [l.from, l.to]));
  if (s.kind === "bikeshare") return [s.bikeshare.from.pos, ...s.bikeshare.geometry, s.bikeshare.to.pos];
  return [...(s.scooter.vehicle ? [s.scooter.vehicle.pos] : []), ...s.scooter.geometry, ...(s.scooter.endSpot ? [s.scooter.endSpot.pos] : [])];
}

/** Car + second leg: the drive in car red, the place the car stays, then the rest of the way. */
function HybridRoute({ h, to, light }: { h: HybridOption; to: LatLng; light: boolean }) {
  const s = h.second;
  const hub = h.hub.navigationPos ?? h.hub.pos;
  return (
    <>
      <Polyline positions={h.car.geometry} pathOptions={{ ...casing(light), weight: 9 }} />
      <Polyline positions={h.car.geometry} pathOptions={{ color: MODE_META.car.color, weight: 5, opacity: 1, dashArray: h.car.geometry.length <= 2 ? "8 8" : undefined }} />
      {s.kind === "transit" && <TransitLegs legs={s.transit.legs} light={light} />}
      {s.kind === "bikeshare" && (
        <>
          <StreetWalk from={hub} to={s.bikeshare.from.pos} geometry={s.bikeshare.walkToGeometry} />
          <StreetWalk from={s.bikeshare.to.pos} to={to} geometry={s.bikeshare.walkFromGeometry} />
          <Polyline positions={s.bikeshare.geometry} pathOptions={{ ...casing(light), weight: 9 }} />
          <Polyline positions={s.bikeshare.geometry} pathOptions={{ color: MODE_META.bikeshare.color, weight: 5, opacity: 1 }} />
          <Marker position={s.bikeshare.from.pos} icon={stopIcon(MODE_META.bikeshare.color)}>
            <Tooltip className="ep-tooltip" direction="top" offset={[0, -6]}>
              <b>{s.bikeshare.from.name}</b>
              <div className="text-xs opacity-80">Paimti dviratį · laisvų {s.bikeshare.from.bikes ?? "?"}</div>
            </Tooltip>
          </Marker>
          <Marker position={s.bikeshare.to.pos} icon={stopIcon(MODE_META.bikeshare.color)}>
            <Tooltip className="ep-tooltip" direction="top" offset={[0, -6]}>
              <b>{s.bikeshare.to.name}</b>
              <div className="text-xs opacity-80">Palikti · laisvų vietų {s.bikeshare.to.docks ?? "?"}</div>
            </Tooltip>
          </Marker>
        </>
      )}
      {s.kind === "scooter" && (
        <>
          {s.scooter.vehicle && <StreetWalk from={hub} to={s.scooter.vehicle.pos} geometry={s.scooter.vehicle.walkGeometry} />}
          {s.scooter.endSpot && <StreetWalk from={s.scooter.endSpot.pos} to={to} />}
          <Polyline positions={s.scooter.geometry} pathOptions={{ ...casing(light), weight: 9 }} />
          <Polyline positions={s.scooter.geometry} pathOptions={{ color: MODE_META.scooter.color, weight: 5, opacity: 1 }} />
          {s.scooter.vehicle && (
            <Marker position={s.scooter.vehicle.pos} icon={stopIcon(MODE_META.scooter.color)}>
              <Tooltip className="ep-tooltip" direction="top" offset={[0, -6]}>
                <b>{s.scooter.source === "demo" ? "DEMO paspirtukas" : "Paspirtukas"}</b>
              </Tooltip>
            </Marker>
          )}
          {s.scooter.endSpot && (
            <Marker position={s.scooter.endSpot.pos} icon={stopIcon(MODE_META.scooter.color)}>
              <Tooltip className="ep-tooltip" direction="top" offset={[0, -6]}>
                <b>Palikite paspirtuką</b>
                <div className="text-xs opacity-80">{s.scooter.endSpot.addr ?? "Paspirtukų stovėjimo vieta"} – Senamiestyje tik pažymėtose vietose</div>
              </Tooltip>
            </Marker>
          )}
        </>
      )}
      <Marker position={hub} icon={HUB(!!h.hub.chargers?.length)} zIndexOffset={500}>
        <Tooltip className="ep-tooltip" direction="top" offset={[0, -10]}>
          <b>Paliksite automobilį</b>
          <div className="text-xs opacity-80">{h.hub.name}</div>
        </Tooltip>
      </Marker>
    </>
  );
}
