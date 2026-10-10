"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { preconnect } from "react-dom";
import { inLithuania, type LatLng } from "@/lib/geo";
import {
  bestParking,
  DEFAULT_SETTINGS,
  isEv,
  isHybridId,
  parkingEvals,
  rank,
  summarize,
  summarizeHybrids,
  type HybridSummary,
  type ModeId,
  type ModeSummary,
  type OptionId,
} from "@/lib/metrics";
import { estimateStay, type StayEstimate } from "@/lib/stay";
import type { PlanResponse } from "@/lib/plan-types";
import { Logo } from "../Logo";
import { BottomSheet, type Snap } from "./BottomSheet";
import { fmtClock, MODE_META } from "./format";
import { ChevronIcon, GearIcon, SwapIcon } from "./icons";
import { useLiveParking } from "./live";
import type { Layers } from "./MapView";
import { ParkingCard } from "./ParkingCard";
import type { MapPick } from "./parking-meta";
import { PlaceInput, placeLabel, type Place } from "./PlaceInput";
import { HybridCard, hybridTitle, MoreHybrids, StayLine } from "./HybridCard";
import { usualTrip, useHabits } from "./habits";
import { ModeExtras, signals, type Signals } from "./Results";
import { Savings } from "./Savings";
import { useSettings } from "./settings";
import { useCarDrive } from "./useCarDrive";
import { useHybrids } from "./useHybrids";
import { PRIORITIES, SettingsPanel } from "./SettingsPanel";
import { ImpactTiles, LiveStatus, ModeMatrix, NavButton, NowClock, RouteSteps } from "./Trip";

/** Desktop: the planner card floats over the map; the map keeps its content clear of it. */
const PANEL_LEFT = 24 + 560;

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

