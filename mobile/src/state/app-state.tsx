// App state (STRUCTURE.md › B2): profile and saved trips are loaded from the phone at
// start; the current trip draft and the latest plan live in memory. Screens get ids via
// route params and read objects from here. No global state library.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { ApiError, fetchPlan } from "@/api/client";
import type { MobilityProfile, PlanRequest, PlanResponse, Preference } from "@/api/contract";
import { buildRequest, DEFAULT_PROFILE, emptyDraft, newId, nextDayFor, type SavedTrip, type TripDraft } from "@/domain/trip";
import { loadProfile, loadTrips, saveProfile, saveTrips } from "@/state/storage";

export type PlanState =
  | { status: "idle" }
  | { status: "loading"; request: PlanRequest }
  | { status: "ok"; request: PlanRequest; response: PlanResponse }
  | { status: "error"; request: PlanRequest; message: string; code: string };

type AppState = {
  ready: boolean;
  profile: MobilityProfile;
  updateProfile: (next: MobilityProfile | ((current: MobilityProfile) => MobilityProfile)) => void;
  trips: SavedTrip[];
  saveTrip: (name: string) => SavedTrip | null;
  deleteTrip: (id: string) => SavedTrip | undefined;
  restoreTrip: (trip: SavedTrip) => void;
  draft: TripDraft;
  updateDraft: (patch: Partial<TripDraft>) => void;
  plan: PlanState;
  /** Saved trip the current plan was opened from, if any. */
  planTripId: string | null;
  startPlan: (preference?: Preference) => boolean;
  retryPlan: () => void;
  cancelPlan: () => void;
  openSavedTrip: (trip: SavedTrip) => boolean;
};

const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<MobilityProfile>(DEFAULT_PROFILE);
  const [trips, setTrips] = useState<SavedTrip[]>([]);
  const [draft, setDraft] = useState<TripDraft>(emptyDraft);
  const [plan, setPlan] = useState<PlanState>({ status: "idle" });
  const [planTripId, setPlanTripId] = useState<string | null>(null);
  const seq = useRef(0);
  const active = useRef<AbortController | null>(null);
  const savedId = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const sequence = seq;
    const pending = active;
    Promise.all([loadProfile(), loadTrips()]).then(([p, t]) => {
      if (!mounted) return;
      setProfile(p);
      setTrips(t);
      setReady(true);
    });
    return () => {
      mounted = false;
      ++sequence.current;
      pending.current?.abort();
    };
  }, []);

  const updateProfile = useCallback((update: MobilityProfile | ((current: MobilityProfile) => MobilityProfile)) => {
    setProfile((current) => {
      const next = typeof update === "function" ? update(current) : update;
      void saveProfile(next);
      return next;
    });
  }, []);

  const setTripsPersist = useCallback((update: (t: SavedTrip[]) => SavedTrip[]) => {
    setTrips((prev) => {
      const next = update(prev);
      saveTrips(next);
      return next;
    });
  }, []);

  const run = useCallback(
    (request: PlanRequest, tripId: string | null) => {
      if (active.current) return false;
      const controller = new AbortController();
      active.current = controller;
      const id = ++seq.current;
      savedId.current = tripId;
      setPlanTripId(tripId);
      setPlan({ status: "loading", request });
      fetchPlan(request, controller.signal)
        .then((response) => {
          if (id !== seq.current) return; // a newer request replaced this one
          setPlan({ status: "ok", request, response });
          const rec = response.options.find((o) => o.id === response.recommendation?.optionId);
          if (tripId && rec) {
            const last = { at: response.generatedAt, title: rec.title, durationMin: rec.metrics.durationMin };
            setTripsPersist((t) => t.map((x) => (x.id === tripId ? { ...x, last } : x)));
          }
        })
        .catch((err: unknown) => {
          if (id !== seq.current) return;
          const e = err instanceof ApiError ? err : new ApiError("Nepavyko gauti maršrutų.", "unknown");
          setPlan({ status: "error", request, message: e.message, code: e.code });
        })
        .finally(() => {
          if (active.current === controller) active.current = null;
        });
      return true;
    },
    [setTripsPersist],
  );

  const startPlan = useCallback(
    (preference?: Preference) => {
      if (!ready) return false;
      const request = preference && plan.status !== "idle"
        ? { ...plan.request, profile: { ...(plan.request.profile ?? profile), preference } }
        : buildRequest(draft, profile, preference);
      return request ? run(request, preference ? planTripId : null) : false;
    },
    [ready, draft, profile, run, plan, planTripId],
  );

  const retryPlan = useCallback(() => {
    if (ready && plan.status === "error") run(plan.request, planTripId);
  }, [ready, plan, planTripId, run]);

  const cancelPlan = useCallback(() => {
    if (!active.current) return;
    ++seq.current;
    active.current.abort();
    active.current = null;
    setPlan((previous) => previous.status === "loading" ? { status: "idle" } : previous);
  }, []);

  const openSavedTrip = useCallback(
    (trip: SavedTrip) => {
      if (!ready || active.current) return false;
      const next: TripDraft = {
        origin: trip.origin,
        destination: trip.destination,
        arriveByTime: trip.arriveByTime,
        day: nextDayFor(trip.arriveByTime),
        stayMinutes: trip.stayMinutes,
      };
      const request = buildRequest(next, profile);
      if (!request || !run(request, trip.id)) return false;
      setDraft(next);
      return true;
    },
    [ready, profile, run],
  );

  const saveTrip = useCallback(
    (name: string) => {
      if (!ready || plan.status !== "ok" || !name.trim() || savedId.current) return null;
      const request = plan.request;
      const rec = plan.response.options.find((o) => o.id === plan.response.recommendation?.optionId);
      const trip: SavedTrip = {
        id: newId(),
        name: name.trim(),
        origin: request.origin,
        destination: request.destination,
        arriveByTime: request.arriveBy.slice(11, 16),
        ...(request.stayMinutes ? { stayMinutes: request.stayMinutes } : {}),
        createdAt: new Date().toISOString(),
        ...(rec ? { last: { at: plan.response.generatedAt, title: rec.title, durationMin: rec.metrics.durationMin } } : {}),
      };
      savedId.current = trip.id; // synchronous guard, including taps before React renders
      setTripsPersist((t) => [...t, trip]);
      setPlanTripId(trip.id);
      return trip;
    },
    [ready, plan, setTripsPersist],
  );

  const deleteTrip = useCallback(
    (id: string) => {
      const trip = trips.find((t) => t.id === id);
      setTripsPersist((t) => t.filter((x) => x.id !== id));
      return trip;
    },
    [trips, setTripsPersist],
  );

  const restoreTrip = useCallback((trip: SavedTrip) => setTripsPersist((t) => t.some((x) => x.id === trip.id) ? t : [...t, trip]), [setTripsPersist]);
  const updateDraft = useCallback((patch: Partial<TripDraft>) => setDraft((d) => ({ ...d, ...patch })), []);

  const value = useMemo<AppState>(
    () => ({
      ready,
      profile,
      updateProfile,
      trips,
      saveTrip,
      deleteTrip,
      restoreTrip,
      draft,
      updateDraft,
      plan,
      planTripId,
      startPlan,
      retryPlan,
      cancelPlan,
      openSavedTrip,
    }),
    [ready, profile, updateProfile, trips, saveTrip, deleteTrip, restoreTrip, draft, updateDraft, plan, planTripId, startPlan, retryPlan, cancelPlan, openSavedTrip],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppState must be used inside AppStateProvider");
  return v;
}
