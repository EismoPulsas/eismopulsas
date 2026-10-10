"use client";

import { useEffect, useState } from "react";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/metrics";

// The profile lives only in this browser (localStorage). The planner and /profilis
// share it; v1 (before the profile page) is read once and carried over.

const KEY = "ep-settings-v2";
const OLD_KEY = "ep-settings-v1";

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(OLD_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_SETTINGS;
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}

/** Settings restored after mount (localStorage is browser-only), saved on every change. */
export function useSettings(): [Settings, (s: Settings) => void, boolean] {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettings(loadSettings());
    setReady(true);
  }, []);
  const update = (s: Settings) => {
    setSettings(s);
    saveSettings(s);
  };
  return [settings, update, ready];
}
