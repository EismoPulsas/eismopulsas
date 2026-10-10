"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { preconnect } from "react-dom";
import { inLithuania, type LatLng } from "@/lib/geo";
import { bestParking, DEFAULT_SETTINGS, isEv, parkingEvals, rank, summarize, type ModeId, type ModeSummary } from "@/lib/metrics";
import type { PlanResponse } from "@/lib/plan-types";
import { Logo } from "../Logo";
import { BottomSheet, type Snap } from "./BottomSheet";
import { fmtDurShort, fmtEur, MODE_META, MODE_TAB } from "./format";
import { ChevronIcon, GearIcon, ModeBadge, SwapIcon } from "./icons";
import { useLiveParking } from "./live";
import type { Layers } from "./MapView";
import { ParkingCard } from "./ParkingCard";
import type { MapPick } from "./parking-meta";
import { PlaceInput, placeLabel, type Place } from "./PlaceInput";
import { ModeList } from "./Results";
import { Savings } from "./Savings";
import { useSettings } from "./settings";
import { useCarDrive } from "./useCarDrive";
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

function localNow(): string {
  const s = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Vilnius", dateStyle: "short", timeStyle: "short" }).format(new Date());
  return s.replace(" ", "T").slice(0, 16);
}

async function reverse(p: LatLng): Promise<string> {
  try {
    const r = await fetch(`/api/geocode?lat=${p[0]}&lng=${p[1]}`);
    const d = await r.json();
    if (d.label) return placeLabel(d.label, d.sub);
  } catch {}
  return `${p[0].toFixed(4)}, ${p[1].toFixed(4)}`;
}

const parseLL = (s: string | null): LatLng | null => {
  const m = /^(-?[\d.]+),(-?[\d.]+)$/.exec(s ?? "");
  return m ? [+m[1], +m[2]] : null;
};

const isPhone = () => typeof window !== "undefined" && !window.matchMedia("(min-width: 1024px)").matches;

