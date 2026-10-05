"use client";

import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import { GeoJSON, Marker, Popup, Tooltip, useMap, useMapEvents } from "react-leaflet";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { SEVERITY, nf, type Accident } from "@/lib/data";
import { reportCategory, type Report } from "@/lib/reports";
import { HeatLayer, type HeatPoint } from "./heat-layer";

// ---------------------------------------------------------------- points

const RADIUS = { fatal: 6, injury: 4.5, damage: 3 } as const;
const DRAW_ORDER = { damage: 0, injury: 1, fatal: 2 } as const;

/**
 * Accident dots on one shared canvas. Tens of thousands of React components
 * would be slow, so markers are managed imperatively.
 */
export function PointsLayer({
  accidents,
  fade,
  onSelect,
}: {
  accidents: Accident[];
  /** Optional per-accident opacity multiplier (timeline trail). */
  fade?: (a: Accident) => number;
  onSelect: (a: Accident) => void;
}) {
  const map = useMap();
  const renderer = useMemo(() => L.canvas({ padding: 0.3, tolerance: 4 }), []);
  const selectRef = useRef(onSelect);
  useEffect(() => {
    selectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const group = L.layerGroup();
    // Fatal last so they sit on top.
    const sorted = [...accidents].sort((a, b) => DRAW_ORDER[a.severity] - DRAW_ORDER[b.severity]);
    for (const a of sorted) {
      const o = fade ? fade(a) : 1;
      const color = SEVERITY[a.severity].color;
      const m = L.circleMarker([a.lat, a.lng], {
        renderer,
        radius: RADIUS[a.severity],
        stroke: true,
        weight: 1,
        color: "#0b0d12",
        opacity: 0.6 * o,
        fillColor: color,
        fillOpacity: (a.severity === "damage" ? 0.55 : 0.85) * o,
        bubblingMouseEvents: false,
      });
      m.on("click", () => selectRef.current(a));
      group.addLayer(m);
    }
    group.addTo(map);
    return () => {
      group.remove();
    };
  }, [accidents, fade, map, renderer]);

  return null;
}

