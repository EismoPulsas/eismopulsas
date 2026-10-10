"use client";

import Link from "next/link";
import { Logo } from "@/components/Logo";
import { useSettings } from "@/components/planner/settings";
import { NumberField, PRIORITIES } from "@/components/planner/SettingsPanel";
import { DEFAULT_SETTINGS, FUELS, isEv, type Fuel, type Settings } from "@/lib/metrics";
import type { Connector } from "@/lib/plan-types";

// The user's profile: what car they have and how they like to travel. It stays in
// this browser only; the planner reads it to price parking, offer chargers to EVs, etc.

const CONNECTORS: { id: Connector; label: string; hint: string }[] = [
  { id: "T2", label: "Type 2", hint: "AC, dauguma Europos automobilių" },
  { id: "CCS", label: "CCS", hint: "greitas DC" },
  { id: "CHADEMO", label: "CHAdeMO", hint: "greitas DC, pvz. senesni Nissan Leaf" },
  { id: "T1", label: "Type 1", hint: "AC, senesni Azijos / JAV modeliai" },
];

function Card({ title, tone, children }: { title: string; tone: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-[var(--line)] bg-[var(--panel)]/80 p-4">
      <h2 className="text-xs font-semibold tracking-wide uppercase" style={{ color: tone }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Check({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: React.ReactNode }) {
  return (
    <label className="flex items-start gap-2.5 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--marking)]" />
      <span>
        {label}
        {hint && <span className="block text-xs text-[var(--muted)]">{hint}</span>}
      </span>
    </label>
  );
}

export function ProfileView() {
  const [s, save, ready] = useSettings();
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => save({ ...s, [k]: v });
  const fuel = FUELS[s.fuel];
  const ev = isEv(s);
  const toggleConnector = (c: Connector, on: boolean) => set("connectors", on ? [...new Set([...s.connectors, c])] : s.connectors.filter((x) => x !== c));

  return (
    <div className="asphalt min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--bg)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <Logo />
          <Link href="/" className="ml-auto rounded-md bg-[var(--marking)] px-3 py-1.5 text-sm font-semibold text-black">
            Į planavimą
          </Link>
        </div>
      </header>

      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Profilis</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Pagal jį skaičiuojame kainas, parenkame, kur palikti automobilį, ir rodome įkrovimo vietas. Saugoma tik šioje naršyklėje – niekur nesiunčiama.
          </p>
        </div>

        <fieldset disabled={!ready} className="flex flex-col gap-4">
          <Card title="Automobilis" tone="var(--car)">
            <Check checked={s.hasCar} onChange={(v) => set("hasCar", v)} label="Turiu automobilį" hint="Jei ne, automobilio variantas palyginime nerodomas kaip galimas." />
            {s.hasCar && (
              <>
                <div className="seg flex-wrap" role="group" aria-label="Kuro tipas">
                  {(Object.keys(FUELS) as Fuel[]).map((f) => (
                    <button key={f} type="button" aria-pressed={s.fuel === f} onClick={() => save({ ...s, fuel: f, consumption: FUELS[f].consumption, fuelPrice: FUELS[f].price })}>
                      {FUELS[f].label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <NumberField label="Sąnaudos" value={s.consumption} unit={`${fuel.unit}/100 km`} step={0.1} min={1} max={40} onChange={(v) => set("consumption", v)} />
                  <NumberField label="Kaina" value={s.fuelPrice} unit={`€/${fuel.unit}`} step={0.01} min={0} max={5} onChange={(v) => set("fuelPrice", v)} />
                </div>
                {s.fuel === "hybrid" && (
                  <Check checked={s.plugIn} onChange={(v) => set("plugIn", v)} label="Įkraunamas hibridas (galiu krauti iš lizdo)" hint="Tada žemėlapyje ir parkavimo pasiūlymuose matysite įkrovimo vietas." />
                )}
                <Check checked={s.wear} onChange={(v) => set("wear", v)} label="Įskaičiuoti nusidėvėjimą ir servisą (0,12 €/km)" />
              </>
            )}
          </Card>

          {s.hasCar && ev && (
            <Card title="Įkrovimas" tone="#22d3ee">
              <p className="text-xs text-[var(--muted)]">
                Įkrovimo vietos rodomos tik elektromobiliams ir įkraunamiems hibridams. Pasiūlysime vietas, kur galite palikti automobilį ir tuo metu jį įkrauti.
              </p>
              <div className="flex flex-col gap-2" role="group" aria-label="Jungtys">
                <span className="text-xs text-[var(--muted)]">Kokias jungtis tinka jūsų automobiliui?</span>
                {CONNECTORS.map((c) => (
                  <Check key={c.id} checked={s.connectors.includes(c.id)} onChange={(v) => toggleConnector(c.id, v)} label={c.label} hint={c.hint} />
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <NumberField label="Didžiausia AC galia" value={s.acKw} unit="kW" step={0.1} min={1} max={43} onChange={(v) => set("acKw", v)} />
                <NumberField label="Didžiausia DC galia" value={s.dcKw} unit="kW" step={5} min={0} max={400} onChange={(v) => set("dcKw", v)} />
                <NumberField label="Baterijos talpa" value={s.batteryKwh} unit="kWh" step={1} min={5} max={200} onChange={(v) => set("batteryKwh", v)} />
              </div>
              {s.fuel === "electric" ? (
                <Check
                  checked={s.evPermit}
                  onChange={(v) => set("evPermit", v)}
                  label="Turiu JUDU elektromobilio leidimą"
                  hint={
                    <>
                      Nemokamas. Vilniuje leidžia nemokamai stovėti geltonojoje, žaliojoje ir raudonojoje zonose bei JUDU aikštelėse be užtvarų; mėlynojoje – pirma valanda
                      nemokama, antra 3,50 €, toliau 4 €/val. JUDU puslapio formuluotės dėl raudonosios zonos nevienodos – pasitikrinkite.{" "}
                      <a href="https://judu.lt/en/for-drivers/permits-concessions/parking-permits-for-electric-vehicles/" target="_blank" rel="noreferrer" className="text-[var(--marking)] underline">
                        JUDU
                      </a>
                    </>
                  }
                />
              ) : (
                <p className="text-xs text-[var(--muted)]">JUDU elektromobilio leidimas hibridams neišduodamas.</p>
              )}
            </Card>
          )}

          {s.hasCar && (
            <Card title="Parkavimas" tone="var(--sign-blue)">
              <NumberField label="Kiek dažniausiai stovite tikslo vietoje" value={s.parkingHours} unit="val." step={0.5} min={0.5} max={24} onChange={(v) => set("parkingHours", v)} />
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-[var(--muted)]">Kiek daugiausia sutinkate eiti nuo automobilio iki tikslo?</span>
                <div className="seg" role="group" aria-label="Didžiausias ėjimas">
                  {[5, 10, 15, 20].map((m) => (
                    <button key={m} type="button" aria-pressed={s.maxWalkMin === m} onClick={() => set("maxWalkMin", m)}>
                      {m} min
                    </button>
                  ))}
                </div>
              </div>
            </Card>
          )}

          <Card title="Viešasis transportas" tone="var(--transit)">
            <div className="seg" role="group" aria-label="Bilietas">
              <button type="button" aria-pressed={s.ticket === "single"} onClick={() => set("ticket", "single")}>
                Vienkartinis
              </button>
              <button type="button" aria-pressed={s.ticket === "pass"} onClick={() => set("ticket", "pass")}>
                30 d. bilietas
              </button>
            </div>
            <div className="seg" role="group" aria-label="Nuolaida">
              {([0, 50, 80] as const).map((d) => (
                <button key={d} type="button" aria-pressed={s.discount === d} onClick={() => set("discount", d)}>
                  {d ? `−${d} % nuolaida` : "Be nuolaidos"}
                </button>
              ))}
            </div>
          </Card>

          <Card title="Kas svarbiausia" tone="var(--marking)">
            <div className="seg flex-wrap" role="group" aria-label="Prioritetas">
              {PRIORITIES.map((p) => (
                <button key={p.id} type="button" aria-pressed={s.priority === p.id} onClick={() => set("priority", p.id)}>
                  {p.label}
                </button>
              ))}
            </div>
            <NumberField label="Kelionių šiuo maršrutu per savaitę" value={s.tripsPerWeek} unit="kel." step={1} min={1} max={28} onChange={(v) => set("tripsPerWeek", Math.round(v))} />
          </Card>
        </fieldset>

        <button type="button" onClick={() => save(DEFAULT_SETTINGS)} className="self-start text-xs text-[var(--muted)] underline hover:text-[var(--ink)]">
          Atstatyti numatytuosius
        </button>
      </main>
    </div>
  );
}
