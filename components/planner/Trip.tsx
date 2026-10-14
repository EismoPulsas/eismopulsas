"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ClockIcon, InfoIcon, MenuIcon, RefreshIcon, UserIcon } from "./icons";

/* ------------------------------------------------------------------ navigation */

/** Hands the chosen way to a navigation app: Waze for the drive (to where the car is left), Google Maps for the rest. */
export function NavButton({ nav, className = "" }: { nav: { href: string; app: "Waze" | "Google Maps" } | null; className?: string }) {
  if (!nav) return null;
  return (
    <a
      href={nav.href}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center justify-center gap-2.5 rounded-2xl bg-[var(--marking)] py-3 text-[15px] font-semibold text-white lg:py-4 lg:text-base shadow-[0_8px_20px_rgba(5,150,105,0.3)] transition hover:brightness-110 ${className}`}
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

/** Re-asks for the driving time with the traffic as it is now. */
export function RefreshButton({ busy, onClick, className = "" }: { busy: boolean; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className={`tap grid shrink-0 place-items-center text-[var(--muted)] hover:text-[var(--ink)] disabled:opacity-50 ${className}`}
      title={busy ? "Atnaujinama…" : "Atnaujinti eismą"}
      aria-label="Atnaujinti eismą"
    >
      <RefreshIcon size={16} className={busy ? "animate-spin" : ""} />
    </button>
  );
}

/** The logo's three signal lights, small. */
const LogoMark = () => (
  <svg width="18" height="9" viewBox="0 0 38 18" aria-hidden>
    <rect x="0.5" y="0.5" width="37" height="17" rx="8.5" fill="#0a0b0e" />
    <circle cx="9" cy="9" r="4.2" fill="var(--stop)" />
    <circle cx="19" cy="9" r="4.2" fill="var(--wait)" />
    <circle cx="29" cy="9" r="4.2" fill="var(--go)" />
  </svg>
);

/** Phones: the profile, "how we count" and "about us" links behind one button, so the top card stays one line. */
export function MenuButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const item = "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-[var(--chip)]";
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label="Meniu"
        className={`tap grid h-9 w-9 place-items-center rounded-full transition ${open ? "bg-[var(--ink)] text-white" : "text-[var(--ink)] hover:bg-[var(--chip)]"}`}
      >
        <MenuIcon />
      </button>
      {open && (
        <nav aria-label="Meniu" className="pop-in absolute top-full right-0 z-[1300] mt-2 w-56 origin-top-right rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-1.5 shadow-[0_20px_50px_rgba(15,23,42,0.22)]">
          <Link href="/profilis" className={item}>
            <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--chip)] text-[var(--muted)]">
              <UserIcon size={17} />
            </span>
            Profilis
          </Link>
          <Link href="/apie" className={item}>
            <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--chip)] text-[var(--muted)]">
              <InfoIcon size={17} />
            </span>
            Kaip skaičiuojame
          </Link>
          <Link href="/apie-mus" className={item}>
            <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--accent-soft)] text-[var(--marking)]">
              <LogoMark />
            </span>
            Apie mus
          </Link>
        </nav>
      )}
    </div>
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
