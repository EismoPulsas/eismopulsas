"use client";

import { useEffect, useState } from "react";
import { samePoint, wazeNavigationUrl, wazeUrl } from "@/lib/driving";
import type { CarLeg, ParkingOption } from "@/lib/plan-types";
import { fmtDur } from "./format";

const FALLBACK = {
  "missing-key": "Eismo paslauga nesukonfigūruota", quota: "Pasiektas nemokamos eismo paslaugos limitas",
  authentication: "Eismo paslaugos prieiga nepasiekiama", timeout: "Eismo paslauga neatsakė laiku",
  "provider-error": "Eismo paslauga laikinai nepasiekiama", "invalid-response": "Eismo paslauga pateikė netinkamą atsakymą",
};
const clock = (at: string) => new Intl.DateTimeFormat("lt-LT", { timeZone: "Europe/Vilnius", hour: "2-digit", minute: "2-digit" }).format(new Date(at));

/** Reusable for a standalone car trip or the car portion of a hybrid. */
export function CarDriveDetails({ leg, parking, searchSec = 0, walkSec = 0, updating = false, error }: { leg: CarLeg; parking?: ParkingOption; searchSec?: number; walkSec?: number; updating?: boolean; error?: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000); // age label only; no API polling
    return () => clearInterval(timer);
  }, []);
  const age = Math.max(0, Math.floor((now - Date.parse(leg.traffic.calculatedAt)) / 60000));
  const ready = !updating && !error && (!parking || samePoint(leg.to, parking.navigationPos ?? parking.pos));
  const status = { live: "Dabartinis eismas", predicted: "Prognozė pagal išvykimo laiką", approximate: "Apytikslis vertinimas" }[leg.traffic.mode];
  if (!ready) return (
    <div className="flex flex-col gap-2 text-sm" role={error ? "alert" : "status"}>
      <p>{error ?? "Atnaujinamas važiavimo maršrutas ir laikas…"}</p>
      {parking && <p className="text-xs text-[var(--muted)]">Važiavimo tikslas: {parking.name}.</p>}
      {error && <p className="text-xs text-[var(--muted)]">Pabandykite atnaujinti arba pasirinkite kitą stovėjimo vietą.</p>}
    </div>
  );
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex justify-between gap-3"><span>Numatomas važiavimas</span><b>{fmtDur(leg.duration)}</b></div>
      <p className="text-xs text-[var(--muted)]">
        {leg.traffic.provider === "tomtom" ? "TomTom" : "OSRM / OpenStreetMap"} · {status.toLowerCase()} · skaičiuota {clock(leg.traffic.calculatedAt)} ({age ? `prieš ${age} min.` : "ką tik"}).
        {age >= 5 && " Duomenys gali būti pasikeitę – atnaujinkite prieš išvykdami."}
      </p>
      {leg.baseDuration !== null && <div className="flex justify-between gap-3 text-xs text-[var(--muted)]"><span>OSRM pradinis važiavimo laikas</span><span>{fmtDur(leg.baseDuration)}</span></div>}
      {leg.traffic.delaySeconds !== null && <div className="flex justify-between gap-3 text-xs text-[var(--muted)]"><span>Eismo korekcija (jau įskaičiuota)</span><span>{leg.traffic.delaySeconds < 0 ? "−" : "+"}{fmtDur(leg.traffic.delaySeconds)}</span></div>}
      {parking?.curb && <p className="rounded-lg bg-[var(--chip)] p-2 text-xs">↳ Privažiuosite iš tos pusės, kur stovėjimo vietos – jos bus dešinėje, nereikės kirsti priešpriešinės juostos.</p>}
      <div className="flex justify-between gap-3"><span>Iki automobilio (prielaida)</span><span>+2 min</span></div>
      <div className="flex justify-between gap-3"><span>Vietos paieška (vertinimas)</span><span>+{fmtDur(searchSec)}</span></div>
      <div className="flex justify-between gap-3"><span>Pėsčiomis nuo automobilio</span><span>+{fmtDur(walkSec)}</span></div>
      {leg.traffic.fallbackReason && <p className="rounded-lg bg-[var(--chip)] p-2 text-xs">{FALLBACK[leg.traffic.fallbackReason]}. Naudojamas apytikslis atsarginis skaičiavimas; kelių darbai ir uždarymai gali būti neįvertinti.</p>}
      {leg.traffic.partialCoverage && <p className="text-xs text-[var(--muted)]">Jutikliai neapima viso maršruto. Kitoms atkarpoms taikomos įprasto eismo prielaidos.</p>}
      {leg.traffic.sensors.length > 0 && <p className="text-xs text-[var(--muted)]">Via Lietuva: {leg.traffic.sensors.map((s) => `${s.name} ${s.speed} km/h`).join("; ")}. Seniausias naudotas matavimas: {clock(leg.traffic.observedAt!)}.</p>}
      {leg.warnings.map((w, i) => <p key={`${w.kind}-${i}`} className="rounded-lg bg-[var(--wait)]/10 p-2 text-xs">{w.text}{w.at && ` · ${clock(w.at)}`}</p>)}
      <p className="text-xs text-[var(--muted)]">
        Orai: {leg.weather.status === "unavailable" ? "prognozė šiam maršrutui ir laikui nepasiekiama" : leg.weather.status === "partial" ? "prognozė apima dalį kelionės" : "prognozė patikrinta kelionės pradžioje, viduryje ir pabaigoje"}.
        {leg.weather.forecastCreatedAt && ` Prognozė sudaryta ${clock(leg.weather.forecastCreatedAt)}.`} Šaltinis: Lietuvos hidrometeorologijos tarnyba (Meteo.lt, CC BY-SA 4.0). Orai neprideda papildomų minučių.
      </p>
      <div className="flex flex-wrap gap-2">
        <a href={wazeUrl(leg)} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-[var(--sign-blue)] px-3 py-2 font-semibold text-white" aria-label={parking ? `Atidaryti Waze maršrutą į ${parking.name}` : "Atidaryti Waze važiavimo maršrutą"}>Atidaryti Waze</a>
        <a href={wazeNavigationUrl(leg)} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-[var(--line)] px-3 py-2" aria-label="Naviguoti Waze nuo dabartinės vietos">Naviguoti nuo mano vietos</a>
      </div>
      <p className="text-xs text-[var(--muted)]">{parking && `Važiavimo tikslas: ${parking.name}. `}„Atidaryti Waze“ parodo maršrutą su įvestu šios atkarpos išvykimo tašku ir tikslu. Navigacija programėlėje prasideda nuo dabartinės jūsų vietos. Waze parenka savo maršrutą.{parking && !parking.navigationPos && " Naudojamos vietos koordinatės; tikslus įvažiavimas šaltinyje nenurodytas."}</p>
    </div>
  );
}
