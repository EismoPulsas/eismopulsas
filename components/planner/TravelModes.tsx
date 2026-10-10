"use client";

import { FUELS, isEv, TRAVEL_MODES, type Settings, type TravelMode } from "@/lib/metrics";

// What the user is willing to travel by, right under A and B. Only options that use these
// vehicles alone are shown (walking goes with every one); the choice is kept in the profile.

const LABEL: Record<TravelMode, string> = { car: "Automobilis", transit: "Viešasis tr.", scooter: "Paspirtukas", bike: "Dviratis" };
const TITLE: Record<TravelMode, string> = {
  car: "Automobiliu – iki pat tikslo arba dalį kelio",
  transit: "Autobusu, troleibusu, traukiniu",
  scooter: "Nuomojamu arba savu paspirtuku",
  bike: "Cyclocity arba savu dviračiu",
};

export const travelOn = (s: Settings, m: TravelMode) => (m === "car" ? s.hasCar && s.travel.includes("car") : s.travel.includes(m));

/**
 * The car charges from a plug: a hybrid becomes a plug-in one, anything else electric (with
 * electricity prices). Unticked, a plug-in hybrid stays a hybrid and an EV goes back to petrol.
 */
function withEv(s: Settings, on: boolean): Settings {
  if (s.fuel === "hybrid") return { ...s, plugIn: on };
  const fuel = on ? "electric" : "petrol";
  return { ...s, fuel, consumption: FUELS[fuel].consumption, fuelPrice: FUELS[fuel].price };
}

export function TravelModes({ s, onChange }: { s: Settings; onChange: (s: Settings) => void }) {
  const toggle = (m: TravelMode, on: boolean) => {
    const travel = on ? [...new Set([...s.travel, m])] : s.travel.filter((x) => x !== m);
    // Ticking the car means there is one, even if the profile said otherwise.
    onChange({ ...s, travel, ...(m === "car" && on ? { hasCar: true } : {}) });
  };
  const none = !TRAVEL_MODES.some((m) => travelOn(s, m));
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">Kuo keliausite?</legend>
      <div className="flex flex-wrap gap-1.5">
        {TRAVEL_MODES.map((m) => {
          const on = travelOn(s, m);
          return (
            <label key={m} className="cursor-pointer" title={TITLE[m]}>
              <input type="checkbox" className="peer sr-only" checked={on} onChange={(e) => toggle(m, e.target.checked)} />
              <span
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px] transition select-none peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--marking)] ${
                  on ? "border-[var(--marking)] bg-[var(--accent-soft)] font-semibold text-[var(--marking)]" : "border-[var(--line)] bg-[var(--panel)] text-[var(--muted)] hover:border-[#cbd5e1] hover:text-[var(--ink)]"
                }`}
              >
                <span className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${on ? "border-[var(--marking)] bg-[var(--marking)] text-white" : "border-[#cbd5e1] bg-[var(--panel)]"}`} aria-hidden>
                  {on && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m5 12 5 5 9-10" />
                    </svg>
                  )}
                </span>
                {LABEL[m]}
              </span>
            </label>
          );
        })}
      </div>
      {(travelOn(s, "car") || travelOn(s, "scooter") || travelOn(s, "bike")) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {travelOn(s, "car") && (
            <label className="flex items-center gap-1.5 text-xs" title="Parkavimo vietas rodysime dviem sąrašais: kur galima ir pasikrauti, ir kur tiesiog pastatyti. Jungtis ir JUDU leidimą nurodykite profilyje.">
              <input type="checkbox" checked={isEv(s)} onChange={(e) => onChange(withEv(s, e.target.checked))} className="h-3.5 w-3.5 accent-[var(--marking)]" />
              {s.fuel === "hybrid" ? "Įkraunamas hibridas" : "Elektromobilis"}
            </label>
          )}
          {travelOn(s, "scooter") && (
            <label className="flex items-center gap-1.5 text-xs" title="Nereikės nuomotis: važiuosite savo paspirtuku, o su automobiliu – pastatysite jį bet kur pakeliui ir tęsite paspirtuku.">
              <input type="checkbox" checked={s.ownScooter} onChange={(e) => onChange({ ...s, ownScooter: e.target.checked })} className="h-3.5 w-3.5 accent-[var(--marking)]" />
              Turiu savo paspirtuką
            </label>
          )}
          {travelOn(s, "bike") && (
            <label className="flex items-center gap-1.5 text-xs" title="Vietoj Cyclocity – savo dviračiu (deriniuose su automobiliu lieka Cyclocity).">
              <input type="checkbox" checked={s.ownBike} onChange={(e) => onChange({ ...s, ownBike: e.target.checked })} className="h-3.5 w-3.5 accent-[var(--marking)]" />
              Turiu savo dviratį
            </label>
          )}
        </div>
      )}
      {none && <p className="text-xs text-[var(--stop)]">Pažymėkite bent vieną – kitaip liks tik trumpas ėjimas pėsčiomis.</p>}
    </fieldset>
  );
}