/** Pulsing rings for fatal accidents (used by the timeline). */
export function PulseLayer({ accidents }: { accidents: Accident[] }) {
  // Animate an inner element: Leaflet positions the icon itself with a transform.
  const icon = useMemo(() => L.divIcon({ className: "", html: '<span class="ep-pulse"></span>', iconSize: [18, 18] }), []);
  return (
    <>
      {accidents.map((a) => (
        <Marker key={a.id + a.t} position={[a.lat, a.lng]} icon={icon} interactive={false} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------- heat

export function HeatmapLayer({ points }: { points: HeatPoint[] }) {
  const map = useMap();
  const layer = useMemo(() => new HeatLayer(), []);
  useEffect(() => {
    layer.addTo(map);
    return () => {
      layer.remove();
    };
  }, [layer, map]);
  useEffect(() => {
    layer.setPoints(points);
  }, [layer, points]);
  return null;
}

// ---------------------------------------------------------------- municipalities

export type RegionValue = { value: number; label: string };

export function ChoroplethLayer({
  geo,
  values,
  breaks,
  colors,
  selected,
  onSelect,
}: {
  geo: FeatureCollection;
  values: Map<string, RegionValue>;
  breaks: number[];
  colors: string[];
  selected: string | null;
  onSelect: (code: string) => void;
}) {
  const colorFor = (v: number | undefined) => {
    if (v == null) return "#1f2433";
    let i = 0;
    while (i < breaks.length && v > breaks[i]) i++;
    return colors[Math.min(i, colors.length - 1)];
  };
  // GeoJSON layers don't restyle on prop changes, so key them on the data.
  const key = useMemo(() => [...values.entries()].map(([k, v]) => k + v.value).join("|") + selected, [values, selected]);
  return (
    <GeoJSON
      key={key}
      data={geo}
      style={(f?: Feature<Geometry, { code: string }>) => {
        const code = f?.properties.code ?? "";
        const isSel = code === selected;
        return {
          color: isSel ? "#e6fbff" : "#0b0d12",
          weight: isSel ? 2.5 : 1,
          fillColor: colorFor(values.get(code)?.value),
          fillOpacity: 0.78,
        };
      }}
      onEachFeature={(f: Feature<Geometry, { code: string; name: string }>, layer) => {
        const v = values.get(f.properties.code);
        layer.bindTooltip(
          `<strong>${f.properties.name}</strong><br/>${v ? v.label : "Nėra duomenų"}`,
          { sticky: true, className: "ep-tooltip" },
        );
        layer.on("click", () => onSelect(f.properties.code));
      }}
    />
  );
}

// ---------------------------------------------------------------- hotspots

export type Hotspot = {
  lat: number;
  lng: number;
  count: number;
  killed: number;
  injured: number;
  street: string | null;
};

export function HotspotLayer({ spots, onSelect }: { spots: Hotspot[]; onSelect: (h: Hotspot) => void }) {
  return (
    <>
      {spots.map((h, i) => (
        <Marker
          key={`${h.lat},${h.lng}`}
          position={[h.lat, h.lng]}
          zIndexOffset={1000}
          icon={L.divIcon({
            className: "",
            html: `<div class="ep-hotspot"><span class="ep-hotspot-rank">${i + 1}</span>${nf.format(h.count)}</div>`,
            iconSize: [0, 0],
          })}
          eventHandlers={{ click: () => onSelect(h) }}
        >
          <Tooltip direction="top" offset={[0, -14]} className="ep-tooltip">
            #{i + 1} {h.street ?? "Be pavadinimo"} – {nf.format(h.count)} įv.
          </Tooltip>
        </Marker>
      ))}
    </>
  );
}

// ---------------------------------------------------------------- police black spots (live)

export function BlackspotLayer({ data }: { data: FeatureCollection | null }) {
  // Sections are only ~200 m long, so also mark their middle to keep them visible when zoomed out.
  const mids = useMemo(
    () =>
      (data?.features ?? []).flatMap((f) => {
        if (f.geometry.type !== "LineString") return [];
        const c = f.geometry.coordinates;
        const [lng, lat] = c[Math.floor(c.length / 2)];
        return [{ lat, lng, p: f.properties as Record<string, string | number> }];
      }),
    [data],
  );
  if (!data) return null;
  const tip = (p: Record<string, string | number>) =>
    `<strong>${p.PAVAD ?? "Avaringas ruožas"}</strong><br/>Kelias ${p.KELIONR}, ${p.PRADZIAKM}–${p.PABAIGAKM} km<br/><span class="opacity-70">Policijos EĮIS, nuo ${p.IVEDIMODATA}</span>`;
  return (
    <>
      <GeoJSON
        data={data}
        style={() => ({ color: "#ff2e88", weight: 9, opacity: 0.85, lineCap: "round" })}
        onEachFeature={(f, layer) => layer.bindTooltip(tip(f.properties), { sticky: true, className: "ep-tooltip" })}
      />
      {mids.map((m, i) => (
        <Marker
          key={i}
          position={[m.lat, m.lng]}
          icon={L.divIcon({ className: "", html: '<div class="ep-blackspot"><span>!</span></div>', iconSize: [0, 0] })}
        >
          <Tooltip direction="top" offset={[0, -12]} className="ep-tooltip">
            <span dangerouslySetInnerHTML={{ __html: tip(m.p) }} />
          </Tooltip>
        </Marker>
      ))}
    </>
  );
}

// ---------------------------------------------------------------- user reports

export function ReportsLayer({
  reports,
  onVote,
  votedIds,
}: {
  reports: Report[];
  onVote: (id: number) => void;
  votedIds: Set<number>;
}) {
  return (
    <>
      {reports.map((r) => {
        const c = reportCategory(r.category);
        const size = Math.min(46, 26 + Math.sqrt(r.votes) * 5);
        return (
          <Marker
            key={r.id}
            position={[r.lat, r.lng]}
            zIndexOffset={500}
            icon={L.divIcon({
              className: "",
              html: `<div class="ep-report" style="--c:${c.color};width:${size}px;height:${size}px"><span>${c.icon}</span><b>${r.votes}</b></div>`,
              iconSize: [size, size],
              iconAnchor: [size / 2, size / 2],
            })}
          >
            <Popup className="ep-popup">
              <div className="min-w-48">
                <div className="text-xs uppercase tracking-wide opacity-60">Vartotojų pranešimas</div>
                <div className="mt-0.5 font-semibold">
                  {c.icon} {c.label}
                </div>
                {r.note && <p className="mt-1 text-sm opacity-90">„{r.note}“</p>}
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-sm">
                    <b>{r.votes}</b> {r.votes === 1 ? "žmogus pažymėjo" : "žmonės pažymėjo"}
                  </span>
                  <button
                    type="button"
                    disabled={votedIds.has(r.id)}
                    onClick={() => onVote(r.id)}
                    className="rounded-full bg-cyan-400 px-3 py-1 text-xs font-semibold text-slate-950 disabled:bg-slate-600 disabled:text-slate-300"
                  >
                    {votedIds.has(r.id) ? "✓ Balsavote" : "+1 Aš irgi"}
                  </button>
                </div>
                <div className="mt-1 text-[11px] opacity-50">Pažymėta {r.createdAt.slice(0, 10)}</div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}

export function DraftMarker({ lat, lng, onMove }: { lat: number; lng: number; onMove: (lat: number, lng: number) => void }) {
  const icon = useMemo(
    () => L.divIcon({ className: "", html: '<div class="ep-draft"></div>', iconSize: [28, 28], iconAnchor: [14, 28] }),
    [],
  );
  return (
    <Marker
      position={[lat, lng]}
      icon={icon}
      draggable
      zIndexOffset={2000}
      eventHandlers={{
        dragend: (e) => {
          const p = (e.target as L.Marker).getLatLng();
          onMove(p.lat, p.lng);
        },
      }}
    />
  );
}

// ---------------------------------------------------------------- helpers

/** Ring around the selected accident / place. */
export function SelectionMarker({ lat, lng }: { lat: number; lng: number }) {
  const icon = useMemo(() => L.divIcon({ className: "ep-selected", iconSize: [30, 30] }), []);
  return <Marker position={[lat, lng]} icon={icon} interactive={false} zIndexOffset={1500} />;
}

export function MapClick({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onClick(e.latlng.lat, e.latlng.lng) });
  return null;
}

/** Imperative camera moves requested by the UI. */
export function CameraControl({ target }: { target: { bounds?: L.LatLngBoundsExpression; center?: [number, number]; zoom?: number; nonce: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    if (target.bounds) map.flyToBounds(target.bounds, { padding: [30, 30], duration: 0.8 });
    else if (target.center) map.flyTo(target.center, target.zoom ?? Math.max(map.getZoom(), 15), { duration: 0.8 });
  }, [map, target]);
  return null;
}
