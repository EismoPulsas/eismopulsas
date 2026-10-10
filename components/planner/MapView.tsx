"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import L from "leaflet";
import { CircleMarker, MapContainer, Marker, Polygon, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { inRing, LT_BOUNDS, type LatLng } from "@/lib/geo";
import type { ModeId } from "@/lib/metrics";
import type { PlanResponse, RideLeg } from "@/lib/plan-types";
import { fmtClock, MODE_META } from "./format";

export type Layers = { lanes: boolean; traffic: boolean; parking: boolean };

type Lane = { k: "A" | "A+" | "OSM"; n: string; c: LatLng[] };
type Zone = { city: string; zone: string; price: number; text: string; poly: LatLng[][][] };
type Sensor = { name: string; road: string; pos: LatLng; speed: number; limit: number; vehicles: number };

const ZONE_COLOR: Record<string, string> = {
  "Mėlynoji zona": "#3b82f6",
  "Raudonoji zona": "#ef4444",
  "Geltonoji zona": "#facc15",
  "Žalioji zona": "#22c55e",
};

const pin = (letter: string, color: string) =>
  L.divIcon({ className: "", html: `<div class="ep-pin" style="--c:${color}"><span>${letter}</span></div>`, iconSize: [34, 46], iconAnchor: [17, 46] });
const stopIcon = (color: string) => L.divIcon({ className: "", html: `<div class="ep-stop" style="--c:${color}"></div>`, iconSize: [12, 12], iconAnchor: [6, 6] });

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
  const [traffic, setTraffic] = useState<{ time: string; sensors: Sensor[] } | null>(null);
  useEffect(() => {
    if (!layers.traffic) return;
    let alive = true;
    const load = () =>
      fetch("/api/traffic")
        .then((r) => r.json())
        .then((d) => alive && setTraffic(d))
        .catch(() => {});
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [layers.traffic]);

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
  const rides = plan?.transit?.legs.filter((l): l is RideLeg => l.kind === "ride") ?? [];

  return (
    <div className={`h-full w-full ${picking ? "ep-picking" : ""}`}>
      <MapContainer
        center={[55.17, 23.9]}
        zoom={7}
        minZoom={7}
        maxBounds={bounds}
        maxBoundsViscosity={1}
        preferCanvas
        zoomControl={false}
        fadeAnimation={false}
        className="h-full w-full"
      >
        <TileLayer
          attribution='Žemėlapis &copy; Esri, <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
          maxZoom={16}
        />
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
          maxZoom={16}
        />
        {border && (
          <>
            <Polygon positions={[WORLD, ...border.rings]} pathOptions={{ stroke: false, fillColor: "#05060a", fillOpacity: 0.78 }} interactive={false} />
            {border.rings.map((r, i) => (
              <Polygon key={i} positions={r} pathOptions={{ color: "#ffd23f", weight: 1.5, opacity: 0.5, dashArray: "6 6", fill: false }} interactive={false} />
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
    </div>
  );
}
