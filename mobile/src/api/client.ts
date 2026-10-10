// BFF client. The app only talks to our own backend (Next.js on Vercel or a dev
// machine); never to routing, GTFS or parking providers directly.
//
// EXPO_PUBLIC_API_BASE_URL (public, embedded in the app — never put secrets in it):
//   Android emulator → http://10.0.2.2:3000
//   physical phone   → http://<dev machine LAN IP>:3000 (same Wi-Fi)
//   Preview / prod   → https://<deployment>.vercel.app

import { Platform } from "react-native";

import type { PlanRequest, PlanResponse } from "./contract";
import { isGeocodeResponse, isPlanResponse } from "./validate-response";

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

function configurationError(): ApiError | null {
  if (!BASE_URL) return new ApiError("Nenustatytas serverio adresas. Kreipkitės į programėlės paruošėją.", "no_base_url");
  try {
    const url = new URL(BASE_URL);
    if (!/^https?:$/.test(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
      throw new Error("Invalid origin");
    }
    if (Platform.OS !== "web" && /^(localhost|127(?:\.\d+){3}|\[::1\]|0\.0\.0\.0)$/i.test(url.hostname)) {
      return new ApiError("Serverio adresas šiame telefone nepasiekiamas. Kreipkitės į programėlės paruošėją.", "invalid_base_url");
    }
  } catch {
    return new ApiError("Neteisingas serverio adresas. Kreipkitės į programėlės paruošėją.", "invalid_base_url");
  }
  return null;
}

export const apiConfigurationError = configurationError();

async function call<T>(path: string, valid: (body: unknown) => body is T, init?: RequestInit, signal?: AbortSignal): Promise<T> {
  if (apiConfigurationError) throw apiConfigurationError;
  if (signal?.aborted) throw new ApiError("Užklausa atšaukta.", "cancelled");
  const controller = new AbortController();
  let rejectDeadline: (error: ApiError) => void = () => {};
  const deadline = new Promise<never>((_, reject) => { rejectDeadline = reject; });
  const cancel = () => {
    controller.abort();
    rejectDeadline(new ApiError("Užklausa atšaukta.", "cancelled"));
  };
  signal?.addEventListener("abort", cancel, { once: true });
  let timedOut = false;
  // Keep the timeout active through body decoding, not just until headers arrive.
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
    rejectDeadline(new ApiError("Serveris neatsakė laiku. Patikrinkite interneto ryšį ir bandykite dar kartą.", "timeout"));
  }, TIMEOUT_MS);
  try {
    const { res, body } = await Promise.race([
      (async () => {
        const res = await fetch(`${BASE_URL}${path}`, { ...init, signal: controller.signal });
        const body: unknown = await res.json().catch((error: unknown) => {
          if (controller.signal.aborted) throw error;
          return null;
        });
        return { res, body };
      })(),
      deadline,
    ]);
    if (!res.ok) {
      const error = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : null;
      const code = body && typeof body === "object" && "code" in body && typeof body.code === "string" ? body.code : `http_${res.status}`;
      const message = res.status === 401 || res.status === 403
        ? "Serveris neleidžia pasiekti duomenų. Kreipkitės į programėlės paruošėją."
        : res.status === 429
          ? "Per daug užklausų. Palaukite ir bandykite dar kartą."
          : res.status >= 500
            ? "Serveris laikinai nepasiekiamas. Pabandykite dar kartą."
            : error ?? "Nepavyko gauti duomenų. Pabandykite dar kartą.";
      throw new ApiError(message, code);
    }
    if (!valid(body)) throw new ApiError("Serveris grąžino netinkamus duomenis. Pabandykite dar kartą.", "invalid_response");
    return body;
  } catch (error) {
    if (signal?.aborted) throw new ApiError("Užklausa atšaukta.", "cancelled");
    if (timedOut) throw new ApiError("Serveris neatsakė laiku. Patikrinkite interneto ryšį ir bandykite dar kartą.", "timeout");
    if (error instanceof ApiError) throw error;
    throw new ApiError("Nepavyko susisiekti su serveriu. Patikrinkite interneto ryšį.", "network");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}

export function fetchPlan(request: PlanRequest, signal?: AbortSignal): Promise<PlanResponse> {
  return call<PlanResponse>("/api/mobility/plan", isPlanResponse, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  }, signal);
}

/** Legacy public endpoint, reused unchanged (STRUCTURE.md › Reuse map). Submit-based: no autocomplete. */
export type GeocodeResult = { lat: number; lng: number; label: string; street: string | null; city: string | null };
export function geocode(query: string, signal?: AbortSignal): Promise<GeocodeResult[]> {
  return call<GeocodeResult[]>(`/api/geocode?q=${encodeURIComponent(query)}`, isGeocodeResponse, undefined, signal);
}

export const apiBaseUrl = BASE_URL;
