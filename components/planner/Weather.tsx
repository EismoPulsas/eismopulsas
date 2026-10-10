"use client";

import type { TripWeather } from "@/lib/plan-types";
import { CloudIcon, FogIcon, RainIcon, SnowIcon, SunIcon } from "./icons";

const RISK = {
  ok: { color: "var(--go)", text: "Tinkami orai bet kuriam keliavimo būdui" },
  caution: { color: "var(--wait)", text: "Dviračiu ar paspirtuku – atsargiai" },
  bad: { color: "var(--stop)", text: "Dviračio ir paspirtuko nerekomenduojame" },
} as const;

export function WeatherIcon({ w, size = 20 }: { w: TripWeather; size?: number }) {
  const c = w.condition ?? "";
  if (/snow|sleet|hail|freezing/.test(c)) return <SnowIcon size={size} />;
  if (/rain|thunder/.test(c) || (w.rainChance ?? 0) >= 50) return <RainIcon size={size} />;
  if (c === "fog") return <FogIcon size={size} />;
  if (c === "clear" || c === "partly-cloudy") return <SunIcon size={size} />;
  return <CloudIcon size={size} />;
}

const num = (v: number) => String(Math.round(v * 10) / 10).replace(".", ",");

/** The forecast for the start of the trip and what it means for riding. */
export function WeatherCard({ w }: { w: TripWeather }) {
  const risk = RISK[w.risk];
  return (
    <section aria-label="Orai" className="flex items-center gap-3 rounded-2xl border bg-[var(--panel)] p-3" style={{ borderColor: `color-mix(in oklab, ${risk.color} 55%, var(--line))` }}>
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ background: `color-mix(in oklab, ${risk.color} 18%, transparent)`, color: risk.color }}>
        <WeatherIcon w={w} size={24} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          {w.temp !== null && <span className="tnum font-display text-lg leading-none font-bold">{w.temp}°</span>}
          <span className="text-sm font-semibold">{w.label}</span>
        </div>
        <div className="tnum mt-0.5 flex flex-wrap gap-x-2.5 text-xs text-[var(--muted)]">
          {w.rainChance !== null && <span>Lietaus tikimybė {w.rainChance} %</span>}
          {w.precip > 0 && <span>{num(w.precip)} mm/val.</span>}
          {w.wind !== null && <span>Vėjas {Math.round(w.wind)}{w.gust ? `–${Math.round(w.gust)}` : ""} m/s</span>}
        </div>
        <p className="mt-1 text-xs font-medium" style={{ color: risk.color }}>
          <span className={`signal mr-1.5 align-middle ${w.risk === "ok" ? "go" : w.risk === "caution" ? "wait" : "stop"}`} />
          {risk.text}
          {w.reasons.length > 0 && <span className="font-normal text-[var(--muted)]"> – {w.reasons.join(", ")}</span>}
        </p>
      </div>
    </section>
  );
}

/** Compact chip for the map. */
export function WeatherChip({ w }: { w: TripWeather }) {
  const risk = RISK[w.risk];
  return (
    <div
      className="flex items-center gap-1.5 rounded-full border bg-[var(--bg)]/90 px-2.5 py-1.5 text-xs font-semibold shadow-lg backdrop-blur"
      style={{ borderColor: `color-mix(in oklab, ${risk.color} 60%, var(--line))`, color: risk.color }}
      title={`${w.label}${w.place ? ` · ${w.place}` : ""}`}
    >
      <WeatherIcon w={w} size={16} />
      <span className="tnum text-[var(--ink)]">
        {w.temp !== null ? `${w.temp}°` : ""}
        {w.rainChance !== null ? ` · ${w.rainChance} %` : ""}
      </span>
    </div>
  );
}
