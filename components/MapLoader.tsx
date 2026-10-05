"use client";

// Leaflet needs the browser's `window`, which doesn't exist during server
// rendering. `ssr: false` makes Next.js load the map only in the browser.
import dynamic from "next/dynamic";

const Dashboard = dynamic(() => import("./map/Dashboard"), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh items-center justify-center bg-[var(--bg)] text-[var(--muted)]">
      <span className="animate-pulse">Kraunamas eismo pulsas…</span>
    </div>
  ),
});

export default function MapLoader() {
  return <Dashboard />;
}
