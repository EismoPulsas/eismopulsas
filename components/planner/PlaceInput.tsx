"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { LatLng } from "@/lib/geo";
import { LocateIcon, PinIcon } from "./icons";

export type Place = { pos: LatLng; label: string };

type Hit = { lat: number; lng: number; label: string };

/** "Gedimino pr. 9, Senamiestis, Vilnius, …, Lietuva" -> "Gedimino pr. 9, Vilnius" */
export function shortLabel(label: string): string {
  const parts = label.split(",").map((s) => s.trim()).filter((s) => s && s !== "Lietuva" && !/^\d{5}$|^LT-?\d+/.test(s));
  if (parts.length <= 2) return parts.join(", ");
  // Keep the first part (name / street), plus the house number if split, plus the town.
  const head = /^\d+[a-zA-Z]?$/.test(parts[0]) ? `${parts[1]} ${parts[0]}` : parts[0];
  const town = parts.find((p, i) => i > 0 && /(Vilnius|Kaunas|Klaipėda|Šiauliai|Panevėžys|Alytus|miestas|mstl\.|kaimas|k\.)$/.test(p)) ?? parts.at(-3) ?? parts[1];
  return head === town ? head : `${head}, ${town}`;
}

export function PlaceInput({
  letter,
  color,
  value,
  placeholder,
  active,
  onChange,
  onPickOnMap,
  onLocate,
}: {
  letter: string;
  color: string;
  value: Place | null;
  placeholder: string;
  active: boolean;
  onChange: (p: Place | null) => void;
  onPickOnMap: () => void;
  onLocate?: () => void;
}) {
  const [text, setText] = useState(value?.label ?? "");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const listId = useId();
  const typed = useRef(false);

  // Follow outside changes (map click, drag, swap).
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setText(value?.label ?? "");
  }

  useEffect(() => {
    if (!typed.current) return;
    const q = text.trim();
    if (q.length < 3) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      setBusy(true);
      fetch(`/api/geocode?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d: Hit[]) => {
          setHits(Array.isArray(d) ? d : []);
          setOpen(true);
          setCursor(-1);
        })
        .catch(() => {})
        .finally(() => setBusy(false));
    }, 400);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [text]);

  const choose = (h: Hit) => {
    typed.current = false;
    setOpen(false);
    onChange({ pos: [h.lat, h.lng], label: shortLabel(h.label) });
  };

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
          className="field pr-16"
          style={active ? { borderColor: "var(--marking)" } : undefined}
          value={text}
          placeholder={placeholder}
          aria-label={placeholder}
          role="combobox"
          aria-expanded={open && hits.length > 0}
          aria-controls={listId}
          autoComplete="off"
          onChange={(e) => {
            typed.current = true;
            if (e.target.value.trim().length < 3) setHits([]);
            setText(e.target.value);
            if (!e.target.value) onChange(null);
          }}
          onFocus={(e) => {
            e.target.select();
            if (hits.length) setOpen(true);
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (!open || !hits.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setCursor((c) => Math.min(hits.length - 1, c + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setCursor((c) => Math.max(0, c - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              choose(hits[Math.max(0, cursor)]);
            } else if (e.key === "Escape") setOpen(false);
          }}
        />
        <div className="absolute inset-y-0 right-1.5 flex items-center gap-0.5">
          {busy && <span className="mr-1 h-3 w-3 animate-spin rounded-full border-2 border-[var(--muted)] border-t-transparent" />}
          {onLocate && (
            <button type="button" onClick={onLocate} className="rounded-md p-1.5 text-[var(--muted)] hover:bg-[var(--line)] hover:text-[var(--ink)]" title="Mano vieta" aria-label="Naudoti mano vietą">
              <LocateIcon size={16} />
            </button>
          )}
          <button
            type="button"
            onClick={onPickOnMap}
            className={`rounded-md p-1.5 hover:bg-[var(--line)] hover:text-[var(--ink)] ${active ? "text-[var(--marking)]" : "text-[var(--muted)]"}`}
            title="Pažymėti žemėlapyje"
            aria-label="Pažymėti žemėlapyje"
            aria-pressed={active}
          >
            <PinIcon size={16} />
          </button>
        </div>
        {open && hits.length > 0 && (
          <ul id={listId} role="listbox" className="absolute top-full right-0 left-0 z-[1000] mt-1 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] shadow-2xl">
            {hits.map((h, i) => (
              <li key={`${h.lat},${h.lng},${i}`} role="option" aria-selected={i === cursor}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(h)}
                  className={`block w-full px-3 py-2 text-left text-sm ${i === cursor ? "bg-[var(--chip)]" : "hover:bg-[var(--chip)]"}`}
                >
                  <div className="truncate font-medium">{shortLabel(h.label)}</div>
                  <div className="truncate text-xs text-[var(--muted)]">{h.label}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
