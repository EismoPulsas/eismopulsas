"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";

export type Accident = {
  id: number;
  lat: number;
  lng: number;
  severity: "fatal" | "injury" | "damage";
  date: string | null;
  municipality: string | null;
  street: string | null;
};

// One color per category. The legend is built from this same object,
// so adding a category here updates both the markers and the legend.
const SEVERITY = {
  fatal: { color: "#b91c1c", label: "Žuvusieji" },
  injury: { color: "#ea580c", label: "Sužeistieji" },
  damage: { color: "#ca8a04", label: "Tik materialinė žala" },
} as const;

const LITHUANIA_CENTER: [number, number] = [55.17, 23.88];

export default function AccidentMap() {
  const [accidents, setAccidents] = useState<Accident[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Runs once when the map appears: ask our API for data.
  useEffect(() => {
    fetch("/api/accidents")
      .then((res) => {
        if (!res.ok) throw new Error(`API grąžino klaidą ${res.status}`);
        return res.json();
      })
      .then(setAccidents)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="relative h-full w-full">
      <MapContainer center={LITHUANIA_CENTER} zoom={7} className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {accidents.map((a) => (
          <CircleMarker
            key={a.id}
            center={[a.lat, a.lng]}
            radius={8}
            pathOptions={{
              color: SEVERITY[a.severity]?.color ?? "#555",
              fillOpacity: 0.7,
            }}
          >
            <Popup>
              <strong>{SEVERITY[a.severity]?.label ?? a.severity}</strong>
              <br />
              {a.street && <>{a.street}, </>}
              {a.municipality}
              <br />
              {a.date}
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>

      {/* Legend: color, meaning, and how many points of each kind */}
      <div className="absolute bottom-6 left-3 z-[1000] rounded-md bg-white px-3 py-2 text-sm text-gray-900 shadow">
        {Object.entries(SEVERITY).map(([key, s]) => (
          <div key={key} className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full" style={{ background: s.color }} />
            {s.label}: {accidents.filter((a) => a.severity === key).length}
          </div>
        ))}
        {error && <p className="mt-1 text-red-700">Nepavyko įkelti duomenų: {error}</p>}
      </div>
    </div>
  );
}
