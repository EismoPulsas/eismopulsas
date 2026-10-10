"use client";

import { useEffect, useRef, useState } from "react";

export type Snap = "peek" | "half" | "full";

const PEEK = 156; // px: handle + one row of results
const HANDLE = 28;

/** Viewport height, kept in sync with the on-screen keyboard and rotation. */
function useViewportHeight() {
  const [vh, setVh] = useState(800);
  useEffect(() => {
    const update = () => setVh(window.visualViewport?.height ?? window.innerHeight);
    update();
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, []);
  return vh;
}

export function sheetVisible(snap: Snap, vh: number, topInset = 0) {
  // Full height stops just below the floating search card.
  const full = Math.round(Math.min(vh * 0.9, vh - topInset - 8));
  return snap === "full" ? full : snap === "half" ? Math.round(vh * 0.52) : Math.min(PEEK, full);
}

/**
 * Phones: a sheet over the map that snaps to peek / half / full and is dragged by
 * its handle. Desktop (lg): an ordinary column, no transform.
 */
export function BottomSheet({
  snap,
  onSnap,
  onVisible,
  topInset = 0,
  children,
}: {
  snap: Snap;
  onSnap: (s: Snap) => void;
  /** Reports how many px of the screen the sheet covers (for map padding). */
  onVisible?: (px: number) => void;
  /** px from the top of the screen the sheet must not cover. */
  topInset?: number;
  children: React.ReactNode;
}) {
  const vh = useViewportHeight();
  const height = sheetVisible("full", vh, topInset);
  const [drag, setDrag] = useState<number | null>(null); // visible px while dragging
  const start = useRef<{ y: number; visible: number; t: number } | null>(null);
  const visible = drag ?? sheetVisible(snap, vh, topInset);

  useEffect(() => {
    onVisible?.(sheetVisible(snap, vh, topInset));
  }, [snap, vh, topInset, onVisible]);

  const onPointerDown = (e: React.PointerEvent) => {
    start.current = { y: e.clientY, visible, t: performance.now() };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    const v = start.current.visible + (start.current.y - e.clientY);
    setDrag(Math.max(PEEK * 0.7, Math.min(height, v)));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    const moved = s.y - e.clientY;
    if (Math.abs(moved) < 6) {
      // A tap on the handle toggles between half and full / peek.
      onSnap(snap === "full" ? "half" : snap === "half" ? "full" : "half");
      setDrag(null);
      return;
    }
    // Project a little along the flick so fast swipes jump a level.
    const velocity = moved / Math.max(1, performance.now() - s.t);
    const target = s.visible + moved + velocity * 180;
    const options: Snap[] = ["peek", "half", "full"];
    const dist = (o: Snap) => Math.abs(sheetVisible(o, vh, topInset) - target);
    const next = options.reduce((a, b) => (dist(b) < dist(a) ? b : a));
    onSnap(next);
    setDrag(null);
  };

  return (
    <section
      aria-label="Rezultatai"
      className="sheet pointer-events-auto fixed inset-x-0 bottom-0 z-[1050] flex flex-col rounded-t-3xl border-t border-[var(--line)] shadow-[0_-12px_40px_rgba(0,0,0,0.55)] lg:static lg:z-auto lg:flex-1 lg:rounded-none lg:border-0 lg:shadow-none"
      style={
        {
          "--sheet-h": `${height}px`,
          "--sheet-y": `${height - visible}px`,
          "--sheet-body": `${visible - HANDLE}px`,
          transition: drag === null ? "transform 260ms cubic-bezier(.2,.8,.2,1)" : "none",
        } as React.CSSProperties
      }
    >
      <div
        className="flex h-7 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing lg:hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="button"
        aria-label={snap === "full" ? "Sumažinti rezultatus" : "Išskleisti rezultatus"}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSnap(snap === "full" ? "half" : "full");
          }
        }}
      >
        <span className="h-1.5 w-11 rounded-full bg-[var(--muted)]/60" />
      </div>
      <div className="sheet-body min-h-0 overflow-y-auto overscroll-contain lg:overflow-visible">{children}</div>
    </section>
  );
}
