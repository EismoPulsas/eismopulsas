"use client";

// Leaflet needs the browser's `window`, which doesn't exist during server
// rendering. `ssr: false` makes Next.js load the map only in the browser.
import dynamic from "next/dynamic";

const AccidentMap = dynamic(() => import("./AccidentMap"), {
  ssr: false,
  loading: () => <p className="p-4">Kraunamas žemėlapis…</p>,
});

export default function MapLoader() {
  return <AccidentMap />;
}
