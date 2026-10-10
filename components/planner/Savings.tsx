"use client";

import { savingsVsCar, TREE_KG_YEAR, type ModeId, type ModeSummary, type Settings } from "@/lib/metrics";
import { fmtCo2, fmtDur, fmtEur, fmtEur0, fmtNum } from "./format";
import { ClockIcon, CoinIcon, TreeIcon } from "./icons";

/** Reads on from the title: "Jei vietoj automobilio… viešuoju transportu". */
const ALT_NAME: Record<Exclude<ModeId, "car">, string> = {
  transit: "Viešuoju transportu",
  bikeshare: "Cyclocity dviračiu",
  scooter: "Paspirtuku",
  bike: "Dviračiu",
  walk: "Pėsčiomis",
};

/**
 * What leaving the car at home gives over a year: money and CO₂ as the two big numbers (green
 * when the alternative wins, amber when it loses), the time as one quiet line under them.
 */
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
  const cleaner = s.perTrip.co2 >= 0;
  const faster = s.perTrip.time >= 0;
  const trees = s.perYear.trees;

  return (
    <section
      aria-label="Sutaupymas"
      className={`flex flex-col gap-3 rounded-2xl border p-3 ${cheaper || cleaner ? "border-[#a7f3d0] bg-gradient-to-b from-[#ecfdf5] to-[var(--panel)]" : "border-[var(--line)] bg-[var(--panel)]"}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-sm font-bold tracking-wide uppercase">Jei vietoj automobilio…</h2>
        <span className="shrink-0 text-[11px] text-[var(--muted)]" title={`${fmtNum(s.perYear.trips)} kelionių per metus – keiskite nustatymuose žemiau`}>
          per metus · {settings.tripsPerWeek} kel./sav.
        </span>
      </div>

      <div className="-mx-1 -mt-1 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none]" role="group" aria-label="Kuo vietoj automobilio">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={o.id === other.id}
            onClick={() => onAlt(o.id)}
            className={`shrink-0 rounded-full border px-3 py-1 text-[13px] transition ${o.id === other.id ? "border-[var(--ink)] bg-[var(--ink)] font-semibold text-white" : "border-[var(--line)] bg-[var(--panel)] text-[var(--muted)] hover:text-[var(--ink)]"}`}
          >
            {ALT_NAME[o.id]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <BigNumber
          good={cheaper}
          icon={<CoinIcon size={15} />}
          label={cheaper ? "Sutaupysite" : "Kainuos daugiau"}
          value={`${cheaper ? "" : "+"}${fmtEur0(Math.abs(s.perYear.money))}`}
          sub={`${fmtEur(Math.abs(s.perTrip.money))} kas kelionę`}
        />
        <BigNumber
          good={cleaner}
          icon={<TreeIcon size={15} />}
          label={cleaner ? "Mažiau CO₂" : "Daugiau CO₂"}
          value={`${cleaner ? "" : "+"}${bigCo2(s.perYear.co2)}`}
          sub={cleaner && trees >= 0.5 ? `Tiek sugeria ${fmtNum(trees)} ${treeWord(trees)}` : `${fmtCo2(s.perTrip.co2)} kas kelionę`}
          title={cleaner ? `≈ ${TREE_KG_YEAR} kg CO₂ per metus sugeria vienas medis` : undefined}
        />
      </div>

      <p className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
        <ClockIcon size={14} className="shrink-0" />
        {Math.abs(s.perTrip.time) < 60
          ? "Kelyje – tiek pat laiko"
          : `Kelyje ${faster ? "trumpiau" : "ilgiau"}: ${fmtDur(s.perTrip.time)} kas kelionę, ${fmtNum(Math.abs(s.perYear.hours))} val. per metus`}
      </p>
    </section>
  );
}

/** A big yearly CO₂ number needs no decimals once it is in the hundreds of kilograms. */
const bigCo2 = (kg: number) => (Math.abs(kg) >= 100 && Math.abs(kg) < 1000 ? `${fmtNum(Math.abs(kg))} kg` : fmtCo2(kg));

function treeWord(n: number) {
  const r = Math.round(n);
  if (r % 10 === 1 && r % 100 !== 11) return "medis";
  if (r % 10 === 0 || (r % 100 >= 11 && r % 100 <= 19)) return "medžių";
  return "medžiai";
}

/** One yearly number on a white tile: green when switching wins it, amber when it loses it. */
function BigNumber({ good, icon, label, value, sub, title }: { good: boolean; icon: React.ReactNode; label: string; value: string; sub: string; title?: string }) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-[var(--line)] bg-[var(--panel)] p-2.5" title={title}>
      <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: good ? "#047857" : "#b45309" }}>
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full" style={{ background: good ? "#d1fae5" : "#fef3c7" }}>
          {icon}
        </span>
        {label}
      </span>
      <span className="tnum mt-1.5 font-display text-[26px] leading-none font-bold whitespace-nowrap" style={{ color: good ? "#047857" : "#b45309" }}>
        {value}
      </span>
      <span className="mt-1 truncate text-[11px] text-[var(--muted)]">{sub}</span>
    </div>
  );
}
