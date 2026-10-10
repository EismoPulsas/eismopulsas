"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import type { StyleSpecification } from "maplibre-gl";
import { CircleMarker, MapContainer, Marker, Polygon, Polyline, Tooltip, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "maplibre-gl/dist/maplibre-gl.css";
import "@maplibre/maplibre-gl-leaflet";
import { inRing, LT_BOUNDS, type LatLng } from "@/lib/geo";
import type { ModeId } from "@/lib/metrics";
import type { Charger, Connector, Lot, PlanResponse, RideLeg } from "@/lib/plan-types";
import { fmtClock, MODE_META } from "./format";
import type { LiveParking } from "./live";
import { FREE_STREET, LOT_CLASS, lotClass, NO_PARKING, ZONE_COLOR, type Area, type MapPick, type Zone } from "./parking-meta";

export type Layers = { lanes: boolean; traffic: boolean; parking: boolean; charging: boolean; bikeshare: boolean; scooters: boolean };
type Padding = { top: number; bottom: number };

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
type Sensor = { name: string; road: string; pos: LatLng; speed: number; limit: number; vehicles: number };
type StreetRef = { zi?: number; ai?: number };
type StreetFile = {
  segments: (StreetRef & { src: "osm" | "judu"; line: LatLng[]; name: string | null; side?: string; orientation?: string | null; fee?: string | null; maxStayMin?: number; spaces?: number | null; note?: string | null })[];
  areas: (StreetRef & { pos: LatLng; poly: LatLng[][][] | null; name: string | null; kind: string; cap: number | null; fee: string | null; maxStayMin?: number })[];
  points: (StreetRef & { pos: LatLng; name: string | null; spaces: number | null })[];
  noParking: { line: LatLng[]; kind: string; name: string | null }[];
  noZones: { name: string | null; poly: LatLng[][][] }[];
};
type BikeStation = { id: string; name: string; address: string; pos: LatLng; capacity: number; bikes: number; docks: number; open: boolean };

const pin = (letter: string, color: string) =>
  L.divIcon({ className: "", html: `<div class="ep-pin" style="--c:${color}"><span>${letter}</span></div>`, iconSize: [34, 46], iconAnchor: [17, 46] });
const stopIcon = (color: string) => L.divIcon({ className: "", html: `<div class="ep-stop" style="--c:${color}"></div>`, iconSize: [12, 12], iconAnchor: [6, 6] });
/** JUDU gated lot: a "P" plate with the live number of free spaces. */
const lotBadge = (color: string, free: number | null) =>
  L.divIcon({
    className: "",
    html: `<div class="ep-lot" style="--c:${color}"><b>P</b>${free != null ? `<span>${free}</span>` : ""}</div>`,
    iconSize: [free != null ? 44 : 22, 22],
    iconAnchor: [11, 11],
  });
const SPOT = L.divIcon({ className: "", html: `<div class="ep-lot ep-lot-chosen"><b>P</b></div>`, iconSize: [26, 26], iconAnchor: [13, 13] });

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
    const pad = { paddingTopLeft: L.point(32, padding.top + 24), paddingBottomRight: L.point(32, padding.bottom + 24) };
    if (points.length === 1) map.flyToBounds(L.latLngBounds(points[0], points[0]).pad(0.01), { ...pad, maxZoom: 14, duration: 0.6 });
    else map.flyToBounds(L.latLngBounds(points), { ...pad, maxZoom: 15, duration: 0.6 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, map, padding.top, padding.bottom]);
  return null;
}

const SCOOTER_MIN_ZOOM = 12;

