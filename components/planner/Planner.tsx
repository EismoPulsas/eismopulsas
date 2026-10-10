"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { inLithuania, type LatLng } from "@/lib/geo";
import { DEFAULT_SETTINGS, rank, summarize, type ModeId, type Settings } from "@/lib/metrics";
import type { PlanResponse } from "@/lib/plan-types";
import { Logo } from "../Logo";
import { fmtDur, MODE_META } from "./format";
import { GearIcon, ChevronIcon, SwapIcon } from "./icons";
import type { Layers } from "./MapView";
import { PlaceInput, shortLabel, type Place } from "./PlaceInput";
import { ModeList } from "./Results";
import { Savings } from "./Savings";
import { PRIORITIES, SettingsPanel } from "./SettingsPanel";

// Leaflet needs `window`, so the map only loads in the browser.
const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-[var(--muted)]">Kraunamas žemėlapis…</div>,
});

const EXAMPLES: { label: string; from: Place; to: Place }[] = [
  { label: "Pašilaičiai → Senamiestis", from: { pos: [54.7329, 25.2236], label: "Pašilaičiai, Vilnius" }, to: { pos: [54.6812, 25.2876], label: "Rotušės a., Vilnius" } },
  { label: "Žirmūnai → Saulėtekis", from: { pos: [54.7101, 25.2988], label: "Žirmūnai, Vilnius" }, to: { pos: [54.7228, 25.3375], label: "Saulėtekis, Vilnius" } },
  { label: "Vilnius → Kaunas", from: { pos: [54.6872, 25.2797], label: "Vilniaus centras" }, to: { pos: [54.8972, 23.8861], label: "Kauno centras" } },
  { label: "Šilainiai → Laisvės al.", from: { pos: [54.9235, 23.8546], label: "Šilainiai, Kaunas" }, to: { pos: [54.8977, 23.9126], label: "Laisvės al., Kaunas" } },
];

const SETTINGS_KEY = "ep-settings-v1";

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_SETTINGS;
}

function localNow(): string {
  const s = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Vilnius", dateStyle: "short", timeStyle: "short" }).format(new Date());
  return s.replace(" ", "T").slice(0, 16);
}

async function reverse(p: LatLng): Promise<string> {
  try {
    const r = await fetch(`/api/geocode?lat=${p[0]}&lng=${p[1]}`);
    const d = await r.json();
    if (d.label) return shortLabel(d.label);
  } catch {}
  return `${p[0].toFixed(4)}, ${p[1].toFixed(4)}`;
}

const parseLL = (s: string | null): LatLng | null => {
  const m = /^(-?[\d.]+),(-?[\d.]+)$/.exec(s ?? "");
  return m ? [+m[1], +m[2]] : null;
};