export default function Planner() {
  // Open the map tile connections while the map code is still loading.
  preconnect("https://tiles.openfreemap.org", { crossOrigin: "anonymous" });
  const [from, setFrom] = useState<Place | null>(null);
  const [to, setTo] = useState<Place | null>(null);
  const [picking, setPicking] = useState<"from" | "to" | null>(null);
  const [departAt, setDepartAt] = useState<string | null>(null); // null = now
  const [settings, setSettings] = useSettings();
  const [basePlan, setPlan] = useState<PlanResponse | null>(null);
  const [loadedQuery, setLoadedQuery] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ModeId | null>(null);
  const [alt, setAlt] = useState<Exclude<ModeId, "car">>("transit");
  const [layers, setLayers] = useState<Layers>({ lanes: true, traffic: false, parking: false, charging: true, bikeshare: false, scooters: false });
  const [showSettings, setShowSettings] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** Where the car option leaves the car; null = the best one for the priority. */
  const [parkingId, setParkingId] = useState<string | null>(null);
  /** A car park, street piece or charger clicked on the map. */
  const [picked, setPicked] = useState<MapPick | null>(null);
  const ev = isEv(settings);
  const live = useLiveParking(layers.parking || (ev && layers.charging), ev && layers.charging);
  const queryKey = JSON.stringify([from?.pos, to?.pos, departAt, settings.maxWalkMin]);
  const currentPlan = loadedQuery === queryKey ? basePlan : null;
  // Refreshed driving times must not silently change the chosen destination.
  const chosenParking = useMemo(() => {
    if (!currentPlan?.car) return undefined;
    const options = parkingEvals(currentPlan, settings);
    return (options.find((p) => p.option.id === parkingId) ?? bestParking(options, settings.priority))?.option;
  }, [currentPlan, settings, parkingId]);
  const driving = useCarDrive(currentPlan, chosenParking, refresh, settings.maxWalkMin, !loading);
  const plan = driving.plan;
  const updatingCar = loading || driving.pending;
  // Phones: the search card collapses to one line once there are results.
  const [editing, setEditing] = useState(true);
  const [snap, setSnap] = useState<Snap>("peek");
  const [sheetPx, setSheetPx] = useState(156);
  const [topPx, setTopPx] = useState(0);
  const topRef = useRef<HTMLDivElement>(null);
  const [phone, setPhone] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023.98px)");
    const update = () => setPhone(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Restore a shared trip from the URL (the profile restores itself).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const a = parseLL(q.get("from"));
    const b = parseLL(q.get("to"));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (a) setFrom({ pos: a, label: q.get("a") ?? `${a[0]}, ${a[1]}` });
    if (b) setTo({ pos: b, label: q.get("b") ?? `${b[0]}, ${b[1]}` });
    if (q.get("t")) setDepartAt(q.get("t"));
  }, []);

  // The floating search card's height decides where the map content starts.
  useEffect(() => {
    const el = topRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setTopPx(isPhone() ? el.getBoundingClientRect().bottom : 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
    const q = new URLSearchParams({ from: from.pos.join(","), to: to.pos.join(","), walk: String(settings.maxWalkMin) });
    if (departAt) q.set("depart", departAt);
    const timer = setTimeout(() => fetch(`/api/plan?${q}`, { signal: ctrl.signal, cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Nepavyko apskaičiuoti maršruto");
        if (!ctrl.signal.aborted) {
          setPlan(d);
          setLoadedQuery(queryKey);
          setEditing(false);
          setSnap("half");
        }
      })
      .catch((e) => {
        if (!ctrl.signal.aborted && e.name !== "AbortError") {
          setPlan(null);
          setError(e.message);
          setSnap("half");
        }
      })
      .finally(() => !ctrl.signal.aborted && setLoading(false)), 350);
    return () => { clearTimeout(timer); ctrl.abort(); };
    // Reverse-geocoded labels never trigger another routing request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, refresh]);

  const modes = useMemo(() => (plan ? summarize(plan, settings, chosenParking?.id).map((m) =>
    m.id === "car" && (updatingCar || driving.error) ? { ...m, feasible: false, why: driving.error ?? "Atnaujinamas važiavimo laikas…" } : m) : []),
    [plan, settings, chosenParking?.id, updatingCar, driving.error]);
  const ranking = useMemo(() => rank(modes, settings.priority), [modes, settings.priority]);
  const carPark = modes.find((m) => m.id === "car")?.parking?.option;

  // Open the winner and compare the car against the best alternative.
  useEffect(() => {
    if (!plan) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelected((prev) => prev ?? ranking.best);
    const alts = [...ranking.scores].filter(([id]) => id !== "car").sort((a, b) => a[1] - b[1]);
    if (alts.length) setAlt(alts[0][0] as Exclude<ModeId, "car">);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basePlan]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setParkingId(null);
  }, [queryKey]);

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
      // With both ends set a stray tap should not move B: use the pin buttons or drag.
      if (!picking && from && to) {
        setNotice("Norėdami pakeisti A ar B, spauskite smeigtuką prie laukelio arba tempkite žymeklį.");
        return;
      }
      const which = picking ?? (!from ? "from" : "to");
      place(which, p);
      setPicking(which === "from" && !to ? "to" : null);
    },
    [picking, from, to, place],
  );

  const startPicking = (which: "from" | "to") => {
    const next = picking === which ? null : which;
    setPicking(next);
    if (next) setSnap("peek");
  };

  const locate = () => {
    if (!navigator.geolocation) return setNotice("Naršyklė nepalaiko vietos nustatymo.");
    navigator.geolocation.getCurrentPosition(
      (pos) => place("from", [pos.coords.latitude, pos.coords.longitude]),
      () => setNotice("Nepavyko nustatyti jūsų vietos."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const selectMode = (m: ModeId) => {
    setSelected(selected === m ? null : m);
    if (snap === "peek") setSnap("half");
  };

  const best = ranking.best;
  const car = modes.find((m) => m.id === "car");
  const collapsed = !!plan && !editing;

  return (
    <div className="relative h-dvh overflow-hidden lg:flex">
      <main className="absolute inset-0 lg:relative lg:order-2 lg:flex-1" style={{ "--map-bottom": `${sheetPx}px` } as React.CSSProperties}>
        <MapView
          from={from?.pos ?? null}
          to={to?.pos ?? null}
          plan={plan && (updatingCar || driving.error) ? { ...plan, car: null } : plan}
          selected={selected}
          layers={layers}
          picking={!!picking || !from || !to}
          live={live}
          ev={ev}
          connectors={settings.connectors}
          parkingSpot={carPark && carPark.kind !== "zone" ? { pos: carPark.navigationPos ?? carPark.pos, name: carPark.name } : null}
          picked={picked}
          padding={{ top: phone ? topPx : 0, bottom: phone ? sheetPx : 0 }}
          onPick={onMapPick}
          onOutside={() => setNotice("Kol kas veikia tik Lietuvoje – pažymėkite tašką šalies viduje.")}
          onMove={(w, p) => place(w, p)}
          onPickPlace={(p) => {
            setPicked(p);
            if (phone) setSnap("peek");
          }}
        />
        <LayerToggles layers={layers} onChange={setLayers} ev={ev} top={phone ? topPx : 0} />
        {picked && (
          // On phones the card sits between the search card and the results sheet.
          <div className="pointer-events-none absolute inset-x-0 z-[600]" style={{ top: phone ? topPx : 0, bottom: phone ? sheetPx : 0 }}>
            <ParkingCard pick={picked} live={live} settings={settings} onClose={() => setPicked(null)} />
          </div>
        )}
      </main>

      {/* Phones: floating search card + bottom sheet over the map. Desktop: a side column. */}
      <aside className="asphalt-lg pointer-events-none absolute inset-0 z-[1000] flex flex-col lg:pointer-events-auto lg:relative lg:order-1 lg:w-[460px] lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-[var(--line)]">
        <div
          ref={topRef}
          className="pointer-events-auto mx-2 mt-[max(0.5rem,env(safe-area-inset-top))] rounded-2xl border border-[var(--line)] bg-[var(--bg)]/95 shadow-2xl backdrop-blur lg:m-0 lg:mt-0 lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none lg:backdrop-blur-none"
        >
          <header className="flex items-center gap-3 px-3 pt-2.5 pb-2 lg:sticky lg:top-0 lg:z-20 lg:border-b lg:border-[var(--line)] lg:bg-[var(--bg)]/90 lg:px-4 lg:py-3 lg:backdrop-blur">
            <Logo />
            <nav className="ml-auto flex items-center gap-1">
              <Link href="/profilis" className="rounded-md px-2 py-1 text-xs text-[var(--muted)] hover:bg-[var(--chip)] hover:text-[var(--ink)] lg:px-2.5 lg:py-1.5 lg:text-sm">
                Profilis
              </Link>
              <Link href="/apie" className="rounded-md px-2 py-1 text-xs text-[var(--muted)] hover:bg-[var(--chip)] hover:text-[var(--ink)] lg:px-2.5 lg:py-1.5 lg:text-sm">
                Kaip skaičiuojame
              </Link>
            </nav>
          </header>

          {collapsed && (
            <button
              type="button"
              onClick={() => {
                setEditing(true);
                setSnap("peek");
              }}
              className="flex w-full items-center gap-2 border-t border-[var(--line)] px-3 py-2.5 text-left lg:hidden"
              aria-label="Keisti maršrutą"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {from?.label} <span className="text-[var(--muted)]">→</span> {to?.label}
                </span>
                <span className="block text-xs text-[var(--muted)]">{departAt ? departAt.replace("T", " ") : "Išvykti dabar"} · keisti</span>
              </span>
              <ChevronIcon className="shrink-0 text-[var(--muted)]" />
            </button>
          )}

          <div className={`${collapsed ? "hidden lg:flex" : "flex"} flex-col gap-3 px-3 pb-3 lg:gap-4 lg:p-4`}>
            <div className="hidden lg:block">
              <h1 className="font-display text-[22px] leading-tight font-bold">Kuo važiuoti iš A į B?</h1>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Palyginkite automobilį, autobusą, dviratį, paspirtuką ir kojas: laiką su spūstimis ir A juostomis, kainą su parkavimu, CO₂.
              </p>
            </div>

            {/* Route box: A and B joined by a dashed lane line. */}
            <div className="relative lg:rounded-2xl lg:border lg:border-[var(--line)] lg:bg-[var(--panel)] lg:p-3 lg:shadow-xl">
              <div className="flex gap-2">
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <PlaceInput
                    letter="A"
                    color="#1f2937"
                    value={from}
                    placeholder="Iš kur? Adresas, vieta, stotelė"
                    active={picking === "from"}
                    near={to?.pos ?? null}
                    onChange={setFrom}
                    onPickOnMap={() => startPicking("from")}
                    onLocate={locate}
                  />
                  <PlaceInput
                    letter="B"
                    color="#b4232f"
                    value={to}
                    placeholder="Į kur?"
                    active={picking === "to"}
                    near={from?.pos ?? null}
                    onChange={setTo}
                    onPickOnMap={() => startPicking("to")}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFrom(to);
                    setTo(from);
                  }}
                  className="grid h-10 w-10 shrink-0 place-items-center self-center rounded-lg border border-[var(--line)] text-[var(--muted)] hover:bg-[var(--chip)] hover:text-[var(--ink)]"
                  title="Sukeisti"
                  aria-label="Sukeisti A ir B"
                >
                  <SwapIcon />
                </button>
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <div className="seg">
                  <button type="button" aria-pressed={!departAt} onClick={() => setDepartAt(null)}>
                    Dabar
                  </button>
                  <button type="button" aria-pressed={!!departAt} onClick={() => setDepartAt(departAt ?? localNow())}>
                    Kitu laiku
                  </button>
                </div>
                {departAt && (
                  <input
                    type="datetime-local"
                    className="field w-auto min-w-0 flex-1 py-1.5 text-base lg:text-sm"
                    value={departAt}
                    onChange={(e) => e.target.value && setDepartAt(e.target.value)}
                    aria-label="Išvykimo laikas"
                  />
                )}
                {collapsed === false && plan && (
                  <button type="button" onClick={() => setEditing(false)} className="ml-auto text-sm font-semibold text-[var(--marking)] lg:hidden">
                    Gerai
                  </button>
                )}
              </div>
              {picking && <p className="mt-2 text-xs text-[var(--marking)]">Bakstelėkite žemėlapyje, kur yra {picking === "from" ? "A" : "B"} taškas.</p>}
              {notice && <p className="mt-2 text-xs text-[var(--wait)]">{notice}</p>}
            </div>
          </div>
        </div>

        <BottomSheet snap={snap} onSnap={setSnap} onVisible={setSheetPx} topInset={topPx}>
          <div className="flex flex-col gap-4 px-3 pb-6 lg:p-4">
            {loading && (
              <div className="flex items-center gap-3 py-3 text-sm text-[var(--muted)]" role="status">
                <span className="traffic-light" aria-hidden>
                  <i />
                  <i />
                  <i />
                </span>
                Skaičiuojame maršrutus, tikriname eismą ir tvarkaraščius…
              </div>
            )}
            {error && !loading && <div className="rounded-xl border border-[var(--stop)]/50 bg-[var(--stop)]/10 p-3 text-sm">{error}</div>}

            {!plan && !loading && !error && (
              <Intro
                onExample={(e) => {
                  setFrom(e.from);
                  setTo(e.to);
                }}
              />
            )}

            {plan && (
              <>
                <ModeStrip modes={modes} best={best} selected={selected} onSelect={selectMode} />

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

                <button type="button" disabled={updatingCar} onClick={() => setRefresh((v) => v + 1)} className="self-start rounded-lg border border-[var(--line)] px-3 py-2 text-sm disabled:opacity-50">
                  {updatingCar ? "Atnaujinama…" : "Atnaujinti eismą"}
                </button>
                <ModeList
                  plan={plan}
                  modes={modes}
                  best={best}
                  selected={selected}
                  onSelect={selectMode}
                  parking={{ settings, parkingId: chosenParking?.id ?? null, onParking: setParkingId, updating: updatingCar, error: driving.error }}
                />

                {car?.feasible && plan.car && <Savings modes={modes} alt={alt} onAlt={setAlt} settings={settings} carDistance={plan.car.distance} />}

                <p className="text-[11px] leading-relaxed text-[var(--muted)]">
                  Tvarkaraščiai: LTSA nacionalinis GTFS ({plan.timetable.window}){plan.timetable.shifted && " – pasirinkta data už ribų, naudojama ta pati savaitės diena"}.
                  Automobilis: {plan.car?.traffic.provider === "tomtom" ? "TomTom eismo maršrutas" : "apytikslis OSRM / Via Lietuva vertinimas"}. Dviratis ir pėsčiomis: OSRM / OpenStreetMap.
                  {plan.bikeshareNote && ` ${plan.bikeshareNote}`}
                </p>
              </>
            )}

            <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)]/70">
              <button type="button" onClick={() => setShowSettings(!showSettings)} className="flex w-full items-center gap-2 p-3 text-left text-sm font-semibold" aria-expanded={showSettings}>
                <GearIcon />
                Mano automobilis, bilietai ir kelionių dažnis
                <ChevronIcon className={`ml-auto shrink-0 text-[var(--muted)] transition ${showSettings ? "rotate-180" : ""}`} />
              </button>
              {showSettings && (
                <div className="border-t border-[var(--line)] p-3">
                  <p className="mb-3 text-xs text-[var(--muted)]">
                    Elektromobilio jungtys, leidimai ir ėjimo atstumas –{" "}
                    <Link href="/profilis" className="text-[var(--marking)] underline">
                      profilyje
                    </Link>
                    .
                  </p>
                  <SettingsPanel s={settings} onChange={setSettings} />
                  <button type="button" onClick={() => setSettings({ ...DEFAULT_SETTINGS, priority: settings.priority })} className="mt-3 text-xs text-[var(--muted)] underline hover:text-[var(--ink)]">
                    Atstatyti numatytuosius
                  </button>
                </div>
              )}
            </div>
            <p className="text-[10px] text-[var(--muted)] lg:hidden">Žemėlapis © OpenFreeMap, OpenMapTiles, OpenStreetMap bendruomenė</p>
          </div>
        </BottomSheet>
      </aside>
    </div>
  );
}

