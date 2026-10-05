"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import L from "leaflet";
import { MapContainer, TileLayer, ZoomControl } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { FeatureCollection } from "geojson";
import {
  YEARS,
  distance,
  loadYear,
  matches,
  nf,
  type Accident,
  type Filters,
} from "@/lib/data";
import type { Report } from "@/lib/reports";
import type { Stats } from "@/lib/stats";
import {
  BlackspotLayer,
  CameraControl,
  ChoroplethLayer,
  DraftMarker,
  HeatmapLayer,
  HotspotLayer,
  MapClick,
  PointsLayer,
  PulseLayer,
  ReportsLayer,
  SelectionMarker,
  type Hotspot,
  type RegionValue,
} from "./layers";
import { AddressSearch, DetailPanel, FiltersPanel, ReportPanel, type Selection } from "./panels";
import { Timeline } from "./Timeline";
import { Logo } from "../Logo";

export type Source = "official" | "users" | "mix";
export type View = "points" | "heat" | "regions";
export type RegionMetric = "rate" | "total";

const LITHUANIA_CENTER: [number, number] = [55.17, 23.9];
const REGION_COLORS = ["#3a0d1a", "#6b1529", "#a0213d", "#d63c58", "#ff8597"];
type Camera = { bounds?: L.LatLngBoundsExpression; center?: [number, number]; zoom?: number; nonce: number };

function getVoterId(): string {
  try {
    let id = localStorage.getItem("ep-voter");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("ep-voter", id);
    }
    return id;
  } catch {
    // Private mode etc.: a per-session id still lets the person vote once.
    return ((globalThis as { __epVoter?: string }).__epVoter ??= crypto.randomUUID());
  }
}

function loadVoted(): Set<number> {
  try {
    return new Set(JSON.parse(localStorage.getItem("ep-voted") ?? "[]"));
  } catch {
    return new Set();
  }
}

