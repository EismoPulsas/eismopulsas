"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { nf } from "@/lib/data";
import { shortMuni, type Stats } from "@/lib/stats";

// ---------------------------------------------------------------- primitives

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-[var(--line)] bg-[var(--bg)] p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={`rounded-md px-3 py-1.5 text-sm transition ${
            value === o.id ? "bg-[var(--chip)] font-medium text-[var(--ink)]" : "text-[var(--muted)] hover:text-[var(--ink)]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

type Row = { key: string; label: string; value: number; display: string; detail?: string; highlight?: boolean };

/** Horizontal bar list: label · bar · value at the tip. One series, so no legend. */
export function HBars({ rows, limit, color = "var(--accent)" }: { rows: Row[]; limit?: number; color?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const shown = limit && !expanded ? rows.slice(0, limit) : rows;
  const max = Math.max(1e-9, ...rows.map((r) => r.value));
  return (
    <div>
      <ol className="space-y-[3px]">
        {shown.map((r, i) => (
          <li
            key={r.key}
            className="group grid grid-cols-[1.75rem_minmax(6rem,11rem)_1fr] items-center gap-2 rounded-md px-1 py-0.5 text-sm hover:bg-[var(--chip)] sm:grid-cols-[2rem_13rem_1fr]"
            onMouseEnter={() => setHover(r.key)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="text-right text-xs text-[var(--muted)] tabular-nums">{i + 1}.</span>
            <span className={`truncate ${r.highlight ? "font-semibold" : ""}`} title={r.label}>
              {r.label}
            </span>
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-[14px] rounded-r-[4px] transition-[width] duration-500"
                style={{
                  width: `${(r.value / max) * 82}%`,
                  minWidth: 2,
                  background: r.highlight ? "#ff4d5e" : color,
                  opacity: hover && hover !== r.key ? 0.55 : 1,
                }}
              />
              <span className="shrink-0 text-xs tabular-nums">{r.display}</span>
              {hover === r.key && r.detail && <span className="truncate text-xs text-[var(--muted)]">{r.detail}</span>}
            </span>
          </li>
        ))}
      </ol>
      {limit && rows.length > limit && (
        <button onClick={() => setExpanded((e) => !e)} className="mt-2 text-sm text-[var(--accent)] hover:underline">
          {expanded ? "Rodyti mažiau" : `Rodyti visas (${rows.length})`}
        </button>
      )}
    </div>
  );
}

/** Vertical columns with hover tooltip; value labels only on the max. */
export function Columns({ items, height = 200, format = (v: number) => nf.format(v) }: { items: { label: string; value: number; detail?: string }[]; height?: number; format?: (v: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1e-9, ...items.map((i) => i.value));
  const maxIdx = items.findIndex((i) => i.value === max);
  return (
    <div>
      <div className="relative flex items-end gap-1 border-b border-[var(--line)] sm:gap-2" style={{ height }} onMouseLeave={() => setHover(null)}>
        {items.map((it, i) => (
          <div key={it.label} className="relative flex h-full flex-1 items-end justify-center" onMouseEnter={() => setHover(i)}>
            {(i === maxIdx || i === hover) && (
              <span className="absolute -translate-y-1 text-[11px] whitespace-nowrap tabular-nums" style={{ bottom: `${(it.value / max) * 100}%` }}>
                {format(it.value)}
              </span>
            )}
            <div
              className="w-full max-w-[24px] rounded-t-[4px] transition-[height] duration-500"
              style={{ height: `${(it.value / max) * 100}%`, background: "var(--accent)", opacity: hover != null && hover !== i ? 0.5 : 1 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1 sm:gap-2">
        {items.map((it) => (
          <span key={it.label} className="flex-1 text-center text-[10px] text-[var(--muted)] sm:text-[11px]">
            {it.label}
          </span>
        ))}
      </div>
      <p className="mt-2 h-4 text-xs text-[var(--muted)]">{hover != null ? items[hover].detail ?? "" : ""}</p>
    </div>
  );
}

// ---------------------------------------------------------------- sections

export function MakesChart({ makes }: { makes: Stats["makes"] }) {
  const [mode, setMode] = useState<"rate" | "abs">("rate");
  const [who, setWho] = useState<"all" | "culprit">("culprit");
  const rows = useMemo(() => {
    return makes
      .filter((m) => mode === "abs" || (m.registered && m.registered > 3000))
      .map((m) => {
        const n = who === "all" ? m.all : m.culprit;
        const rate = m.registered ? (n / m.registered) * 1000 : 0;
        return {
          key: m.make,
          label: m.make,
          value: mode === "abs" ? n : rate,
          display: mode === "abs" ? nf.format(n) : rate.toFixed(1),
          detail: `${nf.format(n)} įv. · ${m.registered ? nf.format(m.registered) : "?"} reg. numerių`,
          highlight: m.make === "BMW",
        };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 20);
  }, [makes, mode, who]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Segmented
          label="Skaičiavimas"
          value={mode}
          onChange={setMode}
          options={[
            { id: "rate", label: "1 000 registruotų" },
            { id: "abs", label: "Absoliučiai" },
          ]}
        />
        <Segmented
          label="Vaidmuo"
          value={who}
          onChange={setWho}
          options={[
            { id: "culprit", label: "Kaltininkai" },
            { id: "all", label: "Visi dalyviai" },
          ]}
        />
      </div>
      <HBars rows={rows} />
      <p className="text-xs text-[var(--muted)]">
        {mode === "rate"
          ? "Lengvųjų automobilių dalyvavimai eismo įvykiuose 2021–2025 m. tūkstančiui Regitros išduotų tos markės numerių (nuo 2005 m.). Markės su mažiau nei 3 000 numerių neįtrauktos."
          : "Lengvųjų automobilių dalyvavimai eismo įvykiuose 2021–2025 m."}{" "}
        BMW pažymėtas raudonai – kad nereikėtų ieškoti.
      </p>
    </div>
  );
}

export function MunicipalityRanking({ stats }: { stats: Stats }) {
  const [mode, setMode] = useState<"rate" | "abs">("rate");
  const [metric, setMetric] = useState<"counted" | "killed" | "all" | "bike">("counted");
  const [year, setYear] = useState<string>("all");
  const years = stats.years.map(String);
  const rows = useMemo(() => {
    const ys = year === "all" ? years : [year];
    return stats.municipalities
      .map((m) => {
        const n = ys.reduce((s, y) => s + ((m.years[y]?.[metric] as number) ?? 0), 0);
        const pop = ys.reduce((s, y) => s + (m.population[y] ?? 0), 0) / ys.length;
        const rate = pop ? (n / ys.length / pop) * 10000 : 0;
        return {
          key: m.code,
          label: shortMuni(m.name),
          value: mode === "abs" ? n : rate,
          display: mode === "abs" ? nf.format(n) : rate.toFixed(metric === "killed" ? 2 : 1),
          detail: `${nf.format(n)} · ${nf.format(Math.round(pop))} gyv.`,
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [stats, mode, metric, year, years]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Segmented
          label="Skaičiavimas"
          value={mode}
          onChange={setMode}
          options={[
            { id: "rate", label: "10 000 gyv. / metus" },
            { id: "abs", label: "Absoliučiai" },
          ]}
        />
        <select
          aria-label="Rodiklis"
          value={metric}
          onChange={(e) => setMetric(e.target.value as typeof metric)}
          className="rounded-lg border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-sm"
        >
          <option value="counted">Įvykiai su nukentėjusiais</option>
          <option value="killed">Žuvusieji</option>
          <option value="all">Visi įvykiai (ir tik žala)</option>
          <option value="bike">Įvykiai su dviratininkais</option>
        </select>
        <select
          aria-label="Metai"
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className="rounded-lg border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-sm"
        >
          <option value="all">2021–2025</option>
          {years.map((y) => (
            <option key={y}>{y}</option>
          ))}
        </select>
      </div>
      <HBars rows={rows} limit={15} />
    </div>
  );
}

export function AgeChart({ ages }: { ages: Stats["ages"] }) {
  const [mode, setMode] = useState<"rate" | "abs">("rate");
  const [what, setWhat] = useState<"culprits" | "drunk">("culprits");
  const items = ages
    .filter((a) => a.label !== "<18")
    .map((a) => {
      const n = a[what];
      // Five years of data -> per year per 1 000 residents of that age.
      const rate = a.population ? (n / 5 / a.population) * 1000 : 0;
      return {
        label: a.label,
        value: mode === "abs" ? n : rate,
        detail: `${a.label} m.: ${nf.format(n)} ${what === "culprits" ? "kaltininkų" : "neblaivių kaltininkų"} · ${rate.toFixed(2)} / 1 000 gyv. per metus · ${nf.format(a.population)} gyventojų`,
      };
    });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Segmented
          label="Skaičiavimas"
          value={mode}
          onChange={setMode}
          options={[
            { id: "rate", label: "1 000 to amžiaus gyv. / metus" },
            { id: "abs", label: "Absoliučiai" },
          ]}
        />
        <Segmented
          label="Kas"
          value={what}
          onChange={setWhat}
          options={[
            { id: "culprits", label: "Kaltininkai" },
            { id: "drunk", label: "Neblaivūs kaltininkai" },
          ]}
        />
      </div>
      <Columns items={items} format={(v) => (mode === "abs" ? nf.format(v) : v.toFixed(2))} />
      <p className="text-xs text-[var(--muted)]">
        Vairuotojai-kaltininkai pagal amžių (įskaitant dviračių, paspirtukų ir motociklų vairuotojus). Santykinis rodiklis
        dalijamas iš Lietuvos 2025 m. to amžiaus gyventojų skaičiaus, ne iš vairuotojo pažymėjimų turėtojų.
      </p>
    </div>
  );
}

const DAYS = ["Pr", "An", "Tr", "Kt", "Pn", "Št", "Sk"];
const HEAT = ["#14202b", "#123a45", "#11575c", "#13766f", "#1f9781", "#2ee6c8"];

export function HourWeekGrid({ grid }: { grid: number[][] }) {
  const max = Math.max(...grid.flat());
  const [hover, setHover] = useState<{ d: number; h: number } | null>(null);
  return (
    <div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[560px] grid-cols-[2rem_repeat(24,1fr)] gap-[2px] text-[10px]">
          <span />
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className="text-center text-[var(--muted)]">
              {h % 3 === 0 ? h : ""}
            </span>
          ))}
          {grid.map((row, d) => (
            <div key={d} className="contents">
              <span className="self-center text-[var(--muted)]">{DAYS[d]}</span>
              {row.map((v, h) => (
                <span
                  key={h}
                  onMouseEnter={() => setHover({ d, h })}
                  onMouseLeave={() => setHover(null)}
                  className="aspect-square rounded-[3px]"
                  style={{
                    background: HEAT[Math.min(HEAT.length - 1, Math.floor((v / max) * HEAT.length))],
                    outline: hover?.d === d && hover?.h === h ? "2px solid var(--ink)" : undefined,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted)]">
        <span>
          {hover
            ? `${DAYS[hover.d]}, ${hover.h}:00–${hover.h + 1}:00 – ${nf.format(grid[hover.d][hover.h])} įvykių`
            : "Užveskite pelę ant langelio"}
        </span>
        <span className="flex items-center gap-1">
          mažiau
          {HEAT.map((c) => (
            <span key={c} className="inline-block h-2.5 w-4 rounded-sm" style={{ background: c }} />
          ))}
          daugiau
        </span>
      </div>
    </div>
  );
}

/** Counts up when scrolled into view. */
export function Counter({ value, className }: { value: number; className?: string }) {
  const [shown, setShown] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / 1400);
        setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value]);
  return (
    <span ref={ref} className={className}>
      {nf.format(shown)}
    </span>
  );
}