/** One chip per mode: the whole comparison at a glance (the only thing visible when the sheet is low). */
function ModeStrip({ modes, best, selected, onSelect }: { modes: ModeSummary[]; best: ModeId | null; selected: ModeId | null; onSelect: (m: ModeId) => void }) {
  const order: ModeId[] = ["car", "transit", "bikeshare", "scooter", "bike", "walk"];
  const sorted = [...modes].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  return (
    <div className="-mx-3 flex snap-x gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] lg:hidden">
      {sorted.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onSelect(m.id)}
          aria-pressed={selected === m.id}
          className={`relative flex shrink-0 snap-start items-center gap-2 rounded-2xl border px-2.5 py-2 text-left ${m.feasible ? "" : "opacity-50"}`}
          style={{ borderColor: selected === m.id ? MODE_META[m.id].color : "var(--line)", background: "var(--panel)" }}
        >
          <ModeBadge mode={m.id} size={30} />
          <span>
            <span className="tnum block font-display text-[15px] leading-tight font-bold">{fmtDurShort(m.duration)}</span>
            <span className="tnum block text-[11px] text-[var(--muted)]">
              {m.cost < 0.005 ? "0 €" : fmtEur(m.cost)} · {MODE_TAB[m.id]}
            </span>
          </span>
          {m.id === best && <span className="absolute -top-1.5 right-2 rounded bg-[var(--sign-green)] px-1 text-[9px] font-bold text-white uppercase ring-1 ring-white/80">Geriausia</span>}
        </button>
      ))}
    </div>
  );
}

