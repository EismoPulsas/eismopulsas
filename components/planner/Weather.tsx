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

/** Compact map badge; forecast details stay outside the travel options. */
export function WeatherChip({ w }: { w: TripWeather }) {
  const risk = RISK[w.risk];
  const readings = [
    w.temp !== null ? `${num(w.temp)}°` : null,
    w.rainChance !== null ? `Lietus ${w.rainChance} %` : null,
  ].filter(Boolean).join(" · ") || w.label;
  return (
    <details className="group relative">
      <summary
        className="flex h-10 w-fit max-w-full cursor-pointer list-none items-center gap-1.5 rounded-full border bg-[var(--panel)]/95 px-3.5 text-xs font-semibold shadow-lg backdrop-blur focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--marking)] [&::-webkit-details-marker]:hidden"
        style={{ borderColor: `color-mix(in oklab, ${risk.color} 60%, var(--line))`, color: risk.color }}
        aria-label={`Orai: ${readings}. ${risk.text}. Išsami prognozė`}
        title={`${w.label}${w.place ? ` · ${w.place}` : ""}. ${risk.text}`}
      >
        <span className="shrink-0"><WeatherIcon w={w} size={16} /></span>
        <span className="tnum truncate text-[var(--ink)]">{readings}</span>
        {w.risk !== "ok" && <span className={`signal shrink-0 ${w.risk === "caution" ? "wait" : "stop"}`} aria-hidden />}
      </summary>
      <div className="absolute top-[var(--map-popover-offset,52px)] left-0 w-[min(320px,calc(100vw-24px))] rounded-2xl shadow-xl">
        <WeatherCard w={w} />
      </div>
    </details>
  );
}
