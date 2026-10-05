"use client";

import { useMemo } from "react";
import { MONTHS, nf, type Accident } from "@/lib/data";

type State = { month: number; playing: boolean } | null;

const monthLabel = (idx: number) => `${2020 + Math.floor(idx / 12)} m. ${MONTHS[idx % 12].toLowerCase()}`;

/**
 * "Eismo įvykių laiko juosta": play through the selected years month by month.
 * The histogram behind the slider shows how many accidents each month had.
 */
export function Timeline({
  accidents,
  range,
  state,
  onChange,
  shownCount,
}: {
  accidents: Accident[];
  range: readonly [number, number];
  state: State;
  onChange: (s: State | ((s: State) => State)) => void;
  shownCount: number;
}) {
  const [from, to] = range;
  const months = useMemo(() => {
    const counts = new Array(to - from + 1).fill(0);
    for (const a of accidents) {
      const i = a.monthIndex - from;
      if (i >= 0 && i < counts.length) counts[i]++;
    }
    return counts;
  }, [accidents, from, to]);
  const max = Math.max(1, ...months);
  const current = state ? Math.min(Math.max(state.month, from), to) : null;

  const play = () => {
    if (!state) return onChange({ month: from, playing: true });
    if (state.month >= to) return onChange({ month: from, playing: true });
    onChange({ ...state, playing: !state.playing });
  };

  return (
    <div className="absolute right-3 bottom-3 left-3 z-[1000] rounded-2xl border border-[var(--line)] bg-[var(--panel)]/95 px-3 py-2 shadow-2xl backdrop-blur sm:right-auto sm:left-1/2 sm:w-[min(760px,calc(100%-2rem))] sm:-translate-x-1/2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={play}
          aria-label={state?.playing ? "Pauzė" : "Paleisti laiko juostą"}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-lg text-slate-950 shadow hover:brightness-110"
        >
          {state?.playing ? "❚❚" : "▶"}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="font-semibold text-[var(--ink)]">
              {current != null ? monthLabel(current) : "Laiko juosta"}
            </span>
            <span className="text-[var(--muted)] tabular-nums">
              {current != null ? `${nf.format(shownCount)} įvykiai šį mėnesį` : `${nf.format(shownCount)} įvykių · paspauskite ▶`}
            </span>
          </div>
          {/* Histogram doubles as a scrubber */}
          <div className="relative mt-1 flex h-8 items-end gap-px">
            {months.map((n, i) => {
              const idx = from + i;
              const active = current != null && idx === current;
              const past = current != null && idx < current;
              return (
                <button
                  key={idx}
                  type="button"
                  title={`${monthLabel(idx)}: ${nf.format(n)}`}
                  onClick={() => onChange({ month: idx, playing: false })}
                  className="flex h-full flex-1 items-end"
                >
                  <span
                    className="block w-full rounded-t-[2px]"
                    style={{
                      height: `${Math.max(6, (n / max) * 100)}%`,
                      background: active
                        ? "var(--accent)"
                        : past
                          ? "color-mix(in oklab, var(--accent) 45%, transparent)"
                          : "color-mix(in oklab, var(--muted) 35%, transparent)",
                    }}
                  />
                </button>
              );
            })}
          </div>
          <div className="mt-0.5 flex justify-between text-[10px] text-[var(--muted)]">
            {Array.from({ length: Math.floor((to - from + 1) / 12) }, (_, i) => (
              <span key={i}>{2020 + Math.floor(from / 12) + i}</span>
            ))}
          </div>
        </div>

        {state && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="shrink-0 rounded-full border border-[var(--line)] px-2.5 py-1 text-xs text-[var(--muted)] hover:text-[var(--ink)]"
            title="Rodyti visą laikotarpį"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
