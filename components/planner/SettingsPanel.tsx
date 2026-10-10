"use client";

import { FUELS, type Fuel, type Priority, type Settings } from "@/lib/metrics";

export const PRIORITIES: { id: Priority; label: string }[] = [
  { id: "balanced", label: "Subalansuotai" },
  { id: "fast", label: "Greičiausia" },
  { id: "cheap", label: "Pigiausia" },
  { id: "green", label: "Žaliausia" },
];

export function NumberField({
  label,
  value,
  unit,
  step,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  unit: string;
  step: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  // The unit sits beside the number (never under it); the browser's spin arrows are hidden.
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs text-[var(--muted)]">
      {label}
      <span className="field flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          className="tnum w-full min-w-0 flex-1 [appearance:textfield] bg-transparent text-base text-[var(--ink)] outline-none lg:text-sm [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          value={value}
          step={step}
          min={min}
          max={max}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
          }}
        />
        <span className="shrink-0 text-xs whitespace-nowrap">{unit}</span>
      </span>
    </label>
  );
}

/** Section title: a dot in the mode's colour, the words in ink (mode colours are too pale for text). */
function Legend({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <legend className="mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-[var(--ink)] uppercase">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} aria-hidden />
      {children}
    </legend>
  );
}

export function SettingsPanel({ s, onChange }: { s: Settings; onChange: (s: Settings) => void }) {
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...s, [k]: v });
  const fuel = FUELS[s.fuel];
  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <Legend color="var(--car)">Automobilis</Legend>
        <div className="seg flex-wrap">
          {(Object.keys(FUELS) as Fuel[]).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={s.fuel === f}
              onClick={() => onChange({ ...s, fuel: f, consumption: FUELS[f].consumption, fuelPrice: FUELS[f].price })}
            >
              {FUELS[f].label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Sąnaudos" value={s.consumption} unit={`${fuel.unit}/100 km`} step={0.1} min={1} max={40} onChange={(v) => set("consumption", v)} />
          <NumberField label="Kaina" value={s.fuelPrice} unit={`€/${fuel.unit}`} step={0.01} min={0} max={5} onChange={(v) => set("fuelPrice", v)} />
        </div>
        <NumberField label="Kiek stovėsite tikslo vietoje" value={s.parkingHours} unit="val." step={0.5} min={0} max={24} onChange={(v) => set("parkingHours", v)} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={s.wear} onChange={(e) => set("wear", e.target.checked)} className="h-4 w-4 accent-[var(--marking)]" />
          Įskaičiuoti nusidėvėjimą ir servisą (0,12 €/km)
        </label>
        <p className="text-[11px] text-[var(--muted)]">Numatyta – LEA 2026 m. rugpjūčio vidutinės kainos.</p>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <Legend color="var(--transit)">Viešasis transportas</Legend>
        <div className="seg">
          <button type="button" aria-pressed={s.ticket === "single"} onClick={() => set("ticket", "single")}>
            Vienkartinis
          </button>
          <button type="button" aria-pressed={s.ticket === "pass"} onClick={() => set("ticket", "pass")}>
            30 d. bilietas
          </button>
        </div>
        <div className="seg">
          {([0, 50, 80] as const).map((d) => (
            <button key={d} type="button" aria-pressed={s.discount === d} onClick={() => set("discount", d)}>
              {d ? `−${d} % nuolaida` : "Be nuolaidos"}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <Legend color="#f472b6">Paspirtukas (Bolt ir kt.)</Legend>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Atrakinimas" value={s.scooterUnlock} unit="€" step={0.05} min={0} max={5} onChange={(v) => set("scooterUnlock", v)} />
          <NumberField label="Minutė" value={s.scooterPerMin} unit="€/min" step={0.01} min={0} max={2} onChange={(v) => set("scooterPerMin", v)} />
        </div>
        <p className="text-[11px] text-[var(--muted)]">Kainas įrašykite iš savo programėlės.</p>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <Legend color="var(--marking)">Kaip dažnai važiuojate</Legend>
        <NumberField label="Kelionių šiuo maršrutu per savaitę" value={s.tripsPerWeek} unit="kel." step={1} min={1} max={28} onChange={(v) => set("tripsPerWeek", Math.round(v))} />
        <p className="text-[11px] text-[var(--muted)]">Į darbą ir atgal 5 d. per savaitę = 10. Iš to – metinis sutaupymas.</p>
      </fieldset>
    </div>
  );
}
