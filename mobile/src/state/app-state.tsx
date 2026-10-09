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
  updateProfile: (next: MobilityProfile) => void;
  trips: SavedTrip[];
  saveTrip: (name: string) => SavedTrip | null;
  deleteTrip: (id: string) => SavedTrip | undefined;
  restoreTrip: (trip: SavedTrip) => void;
  draft: TripDraft;
  updateDraft: (patch: Partial<TripDraft>) => void;
  plan: PlanState;
  /** Saved trip the current plan was opened from, if any. */
  planTripId: string | null;
  startPlan: (preference?: Preference) => void;
  openSavedTrip: (trip: SavedTrip) => void;
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

  useEffect(() => {
    Promise.all([loadProfile(), loadTrips()]).then(([p, t]) => {
      setProfile(p);
      setTrips(t);
      setReady(true);
    });
  }, []);

  const updateProfile = useCallback((next: MobilityProfile) => {
    setProfile(next);
    saveProfile(next);
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
      const id = ++seq.current;
      setPlanTripId(tripId);
      setPlan({ status: "loading", request });
      fetchPlan(request)
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
        });
    },
    [setTripsPersist],
  );

  const startPlan = useCallback(
    (preference?: Preference) => {
      const request = buildRequest(draft, profile, preference);
      if (request) run(request, preference ? planTripId : null);
    },
    [draft, profile, run, planTripId],
  );

  const openSavedTrip = useCallback(
    (trip: SavedTrip) => {
      const next: TripDraft = {
        origin: trip.origin,
        destination: trip.destination,
        arriveByTime: trip.arriveByTime,
        day: nextDayFor(trip.arriveByTime),
        stayMinutes: trip.stayMinutes,
      };
      setDraft(next);
      const request = buildRequest(next, profile);
      if (request) run(request, trip.id);
    },
    [profile, run],
  );

  const saveTrip = useCallback(
    (name: string) => {
      if (!draft.origin || !draft.destination || !name.trim()) return null;
      const trip: SavedTrip = {
        id: newId(),
        name: name.trim(),
        origin: draft.origin,
        destination: draft.destination,
        arriveByTime: draft.arriveByTime,
        ...(draft.stayMinutes ? { stayMinutes: draft.stayMinutes } : {}),
        createdAt: new Date().toISOString(),
      };
      setTripsPersist((t) => [...t, trip]);
      setPlanTripId(trip.id);
      return trip;
    },
    [draft, setTripsPersist],
  );

  const deleteTrip = useCallback(
    (id: string) => {
      const trip = trips.find((t) => t.id === id);
      setTripsPersist((t) => t.filter((x) => x.id !== id));
      return trip;
    },
    [trips, setTripsPersist],
  );

  const restoreTrip = useCallback((trip: SavedTrip) => setTripsPersist((t) => [...t, trip]), [setTripsPersist]);
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
      openSavedTrip,
    }),
    [ready, profile, updateProfile, trips, saveTrip, deleteTrip, restoreTrip, draft, updateDraft, plan, planTripId, startPlan, openSavedTrip],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppState must be used inside AppStateProvider");
  return v;
}
