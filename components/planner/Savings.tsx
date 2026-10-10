"use client";

import { savingsVsCar, TREE_KG_YEAR, type ModeId, type ModeSummary, type Settings } from "@/lib/metrics";
import { fmtCo2, fmtDur, fmtEur, fmtEur0, fmtNum, MODE_META } from "./format";
import { TreeIcon } from "./icons";

const ALT_LABEL: Record<Exclude<ModeId, "car">, string> = {
  transit: "viešuoju transportu",
  bike: "dviračiu",
  walk: "pėsčiomis",
};

export function Savings({
  modes,
  alt,
  onAlt,
  settings,
  carDistance,
}: {
  modes: ModeSummary[];
  alt: Exclude<ModeId, "car">;
  onAlt: (m: Exclude<ModeId, "car">) => void;
  settings: Settings;
  carDistance: number;
}) {
  const car = modes.find((m) => m.id === "car");
  const options = modes.filter((m): m is ModeSummary & { id: Exclude<ModeId, "car"> } => m.id !== "car" && m.feasible);
  const other = options.find((m) => m.id === alt) ?? options[0];
  if (!car || !other) return null;
  const s = savingsVsCar(car, other, settings, carDistance);
  const cheaper = s.perTrip.money >= 0;
  const faster = s.perTrip.time >= 0;
  const trees = Math.max(0, s.perYear.trees);
  const shown = Math.min(24, Math.round(trees));

  return (
    <section aria-label="Sutaupymas" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-sm font-semibold tracking-wide text-[var(--muted)] uppercase">Jei vietoj automobilio…</h2>
        {options.length > 1 && (
          <div className="seg text-xs">
            {options.map((o) => (
              <button key={o.id} type="button" aria-pressed={o.id === other.id} onClick={() => onAlt(o.id)}>
                {MODE_META[o.id].short.split(" ")[0]}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={`road-sign ${cheaper && s.perTrip.co2 > 0 ? "" : "blue"}`}>
        <div className="road-sign-inner">
          <div className="flex items-baseline justify-between gap-2">
            <div className="font-display text-[15px] font-bold">…važiuosite {ALT_LABEL[other.id]}</div>
            <div className="text-xs opacity-85">vienai kelionei</div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <Big label={cheaper ? "sutaupysite" : "brangiau"} value={fmtEur(Math.abs(s.perTrip.money))} />
            <Big label={faster ? "greičiau" : "ilgiau užtruks"} value={fmtDur(s.perTrip.time)} />
            <Big label={s.perTrip.co2 >= 0 ? "mažiau CO₂" : "daugiau CO₂"} value={fmtCo2(s.perTrip.co2)} />
          </div>

          <div className="my-3 h-0.5 bg-white/80" />

          <div className="flex items-baseline justify-between gap-2">
            <div className="font-display text-[15px] font-bold">Per metus</div>
            <div className="text-xs opacity-85">
              {settings.tripsPerWeek} kel./sav. × 46 sav. = {fmtNum(s.perYear.trips)} kel.
            </div>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <Big label={cheaper ? "sutaupysite" : "išleisite daugiau"} value={fmtEur0(Math.abs(s.perYear.money))} big />
            <Big
              label={faster ? "laimėsite laiko" : "praleisite kelyje"}
              value={`${fmtNum(Math.abs(s.perYear.hours))} val.`}
              big
            />
            <Big label={s.perYear.co2 >= 0 ? "išvengsite CO₂" : "papildomai CO₂"} value={fmtCo2(s.perYear.co2)} big />
          </div>

          {trees >= 0.5 && (
            <div className="mt-3 rounded-lg bg-black/15 p-2.5">
              <div className="flex flex-wrap gap-0.5 text-[#bff5c9]" aria-hidden>
                {Array.from({ length: shown }, (_, i) => (
                  <TreeIcon key={i} size={18} />
                ))}
                {trees > shown && <span className="ml-1 self-center text-xs font-bold">+{fmtNum(trees - shown)}</span>}
              </div>
              <div className="mt-1 text-sm">
                Tiek CO₂ per metus sugeria <b>{fmtNum(trees)} {treeWord(trees)}</b>{" "}
                <span className="text-xs opacity-80">(≈ {TREE_KG_YEAR} kg/medžiui)</span>
              </div>
            </div>
          )}
          {other.id !== "transit" && other.kcal > 0 && (
            <div className="mt-2 text-xs opacity-90">
              Ir dar: ≈ {fmtNum((other.kcal * s.perYear.trips) / 1000, 1)} tūkst. kcal per metus – tarsi {fmtNum((other.kcal * s.perYear.trips) / 7700, 1)} kg riebalų.
            </div>
          )}
          {s.perYear.fuel > 1 && settings.fuel !== "electric" && (
            <div className="mt-1 text-xs opacity-90">Nesudeginsite ≈ {fmtNum(s.perYear.fuel)} l degalų per metus.</div>
          )}
        </div>
      </div>
    </section>
  );
}

function treeWord(n: number) {
  const r = Math.round(n);
  if (r % 10 === 1 && r % 100 !== 11) return "medis";
  if (r % 10 === 0 || (r % 100 >= 11 && r % 100 <= 19)) return "medžių";
  return "medžiai";
}

function Big({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="min-w-0">
      <div className={`tnum font-display leading-tight font-bold ${big ? "text-xl" : "text-lg"}`}>{value}</div>
      <div className="text-[11px] leading-tight opacity-85">{label}</div>
    </div>
  );
}