function LayerToggles({ layers, onChange, ev, top }: { layers: Layers; onChange: (l: Layers) => void; ev: boolean; top: number }) {
  const items: { id: keyof Layers; label: string; short: string; swatch: string }[] = [
    { id: "lanes", label: "A juostos", short: "A", swatch: "var(--lane)" },
    { id: "traffic", label: "Gyvas eismas", short: "Eismas", swatch: "var(--wait)" },
    { id: "parking", label: "Parkavimas", short: "P", swatch: "var(--sign-blue)" },
    // Charging points exist on the map only for cars that can use them.
    ...(ev ? [{ id: "charging" as const, label: "Įkrovimas", short: "Įkrovimas", swatch: "#22d3ee" }] : []),
    { id: "bikeshare", label: "Cyclocity dviračiai", short: "Dviračiai", swatch: "#22d3ee" },
    { id: "scooters", label: "Paspirtukai", short: "Paspirtukai", swatch: "#f472b6" },
  ];
  return (
    <div className="absolute right-2 z-[500] flex flex-col items-end gap-1.5 lg:top-3 lg:right-3" style={{ top: top ? top + 8 : undefined }}>
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          aria-pressed={layers[it.id]}
          aria-label={it.label}
          title={it.label}
          onClick={() => onChange({ ...layers, [it.id]: !layers[it.id] })}
          className={`flex min-h-9 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium shadow-lg backdrop-blur transition ${
            layers[it.id] ? "border-white/30 bg-[var(--panel)]/95 text-[var(--ink)]" : "border-[var(--line)] bg-[var(--bg)]/80 text-[var(--muted)]"
          }`}
        >
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: layers[it.id] ? it.swatch : "transparent", boxShadow: `inset 0 0 0 2px ${it.swatch}` }} />
          <span className="lg:hidden">{it.short}</span>
          <span className="hidden lg:inline">{it.label}</span>
        </button>
      ))}
    </div>
  );
}