async function reverse(p: LatLng): Promise<{ label: string; cat?: string }> {
  try {
    const r = await fetch(`/api/geocode?lat=${p[0]}&lng=${p[1]}`);
    const d = await r.json();
    if (d.label) return { label: placeLabel(d.label, d.sub), cat: d.cat };
  } catch {}
  return { label: `${p[0].toFixed(4)}, ${p[1].toFixed(4)}` };
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
  const [selected, setSelected] = useState<OptionId | null>(null);
  const [alt, setAlt] = useState<Exclude<ModeId, "car">>("transit");
  const [layers, setLayers] = useState<Layers>({ lanes: false, traffic: false, parking: false, charging: false, bikeshare: false, scooters: false, stops: false });
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
  // How long the car stands at B: guessed from the place, the time and the user's habits;
  // it replaces the profile's usual stay for this trip (parking prices, P+R, charging).
  const { habits, rememberStay, logTrip } = useHabits();
  const [stayPick, setStayPick] = useState<{ key: string; hours: number } | null>(null);
  const arriveSec = currentPlan ? currentPlan.depart.sec + 120 + (currentPlan.car?.drive.duration ?? 0) : 0;
  const stay = useMemo((): StayEstimate | null => {
    if (!currentPlan || !to) return null;
    if (stayPick?.key === queryKey) return { hours: stayPick.hours, reason: "jūsų pasirinkimas", source: "override" };
    return estimateStay({ to: to.pos, cat: to.cat, weekday: currentPlan.depart.weekday, arriveSec, habits, profileHours: settings.parkingHours });
  }, [currentPlan, to, stayPick, queryKey, arriveSec, habits, settings.parkingHours]);
  const tripSettings = useMemo(() => (stay ? { ...settings, parkingHours: stay.hours } : settings), [settings, stay]);
  // Refreshed driving times must not silently change the chosen destination.
  const chosenParking = useMemo(() => {
    if (!currentPlan?.car) return undefined;
    const options = parkingEvals(currentPlan, tripSettings);
    return (options.find((p) => p.option.id === parkingId) ?? bestParking(options, tripSettings.priority))?.option;
  }, [currentPlan, tripSettings, parkingId]);
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
    if (b) setTo({ pos: b, label: q.get("b") ?? `${b[0]}, ${b[1]}`, cat: q.get("bc") ?? undefined });
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
      if (to.cat) q.set("bc", to.cat); // what B is: the stay guess survives sharing
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

  const modes = useMemo(() => (plan ? summarize(plan, tripSettings, chosenParking?.id).map((m) =>
    m.id === "car" && (updatingCar || driving.error) ? { ...m, feasible: false, why: driving.error ?? "Atnaujinamas važiavimo laikas…" } : m)
    .filter((m) => m.feasible && !m.weatherWarning) : []),
    [plan, tripSettings, chosenParking?.id, updatingCar, driving.error]);
  // Car + second leg: leave the car on the way (P+R, cheap parking, a charger) and continue.
  const hybridState = useHybrids(currentPlan, tripSettings, !loading);
  const hybrids = useMemo(() => (plan && hybridState.options.length ? summarizeHybrids(plan, hybridState.options, tripSettings)
    .filter((h) => h.feasible && !h.weatherWarning) : []), [plan, hybridState.options, tripSettings]);
  const ranking = useMemo(() => rank<ModeSummary | HybridSummary>([...modes, ...hybrids], settings.priority), [modes, hybrids, settings.priority]);
  const sig = useMemo((): Signals => {
    const all = [...modes, ...hybrids];
    return { duration: signals(all, "duration"), cost: signals(all, "cost"), co2: signals(all, "co2") };
  }, [modes, hybrids]);
  // The best combination is shown first only when it beats driving all the way; the rest fold away.
  const hybridOrder = useMemo(() => [...hybrids].sort((a, b) => (ranking.scores.get(a.id) ?? Infinity) - (ranking.scores.get(b.id) ?? Infinity)), [hybrids, ranking]);
  const carScore = ranking.scores.get("car");
  const topHybrid = hybridOrder[0] && ranking.scores.has(hybridOrder[0].id) && (carScore === undefined || ranking.scores.get(hybridOrder[0].id)! < carScore) ? hybridOrder[0] : null;
  const moreHybrids = hybridOrder.filter((h) => h !== topHybrid);
  const selectedHybrid = isHybridId(selected) ? hybrids.find((h) => h.id === selected) : undefined;
  const carPark = modes.find((m) => m.id === "car")?.parking?.option;

  // Open the winner (once combinations are in) and compare the car against the best alternative.
  useEffect(() => {
    if (!plan || !hybridState.settled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelected((prev) => (prev && !isHybridId(prev) && ranking.scores.has(prev) ? prev : null) ?? ranking.best);
    const alts = [...ranking.scores].filter(([id]) => id !== "car" && !isHybridId(id)).sort((a, b) => a[1] - b[1]);
    if (alts.length) setAlt(alts[0][0] as Exclude<ModeId, "car">);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basePlan, hybridState.settled]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setParkingId(null);
  }, [queryKey]);

  // Notices are hints, not state: they go away on their own.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  const place = useCallback(async (which: "from" | "to", p: LatLng) => {
    if (!inLithuania(p)) {
      setNotice("Kol kas veikia tik Lietuvoje.");
      return;
    }
    setNotice(null);
    const set = which === "from" ? setFrom : setTo;
    set({ pos: p, label: "…" });
    set({ pos: p, ...(await reverse(p)) });
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

  // Picking a way turns on the map layer it needs (parking for the car, stations for Cyclocity…).
  const MODE_LAYER: Partial<Record<ModeId, keyof Layers>> = { car: "parking", bikeshare: "bikeshare", scooter: "scooters" };
  const selectMode = (m: OptionId) => {
    setSelected(m);
    const need = isHybridId(m) ? undefined : MODE_LAYER[m];
    if (need && !layers[need]) setLayers({ ...layers, [need]: true });
    if (snap === "peek") setSnap("half");
    const opt = [...modes, ...hybrids].find((x) => x.id === m);
    if (plan && from && to && opt && selected !== m)
      logTrip({ from: from.pos, to: to.pos, toLabel: to.label, date: plan.depart.date, weekday: plan.depart.weekday, departSec: plan.depart.sec, arriveSec: plan.depart.sec + opt.duration });
  };

  const pickStay = (hours: number) => {
    setStayPick({ key: queryKey, hours });
    if (to && currentPlan) rememberStay(to.pos, currentPlan.depart.weekday, arriveSec, hours);
  };

  // Waze-like: with A set and B empty, offer the trip usually made from here at this time.
  const usual = useMemo(() => {
    if (!from || to) return null;
    const now = new Date();
    return usualTrip(habits.trips, from.pos, now.getDay(), now.getHours() * 3600 + now.getMinutes() * 60);
  }, [from, to, habits.trips]);

  // The badge waits for combinations (≤ 2,5 s) so it does not jump from one card to another.
  const best = hybridState.settled ? ranking.best : null;
  const bestMode = isHybridId(best) ? null : best;
  const bestHybrid = isHybridId(best) ? hybrids.find((h) => h.id === best) : undefined;
  const car = modes.find((m) => m.id === "car");
  const sel = selectedHybrid ? null : (modes.find((m) => m.id === selected) ?? modes.find((m) => m.id === ranking.best) ?? modes[0] ?? null);
  const collapsed = !!plan && !editing;
  const showRouteScope = !!plan && (layers.parking || layers.bikeshare || layers.scooters || (ev && layers.charging));

  return (
    <div className="relative h-dvh overflow-hidden">
      <main
        className={`absolute inset-0 ${showRouteScope ? "[--map-popover-offset:104px] min-[1280px]:[--map-popover-offset:52px]" : "[--map-popover-offset:52px]"}`}
        style={{
          "--map-bottom": `${sheetPx}px`,
          "--map-overlay-top": `${phone ? topPx + 12 : 24}px`,
          "--map-overlay-left": `${phone ? 12 : PANEL_LEFT + 24}px`,
          "--map-overlay-right": `${phone ? 12 : 24}px`,
          "--map-overlay-bottom": `${phone ? sheetPx + 12 : 24}px`,
        } as React.CSSProperties}
      >
        <MapView
          from={from?.pos ?? null}
          to={to?.pos ?? null}
          plan={plan && (updatingCar || driving.error) ? { ...plan, car: null } : plan}
          selected={selectedHybrid?.id ?? sel?.id ?? null}
          hybrid={selectedHybrid?.hybrid ?? null}
          layers={layers}
          picking={!!picking || !from || !to}
          live={live}
          ev={ev}
          connectors={settings.connectors}
          parkingSpot={carPark && carPark.kind !== "zone" ? { pos: carPark.navigationPos ?? carPark.pos, name: carPark.name } : null}
          picked={picked}
          padding={{ top: phone ? topPx : 0, bottom: phone ? sheetPx : 0, left: phone ? 0 : PANEL_LEFT }}
          onLayers={setLayers}
          onPick={onMapPick}
          onOutside={() => setNotice("Kol kas veikia tik Lietuvoje – pažymėkite tašką šalies viduje.")}
          onMove={(w, p) => place(w, p)}
          onPickPlace={(p) => {
            setPicked(p);
            if (phone) setSnap("peek");
          }}
        />
        {notice && (
          <div
            role="status"
            className="pointer-events-none absolute z-[800] max-w-[min(420px,calc(100%-24px))] -translate-x-1/2 rounded-2xl border border-[#fde68a] bg-[#fffbeb] px-4 py-2.5 text-sm text-[#92400e] shadow-lg"
            style={{ top: (phone ? topPx : 0) + 60, left: phone ? "50%" : `calc(50% + ${PANEL_LEFT / 2}px)` }}
          >
            {notice}
          </div>
        )}
        {picked && (
          // On phones the card sits between the search card and the results sheet.
          <div
            className="pointer-events-none absolute z-[600]"
            style={{ top: "calc(var(--map-overlay-top) + var(--map-popover-offset))", bottom: "var(--map-overlay-bottom)", left: "var(--map-overlay-left)", right: "var(--map-overlay-right)" }}
          >
            <ParkingCard
              pick={picked}
              live={live}
              settings={settings}
              onClose={() => setPicked(null)}
              onGo={(p) => {
                setPicked(null);
                place("to", p);
              }}
            />
          </div>
        )}
      </main>

      {/* Phones: floating search card + bottom sheet over the map. Desktop: one card floating over the map. */}
      <aside className="pointer-events-none absolute inset-0 z-[1000] flex flex-col lg:pointer-events-auto lg:inset-auto lg:top-6 lg:bottom-6 lg:left-6 lg:w-[560px] lg:overflow-y-auto lg:rounded-[28px] lg:border lg:border-[var(--line)] lg:bg-[var(--panel)] lg:shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
        <div
          ref={topRef}
          className="pointer-events-auto mx-2 mt-[max(0.5rem,env(safe-area-inset-top))] rounded-2xl border border-[var(--line)] bg-[var(--panel)]/95 shadow-xl backdrop-blur lg:m-0 lg:mt-0 lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none lg:backdrop-blur-none"
        >
          <header className="flex items-center gap-3 px-3 pt-2.5 pb-2 lg:sticky lg:gap-2 lg:top-0 lg:z-20 lg:border-b lg:border-[var(--line)] lg:bg-[var(--panel)]/95 lg:px-6 lg:py-4 lg:backdrop-blur">
            <Logo />
            <span className="ml-auto hidden min-w-0 lg:flex">
              <LiveStatus departAt={departAt} />
            </span>
            <nav className="ml-auto flex shrink-0 items-center gap-0.5 lg:ml-0">
              <Link href="/profilis" className="rounded-md px-2 py-1 text-xs text-[var(--muted)] hover:bg-[var(--chip)] hover:text-[var(--ink)] lg:px-1.5 lg:py-1.5 lg:text-[13px] whitespace-nowrap">
                Profilis
              </Link>
              <Link href="/apie" className="rounded-md px-2 py-1 text-xs text-[var(--muted)] hover:bg-[var(--chip)] hover:text-[var(--ink)] lg:px-1.5 lg:py-1.5 lg:text-[13px] whitespace-nowrap">
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

          <div className={`${collapsed ? "hidden lg:flex" : "flex"} flex-col gap-3 px-3 pb-3 lg:gap-4 lg:px-6 lg:pt-5 lg:pb-2`}>
            <div className={plan ? "hidden" : "hidden lg:block"}>
              <h1 className="font-display text-[22px] leading-tight font-bold">Kuo važiuoti iš A į B?</h1>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Palyginkite automobilį, autobusą, dviratį, paspirtuką ir kojas: laiką su spūstimis ir A juostomis, kainą su parkavimu, CO₂.
              </p>
            </div>

            {/* Route box: A and B joined by a dashed lane line. */}
            <div className="relative lg:rounded-2xl lg:border lg:border-[var(--line)] lg:bg-[var(--panel)] lg:p-3 lg:shadow-[0_2px_8px_rgba(15,23,42,0.06)]">
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
                <span className="ml-auto hidden lg:block">
                  <NowClock departAt={departAt} />
                </span>
                {collapsed === false && plan && (
                  <button type="button" onClick={() => setEditing(false)} className="ml-auto text-sm font-semibold text-[var(--marking)] lg:hidden">
                    Gerai
                  </button>
                )}
              </div>
              {picking && <p className="mt-2 text-xs text-[var(--marking)]">Bakstelėkite žemėlapyje, kur yra {picking === "from" ? "A" : "B"} taškas.</p>}
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

            {!plan && !loading && !error && usual && (
              <button
                type="button"
                onClick={() => setTo({ pos: usual.to, label: usual.label })}
                className="flex items-center gap-3 rounded-2xl border border-[var(--marking)]/60 bg-[var(--panel)] p-3 text-left"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[var(--marking)] font-display text-sm font-extrabold text-white">B</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">Į {usual.label}?</span>
                  <span className="block text-xs text-[var(--muted)]">Paprastai išvykstate apie {fmtClock(usual.departSec)} · {usual.count} kartai</span>
                </span>
              </button>
            )}
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
                <div className="flex items-center justify-between gap-2">
                  <span className="eyebrow">Multimodalinė matrica</span>
                  {best && (
                    <span className="rounded-full border border-[#a7f3d0] bg-[var(--accent-soft)] px-3 py-1 text-xs font-medium text-[var(--marking)]">
                      Rekomenduojama: {bestHybrid ? hybridTitle(bestHybrid) : bestMode ? MODE_META[bestMode].short : ""}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <div className="seg flex-1" role="group" aria-label="Kas svarbiausia?">
                    {PRIORITIES.map((p) => (
                      <button key={p.id} type="button" aria-pressed={settings.priority === p.id} onClick={() => setSettings({ ...settings, priority: p.id })}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    disabled={updatingCar}
                    onClick={() => setRefresh((v) => v + 1)}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[var(--line)] text-[var(--muted)] hover:text-[var(--ink)] disabled:opacity-50"
                    title={updatingCar ? "Atnaujinama…" : "Atnaujinti eismą"}
                    aria-label="Atnaujinti eismą"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={updatingCar ? "animate-spin" : ""}>
                      <path d="M21 12a9 9 0 1 1-2.64-6.36L21 8" />
                      <path d="M21 3v5h-5" />
                    </svg>
                  </button>
                </div>

                <ModeMatrix plan={plan} modes={modes} best={bestMode} selected={sel?.id ?? null} onSelect={selectMode} />
                {!modes.length && !hybrids.length && !updatingCar && hybridState.settled && (
                  <p role="status" className="rounded-xl bg-[var(--chip)] p-3 text-sm text-[var(--muted)]">
                    Šiai kelionei tinkamų būdų neradome. Pabandykite kitą išvykimo laiką arba pakeiskite kelionės nustatymus.
                  </p>
                )}
                {driving.error && <p role="status" className="text-sm text-[var(--stop)]">{driving.error}</p>}
                {stay && plan.car && settings.hasCar && <StayLine stay={stay} onPick={pickStay} />}

                {/* Car + second leg (P+R, VT, Cyclocity, scooter): the best one open, the rest folded. */}
                {topHybrid ? (
                  <HybridCard plan={plan} h={topHybrid} car={car} isBest={topHybrid.id === best} open={selected === topHybrid.id} sig={sig} onSelect={() => selectMode(topHybrid.id)} />
                ) : !hybridState.settled && settings.hasCar ? (
                  <div className="flex items-center gap-2 rounded-2xl border border-dashed border-[var(--line)] px-3 py-2.5 text-sm text-[var(--muted)]" role="status">
                    <span className="traffic-light scale-75" aria-hidden>
                      <i />
                      <i />
                      <i />
                    </span>
                    Ieškome derinių su automobiliu…
                  </div>
                ) : null}
                <MoreHybrids
                  items={moreHybrids}
                  selected={selected}
                  onSelect={selectMode}
                  render={(h) => <HybridCard plan={plan} h={h} car={car} isBest={h.id === best} open sig={sig} onSelect={() => selectMode(h.id)} />}
                />
                {hybridState.note && hybrids.length > 0 && <p className="text-[11px] text-[var(--muted)]">{hybridState.note}</p>}
                {!plan.transit && plan.transitNote && <p className="-mt-1 text-xs text-[var(--muted)]">Viešasis transportas: {plan.transitNote}</p>}

                {sel && (
                  <>
                    <div className="border-t border-[var(--line)]" />
                    <ImpactTiles modes={modes} sel={sel} />
                    {sel.feasible && <RouteSteps plan={plan} mode={sel} toLabel={to?.label ?? "B"} />}
                    <ModeExtras
                      plan={plan}
                      mode={sel}
                      parking={{ settings: tripSettings, parkingId: chosenParking?.id ?? null, onParking: setParkingId, updating: updatingCar, error: driving.error }}
                    />
                    {sel.feasible && <NavButton plan={plan} mode={sel.id} className="lg:hidden" />}
                  </>
                )}

                {car?.feasible && plan.car && <Savings modes={modes} alt={alt} onAlt={setAlt} settings={tripSettings} carDistance={plan.car.distance} />}

                <p className="text-[11px] leading-relaxed text-[var(--muted)]">
                  Tvarkaraščiai: LTSA nacionalinis GTFS ({plan.timetable.window}){plan.timetable.shifted && " – pasirinkta data už ribų, naudojama ta pati savaitės diena"}.
                  Automobilis: {plan.car?.traffic.provider === "tomtom" ? "TomTom eismo maršrutas" : "apytikslis OSRM / Via Lietuva vertinimas"}. Dviratis ir pėsčiomis: OSRM / OpenStreetMap. Orai: meteo.lt.
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
        {plan && sel?.feasible && (
          <div className="sticky bottom-0 z-20 mt-auto hidden bg-gradient-to-t from-[var(--panel)] from-60% to-transparent px-6 pt-6 pb-5 lg:block">
            <NavButton plan={plan} mode={sel.id} />
          </div>
        )}
      </aside>
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
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[var(--marking)] font-display text-xs font-extrabold text-white">{n}</span>
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
