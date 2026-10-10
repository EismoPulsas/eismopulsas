"use client";

import { useSyncExternalStore } from "react";
import { ClockIcon } from "./icons";

/* ------------------------------------------------------------------ navigation */

/** Hands the chosen way to a navigation app: Waze for the drive (to where the car is left), Google Maps for the rest. */
export function NavButton({ nav, className = "" }: { nav: { href: string; app: "Waze" | "Google Maps" } | null; className?: string }) {
  if (!nav) return null;
  return (
    <a
      href={nav.href}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center justify-center gap-2.5 rounded-2xl bg-[var(--marking)] py-4 text-base font-semibold text-white shadow-[0_8px_20px_rgba(5,150,105,0.3)] transition hover:brightness-110 ${className}`}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 11l19-9-9 19-2-8-8-2z" />
      </svg>
      Pradėti navigaciją
      <span className="text-sm font-normal opacity-80">· {nav.app}</span>
    </a>
  );
}

/* ------------------------------------------------------------------ header bits */

const subscribeMinute = (cb: () => void) => {
  const t = setInterval(cb, 15000);
  return () => clearInterval(t);
};
const nowHHMM = () => new Intl.DateTimeFormat("lt-LT", { timeZone: "Europe/Vilnius", hour: "2-digit", minute: "2-digit" }).format(new Date());

/** Current Vilnius time; empty during server render so hydration matches. */
export function NowClock({ departAt }: { departAt: string | null }) {
  const now = useSyncExternalStore(subscribeMinute, nowHHMM, () => "");
  const shown = departAt ? departAt.slice(11, 16) : now;
  if (!shown) return null;
  return (
    <span className="flex items-center gap-1.5 font-mono text-sm text-[var(--muted)]">
      <ClockIcon size={14} />
      {shown}
    </span>
  );
}

export function LiveStatus({ departAt }: { departAt: string | null }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-xs whitespace-nowrap text-[var(--muted)]">
      <span className={`h-2 w-2 shrink-0 rounded-full ${departAt ? "bg-[var(--wait)]" : "bg-[var(--go)]"}`} />
      {/* The one part of the header that may shrink (with "…") when space runs out. */}
      <span className="min-w-0 truncate">
        {departAt ? (
          <>
            Planuojama: <b className="text-[var(--ink)]">{departAt.replace("T", " ").slice(5)}</b>
          </>
        ) : (
          <>
            Realiu laiku: <b className="text-[var(--marking)]">Aktyvu</b>
          </>
        )}
      </span>
    </span>
  );
}
