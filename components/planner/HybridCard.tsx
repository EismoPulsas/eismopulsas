"use client";

import { useState } from "react";
import type { HybridSummary } from "@/lib/metrics";
import { fmtStayHours, STAY_CHOICES, type StayEstimate } from "@/lib/stay";
import { ModeBadge } from "./icons";

// Car + second leg ("deriniai"): the name and icon trio (car · where the car stays · next
// vehicle) used by the combination card; the stages are drawn like any other option's.

const SECOND_LABEL = { transit: "autobusas", bikeshare: "Cyclocity", scooter: "paspirtukas" } as const;
const SECOND_MODE = { transit: "transit", bikeshare: "bikeshare", scooter: "scooter" } as const;

/** "P+R", "⚡" (the car charges there) or "P". */
function hubTag(h: HybridSummary): "P+R" | "⚡" | "P" {
  if (h.hybrid.hub.lot?.t.flat || h.hybrid.hub.lot?.access === "pr") return "P+R";
  if (h.parking.charge) return "⚡";
  return "P";
}

export function hybridTitle(h: HybridSummary): string {
  const s = h.hybrid.second;
  const tag = hubTag(h);
  const next =
    s.kind === "transit" && s.transit.legs.some((l) => l.kind === "ride" && l.route.type === 11) ? "troleibusas"
    : s.kind === "scooter" && s.scooter.source === "own" ? "savas paspirtukas"
    : SECOND_LABEL[s.kind];
  return `Auto + ${tag === "P+R" ? "P+R + " : tag === "⚡" ? "įkrovimas + " : ""}${next}`;
}

/** Car · P (or ⚡ / P+R) · next vehicle. */
export function HybridIcons({ h, size = 26 }: { h: HybridSummary; size?: number }) {
  const tag = hubTag(h);
  return (
    <span className="flex shrink-0 items-center gap-0.5" aria-hidden>
      <ModeBadge mode="car" size={size} />
      <span
        className="grid place-items-center rounded-[5px] font-display font-extrabold text-white"
        style={{ width: size * 0.8, height: size * 0.8, fontSize: tag === "P+R" ? size * 0.3 : size * 0.45, background: tag === "⚡" ? "#0e7490" : "var(--sign-blue)", boxShadow: "inset 0 0 0 1.5px rgba(255,255,255,.9)" }}
      >
        {tag}
      </span>
      <ModeBadge mode={SECOND_MODE[h.hybrid.second.kind]} size={size} />
    </span>
  );
}

/** How long the car will stand at B, as one quiet line; "keisti" reveals the choices. */
export function StayLine({ stay, onPick }: { stay: StayEstimate; onPick: (hours: number) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-sm">
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-[var(--sign-blue)] text-[11px] font-extrabold text-white" aria-hidden>
          P
        </span>
        <span className="min-w-0 flex-1 truncate">
          Automobilis stovės <b>~{fmtStayHours(stay.hours)}</b> <span className="text-[var(--muted)]">· {stay.reason}</span>
        </span>
        <button type="button" onClick={() => setOpen(!open)} className="shrink-0 text-xs font-semibold text-[var(--marking)]" aria-expanded={open}>
          {open ? "gerai" : "keisti"}
        </button>
      </div>
      {open && (
        <div className="seg">
          {STAY_CHOICES.map((c) => (
            <button
              key={c.hours}
              type="button"
              aria-pressed={Math.abs(stay.hours - c.hours) < 0.01}
              onClick={() => {
                onPick(c.hours);
                setOpen(false);
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
