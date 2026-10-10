"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { LatLng } from "@/lib/geo";
import { BusIcon, LocateIcon, PinIcon } from "./icons";

export type Place = { pos: LatLng; label: string };

type Hit = { lat: number; lng: number; label: string; sub: string; kind: "address" | "street" | "place" | "poi" | "stop" };
type Status = "idle" | "loading" | "done" | "error";

/** "Vilniaus universitetas" + "Saulėtekio al. 9, Vilnius" -> "Vilniaus universitetas, Vilnius" */
export function placeLabel(label: string, sub: string | null | undefined): string {
  const town = sub?.split(",").pop()?.trim();
  return town && town !== label && !label.includes(town) ? `${label}, ${town}` : label;
}

export function PlaceInput({
  letter,
  color,
  value,
  placeholder,
  active,
  near,
  onChange,
  onPickOnMap,
  onLocate,
}: {
  letter: string;
  color: string;
  value: Place | null;
  placeholder: string;
  active: boolean;
  /** Results near this point rank first (usually the other end of the trip). */
  near: LatLng | null;
  onChange: (p: Place | null) => void;
  onPickOnMap: () => void;
  onLocate?: () => void;
}) {
  const [text, setText] = useState(value?.label ?? "");
  const [hits, setHits] = useState<Hit[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const [query, setQuery] = useState<string | null>(null);
  const listId = useId();
  const nearRef = useRef(near);
  useEffect(() => {
    nearRef.current = near;
  }, [near]);

  // Follow outside changes (map click, drag, swap, examples).
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setText(value?.label ?? "");
    setQuery(null);
    setOpen(false);
  }

  // `query` is only set by typing, so programmatic text changes never search.
  useEffect(() => {
    if (query === null || query.trim().length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      setStatus("loading");
      setOpen(true);
      const n = nearRef.current;
      const url = `/api/geocode?q=${encodeURIComponent(query.trim())}${n ? `&near=${n[0].toFixed(3)},${n[1].toFixed(3)}` : ""}`;
      fetch(url, { signal: ctrl.signal })
        .then(async (r) => {
          const d = await r.json();
          if (!r.ok || !Array.isArray(d)) throw new Error(d?.error ?? "error");
          setHits(d);
          setCursor(d.length ? 0 : -1);
          setStatus("done");
        })
        .catch((e) => {
          if (e.name !== "AbortError") setStatus("error");
        });
    }, 280);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  const choose = (h: Hit) => {
    setOpen(false);
    setQuery(null);
    onChange({ pos: [h.lat, h.lng], label: h.kind === "stop" ? `${h.label} (stotelė)` : placeLabel(h.label, h.sub) });
  };

  const showList = open && query !== null && query.trim().length >= 2;

  return (
    <div className="relative flex items-center gap-2">
      <span
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-white font-display text-sm font-extrabold text-white"
        style={{ background: color }}
        aria-hidden
      >
        {letter}
      </span>
      <div className="relative min-w-0 flex-1">
        <input
          className="field pr-[4.5rem] text-base lg:text-sm"
          style={active ? { borderColor: "var(--marking)" } : undefined}
          value={text}
          placeholder={placeholder}
          aria-label={placeholder}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          enterKeyHint="search"
          onChange={(e) => {
            setText(e.target.value);
            setQuery(e.target.value);
            if (e.target.value.trim().length < 2) {
              setHits([]);
              setStatus("idle");
            }
            if (!e.target.value) onChange(null);
          }}
          onFocus={(e) => {
            e.target.select();
            if (hits.length && query !== null) setOpen(true);
          }}
          onBlur={() => setTimeout(() => setOpen(false), 180)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setCursor((c) => Math.min(hits.length - 1, c + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setCursor((c) => Math.max(0, c - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (hits.length) choose(hits[Math.max(0, cursor)]);
            } else if (e.key === "Escape") setOpen(false);
          }}
        />
        <div className="absolute inset-y-0 right-1 flex items-center">
          {onLocate && (
            <button type="button" onClick={onLocate} className="grid h-9 w-9 place-items-center rounded-md text-[var(--muted)] hover:bg-[var(--line)] hover:text-[var(--ink)]" title="Mano vieta" aria-label="Naudoti mano vietą">
              <LocateIcon size={17} />
            </button>
          )}
          <button
            type="button"
            onClick={onPickOnMap}
            className={`grid h-9 w-9 place-items-center rounded-md hover:bg-[var(--line)] hover:text-[var(--ink)] ${active ? "text-[var(--marking)]" : "text-[var(--muted)]"}`}
            title="Pažymėti žemėlapyje"
            aria-label="Pažymėti žemėlapyje"
            aria-pressed={active}
          >
            <PinIcon size={17} />
          </button>
        </div>
        {showList && (
          <ul
            id={listId}
            role="listbox"
            className="absolute top-full right-0 left-0 z-[1200] mt-1 max-h-[min(60dvh,380px)] overflow-y-auto overscroll-contain rounded-xl border border-[var(--line)] bg-[var(--panel)] shadow-2xl"
          >
            {status === "loading" && !hits.length && <li className="px-3 py-3 text-sm text-[var(--muted)]">Ieškoma…</li>}
            {status === "done" && !hits.length && <li className="px-3 py-3 text-sm text-[var(--muted)]">Nieko nerasta. Pabandykite kitaip arba pažymėkite žemėlapyje.</li>}
            {status === "error" && <li className="px-3 py-3 text-sm text-[var(--wait)]">Paieška laikinai neveikia – pažymėkite vietą žemėlapyje.</li>}
            {hits.map((h, i) => (
              <li key={`${h.lat},${h.lng},${i}`} role="option" aria-selected={i === cursor}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(h)}
                  className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left ${i === cursor ? "bg-[var(--chip)]" : "hover:bg-[var(--chip)]"} ${status === "loading" ? "opacity-60" : ""}`}
                >
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-md ${h.kind === "stop" ? "bg-[var(--sign-blue)] text-white" : "bg-[var(--chip)] text-[var(--muted)]"}`}>
                    {h.kind === "stop" ? <BusIcon size={15} /> : <PinIcon size={15} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{h.label}</span>
                    {h.sub && <span className="block truncate text-xs text-[var(--muted)]">{h.sub}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