export default function Dashboard() {
  // ---------------------------------------------------------------- state
  const [source, setSource] = useState<Source>("mix");
  const [view, setView] = useState<View>("points");
  const [regionMetric, setRegionMetric] = useState<RegionMetric>("rate");
  const [filters, setFilters] = useState<Filters>({
    yearFrom: YEARS.at(-1)!,
    yearTo: YEARS.at(-1)!,
    months: [],
    muni: null,
    category: "all",
    severities: ["fatal", "injury"],
  });
  const [showHotspots, setShowHotspots] = useState(true);
  const [showBlackspots, setShowBlackspots] = useState(false);
  const [basemap, setBasemap] = useState<"dark" | "light">("dark");

  const [loaded, setLoaded] = useState<Record<number, Accident[]>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [geo, setGeo] = useState<FeatureCollection | null>(null);
  const [blackspots, setBlackspots] = useState<FeatureCollection | null>(null);
  const [blackspotError, setBlackspotError] = useState<string | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  // Client-only component (ssr: false), so localStorage is available here.
  const [voted, setVoted] = useState<Set<number>>(loadVoted);

  const [selection, setSelection] = useState<Selection | null>(null);
  const [reportMode, setReportMode] = useState(false);
  const [draft, setDraft] = useState<{ lat: number; lng: number } | null>(null);
  const [timeline, setTimeline] = useState<{ month: number; playing: boolean } | null>(null);
  const [camera, setCamera] = useState<Camera | null>(null);
  // On phones start with the map visible; the ☰ button opens the filters.
  const [sidebarOpen, setSidebarOpen] = useState(() => window.matchMedia("(min-width: 1024px)").matches);

  const fly = useCallback((c: Omit<Camera, "nonce">) => setCamera({ ...c, nonce: Date.now() }), []);

  // ---------------------------------------------------------------- loading
  const refreshReports = useCallback(() => {
    fetch("/api/reports")
      .then((r) => (r.ok ? r.json() : []))
      .then(setReports)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    fetch("/data/stats.json").then((r) => r.json()).then(setStats).catch(() => undefined);
    fetch("/data/municipalities.geojson").then((r) => r.json()).then(setGeo).catch(() => undefined);
    refreshReports();
  }, [refreshReports]);

  useEffect(() => {
    if (source === "users") return;
    const need = YEARS.filter((y) => y >= filters.yearFrom && y <= filters.yearTo && !loaded[y]);
    if (!need.length) return;
    let cancelled = false;
    Promise.all(need.map((y) => loadYear(y).then((rows) => [y, rows] as const)))
      .then((pairs) => {
        if (cancelled) return;
        setLoaded((prev) => ({ ...prev, ...Object.fromEntries(pairs) }));
        setLoadError(null);
      })
      .catch((e) => !cancelled && setLoadError(e.message));
    return () => {
      cancelled = true;
    };
  }, [filters.yearFrom, filters.yearTo, loaded, source]);

  useEffect(() => {
    if (!showBlackspots || blackspots) return;
    fetch("/api/blackspots")
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? "Klaida");
        setBlackspots(body);
        setBlackspotError(null);
      })
      .catch((e) => setBlackspotError(e.message));
  }, [showBlackspots, blackspots]);

  // ---------------------------------------------------------------- derived data
  const pool = useMemo(() => {
    const out: Accident[] = [];
    for (let y = filters.yearFrom; y <= filters.yearTo; y++) if (loaded[y]) out.push(...loaded[y]);
    return out;
  }, [loaded, filters.yearFrom, filters.yearTo]);
  const loading = source !== "users" && YEARS.some((y) => y >= filters.yearFrom && y <= filters.yearTo && !loaded[y]);

  // Everything except severity (for the legend counts and detail stats).
  const anySeverity = useMemo(() => pool.filter((a) => matches(a, filters, true)), [pool, filters]);
  const filtered = useMemo(() => anySeverity.filter((a) => filters.severities.includes(a.severity)), [anySeverity, filters.severities]);

  const severityCounts = useMemo(() => {
    const c = { fatal: 0, injury: 0, damage: 0 };
    for (const a of anySeverity) c[a.severity]++;
    return c;
  }, [anySeverity]);

  const showOfficial = source !== "users";
  const showReports = source !== "official";

  // Timeline: current month bright, two previous months fading out.
  const timelineVisible = useMemo(() => {
    if (!timeline) return filtered;
    return filtered.filter((a) => a.monthIndex <= timeline.month && a.monthIndex > timeline.month - 3);
  }, [filtered, timeline]);
  const fade = useMemo(() => {
    if (!timeline) return undefined;
    const m = timeline.month;
    return (a: Accident) => [1, 0.4, 0.15][m - a.monthIndex] ?? 0;
  }, [timeline]);
  const pulsing = useMemo(
    () => (timeline ? timelineVisible.filter((a) => a.monthIndex === timeline.month && a.severity === "fatal") : []),
    [timeline, timelineVisible],
  );

  const hotspots = useMemo<Hotspot[]>(() => {
    if (!showOfficial || !showHotspots || view === "regions") return [];
    // ~110 m × 100 m cells.
    const cells = new Map<string, { lat: number; lng: number; n: number; k: number; i: number; streets: Map<string, number> }>();
    for (const a of timelineVisible) {
      const key = `${Math.round(a.lat / 0.001)}:${Math.round(a.lng / 0.0016)}`;
      let c = cells.get(key);
      if (!c) cells.set(key, (c = { lat: 0, lng: 0, n: 0, k: 0, i: 0, streets: new Map() }));
      c.lat += a.lat;
      c.lng += a.lng;
      c.n++;
      c.k += a.killed;
      c.i += a.injured;
      if (a.street) c.streets.set(a.street, (c.streets.get(a.street) ?? 0) + 1);
    }
    return [...cells.values()]
      .filter((c) => c.n >= 3)
      .sort((a, b) => b.n - a.n || b.k - a.k)
      .slice(0, 10)
      .map((c) => ({
        lat: c.lat / c.n,
        lng: c.lng / c.n,
        count: c.n,
        killed: c.k,
        injured: c.i,
        street: [...c.streets.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
      }));
  }, [timelineVisible, showHotspots, showOfficial, view]);

  const heatPoints = useMemo(
    () => timelineVisible.map((a) => [a.lat, a.lng, a.severity === "fatal" ? 3 : a.severity === "injury" ? 1.5 : 1] as [number, number, number]),
    [timelineVisible],
  );

  // Municipality choropleth: everything but the municipality filter.
  const region = useMemo(() => {
    if (!stats) return null;
    const counts = new Map<string, number>();
    const f = { ...filters, muni: null };
    for (const a of pool) if (a.muni && matches(a, f)) counts.set(a.muni, (counts.get(a.muni) ?? 0) + 1);
    const years = filters.yearTo - filters.yearFrom + 1;
    const values = new Map<string, RegionValue>();
    for (const m of stats.municipalities) {
      const n = counts.get(m.code) ?? 0;
      const pops = Object.entries(m.population).filter(([y]) => +y >= filters.yearFrom && +y <= filters.yearTo).map(([, p]) => p);
      const pop = pops.length ? pops.reduce((s, p) => s + p, 0) / pops.length : m.population[String(YEARS.at(-1))];
      const rate = pop ? (n / years / pop) * 10000 : 0;
      values.set(m.code, {
        value: regionMetric === "rate" ? rate : n,
        label: `${nf.format(n)} įvykių · ${rate.toFixed(1)} / 10 000 gyv. per metus`,
      });
    }
    const sorted = [...values.values()].map((v) => v.value).sort((a, b) => a - b);
    const q = (p: number) => sorted[Math.floor(p * (sorted.length - 1))] ?? 0;
    const breaks = [q(0.2), q(0.4), q(0.6), q(0.8)];
    return { values, breaks };
  }, [pool, filters, stats, regionMetric]);

  // ---------------------------------------------------------------- actions
  const selectMuni = useCallback(
    (code: string | null) => {
      setFilters((f) => ({ ...f, muni: code }));
      if (!code) return fly({ center: LITHUANIA_CENTER, zoom: 7 });
      const feature = geo?.features.find((ft) => ft.properties?.code === code);
      if (feature) return fly({ bounds: L.geoJSON(feature).getBounds() });
      // Visaginas has no boundary in the source layer: frame its accidents instead.
      const pts = pool.filter((a) => a.muni === code).map((a) => [a.lat, a.lng] as [number, number]);
      if (pts.length) fly({ bounds: L.latLngBounds(pts) });
    },
    [geo, pool, fly],
  );

  const onMapClick = useCallback(
    (lat: number, lng: number) => {
      if (reportMode) return setDraft({ lat, lng });
      if (view === "regions") return;
      setSelection({ kind: "place", lat, lng });
    },
    [reportMode, view],
  );

  const vote = useCallback(async (id: number) => {
    const res = await fetch(`/api/reports/${id}/vote`, { method: "POST", headers: { "x-voter-id": getVoterId() } });
    if (!res.ok) return;
    const { report } = (await res.json()) as { report: Report };
    setReports((rs) => rs.map((r) => (r.id === id ? report : r)));
    setVoted((prev) => {
      const next = new Set(prev).add(id);
      try {
        localStorage.setItem("ep-voted", JSON.stringify([...next]));
      } catch {}
      return next;
    });
  }, []);

  const onReported = useCallback((r: Report) => {
    setReports((rs) => (rs.some((x) => x.id === r.id) ? rs.map((x) => (x.id === r.id ? r : x)) : [...rs, r]));
    setVoted((prev) => {
      const next = new Set(prev).add(r.id);
      try {
        localStorage.setItem("ep-voted", JSON.stringify([...next]));
      } catch {}
      return next;
    });
    if (source === "official") setSource("mix");
  }, [source]);

  // Timeline playback.
  const monthRange = useMemo(
    () => [(filters.yearFrom - 2020) * 12, (filters.yearTo - 2020) * 12 + 11] as const,
    [filters.yearFrom, filters.yearTo],
  );
  useEffect(() => {
    if (!timeline?.playing) return;
    const id = setInterval(() => {
      setTimeline((t) => {
        if (!t) return t;
        if (t.month >= monthRange[1]) return { ...t, playing: false };
        return { ...t, month: t.month + 1 };
      });
    }, 900);
    return () => clearInterval(id);
  }, [timeline?.playing, monthRange]);

  // ---------------------------------------------------------------- render
  const nearbyReports = useMemo(() => {
    if (!selection) return [];
    const c = selection.kind === "accident" ? selection.a : selection;
    return reports.filter((r) => distance(r.lat, r.lng, c.lat, c.lng) < 250);
  }, [selection, reports]);

  return (
    <div className="flex h-dvh w-full flex-col bg-[var(--bg)] text-[var(--ink)]">
      {/* Top bar */}
      <header className="z-[1100] flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--line)] bg-[var(--panel)] px-3 py-2 sm:px-4">
        <button
          className="rounded-md border border-[var(--line)] px-2 py-1 text-sm lg:hidden"
          onClick={() => setSidebarOpen((o) => !o)}
          aria-label="Rodyti / slėpti filtrus"
        >
          ☰
        </button>
        <Logo />
        <SourceSwitch value={source} onChange={setSource} />
        <nav className="ml-auto flex items-center gap-1 text-sm">
          <span className="rounded-md bg-[var(--chip)] px-3 py-1.5 font-medium">Žemėlapis</span>
          <Link href="/statistika" className="rounded-md px-3 py-1.5 text-[var(--muted)] hover:bg-[var(--chip)] hover:text-[var(--ink)]">
            Statistika
          </Link>
          <Link href="/apie" className="hidden rounded-md px-3 py-1.5 text-[var(--muted)] hover:bg-[var(--chip)] hover:text-[var(--ink)] sm:block">
            Apie / API
          </Link>
        </nav>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {/* Sidebar */}
        <aside
          className={`${sidebarOpen ? "flex" : "hidden"} absolute inset-y-0 left-0 z-[1050] w-full max-w-[380px] flex-col overflow-y-auto border-r border-[var(--line)] bg-[var(--panel)] lg:static lg:flex`}
        >
          <div className="space-y-4 p-4">
            <AddressSearch
              placeholder="Ieškoti gatvės ar adreso…"
              onPick={(p) => {
                fly({ center: [p.lat, p.lng], zoom: 16 });
                if (reportMode) setDraft({ lat: p.lat, lng: p.lng });
                else setSelection({ kind: "place", lat: p.lat, lng: p.lng, street: p.street, label: p.label });
              }}
            />
            {reportMode ? (
              <ReportPanel
                draft={draft}
                onDraft={(lat, lng) => {
                  setDraft({ lat, lng });
                  fly({ center: [lat, lng], zoom: 17 });
                }}
                voterId={getVoterId}
                onDone={onReported}
                onClose={() => {
                  setReportMode(false);
                  setDraft(null);
                }}
              />
            ) : selection ? (
              <DetailPanel
                selection={selection}
                pool={anySeverity}
                nearbyReports={nearbyReports}
                stats={stats}
                onClose={() => setSelection(null)}
                onShowAccident={(a) => {
                  setSelection({ kind: "accident", a });
                  fly({ center: [a.lat, a.lng], zoom: 17 });
                }}
              />
            ) : (
              <FiltersPanel
                source={source}
                filters={filters}
                setFilters={setFilters}
                selectMuni={selectMuni}
                stats={stats}
                severityCounts={severityCounts}
                view={view}
                setView={setView}
                regionMetric={regionMetric}
                setRegionMetric={setRegionMetric}
                showHotspots={showHotspots}
                setShowHotspots={setShowHotspots}
                showBlackspots={showBlackspots}
                setShowBlackspots={setShowBlackspots}
                blackspotError={blackspotError}
                hotspots={hotspots}
                onHotspot={(h) => {
                  fly({ center: [h.lat, h.lng], zoom: 17 });
                  setSelection({ kind: "place", lat: h.lat, lng: h.lng, street: h.street, radius: 120 });
                }}
                reports={reports}
                loading={loading}
                loadError={loadError}
                shown={timelineVisible.length}
                regionLegend={region ? { breaks: region.breaks, colors: REGION_COLORS } : null}
              />
            )}
          </div>
        </aside>

        {/* Map */}
        <div className={`relative min-w-0 flex-1 ${reportMode ? "ep-reporting" : ""}`}>
          <MapContainer center={LITHUANIA_CENTER} zoom={7} minZoom={6} zoomControl={false} className="h-full w-full" preferCanvas>
            <ZoomControl position="topright" />
            {/* Esri gray canvas: keyless, quiet enough for data to stand out. */}
            <TileLayer
              key={basemap}
              attribution='Pagrindas &copy; <a href="https://www.esri.com/">Esri</a>, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Duomenys: Policijos departamentas, VDA, Regitra'
              url={`https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_${basemap === "dark" ? "Dark" : "Light"}_Gray_Base/MapServer/tile/{z}/{y}/{x}`}
              maxNativeZoom={16}
              maxZoom={19}
            />
            <TileLayer
              key={basemap + "-labels"}
              url={`https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_${basemap === "dark" ? "Dark" : "Light"}_Gray_Reference/MapServer/tile/{z}/{y}/{x}`}
              maxNativeZoom={16}
              maxZoom={19}
            />
            <MapClick onClick={onMapClick} />
            <CameraControl target={camera} />

            {showOfficial && view === "regions" && geo && region && (
              <ChoroplethLayer
                geo={geo}
                values={region.values}
                breaks={region.breaks}
                colors={REGION_COLORS}
                selected={filters.muni}
                onSelect={(code) => selectMuni(code === filters.muni ? null : code)}
              />
            )}
            {showOfficial && view === "heat" && <HeatmapLayer points={heatPoints} />}
            {showOfficial && view === "points" && (
              <PointsLayer
                accidents={timelineVisible}
                fade={fade}
                onSelect={(a) => {
                  setSelection({ kind: "accident", a });
                  setSidebarOpen(true);
                }}
              />
            )}
            {showOfficial && pulsing.length > 0 && <PulseLayer accidents={pulsing} />}
            {showBlackspots && <BlackspotLayer data={blackspots} />}
            {hotspots.length > 0 && (
              <HotspotLayer
                spots={hotspots}
                onSelect={(h) => {
                  setSelection({ kind: "place", lat: h.lat, lng: h.lng, street: h.street, radius: 120 });
                  setSidebarOpen(true);
                }}
              />
            )}
            {showReports && <ReportsLayer reports={reports} onVote={vote} votedIds={voted} />}
            {selection && !reportMode && (
              <SelectionMarker
                lat={selection.kind === "accident" ? selection.a.lat : selection.lat}
                lng={selection.kind === "accident" ? selection.a.lng : selection.lng}
              />
            )}
            {reportMode && draft && <DraftMarker lat={draft.lat} lng={draft.lng} onMove={(lat, lng) => setDraft({ lat, lng })} />}
          </MapContainer>

          {/* Floating controls */}
          <div className="pointer-events-none absolute right-3 bottom-28 z-[1000] flex flex-col items-end gap-2 sm:bottom-24">
            <button
              onClick={() => setBasemap((b) => (b === "dark" ? "light" : "dark"))}
              className="pointer-events-auto rounded-full border border-[var(--line)] bg-[var(--panel)] px-3 py-1.5 text-xs text-[var(--muted)] shadow-lg hover:text-[var(--ink)]"
            >
              {basemap === "dark" ? "☀ Šviesus pagrindas" : "☾ Tamsus pagrindas"}
            </button>
            <button
              onClick={() => {
                setReportMode((m) => !m);
                setSelection(null);
                setSidebarOpen(true);
                if (reportMode) setDraft(null);
              }}
              className={`pointer-events-auto rounded-full px-5 py-3 text-sm font-semibold shadow-xl transition ${
                reportMode ? "bg-slate-200 text-slate-900" : "ep-glow bg-[var(--accent)] text-slate-950 hover:brightness-110"
              }`}
            >
              {reportMode ? "✕ Atšaukti žymėjimą" : "⚠ Pažymėti pavojingą vietą"}
            </button>
          </div>

          {reportMode && (
            <div className="pointer-events-none absolute top-3 left-1/2 z-[1000] -translate-x-1/2 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-medium text-slate-950 shadow-lg">
              Spustelėkite žemėlapyje pavojingą vietą
            </div>
          )}

          {showOfficial && (
            <Timeline
              accidents={filtered}
              range={monthRange}
              state={timeline}
              onChange={setTimeline}
              shownCount={timeline ? timelineVisible.filter((a) => a.monthIndex === timeline.month).length : filtered.length}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SourceSwitch({ value, onChange }: { value: Source; onChange: (s: Source) => void }) {
  const items: { id: Source; label: string; hint: string }[] = [
    { id: "official", label: "Oficialūs", hint: "Policijos registruoti eismo įvykiai" },
    { id: "users", label: "Vartotojų", hint: "Žmonių pažymėtos pavojingos vietos" },
    { id: "mix", label: "Mix", hint: "Abu sluoksniai kartu" },
  ];
  return (
    <div role="radiogroup" aria-label="Duomenų šaltinis" className="flex rounded-full border border-[var(--line)] bg-[var(--bg)] p-1">
      {items.map((it) => (
        <button
          key={it.id}
          role="radio"
          aria-checked={value === it.id}
          title={it.hint}
          onClick={() => onChange(it.id)}
          className={`rounded-full px-3 py-1 text-sm font-medium transition sm:px-4 ${
            value === it.id ? "bg-[var(--accent)] text-slate-950 shadow" : "text-[var(--muted)] hover:text-[var(--ink)]"
          }`}
        >
          {it.id === "official" && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[#ffb020] align-middle" />}
          {it.id === "users" && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[#22c55e] align-middle" />}
          {it.label}
        </button>
      ))}
    </div>
  );
}
