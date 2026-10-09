// BFF client. The app only talks to our own backend (Next.js on Vercel or a dev
// machine); never to routing, GTFS or parking providers directly.
//
// EXPO_PUBLIC_API_BASE_URL (public, embedded in the app — never put secrets in it):
//   Android emulator → http://10.0.2.2:3000
//   physical phone   → http://<dev machine LAN IP>:3000 (same Wi-Fi)
//   Preview / prod   → https://<deployment>.vercel.app

import type { PlanError, PlanRequest, PlanResponse } from "./contract";

const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL?.trim().replace(/\/+$/, "") ?? "";
const TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  if (!BASE_URL) {
    throw new ApiError("Nenustatytas serverio adresas (EXPO_PUBLIC_API_BASE_URL, žr. README).", "no_base_url");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, { ...init, signal: controller.signal });
  } catch {
    throw new ApiError("Nepavyko susisiekti su serveriu. Patikrinkite interneto ryšį.", "network");
  } finally {
    clearTimeout(timer);
  }
  const body = (await res.json().catch(() => null)) as T | PlanError | null;
  if (!res.ok || body === null) {
    const err = body as PlanError | null;
    throw new ApiError(err?.error ?? `Serverio klaida (${res.status})`, err?.code ?? `http_${res.status}`);
  }
  return body as T;
}

export function fetchPlan(request: PlanRequest): Promise<PlanResponse> {
  return call<PlanResponse>("/api/mobility/plan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
}

/** Legacy public endpoint, reused unchanged (STRUCTURE.md › Reuse map). Submit-based: no autocomplete. */
export type GeocodeResult = { lat: number; lng: number; label: string; street: string | null; city: string | null };
export function geocode(query: string): Promise<GeocodeResult[]> {
  return call<GeocodeResult[]>(`/api/geocode?q=${encodeURIComponent(query)}`);
}

export const apiBaseUrl = BASE_URL;