export default function Planner() {
  const [from, setFrom] = useState<Place | null>(null);
  const [to, setTo] = useState<Place | null>(null);
  const [picking, setPicking] = useState<"from" | "to" | null>(null);
  const [departAt, setDepartAt] = useState<string | null>(null); // null = now
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ModeId | null>(null);
  const [alt, setAlt] = useState<Exclude<ModeId, "car">>("transit");
  const [layers, setLayers] = useState<Layers>({ lanes: true, traffic: false, parking: false });
  const [showSettings, setShowSettings] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Restore settings and a shared trip from the URL.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettings(loadSettings());
    const q = new URLSearchParams(window.location.search);
    const a = parseLL(q.get("from"));
    const b = parseLL(q.get("to"));
    if (a) setFrom({ pos: a, label: q.get("a") ?? `${a[0]}, ${a[1]}` });
    if (b) setTo({ pos: b, label: q.get("b") ?? `${b[0]}, ${b[1]}` });
    if (q.get("t")) setDepartAt(q.get("t"));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {}
  }, [settings]);

  // Keep the URL shareable.
  useEffect(() => {
    const q = new URLSearchParams();
    if (from) {
      q.set("from", from.pos.map((v) => v.toFixed(5)).join(","));
      q.set("a", from.label);
    }
    if (to) {
      q.set("to", to.pos.map((v) => v.toFixed(5)).join(","));
      q.set("b", to.label);
    }
    if (departAt) q.set("t", departAt);
    const s = q.toString();
    window.history.replaceState(null, "", s ? `?${s}` : window.location.pathname);
  }, [from, to, departAt]);

  // Plan whenever both ends or the time change.
  useEffect(() => {
    if (!from || !to) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPlan(null);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    const q = new URLSearchParams({ from: from.pos.join(","), to: to.pos.join(",") });
    if (departAt) q.set("depart", departAt);
    fetch(`/api/plan?${q}`, { signal: ctrl.signal })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Nepavyko apskaičiuoti maršruto");
        setPlan(d);
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setPlan(null);
          setError(e.message);
        }
      })
      .finally(() => !ctrl.signal.aborted && setLoading(false));
    return () => ctrl.abort();
  }, [from, to, departAt]);

  const modes = useMemo(() => (plan ? summarize(plan, settings) : []), [plan, settings]);
  const ranking = useMemo(() => rank(modes, settings.priority), [modes, settings.priority]);

  // Open the winner and compare the car against the best alternative.
  useEffect(() => {
    if (!plan) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelected(ranking.best);
    const alts = [...ranking.scores].filter(([id]) => id !== "car").sort((a, b) => a[1] - b[1]);
    if (alts.length) setAlt(alts[0][0] as Exclude<ModeId, "car">);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);

  const place = useCallback(async (which: "from" | "to", p: LatLng) => {
    if (!inLithuania(p)) {
      setNotice("Kol kas veikia tik Lietuvoje.");
      return;
    }
    setNotice(null);
    const set = which === "from" ? setFrom : setTo;
    set({ pos: p, label: "…" });
    set({ pos: p, label: await reverse(p) });
  }, []);

  const onMapPick = useCallback(
    (p: LatLng) => {
      const which = picking ?? (!from ? "from" : "to");
      place(which, p);
      setPicking(which === "from" && !to ? "to" : null);
    },
    [picking, from, to, place],
  );

  const locate = () => {
    if (!navigator.geolocation) return setNotice("Naršyklė nepalaiko vietos nustatymo.");
    navigator.geolocation.getCurrentPosition(
      (pos) => place("from", [pos.coords.latitude, pos.coords.longitude]),
      () => setNotice("Nepavyko nustatyti jūsų vietos."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const best = ranking.best;
  const bestMode = modes.find((m) => m.id === best);
  const car = modes.find((m) => m.id === "car");

  return (
    // On phones the side panel dissolves (display: contents) so the map can sit
    // between the search box and the results.
    <div className="asphalt flex min-h-dvh flex-col lg:h-dvh lg:flex-row">
      <aside className="contents border-[var(--line)] lg:order-1 lg:flex lg:w-[460px] lg:shrink-0 lg:flex-col lg:overflow-y-auto lg:border-r">
        <header className="sticky top-0 z-[1100] order-1 flex items-center gap-3 border-b border-[var(--line)] bg-[var(--bg)]/90 px-4 py-3 backdrop-blur">
          <Logo />
          <nav className="ml-auto flex items-center gap-1 text-sm">
            <Link href="/apie" className="rounded-md px-2.5 py-1.5 text-[var(--muted)] hover:bg-[var(--chip)] hover:text-[var(--ink)]">
              Kaip skaičiuojame
            </Link>
          </nav>
        </header>

        <div className="order-2 flex flex-col gap-4 p-4 lg:pb-0">
          <div>
            <h1 className="font-display text-[22px] leading-tight font-bold">Kuo važiuoti iš A į B?</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Palyginkite automobilį, autobusą, dviratį ir kojas: laiką su spūstimis ir A juostomis, kainą su parkavimu, CO₂.
            </p>
          </div>

          {/* Route box: A and B joined by a dashed lane line. */}
          <div className="relative rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-3 shadow-xl">
            <div className="flex gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                <PlaceInput
                  letter="A"
                  color="#1f2937"
                  value={from}
                  placeholder="Iš kur? Adresas ar vieta"
                  active={picking === "from"}
                  onChange={setFrom}
                  onPickOnMap={() => setPicking(picking === "from" ? null : "from")}
                  onLocate={locate}
                />
                <PlaceInput
                  letter="B"
                  color="#b4232f"
                  value={to}
                  placeholder="Į kur?"
                  active={picking === "to"}
                  onChange={setTo}
                  onPickOnMap={() => setPicking(picking === "to" ? null : "to")}
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  setFrom(to);
                  setTo(from);
                }}
                className="self-center rounded-lg border border-[var(--line)] p-2 text-[var(--muted)] hover:bg-[var(--chip)] hover:text-[var(--ink)]"
                title="Sukeisti"
                aria-label="Sukeisti A ir B"
              >
                <SwapIcon />
              </button>
            </div>
            <span className="lane-vertical pointer-events-none absolute top-[44px] left-[25px] h-[22px]" aria-hidden />

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <div className="seg">
                <button type="button" aria-pressed={!departAt} onClick={() => setDepartAt(null)}>
                  Išvykti dabar
                </button>
                <button type="button" aria-pressed={!!departAt} onClick={() => setDepartAt(departAt ?? localNow())}>
                  Kitu laiku
                </button>
              </div>
              {departAt && (
                <input
                  type="datetime-local"
                  className="field w-auto flex-1 py-1.5"
                  value={departAt}
                  onChange={(e) => e.target.value && setDepartAt(e.target.value)}
                  aria-label="Išvykimo laikas"
                />
              )}
            </div>
            {picking && (
              <p className="mt-2 text-xs text-[var(--marking)]">Spustelėkite žemėlapyje, kur yra {picking === "from" ? "A" : "B"} taškas.</p>
            )}
            {notice && <p className="mt-2 text-xs text-[var(--wait)]">{notice}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">Kas svarbiausia?</span>
            <div className="seg">
              {PRIORITIES.map((p) => (
                <button key={p.id} type="button" aria-pressed={settings.priority === p.id} onClick={() => setSettings({ ...settings, priority: p.id })}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

        </div>

        <div className="order-4 flex flex-col gap-4 p-4">
          <div className="lane-divider" aria-hidden />

          {loading && (
            <div className="flex items-center gap-3 py-6 text-sm text-[var(--muted)]" role="status">
              <span className="traffic-light" aria-hidden>
                <i />
                <i />
                <i />
              </span>
              Skaičiuojame maršrutus, tikriname eismą ir tvarkaraščius…
            </div>
          )}
          {error && !loading && <div className="rounded-xl border border-[var(--stop)]/50 bg-[var(--stop)]/10 p-3 text-sm">{error}</div>}

          {!plan && !loading && !error && <Intro
              onExample={(e) => {
                setFrom(e.from);
                setTo(e.to);
              }}
            />}

          {plan && !loading && (
            <>
              {bestMode && (
                <div className="road-sign">
                  <div className="road-sign-inner flex items-center justify-between gap-3 py-2.5">
                    <div>
                      <div className="text-[11px] font-semibold tracking-wider uppercase opacity-85">Geriausias pasirinkimas</div>
                      <div className="font-display text-lg font-bold">{MODE_META[bestMode.id].short}</div>
                    </div>
                    <div className="text-right">
                      <div className="tnum font-display text-2xl font-bold">{fmtDur(bestMode.duration)}</div>
                      {car && bestMode.id !== "car" && (
                        <div className="text-xs opacity-90">
                          {bestMode.duration <= car.duration ? `${fmtDur(car.duration - bestMode.duration)} greičiau nei automobiliu` : `+${fmtDur(bestMode.duration - car.duration)} palyginti su automobiliu`}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <ModeList plan={plan} modes={modes} best={best} selected={selected} onSelect={(m) => setSelected(selected === m ? null : m)} />

              {car && plan.car && <Savings modes={modes} alt={alt} onAlt={setAlt} settings={settings} carDistance={plan.car.distance} />}

              <p className="text-[11px] leading-relaxed text-[var(--muted)]">
                Tvarkaraščiai: LTSA nacionalinis GTFS ({plan.timetable.window}){plan.timetable.shifted && " – pasirinkta data už ribų, naudojama ta pati savaitės diena"}.
                Spūstys: {plan.car?.traffic.source === "live" ? "gyvi Via Lietuva (eismoinfo.lt) jutikliai" : "piko valandų vertinimas"}. Maršrutai: OSRM / OpenStreetMap.
              </p>
            </>
          )}

          <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)]/70">
            <button type="button" onClick={() => setShowSettings(!showSettings)} className="flex w-full items-center gap-2 p-3 text-left text-sm font-semibold" aria-expanded={showSettings}>
              <GearIcon />
              Mano automobilis, bilietai ir kelionių dažnis
              <ChevronIcon className={`ml-auto text-[var(--muted)] transition ${showSettings ? "rotate-180" : ""}`} />
            </button>
            {showSettings && (
              <div className="border-t border-[var(--line)] p-3">
                <SettingsPanel s={settings} onChange={setSettings} />
                <button type="button" onClick={() => setSettings({ ...DEFAULT_SETTINGS, priority: settings.priority })} className="mt-3 text-xs text-[var(--muted)] underline hover:text-[var(--ink)]">
                  Atstatyti numatytuosius
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      <main className="relative order-3 h-[52dvh] border-y border-[var(--line)] lg:order-2 lg:h-auto lg:flex-1 lg:border-0">
        <MapView
          from={from?.pos ?? null}
          to={to?.pos ?? null}
          plan={plan}
          selected={selected}
          layers={layers}
          picking={!!picking || !from || !to}
          onPick={onMapPick}
          onOutside={() => setNotice("Kol kas veikia tik Lietuvoje – pažymėkite tašką šalies viduje.")}
          onMove={(w, p) => place(w, p)}
        />
        <LayerToggles layers={layers} onChange={setLayers} />
      </main>
    </div>
  );
}

function LayerToggles({ layers, onChange }: { layers: Layers; onChange: (l: Layers) => void }) {
  const items: { id: keyof Layers; label: string; swatch: string }[] = [
    { id: "lanes", label: "A juostos", swatch: "var(--lane)" },
    { id: "traffic", label: "Gyvas eismas", swatch: "var(--wait)" },
    { id: "parking", label: "Mokamas parkavimas", swatch: "var(--sign-blue)" },
  ];
  return (
    <div className="absolute top-3 right-3 z-[500] flex flex-col items-end gap-1.5">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          aria-pressed={layers[it.id]}
          onClick={() => onChange({ ...layers, [it.id]: !layers[it.id] })}
          className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium shadow-lg backdrop-blur transition ${
            layers[it.id] ? "border-white/30 bg-[var(--panel)]/95 text-[var(--ink)]" : "border-[var(--line)] bg-[var(--bg)]/80 text-[var(--muted)]"
          }`}
        >
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: layers[it.id] ? it.swatch : "transparent", boxShadow: `inset 0 0 0 2px ${it.swatch}` }} />
          {it.label}
        </button>
      ))}
    </div>
  );
}

function Intro({ onExample }: { onExample: (e: (typeof EXAMPLES)[number]) => void }) {
  const steps = [
    ["A", "Įveskite adresą arba spustelėkite žemėlapyje"],
    ["B", "Pažymėkite, kur važiuojate"],
    ["✓", "Gausite laiką, kainą ir CO₂ kiekvienam būdui"],
  ];
  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-2">
        {steps.map(([n, t]) => (
          <li key={n} className="flex items-center gap-3 text-sm">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[var(--marking)] font-display text-xs font-extrabold text-black">{n}</span>
            {t}
          </li>
        ))}
      </ol>
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">Pabandykite</span>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((e) => (
            <button key={e.label} type="button" onClick={() => onExample(e)} className="rounded-full border border-[var(--line)] bg-[var(--chip)] px-3 py-1.5 text-sm hover:border-[var(--marking)]">
              {e.label}
            </button>
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)]/70 p-3 text-xs leading-relaxed text-[var(--muted)]">
        <b className="text-[var(--ink)]">Atviri duomenys:</b> visos Lietuvos VT tvarkaraščiai (LTSA), Vilniaus A juostos (SĮ „Susisiekimo paslaugos“), gyvas eismas
        magistralėse (Via Lietuva, eismoinfo.lt), Vilniaus ir Klaipėdos mokamo parkavimo zonos, OpenStreetMap maršrutai.{" "}
        <Link href="/apie" className="text-[var(--marking)] underline">
          Daugiau
        </Link>
      </div>
    </div>
  );
}
