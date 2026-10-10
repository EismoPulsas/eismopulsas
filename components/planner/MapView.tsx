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
import type { PlanResponse, RideLeg } from "@/lib/plan-types";
import { fmtClock, MODE_META } from "./format";

export type Layers = { lanes: boolean; traffic: boolean; parking: boolean; bikeshare: boolean };

export type MapTheme = "dark" | "fiord" | "positron" | "liberty";
export const MAP_THEMES: { id: MapTheme; label: string; bg: string; light: boolean }[] = [
  { id: "dark", label: "Tamsus", bg: "#0c0c0c", light: false },
  { id: "fiord", label: "Mėlynas", bg: "#45516e", light: false },
  { id: "positron", label: "Šviesus", bg: "#f2f3f0", light: true },
  { id: "liberty", label: "Spalvotas", bg: "#f8f4f0", light: true },
];

type Lane = { k: "A" | "A+" | "OSM"; n: string; c: LatLng[] };
type Zone = { city: string; zone: string; price: number; text: string; poly: LatLng[][][] };
type Sensor = { name: string; road: string; pos: LatLng; speed: number; limit: number; vehicles: number };
type BikeStation = { id: string; name: string; address: string; pos: LatLng; capacity: number; bikes: number; docks: number; open: boolean };

const ZONE_COLOR: Record<string, string> = {
  "Mėlynoji zona": "#3b82f6",
  "Raudonoji zona": "#ef4444",
  "Geltonoji zona": "#facc15",
  "Žalioji zona": "#22c55e",
};

const pin = (letter: string, color: string) =>
  L.divIcon({ className: "", html: `<div class="ep-pin" style="--c:${color}"><span>${letter}</span></div>`, iconSize: [34, 46], iconAnchor: [17, 46] });
const stopIcon = (color: string) => L.divIcon({ className: "", html: `<div class="ep-stop" style="--c:${color}"></div>`, iconSize: [12, 12], iconAnchor: [6, 6] });

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

// Everything outside Lithuania is dimmed: a world-sized polygon with the country cut out.
const WORLD: LatLng[] = [
  [48, 10],
  [48, 36],
  [62, 36],
  [62, 10],
];

/** Re-frame the map when the trip changes. */
function Framer({ points, nonce }: { points: LatLng[]; nonce: string }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) map.flyTo(points[0], Math.max(map.getZoom(), 13), { duration: 0.6 });
    else map.flyToBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 15, duration: 0.6 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, map]);
  return null;
}

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

function bikeColor(s: BikeStation) {
  if (!s.open || s.bikes === 0) return "#6b7280";
  return s.bikes < 3 ? "#ffb020" : "#ffc53d";
}

function ThemePicker({ theme, onChange }: { theme: MapTheme; onChange: (t: MapTheme) => void }) {
  return (
    <div role="radiogroup" aria-label="Žemėlapio išvaizda" className="absolute bottom-6 left-3 z-[500] flex gap-1 rounded-full border border-[var(--line)] bg-[var(--bg)]/85 p-1 backdrop-blur">
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

export default function MapView({
  from,
  to,
  plan,
  selected,
  layers,
  picking,
  onPick,
  onOutside,
  onMove,
}: {
  from: LatLng | null;
  to: LatLng | null;
  plan: PlanResponse | null;
  selected: ModeId | null;
  layers: Layers;
  picking: boolean;
  onPick: (p: LatLng) => void;
  onOutside: () => void;
  onMove: (which: "from" | "to", p: LatLng) => void;
}) {
  const lanes = useJson<{ lanes: Lane[] }>("/data/bus-lanes.json", layers.lanes);
  const zones = useJson<{ zones: Zone[] }>("/data/parking.json", layers.parking);
  const border = useJson<{ rings: LatLng[][] }>("/data/lithuania.json", true);
  const traffic = useLive<{ time: string; sensors: Sensor[] }>("/api/traffic", layers.traffic, 5 * 60 * 1000);
  const bikeshare = useLive<{ stations: BikeStation[] }>("/api/bikeshare", layers.bikeshare, 60 * 1000);

  const frame = useMemo(() => {
    if (plan) {
      const pts: LatLng[] = [plan.from, plan.to];
      const g = selected === "car" ? plan.car?.geometry : selected === "bike" ? plan.bike?.geometry : selected === "walk" ? plan.walk?.geometry : null;
      if (g) pts.push(...g);
      if (selected === "transit" && plan.transit) for (const l of plan.transit.legs) if (l.kind === "ride") pts.push(...l.geometry);
      return { points: pts, nonce: `${plan.from}-${plan.to}-${selected}` };
    }
    const pts = [from, to].filter(Boolean) as LatLng[];
    return { points: pts, nonce: pts.join("|") };
  }, [plan, selected, from, to]);

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
    <div className={`h-full w-full ${picking ? "ep-picking" : ""}`}>
      <MapContainer
        center={[55.17, 23.9]}
        zoom={7}
        minZoom={7}
        maxZoom={19}
        maxBounds={bounds}
        maxBoundsViscosity={1}
        preferCanvas
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
        <Framer points={frame.points} nonce={frame.nonce} />

        {layers.parking &&
          zones?.zones.map((z, i) =>
            z.poly.map((rings, j) => (
              <Polygon
                key={`${i}-${j}`}
                positions={rings}
                pathOptions={{ color: ZONE_COLOR[z.zone] ?? "#999", weight: 1, fillOpacity: 0.12, opacity: 0.6 }}
              >
                <Tooltip className="ep-tooltip" sticky>
                  <b>{z.city}: {z.zone}</b>
                  <div className="text-xs opacity-80">{z.text}</div>
                </Tooltip>
              </Polygon>
            )),
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
              <CircleMarker
                key={i}
                center={s.pos}
                radius={5}
                pathOptions={{ color: "#0c0e12", weight: 1.5, fillColor: speedColor(ratio), fillOpacity: 0.95 }}
              >
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

        {/* Unselected routes first, faint. */}
        {plan &&
          (["car", "bike", "walk"] as const).map((m) => {
            const r = plan[m];
            if (!r || m === selected) return null;
            return <Polyline key={m} positions={r.geometry} pathOptions={{ color: MODE_META[m].color, weight: 3, opacity: 0.3 }} />;
          })}
        {plan?.transit && selected !== "transit" &&
          rides.map((l, i) => <Polyline key={`t${i}`} positions={l.geometry} pathOptions={{ color: MODE_META.transit.color, weight: 3, opacity: 0.3 }} />)}

        {/* Selected route on top, with a dark casing like a road. */}
        {plan && selected && selected !== "transit" && plan[selected] && (
          <>
            <Polyline positions={plan[selected]!.geometry} pathOptions={{ color: "#05060a", weight: 9, opacity: 0.85 }} />
            <Polyline
              positions={plan[selected]!.geometry}
              pathOptions={{ color: MODE_META[selected].color, weight: 5, opacity: 1, dashArray: selected === "walk" ? "2 9" : undefined }}
            />
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

        {from && (
          <Marker
            position={from}
            icon={PIN_A}
            draggable
            eventHandlers={{ dragend: (e) => onMove("from", [e.target.getLatLng().lat, e.target.getLatLng().lng]) }}
          />
        )}
        {to && (
          <Marker
            position={to}
            icon={PIN_B}
            draggable
            eventHandlers={{ dragend: (e) => onMove("to", [e.target.getLatLng().lat, e.target.getLatLng().lng]) }}
          />
        )}
      </MapContainer>
      <ThemePicker theme={theme} onChange={pickTheme} />
    </div>
  );
}
