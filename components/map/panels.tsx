"use client";

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  CATEGORIES,
  FLAG,
  MONTHS_SHORT,
  SEVERITY,
  YEARS,
  accidentDate,
  distance,
  formatDate,
  nf,
  streetKey,
  type Accident,
  type Filters,
  type Severity,
} from "@/lib/data";
import { MERGE_RADIUS_M, REPORT_CATEGORIES, reportCategory, type Report, type ReportCategory } from "@/lib/reports";
import { shortMuni, type Stats } from "@/lib/stats";
import type { Hotspot } from "./layers";
import type { RegionMetric, Source, View } from "./Dashboard";

export type Selection =
  | { kind: "accident"; a: Accident }
  | { kind: "place"; lat: number; lng: number; street?: string | null; label?: string; radius?: number };

// ---------------------------------------------------------------- small building blocks

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-[11px] font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Chip({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-sm transition ${
        active
          ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--ink)]"
          : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--muted)] hover:text-[var(--ink)]"
      }`}
    >
      {children}
    </button>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-lg border border-[var(--line)] bg-[var(--bg)] p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={`flex-1 rounded-md px-2 py-1.5 text-sm transition ${
            value === o.id ? "bg-[var(--chip)] font-medium text-[var(--ink)]" : "text-[var(--muted)] hover:text-[var(--ink)]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1 text-sm">
      <span>{children}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition ${checked ? "bg-[var(--accent)]" : "bg-[var(--chip)]"}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${checked ? "left-[18px]" : "left-0.5"}`} />
      </button>
    </label>
  );
}

/** Single-series column chart with hover values. */
export function MiniBars({ values, labels, height = 56, highlight }: { values: number[]; labels: string[]; height?: number; highlight?: number }) {
  const max = Math.max(1, ...values);
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? highlight ?? null;
  return (
    <div>
      <div className="flex items-end gap-[2px]" style={{ height }} onMouseLeave={() => setHover(null)}>
        {values.map((v, i) => (
          <div
            key={i}
            className="flex h-full flex-1 cursor-default items-end"
            onMouseEnter={() => setHover(i)}
            title={`${labels[i]}: ${nf.format(v)}`}
          >
            <div
              className="w-full rounded-t-[3px] transition-colors"
              style={{
                height: `${Math.max(v ? 4 : 0, (v / max) * 100)}%`,
                background: i === shown ? "var(--accent)" : "color-mix(in oklab, var(--accent) 45%, transparent)",
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-[var(--muted)]">
        <span>{labels[0]}</span>
        <span className="text-[var(--ink)]">{shown != null ? `${labels[shown]}: ${nf.format(values[shown])}` : ""}</span>
        <span>{labels.at(-1)}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- address search

type Place = { lat: number; lng: number; label: string; street: string | null; city: string | null };

export function AddressSearch({ onPick, placeholder }: { onPick: (p: Place) => void; placeholder: string }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shown = q.trim().length >= 3 ? results : [];
  // Filling the box with the picked address shouldn't trigger a new search.
  const picked = useRef<string | null>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 3 || term === picked.current) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      setBusy(true);
      fetch(`/api/geocode?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        .then(async (r) => {
          const body = await r.json();
          if (!r.ok) throw new Error(body.error);
          setResults(body);
          setError(null);
          setOpen(true);
        })
        .catch((e) => e.name !== "AbortError" && setError(e.message || "Paieška nepavyko"))
        .finally(() => setBusy(false));
    }, 600);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  return (
    <div className="relative">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => shown.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 pr-8 text-sm outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
      />
      <span className="absolute top-2 right-3 text-sm text-[var(--muted)]">{busy ? "…" : "⌕"}</span>
      {error && <p className="mt-1 text-xs text-[#ff8597]">{error}</p>}
      {open && shown.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-[var(--line)] bg-[var(--panel)] py-1 shadow-2xl">
          {shown.map((r, i) => (
            <li key={i}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(r);
                  setOpen(false);
                  const text = r.street ? `${r.street}${r.city ? ", " + r.city : ""}` : r.label;
                  picked.current = text;
                  setQ(text);
                }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--chip)]"
              >
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- filters

export function FiltersPanel(props: {
  source: Source;
  filters: Filters;
  setFilters: Dispatch<SetStateAction<Filters>>;
  selectMuni: (code: string | null) => void;
  stats: Stats | null;
  severityCounts: Record<Severity, number>;
  view: View;
  setView: (v: View) => void;
  regionMetric: RegionMetric;
  setRegionMetric: (m: RegionMetric) => void;
  showHotspots: boolean;
  setShowHotspots: (v: boolean) => void;
  showBlackspots: boolean;
  setShowBlackspots: (v: boolean) => void;
  blackspotError: string | null;
  hotspots: Hotspot[];
  onHotspot: (h: Hotspot) => void;
  reports: Report[];
  loading: boolean;
  loadError: string | null;
  shown: number;
  regionLegend: { breaks: number[]; colors: string[] } | null;
}) {
  const { filters, setFilters, stats, source } = props;
  const munis = useMemo(
    () => [...(stats?.municipalities ?? [])].sort((a, b) => a.name.localeCompare(b.name, "lt")),
    [stats],
  );
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }));
  const official = source !== "users";

  const reportCounts = useMemo(() => {
    const c = new Map<string, { n: number; votes: number }>();
    for (const r of props.reports) {
      const e = c.get(r.category) ?? { n: 0, votes: 0 };
      e.n++;
      e.votes += r.votes;
      c.set(r.category, e);
    }
    return c;
  }, [props.reports]);

  return (
    <div className="space-y-5">
      {official && (
        <>
          <Section title="Savivaldybė">
            <select
              value={filters.muni ?? ""}
              onChange={(e) => props.selectMuni(e.target.value || null)}
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            >
              <option value="">Visa Lietuva</option>
              {munis.map((m) => (
                <option key={m.code} value={m.code}>
                  {shortMuni(m.name)}
                </option>
              ))}
            </select>
          </Section>

          <Section title="Kas nukentėjo / dalyvavo">
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => (
                <Chip key={c.id} active={filters.category === c.id} onClick={() => set("category", c.id)}>
                  <span className="mr-1">{c.icon}</span>
                  {c.label}
                </Chip>
              ))}
            </div>
          </Section>

          <Section title="Laikotarpis">
            <div className="flex items-center gap-2 text-sm">
              <select
                aria-label="Nuo metų"
                value={filters.yearFrom}
                onChange={(e) => setFilters((f) => ({ ...f, yearFrom: +e.target.value, yearTo: Math.max(+e.target.value, f.yearTo) }))}
                className="flex-1 rounded-lg border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5"
              >
                {YEARS.map((y) => (
                  <option key={y}>{y}</option>
                ))}
              </select>
              <span className="text-[var(--muted)]">–</span>
              <select
                aria-label="Iki metų"
                value={filters.yearTo}
                onChange={(e) => setFilters((f) => ({ ...f, yearTo: +e.target.value, yearFrom: Math.min(+e.target.value, f.yearFrom) }))}
                className="flex-1 rounded-lg border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5"
              >
                {YEARS.map((y) => (
                  <option key={y}>{y}</option>
                ))}
              </select>
            </div>
            <div className="mt-2 grid grid-cols-6 gap-1">
              {MONTHS_SHORT.map((m, i) => {
                const on = filters.months.includes(i);
                return (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set("months", on ? filters.months.filter((x) => x !== i) : [...filters.months, i])}
                    className={`rounded-md border py-1 text-xs ${
                      on ? "border-[var(--accent)] bg-[var(--accent)]/15" : "border-[var(--line)] text-[var(--muted)] hover:text-[var(--ink)]"
                    }`}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[11px] text-[var(--muted)]">
              {filters.months.length ? "Rodomi tik pažymėti mėnesiai" : "Visi mėnesiai (spustelėkite, kad atrinktumėte)"}
            </p>
          </Section>

          <Section
            title="Sunkumas"
            aside={<span className="text-xs text-[var(--muted)]">{props.loading ? "kraunama…" : `rodoma ${nf.format(props.shown)}`}</span>}
          >
            <div className="space-y-1">
              {(Object.keys(SEVERITY) as Severity[]).map((s) => {
                const on = filters.severities.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      set("severities", on ? filters.severities.filter((x) => x !== s) : [...filters.severities, s])
                    }
                    className={`flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-[var(--chip)] ${on ? "" : "opacity-45"}`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 rounded-full ${s === "fatal" ? "ep-dot-pulse" : ""}`}
                      style={{ background: SEVERITY[s].color, boxShadow: "0 0 0 2px var(--panel)" }}
                    />
                    <span className="flex-1">{SEVERITY[s].label}</span>
                    <span className="tabular-nums text-[var(--muted)]">{nf.format(props.severityCounts[s])}</span>
                    <span className="w-4 text-center text-xs">{on ? "✓" : ""}</span>
                  </button>
                );
              })}
            </div>
            {props.loadError && <p className="mt-2 text-xs text-[#ff8597]">{props.loadError}</p>}
          </Section>

          <Section title="Vaizdas">
            <Segmented
              value={props.view}
              onChange={props.setView}
              options={[
                { id: "points", label: "Taškai" },
                { id: "heat", label: "Šiluma" },
                { id: "regions", label: "Savivaldybės" },
              ]}
            />
            {props.view === "regions" && (
              <div className="mt-2 space-y-2">
                <Segmented
                  value={props.regionMetric}
                  onChange={props.setRegionMetric}
                  options={[
                    { id: "rate", label: "10 000 gyv. / metus" },
                    { id: "total", label: "Iš viso" },
                  ]}
                />
                {props.regionLegend && (
                  <div>
                    <div className="flex gap-[2px]">
                      {props.regionLegend.colors.map((c) => (
                        <span key={c} className="h-2.5 flex-1 first:rounded-l last:rounded-r" style={{ background: c }} />
                      ))}
                    </div>
                    <div className="mt-1 flex justify-between text-[11px] text-[var(--muted)] tabular-nums">
                      <span>mažiau</span>
                      {props.regionLegend.breaks.map((b, i) => (
                        <span key={i}>{props.regionMetric === "rate" ? b.toFixed(1) : nf.format(Math.round(b))}</span>
                      ))}
                      <span>daugiau</span>
                    </div>
                    <p className="mt-1 text-[11px] text-[var(--muted)]">Spustelėkite savivaldybę, kad ją atrinktumėte.</p>
                  </div>
                )}
              </div>
            )}
            <div className="mt-2">
              <Toggle checked={props.showHotspots} onChange={props.setShowHotspots}>
                Pavojingiausios vietos (TOP 10)
              </Toggle>
              <Toggle checked={props.showBlackspots} onChange={props.setShowBlackspots}>
                <span>
                  Policijos „juodosios dėmės“ <span className="ml-1 rounded bg-[#ff2e88]/20 px-1 text-[10px] text-[#ff8fc0]">LIVE</span>
                </span>
              </Toggle>
              {props.blackspotError && <p className="text-xs text-[#ff8597]">{props.blackspotError}</p>}
            </div>
          </Section>

          {props.showHotspots && props.hotspots.length > 0 && props.view !== "regions" && (
            <Section title="Pavojingiausios vietos">
              <ol className="space-y-1">
                {props.hotspots.map((h, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => props.onHotspot(h)}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-[var(--chip)]"
                    >
                      <span className="w-5 text-right text-xs text-[var(--muted)] tabular-nums">{i + 1}.</span>
                      <span className="flex-1 truncate">{h.street ?? "Be pavadinimo"}</span>
                      {h.killed > 0 && <span className="text-xs text-[#ff8597]">✝ {h.killed}</span>}
                      <span className="rounded-full bg-[var(--chip)] px-2 text-xs font-semibold tabular-nums">{h.count}</span>
                    </button>
                  </li>
                ))}
              </ol>
              <p className="mt-1 text-[11px] text-[var(--muted)]">~100 m kvadratai su daugiausiai įvykių pagal pasirinktus filtrus.</p>
            </Section>
          )}
        </>
      )}

      {source !== "official" && (
        <Section title="Vartotojų pranešimai" aside={<span className="text-xs text-[var(--muted)]">{props.reports.length} vietos</span>}>
          <ul className="space-y-1 text-sm">
            {REPORT_CATEGORIES.map((c) => {
              const e = reportCounts.get(c.id);
              return (
                <li key={c.id} className="flex items-center gap-2 px-2 py-0.5">
                  <span className="ep-report-mini" style={{ ["--c" as string]: c.color }}>
                    {c.icon}
                  </span>
                  <span className="flex-1">{c.label}</span>
                  <span className="text-xs text-[var(--muted)] tabular-nums">
                    {e ? `${e.n} · ${e.votes} bals.` : "–"}
                  </span>
                </li>
              );
            })}
          </ul>
          {props.reports.length === 0 && (
            <p className="mt-2 rounded-lg border border-dashed border-[var(--line)] p-3 text-xs text-[var(--muted)]">
              Dar niekas nepažymėjo pavojingų vietų. Būkite pirmas – spauskite „⚠ Pažymėti pavojingą vietą“.
            </p>
          )}
        </Section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- details

function summarise(list: Accident[]) {
  let killed = 0,
    injured = 0,
    counted = 0,
    bike = 0,
    ped = 0,
    drunk = 0;
  const kinds = new Map<string, number>();
  const hours = Array(24).fill(0);
  const years = new Map<number, number>();
  for (const a of list) {
    killed += a.killed;
    injured += a.injured;
    if (a.flags & FLAG.COUNTED) counted++;
    if (a.flags & FLAG.BIKE) bike++;
    if (a.flags & FLAG.PEDESTRIAN) ped++;
    if (a.flags & FLAG.DRUNK) drunk++;
    if (a.kind) kinds.set(a.kind, (kinds.get(a.kind) ?? 0) + 1);
    hours[accidentDate(a).getUTCHours()]++;
    years.set(a.year, (years.get(a.year) ?? 0) + 1);
  }
  return {
    n: list.length,
    killed,
    injured,
    counted,
    bike,
    ped,
    drunk,
    hours,
    years,
    kinds: [...kinds.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4),
  };
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="rounded-lg bg-[var(--bg)] px-3 py-2">
      <div className="text-xl font-semibold tabular-nums" style={tone ? { color: tone } : undefined}>
        {typeof value === "number" ? nf.format(value) : value}
      </div>
      <div className="text-[11px] text-[var(--muted)]">{label}</div>
    </div>
  );
}

function StatsBlock({ title, list, onShowAccident }: { title: string; list: Accident[]; onShowAccident: (a: Accident) => void }) {
  const s = useMemo(() => summarise(list), [list]);
  const years = [...s.years.keys()].sort();
  const worst = useMemo(
    () => [...list].sort((a, b) => b.killed - a.killed || b.injured - a.injured || b.t - a.t).slice(0, 4),
    [list],
  );
  if (!s.n) return <p className="text-sm text-[var(--muted)]">{title}: įvykių pagal pasirinktus filtrus nerasta.</p>;
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold">{title}</h4>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="įvykiai" value={s.n} />
        <Stat label="žuvo" value={s.killed} tone={s.killed ? SEVERITY.fatal.color : undefined} />
        <Stat label="sužeista" value={s.injured} tone={s.injured ? SEVERITY.injury.color : undefined} />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
        <span>🚲 {s.bike} su dviračiais</span>
        <span>🚶 {s.ped} su pėsčiaisiais</span>
        <span>🍺 {s.drunk} neblaivūs</span>
        <span>
          mirtingumas {s.injured + s.killed ? ((s.killed / (s.killed + s.injured)) * 100).toFixed(1) : "0"}%
        </span>
      </div>
      {years.length > 1 && (
        <div>
          <div className="mb-1 text-[11px] text-[var(--muted)]">Pagal metus</div>
          <MiniBars values={years.map((y) => s.years.get(y) ?? 0)} labels={years.map(String)} height={40} />
        </div>
      )}
      <div>
        <div className="mb-1 text-[11px] text-[var(--muted)]">Paros valanda</div>
        <MiniBars values={s.hours} labels={s.hours.map((_, h) => `${h}:00`)} height={40} />
      </div>
      {s.kinds.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] text-[var(--muted)]">Dažniausios rūšys</div>
          <ul className="space-y-0.5 text-sm">
            {s.kinds.map(([k, n]) => (
              <li key={k} className="flex justify-between gap-2">
                <span className="truncate">{k}</span>
                <span className="text-[var(--muted)] tabular-nums">{n}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <div className="mb-1 text-[11px] text-[var(--muted)]">Sunkiausi įvykiai</div>
        <ul className="space-y-0.5">
          {worst.map((a) => (
            <li key={a.id + a.t}>
              <button
                type="button"
                onClick={() => onShowAccident(a)}
                className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-[var(--chip)]"
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: SEVERITY[a.severity].color }} />
                <span className="tabular-nums text-[var(--muted)]">{formatDate(a, false)}</span>
                <span className="truncate">{a.kind}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function DetailPanel({
  selection,
  pool,
  nearbyReports,
  stats,
  onClose,
  onShowAccident,
}: {
  selection: Selection;
  pool: Accident[];
  nearbyReports: Report[];
  stats: Stats | null;
  onClose: () => void;
  onShowAccident: (a: Accident) => void;
}) {
  const center = selection.kind === "accident" ? selection.a : selection;
  const [resolved, setResolved] = useState<{ key: string; street: string | null; label: string | null } | null>(null);
  const selKey = `${center.lat},${center.lng}`;
  const presetStreet = selection.kind === "accident" ? selection.a.street : selection.street;

  // Clicking an empty spot: ask OSM which street it is.
  useEffect(() => {
    if (presetStreet !== undefined) return;
    let cancelled = false;
    fetch(`/api/geocode?lat=${center.lat}&lng=${center.lng}`)
      .then((r) => r.json())
      .then((b) => !cancelled && setResolved({ key: selKey, street: b.street ?? null, label: b.label ?? null }))
      .catch(() => !cancelled && setResolved({ key: selKey, street: null, label: null }));
    return () => {
      cancelled = true;
    };
  }, [selKey, presetStreet, center.lat, center.lng]);

  const street = presetStreet !== undefined ? presetStreet : resolved?.key === selKey ? resolved.street : undefined;
  const label = selection.kind === "place" ? (selection.label ?? (resolved?.key === selKey ? resolved.label : null)) : null;
  const radius = selection.kind === "place" ? (selection.radius ?? 200) : 150;

  const streetList = useMemo(() => {
    const key = streetKey(street);
    if (!key) return [];
    // Same street name within a few km (so "Vilniaus g." in another town doesn't count).
    return pool.filter((a) => streetKey(a.street) === key && distance(a.lat, a.lng, center.lat, center.lng) < 6000);
  }, [pool, street, center.lat, center.lng]);
  const radiusList = useMemo(
    () => pool.filter((a) => Math.abs(a.lat - center.lat) < 0.01 && distance(a.lat, a.lng, center.lat, center.lng) <= radius),
    [pool, center.lat, center.lng, radius],
  );

  const muniName = (code: string | null) => {
    const m = stats?.municipalities.find((x) => x.code === code);
    return m ? shortMuni(m.name) : null;
  };

  return (
    <div className="space-y-5">
      <button type="button" onClick={onClose} className="text-sm text-[var(--muted)] hover:text-[var(--ink)]">
        ← Atgal į filtrus
      </button>

      {selection.kind === "accident" && <AccidentCard a={selection.a} muni={muniName(selection.a.muni)} />}

      {selection.kind === "place" && (
        <div>
          <div className="text-[11px] tracking-[0.12em] text-[var(--muted)] uppercase">Pasirinkta vieta</div>
          <h2 className="mt-1 text-lg leading-tight font-semibold">{street ?? (street === undefined ? "Ieškoma gatvė…" : "Gatvė nenustatyta")}</h2>
          {label && <p className="mt-0.5 text-xs text-[var(--muted)]">{label}</p>}
        </div>
      )}

      {street && <StatsBlock title={`Visa gatvė: ${street}`} list={streetList} onShowAccident={onShowAccident} />}
      <StatsBlock title={`${radius} m spinduliu`} list={radiusList} onShowAccident={onShowAccident} />

      <section>
        <h4 className="mb-1 text-sm font-semibold">Vartotojų pranešimai šalia</h4>
        {nearbyReports.length ? (
          <ul className="space-y-1 text-sm">
            {nearbyReports.map((r) => (
              <li key={r.id} className="flex justify-between">
                <span>
                  {reportCategory(r.category).icon} {reportCategory(r.category).label}
                </span>
                <span className="text-[var(--muted)]">{r.votes} bals.</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-[var(--muted)]">250 m spinduliu pranešimų nėra.</p>
        )}
      </section>
      <p className="text-[11px] text-[var(--muted)]">
        Statistika skaičiuojama pagal pasirinktą laikotarpį ir kategoriją, įtraukiant visus sunkumo lygius.
      </p>
    </div>
  );
}

function AccidentCard({ a, muni }: { a: Accident; muni: string | null }) {
  const tags = [
    a.flags & FLAG.BIKE && "🚲 Dviratis",
    a.flags & FLAG.PEDESTRIAN && "🚶 Pėsčiasis",
    a.flags & FLAG.SCOOTER && "🛴 Paspirtukas",
    a.flags & FLAG.MOTO && "🏍️ Motociklas / mopedas",
    a.flags & FLAG.DRUNK && "🍺 Neblaivus kaltininkas",
    a.flags & FLAG.CHILD && "🧒 Nukentėjo vaikas",
    a.flags & FLAG.CROSSING && "🚸 Perėja",
    a.flags & FLAG.BUS_STOP && "🚏 Stotelė",
    a.flags & FLAG.FLED && "🏃 Pasišalino iš vietos",
    a.flags & FLAG.TRUCK && "🚛 Sunkvežimis",
  ].filter(Boolean) as string[];
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3">
      <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: SEVERITY[a.severity].color }} />
        {SEVERITY[a.severity].label} · {formatDate(a)}
      </div>
      <h2 className="mt-1 text-lg leading-tight font-semibold">{a.kind ?? "Eismo įvykis"}</h2>
      <p className="text-sm text-[var(--muted)]">{[a.street, muni].filter(Boolean).join(", ") || "Vieta nenurodyta"}</p>
      <div className="mt-2 flex gap-4 text-sm">
        <span>
          Žuvo: <b>{a.killed}</b>
        </span>
        <span>
          Sužeista: <b>{a.injured}</b>
        </span>
      </div>
      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {tags.map((t) => (
            <span key={t} className="rounded-full bg-[var(--chip)] px-2 py-0.5 text-xs">
              {t}
            </span>
          ))}
        </div>
      )}
      <p className="mt-2 text-[11px] text-[var(--muted)]">Registro Nr. {a.id}</p>
    </div>
  );
}

// ---------------------------------------------------------------- report form

export function ReportPanel({
  draft,
  onDraft,
  voterId,
  onDone,
  onClose,
}: {
  draft: { lat: number; lng: number } | null;
  onDraft: (lat: number, lng: number) => void;
  voterId: () => string;
  onDone: (r: Report) => void;
  onClose: () => void;
}) {
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  async function submit() {
    if (!draft || !category) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json", "x-voter-id": voterId() },
        body: JSON.stringify({ ...draft, category, note }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Nepavyko");
      const r = body.report as Report;
      onDone(r);
      setMessage({
        ok: true,
        text: body.alreadyVoted
          ? "Jūs jau esate pažymėję šią vietą – balsas užskaitytas anksčiau."
          : body.merged
            ? `Šią vietą jau buvo pažymėję kiti – jūsų balsas pridėtas! Iš viso: ${r.votes}.`
            : "Ačiū! Vieta pažymėta – kiti dabar gali už ją balsuoti.",
      });
      setNote("");
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[11px] tracking-[0.12em] text-[var(--muted)] uppercase">Naujas pranešimas</div>
          <h2 className="text-lg font-semibold">Pažymėkite pavojingą vietą</h2>
        </div>
        <button type="button" onClick={onClose} className="text-sm text-[var(--muted)] hover:text-[var(--ink)]">
          ✕
        </button>
      </div>

      <ol className="space-y-4 text-sm">
        <li>
          <div className="mb-1 font-medium">1. Vieta</div>
          {draft ? (
            <p className="rounded-lg bg-[var(--bg)] px-3 py-2 text-xs text-[var(--muted)]">
              📍 {draft.lat.toFixed(5)}, {draft.lng.toFixed(5)} — žymeklį galite tempti.
            </p>
          ) : (
            <p className="text-xs text-[var(--muted)]">Spustelėkite žemėlapyje arba susiraskite adresą:</p>
          )}
          <div className="mt-2">
            <AddressSearch placeholder="Adresas, pvz. Ukmergės g. 1, Vilnius" onPick={(p) => onDraft(p.lat, p.lng)} />
          </div>
        </li>
        <li>
          <div className="mb-1 font-medium">2. Pavojaus kategorija</div>
          <div className="grid grid-cols-2 gap-1.5">
            {REPORT_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={category === c.id}
                onClick={() => {
                  setCategory(c.id);
                  noteRef.current?.focus();
                }}
                className={`flex items-center gap-2 rounded-lg border px-2 py-2 text-left text-xs transition ${
                  category === c.id ? "border-[var(--accent)] bg-[var(--accent)]/15" : "border-[var(--line)] hover:border-[var(--muted)]"
                }`}
              >
                <span className="ep-report-mini" style={{ ["--c" as string]: c.color }}>
                  {c.icon}
                </span>
                {c.label}
              </button>
            ))}
          </div>
        </li>
        <li>
          <div className="mb-1 font-medium">
            3. Komentaras <span className="font-normal text-[var(--muted)]">(nebūtina)</span>
          </div>
          <textarea
            ref={noteRef}
            value={note}
            maxLength={280}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Pvz. vakarais automobiliai lekia 80 km/h, nėra šviesoforo"
            className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
          />
        </li>
      </ol>

      <button
        type="button"
        disabled={!draft || !category || busy}
        onClick={submit}
        className="w-full rounded-lg bg-[var(--accent)] py-2.5 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "Siunčiama…" : "Pažymėti vietą"}
      </button>
      {message && (
        <p className={`rounded-lg px-3 py-2 text-sm ${message.ok ? "bg-emerald-500/15 text-emerald-200" : "bg-rose-500/15 text-rose-200"}`}>
          {message.text}
        </p>
      )}
      <p className="text-[11px] text-[var(--muted)]">
        Jei per {MERGE_RADIUS_M} m jau yra tos pačios kategorijos žyma, jūsų pranešimas skaičiuojamas kaip balsas už ją. Vienas žmogus – vienas balsas.
      </p>
    </div>
  );
}
