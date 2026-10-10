"use client";

import { useEffect, useState } from "react";
import { samePoint } from "@/lib/driving";
import type { CarLeg, ParkingOption } from "@/lib/plan-types";
import { fmtDur } from "./format";

const FALLBACK = {
  "missing-key": "Eismo paslauga nesukonfigūruota", quota: "Pasiektas nemokamos eismo paslaugos limitas",
  authentication: "Eismo paslaugos prieiga nepasiekiama", timeout: "Eismo paslauga neatsakė laiku",
  "provider-error": "Eismo paslauga laikinai nepasiekiama", "invalid-response": "Eismo paslauga pateikė netinkamą atsakymą",
};
const clock = (at: string) => new Intl.DateTimeFormat("lt-LT", { timeZone: "Europe/Vilnius", hour: "2-digit", minute: "2-digit" }).format(new Date(at));

/** Where the driving time comes from: provider, traffic, sensors, warnings and weather. */
export function CarDriveDetails({ leg, parking, updating = false, error }: { leg: CarLeg; parking?: ParkingOption; updating?: boolean; error?: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000); // age label only; no API polling
    return () => clearInterval(timer);
  }, []);
  const age = Math.max(0, Math.floor((now - Date.parse(leg.traffic.calculatedAt)) / 60000));
  const ready = !updating && !error && (!parking || samePoint(leg.to, parking.navigationPos ?? parking.pos));
  const status = { live: "dabartinis eismas", predicted: "prognozė pagal išvykimo laiką", approximate: "apytikslis vertinimas" }[leg.traffic.mode];
  if (!ready)
    return (
      <p className="text-xs" role={error ? "alert" : "status"}>
        {error ? `${error} Pabandykite atnaujinti arba pasirinkite kitą stovėjimo vietą.` : "Atnaujinamas važiavimo maršrutas ir laikas…"}
      </p>
    );
  const rows: [string, string][] = [];
  if (leg.baseDuration !== null) rows.push(["Be eismo (OSRM)", fmtDur(leg.baseDuration)]);
  if (leg.traffic.delaySeconds !== null) rows.push(["Eismo korekcija, jau įskaičiuota", `${leg.traffic.delaySeconds < 0 ? "−" : "+"}${fmtDur(leg.traffic.delaySeconds)}`]);
  return (
    <div className="flex flex-col gap-1.5 text-xs text-[var(--muted)]">
      <p>
        {leg.traffic.provider === "tomtom" ? "TomTom" : "OSRM / OpenStreetMap"} · {status} · skaičiuota {clock(leg.traffic.calculatedAt)} ({age ? `prieš ${age} min.` : "ką tik"})
        {age >= 5 && <b className="text-[var(--ink)]"> – atnaujinkite prieš išvykdami</b>}
      </p>
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3">
          <span>{k}</span>
          <span className="tnum">{v}</span>
        </div>
      ))}
      {parking?.curb && <p>↳ Privažiuosite iš tos pusės, kur stovėjimo vietos – jos bus dešinėje.</p>}
      {leg.traffic.fallbackReason && <p>{FALLBACK[leg.traffic.fallbackReason]}: laikas apytikslis, kelių darbai ir uždarymai gali būti neįvertinti.</p>}
      {leg.traffic.partialCoverage && <p>Jutikliai neapima viso maršruto – kitur taikomos įprasto eismo prielaidos.</p>}
      {leg.traffic.sensors.length > 0 && (
        <p>
          Via Lietuva: {leg.traffic.sensors.map((s) => `${s.name} ${s.speed} km/h`).join("; ")} ({clock(leg.traffic.observedAt!)}).
        </p>
      )}
      {leg.warnings.map((w, i) => (
        <p key={`${w.kind}-${i}`} className="rounded-lg bg-[var(--wait)]/10 p-2 text-[var(--ink)]">
          {w.text}
          {w.at && ` · ${clock(w.at)}`}
        </p>
      ))}
      <p>
        Orai (Meteo.lt):{" "}
        {leg.weather.status === "unavailable" ? "prognozė nepasiekiama" : leg.weather.status === "partial" ? "prognozė apima dalį kelionės" : "patikrinta pradžioje, viduryje ir pabaigoje"}; minučių
        neprideda.
      </p>
    </div>
  );
}