function Intro({ onExample }: { onExample: (e: (typeof EXAMPLES)[number]) => void }) {
  const steps = [
    ["A", "Įveskite adresą, stotelę arba bakstelėkite žemėlapyje"],
    ["B", "Pažymėkite, kur važiuojate"],
    ["✓", "Gausite laiką, kainą ir CO₂ kiekvienam būdui"],
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">Pabandykite</span>
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:px-0">
          {EXAMPLES.map((e) => (
            <button key={e.label} type="button" onClick={() => onExample(e)} className="shrink-0 rounded-full border border-[var(--line)] bg-[var(--chip)] px-3 py-2 text-sm hover:border-[var(--marking)]">
              {e.label}
            </button>
          ))}
        </div>
      </div>
      <ol className="flex flex-col gap-2">
        {steps.map(([n, t]) => (
          <li key={n} className="flex items-center gap-3 text-sm">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[var(--marking)] font-display text-xs font-extrabold text-black">{n}</span>
            {t}
          </li>
        ))}
      </ol>
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)]/70 p-3 text-xs leading-relaxed text-[var(--muted)]">
        <b className="text-[var(--ink)]">Atviri duomenys:</b> visos Lietuvos VT tvarkaraščiai (LTSA), Vilniaus A juostos (SĮ „Susisiekimo paslaugos“), gyvas eismas
        magistralėse (Via Lietuva, eismoinfo.lt), Cyclocity dviračiai (GBFS), Vilniaus ir Klaipėdos mokamo parkavimo zonos, OpenStreetMap.{" "}
        <Link href="/apie" className="text-[var(--marking)] underline">
          Daugiau
        </Link>
      </div>
    </div>
  );
}