/** Loads scooters for the visible area whenever the map stops moving. */
function ScooterLayer({ onState }: { onState: (s: ScooterState) => void }) {
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
      {feed?.vehicles.map((v) => (
        <CircleMarker
          key={v.id}
          center={v.pos}
          radius={5}
          pathOptions={{ color: "#0c0e12", weight: 1.5, fillColor: v.battery !== null && v.battery < 25 ? "#9d5c7f" : "#f472b6", fillOpacity: 0.95 }}
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

// Cyan like the Cyclocity route; amber when only a couple of bikes are left.
function bikeColor(s: BikeStation) {
  if (!s.open || s.bikes === 0) return "#6b7280";
  return s.bikes < 3 ? "#ffb020" : "#22d3ee";
}

function ThemePicker({ theme, onChange, bottom }: { theme: MapTheme; onChange: (t: MapTheme) => void; bottom: number }) {
  return (
    <div
      role="radiogroup"
      aria-label="Žemėlapio išvaizda"
      className="absolute left-3 z-[500] flex gap-1 rounded-full border border-[var(--line)] bg-[var(--bg)]/85 p-1 backdrop-blur transition-[bottom]"
      style={{ bottom }}
    >
      {MAP_THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          role="radio"
          aria-checked={theme === t.id}
          onClick={() => onChange(t.id)}
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition ${
            theme === t.id ? "bg-[var(--panel)] text-[var(--ink)] shadow" : "text-[var(--muted)] hover:text-[var(--ink)]"
          }`}
        >
          <span className="h-3 w-3 rounded-full border border-white/30" style={{ background: t.bg }} />
          {t.label}
        </button>
      ))}
    </div>
  );
}

// The chosen map look is a per-browser preference. This component only renders in the
// browser (Planner loads it with ssr: false), so storage can be read on first render.
function savedTheme(): MapTheme {
  try {
    const t = localStorage.getItem("ep-map-theme");
    if (MAP_THEMES.some((m) => m.id === t)) return t as MapTheme;
  } catch {}
  return "dark";
}

function speedColor(ratio: number) {
  if (ratio >= 0.85) return "#2fd17c";
  if (ratio >= 0.6) return "#ffb020";
  return "#ff4d5e";
}

/** Big, official or known car parks are shown first; small unknown ones only close up. */
function lotVisible(l: Lot, zoom: number): boolean {
  if (zoom >= 15) return true;
  const major = l.src !== "osm" || l.access === "pr" || (l.cap ?? 0) >= 100;
  if (zoom >= 13) return major || l.t.known || (l.cap ?? 0) >= 30 || !!l.name;
  return major && zoom >= 11;
}

const chargerColor = (c: Charger) => (c.plugs.some((p) => p.dc && p.kW >= 50) ? "#e879f9" : "#22d3ee");

export default function MapView({
  from,
  to,
  plan,
  selected,
  layers,
  picking,
  live,
  ev,
  connectors,
  parkingSpot,
  picked,
  padding,
  onPick,
  onOutside,
  onMove,
  onPickPlace,
}: {
  from: LatLng | null;
  to: LatLng | null;
  plan: PlanResponse | null;
  selected: ModeId | null;
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
      return { points: pts, nonce: `${plan.from}-${plan.to}-${selected}` };
    }
    const pts = [from, to].filter(Boolean) as LatLng[];
    return { points: pts, nonce: pts.join("|") };
  }, [plan, selected, from, to]);

  const zoom = view?.zoom ?? 7;
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
        ? [...(lotsFile?.lots ?? []), ...(lotsLt?.lots ?? [])].filter((l) => lotVisible(l, zoom) && (!view || view.bounds.contains(l.pos)))
        : [],
    [layers.parking, lotsFile, lotsLt, zoom, view],
  );
  const visibleChargers = useMemo(
    () =>
      ev && layers.charging && chargersFile
        ? chargersFile.chargers.filter((c) => (zoom >= 12 || c.plugs.some((p) => p.dc && p.kW >= 50)) && (!view || view.bounds.contains(c.pos)))
        : [],
    [ev, layers.charging, chargersFile, zoom, view],
  );

  const bounds = L.latLngBounds(LT_BOUNDS).pad(0.15);
  const [theme, setTheme] = useState<MapTheme>(savedTheme);
  const pickTheme = (t: MapTheme) => {
    setTheme(t);
    try {
      localStorage.setItem("ep-map-theme", t);
    } catch {}
  };
  const look = MAP_THEMES.find((t) => t.id === theme) ?? MAP_THEMES[0];
  // Above the phone results sheet, or the bottom corner on desktop; the legend sits above it.
  const themeBottom = padding.bottom + (padding.bottom ? 10 : 24);
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
                pathOptions={{ color: ZONE_COLOR[z.zone] ?? "#999", weight: 1, fillOpacity: zoom >= 15 ? 0.06 : 0.12, opacity: 0.6, dashArray: z.zone.includes("paplūdimys") ? "4 4" : undefined }}
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
        {layers.parking && street && zoom >= 14 &&
          street.noZones.map((z, i) =>
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
              .filter((s) => s.line.some(inView))
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
              .filter((a) => inView(a.pos))
              .map((a, i) => {
                const pick = (e: L.LeafletMouseEvent) => pickPlace(e, { type: "street", name: a.name, what: "stovėjimo vietos prie gatvės", src: "osm", zone: zoneOf(a.zi), area: areaOf(a.ai), fee: a.fee, maxStayMin: a.maxStayMin, spaces: a.cap });
                const color = streetColor(a.zi, a.fee);
                return a.poly ? (
                  a.poly.map((rings, j) => (
                    <Polygon key={`sa${i}-${j}`} positions={rings} {...quiet} pathOptions={{ color, weight: 1.5, fillColor: color, fillOpacity: 0.35 }} eventHandlers={{ click: pick }} />
                  ))
                ) : (
                  <CircleMarker key={`sa${i}`} center={a.pos} radius={4} {...quiet} pathOptions={{ color: "#0c0e12", weight: 1, fillColor: color, fillOpacity: 0.95 }} eventHandlers={{ click: pick }} />
                );
              })}
            {street.points
              .filter((p) => inView(p.pos))
              .map((p, i) => (
                <CircleMarker
                  key={`sp${i}`}
                  center={p.pos}
                  radius={4}
                  {...quiet}
                  pathOptions={{ color: "#0c0e12", weight: 1, fillColor: streetColor(p.zi), fillOpacity: 0.95 }}
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
        {visibleLots.map((l) => {
          const color = LOT_CLASS[lotClass(l)].color;
          const free = l.occ ? (live?.lots?.[l.occ]?.vacant ?? null) : null;
          if (l.src === "judu" && zoom >= 13)
            return <Marker key={l.id} position={l.pos} icon={lotBadge(color, free)} eventHandlers={{ click: (e) => pickPlace(e, { type: "lot", lot: l }) }} />;
          return (
            <CircleMarker
              key={l.id}
              center={l.pos}
              radius={zoom >= 15 ? 6 : zoom >= 13 ? 5 : 4}
              {...quiet}
              pathOptions={{ color: "#0c0e12", weight: 1.5, fillColor: color, fillOpacity: 0.95 }}
              eventHandlers={{ click: (e) => pickPlace(e, { type: "lot", lot: l }) }}
            />
          );
        })}

        {/* EV chargers (only for cars that can charge). */}
        {visibleChargers.map((c) => {
          const status = live?.chargers?.[c.id];
          const fits = c.plugs.some((p) => connectors.includes(p.std));
          return (
            <CircleMarker
              key={`ch${c.id}`}
              center={c.pos}
              radius={zoom >= 14 ? 6 : 4}
              {...quiet}
              pathOptions={{
                color: "#0c0e12",
                weight: 1.5,
                fillColor: fits ? chargerColor(c) : "#5b6475",
                fillOpacity: status && status[0] === 0 ? 0.45 : 0.95,
              }}
              eventHandlers={{ click: (e) => pickPlace(e, { type: "charger", charger: c }) }}
            />
          );
        })}

        {/* Highlight of the clicked place. */}
        {picked && (picked.type === "lot" || picked.type === "charger") && (
          <CircleMarker
            center={picked.type === "lot" ? picked.lot.pos : picked.charger.pos}
            radius={13}
            interactive={false}
            pathOptions={{ color: "#ffd23f", weight: 2.5, fill: false }}
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

        {layers.traffic &&
          traffic?.sensors.map((s, i) => {
            const ratio = s.limit ? s.speed / s.limit : 1;
            return (
              <CircleMarker key={i} center={s.pos} radius={5} pathOptions={{ color: "#0c0e12", weight: 1.5, fillColor: speedColor(ratio), fillOpacity: 0.95 }}>
                <Tooltip className="ep-tooltip">
                  <b>{s.name}</b>
                  <div className="text-xs opacity-80">{s.road}</div>
                  <div className="text-xs">
                    Vid. greitis <b>{s.speed} km/h</b>
                    {s.limit ? ` (leidžiama ${s.limit})` : ""} · {s.vehicles} aut./15 min
                  </div>
                </Tooltip>
              </CircleMarker>
            );
          })}

        {layers.bikeshare &&
          bikeshare?.stations.map((s) => (
            <CircleMarker
              key={s.id}
              center={s.pos}
              radius={6}
              pathOptions={{ color: "#0c0e12", weight: 1.5, fillColor: bikeColor(s), fillOpacity: 0.95 }}
            >
              <Tooltip className="ep-tooltip">
                <b>{s.name}</b>
                {s.address && <div className="text-xs opacity-80">{s.address}</div>}
                <div className="text-xs">
                  {s.open ? (
                    <>
                      Dviračių <b>{s.bikes}</b> · laisvų vietų <b>{s.docks}</b>
                    </>
                  ) : (
                    "Stotelė nedirba"
                  )}
                </div>
                <div className="text-[10px] opacity-60">Cyclocity Vilnius</div>
              </Tooltip>
            </CircleMarker>
          ))}

        {layers.scooters && <ScooterLayer onState={setScooterState} />}

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
              <Polyline positions={plan[m]!.geometry} pathOptions={{ color: "#05060a", weight: 9, opacity: 0.85 }} />
              <Polyline positions={plan[m]!.geometry} pathOptions={{ color: MODE_META[m].color, weight: 5, opacity: 1, dashArray: m === "walk" ? "2 9" : undefined }} />
            </Fragment>
          ))}
        {plan?.scooter?.vehicle && selected === "scooter" && (
          <>
            <Polyline positions={[plan.from, plan.scooter.vehicle.pos]} pathOptions={{ color: "#c9cfdb", weight: 3, dashArray: "2 8", opacity: 0.9 }} />
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
            <Polyline positions={[plan.from, plan.bikeshare.from.pos]} pathOptions={{ color: "#c9cfdb", weight: 3, dashArray: "2 8", opacity: 0.9 }} />
            <Polyline positions={[plan.bikeshare.to.pos, plan.to]} pathOptions={{ color: "#c9cfdb", weight: 3, dashArray: "2 8", opacity: 0.9 }} />
            <Polyline positions={plan.bikeshare.geometry} pathOptions={{ color: "#05060a", weight: 9, opacity: 0.85 }} />
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
        {plan?.transit && selected === "transit" &&
          plan.transit.legs.map((l, i) =>
            l.kind === "walk" ? (
              <Polyline key={i} positions={[l.from, l.to]} pathOptions={{ color: "#c9cfdb", weight: 3, dashArray: "2 8", opacity: 0.9 }} />
            ) : (
              <Fragment key={i}>
                <Polyline positions={l.geometry} pathOptions={{ color: "#05060a", weight: 10, opacity: 0.85 }} />
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
          )}

        {/* Where the car is left, and the walk from there to B. */}
        {selected === "car" && parkingSpot && to && (
          <>
            <Polyline positions={[parkingSpot.pos, to]} interactive={false} pathOptions={{ color: "#c9cfdb", weight: 3, dashArray: "2 8", opacity: 0.9 }} />
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
          className="pointer-events-none absolute left-1/2 z-[500] -translate-x-1/2 whitespace-nowrap rounded-full border border-[var(--line)] bg-[var(--bg)]/90 px-3 py-1.5 text-xs shadow-lg backdrop-blur"
          style={{ bottom: padding.bottom + (padding.bottom ? 56 : 70) }}
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
      <ThemePicker theme={theme} onChange={pickTheme} bottom={themeBottom} />
      {(layers.parking || (ev && layers.charging)) && (
        <Legend parking={layers.parking} charging={ev && layers.charging} zoom={zoom} bottom={themeBottom + 44} />
      )}
    </div>
  );
}

function Legend({ parking, charging, zoom, bottom }: { parking: boolean; charging: boolean; zoom: number; bottom: number }) {
  const zones: [string, string][] = [
    ["Mėlynoji zona", "4 €/val."],
    ["Raudonoji zona", "2,5 €/val."],
    ["Geltonoji zona", "1 €/val."],
    ["Žalioji zona", "0,5 €/val."],
  ];
  // On a phone the map is small: the legend starts folded.
  const [open, setOpen] = useState(() => window.matchMedia("(min-width: 640px)").matches);
  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ bottom }}
        className="absolute left-3 z-[500] rounded-full border border-[var(--line)] bg-[var(--panel)]/95 px-3 py-1.5 text-xs font-medium shadow-lg backdrop-blur"
      >
        Legenda
      </button>
    );
  return (
    <div style={{ bottom }} className="pointer-events-auto absolute left-3 z-[500] max-w-[230px] rounded-xl border border-[var(--line)] bg-[var(--panel)]/95 p-2.5 text-[11px] leading-snug shadow-lg backdrop-blur">
      <button type="button" onClick={() => setOpen(false)} className="float-right -mt-1 -mr-1 rounded px-1 text-[var(--muted)] hover:text-[var(--ink)]" aria-label="Suskleisti legendą">
        ✕
      </button>
      {parking && (
        <>
          <div className="mb-1 font-semibold text-[var(--ink)]">Gatvių zonos (Vilnius)</div>
          <ul className="flex flex-col gap-0.5">
            {zones.map(([z, p]) => (
              <li key={z} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: ZONE_COLOR[z] }} />
                <span className="text-[var(--ink)]">{z.split(" ")[0]}</span>
                <span className="tnum ml-auto pl-3 text-[var(--muted)]">{p}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 mb-1 font-semibold text-[var(--ink)]">Aikštelės</div>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5">
            {Object.values(LOT_CLASS).map((c) => (
              <li key={c.label} className="flex items-center gap-1.5 text-[var(--ink)]">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
                {c.label}
              </li>
            ))}
          </ul>
          {zoom >= 15 ? (
            <div className="mt-2 flex items-center gap-1.5 text-[var(--muted)]">
              <span className="h-1 w-4 rounded-sm" style={{ background: FREE_STREET }} /> gatvėje nemokamai
              <span className="ml-1 h-1 w-4 rounded-sm" style={{ background: `repeating-linear-gradient(90deg, ${NO_PARKING} 0 3px, transparent 3px 6px)` }} /> draudžiama
            </div>
          ) : (
            <div className="mt-2 text-[var(--muted)]">Priartinkite – pamatysite vietas gatvėse.</div>
          )}
        </>
      )}
      {charging && (
        <div className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[var(--ink)] ${parking ? "mt-2" : ""}`}>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#22d3ee]" /> Įkrovimas AC
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#e879f9]" /> Greitas DC ≥ 50 kW
          </span>
          <span className="flex items-center gap-1.5 text-[var(--muted)]">
            <span className="h-2.5 w-2.5 rounded-full bg-[#5b6475]" /> netinka jungtis
          </span>
        </div>
      )}
    </div>
  );
}
