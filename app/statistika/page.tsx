import type { Metadata } from "next";
import Link from "next/link";
import statsJson from "@/public/data/stats.json";
import { nf } from "@/lib/data";
import { shortMuni, type Stats } from "@/lib/stats";
import { SiteHeader } from "@/components/SiteHeader";
import { AgeChart, Columns, Counter, HBars, HourWeekGrid, MakesChart, MunicipalityRanking } from "@/components/stats/charts";

export const metadata: Metadata = {
  title: "Statistika",
  description: "Avaringiausios automobilių markės, savivaldybės, gatvės ir amžiaus grupės Lietuvoje 2021–2025 m.",
};

const stats = statsJson as unknown as Stats;

function Card({ id, kicker, title, children, wide }: { id?: string; kicker: string; title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <section id={id} className={`rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5 sm:p-6 ${wide ? "lg:col-span-2" : ""}`}>
      <div className="text-[11px] font-semibold tracking-[0.14em] text-[var(--accent)] uppercase">{kicker}</div>
      <h2 className="font-display mt-1 mb-4 text-xl font-semibold sm:text-2xl">{title}</h2>
      {children}
    </section>
  );
}

function Tile({ label, value, note, tone }: { label: string; value: number; note?: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
      <div className="text-sm text-[var(--muted)]">{label}</div>
      <Counter value={value} className="mt-1 block text-3xl font-semibold tabular-nums sm:text-4xl" />
      {note && (
        <div className="mt-1 flex items-center gap-1.5 text-xs text-[var(--muted)]">
          {tone && <span className="h-2 w-2 rounded-full" style={{ background: tone }} />}
          {note}
        </div>
      )}
    </div>
  );
}

export default function StatsPage() {
  const years = stats.years.map(String);
  const totals = years.reduce(
    (s, y) => {
      const t = stats.yearTotals[y];
      return { all: s.all + t.all, counted: s.counted + t.counted, killed: s.killed + t.killed, injured: s.injured + t.injured };
    },
    { all: 0, counted: 0, killed: 0, injured: 0 },
  );
  const muniName = (code: string) => shortMuni(stats.municipalities.find((m) => m.code === code)?.name ?? code);
  const bmwStops = stats.busStopsBmw;
  const drunkShare = (stats.fun.drunkCulprits / stats.fun.culprits) * 100;

  return (
    <div className="min-h-dvh">
      <SiteHeader active="/statistika" />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        {/* Hero */}
        <div className="max-w-3xl">
          <h1 className="font-display text-3xl leading-tight font-bold sm:text-5xl">
            Lietuvos eismo <span className="text-[var(--accent)]">pulsas</span> skaičiais
          </h1>
          <p className="mt-3 text-[var(--muted)] sm:text-lg">
            {years[0]}–{years.at(-1)} m. policijos užregistruoti eismo įvykiai, palyginti su gyventojų skaičiumi ir Regitros
            duomenimis. Visi skaičiai – iš atvirų valstybės duomenų.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label="Eismo įvykiai" value={totals.all} note="įskaitant tik materialinę žalą" />
          <Tile label="Su nukentėjusiais" value={totals.counted} note="įskaitiniai įvykiai" />
          <Tile label="Žuvo" value={totals.killed} tone="#ff4d5e" note={`~${Math.round(totals.killed / years.length)} per metus`} />
          <Tile label="Sužeista" value={totals.injured} tone="#ffb020" note={`~${nf.format(Math.round(totals.injured / years.length / 365))} per dieną`} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* 2.4 BMW counter */}
          <Card id="bmw" kicker="Skaitiklis" title="Kiek kartų BMW „aplankė“ stotelę?">
            <div className="flex items-end gap-4">
              <Counter value={bmwStops.length} className="font-display text-7xl leading-none font-bold text-[#ff4d5e] tabular-nums sm:text-8xl" />
              <div className="pb-2 text-sm text-[var(--muted)]">
                BMW eismo įvykiai keleivinio transporto
                <br />
                sustojimo vietose {years[0]}–{years.at(-1)} m.
              </div>
            </div>
            <ul className="mt-4 space-y-1 text-sm">
              {bmwStops.map((b) => (
                <li key={b.date} className="flex gap-3">
                  <span className="shrink-0 whitespace-nowrap text-[var(--muted)] tabular-nums">{b.date.slice(0, 10)}</span>
                  <span className="truncate">
                    {b.model ? `BMW ${b.model}` : "BMW"} · {b.place}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-5 rounded-xl bg-[var(--bg)] p-4">
              <div className="mb-2 text-sm">
                Visų markių stotelių įvykiai: <b>{stats.fun.busStops}</b>. Kas „lankosi“ dažniausiai?
              </div>
              <HBars
                rows={stats.fun.busStopMakes.map((m) => ({
                  key: m.make,
                  label: m.make,
                  value: m.n,
                  display: String(m.n),
                  highlight: m.make === "BMW",
                }))}
              />
              <p className="mt-2 text-xs text-[var(--muted)]">
                Spoileris: dažniausiai stotelėse į įvykius patenka patys autobusai. BMW – garbinga {stats.fun.busStopMakes.findIndex((m) => m.make === "BMW") + 1} vieta.
              </p>
            </div>
          </Card>

          {/* Fun facts */}
          <Card kicker="Faktai" title="Keisti, bet tikri skaičiai">
            <dl className="grid grid-cols-2 gap-3">
              {[
                { v: stats.fun.friday13, l: "įvykių penktadienį, 13-ąją", i: "🐈‍⬛" },
                { v: stats.fun.fled, l: "kartų kaltininkas pasišalino", i: "🏃" },
                { v: stats.fun.animals, l: "susidūrimų su gyvūnais", i: "🦌" },
                { v: stats.fun.scooters, l: "įvykių su el. paspirtukais", i: "🛴" },
              ].map((f) => (
                <div key={f.l} className="rounded-xl bg-[var(--bg)] p-3">
                  <div className="text-2xl">{f.i}</div>
                  <Counter value={f.v} className="mt-1 block text-2xl font-semibold tabular-nums" />
                  <div className="text-xs text-[var(--muted)]">{f.l}</div>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-sm">
              <b>{drunkShare.toFixed(1)}%</b> kaltininkų buvo neblaivūs arba apsvaigę.
            </p>
            <div className="mt-4">
              <div className="mb-2 text-sm font-medium">Avaringiausi adresai (sveiki atvykę į prekybos centrų aikšteles)</div>
              <ol className="space-y-1 text-sm">
                {stats.fun.topAddresses
                  .filter((a) => /\d/.test(a.place))
                  .slice(0, 5)
                  .map((a, i) => (
                    <li key={a.place} className="flex justify-between gap-3">
                      <span className="truncate">
                        <span className="mr-2 text-[var(--muted)]">{i + 1}.</span>
                        {a.place}
                      </span>
                      <span className="tabular-nums text-[var(--muted)]">{a.n}</span>
                    </li>
                  ))}
              </ol>
            </div>
          </Card>

          {/* 2.1 makes */}
          <Card id="markes" kicker="2.1 · Automobilių markės" title="Kurios markės dažniausiai pakliūna į įvykius?" wide>
            <MakesChart makes={stats.makes} />
          </Card>

          {/* 2.2 municipalities */}
          <Card id="savivaldybes" kicker="2.2 · Savivaldybės" title="Miestų ir rajonų avaringumo reitingas">
            <MunicipalityRanking stats={stats} />
          </Card>

          {/* 2.5 streets */}
          <Card id="gatves" kicker="2.5 · Gatvės" title="Pavojingiausių gatvių TOP 15">
            <HBars
              rows={stats.streets.slice(0, 15).map((s) => ({
                key: s.code + s.street,
                label: `${s.street}, ${muniName(s.code)}`,
                value: s.counted,
                display: nf.format(s.counted),
                detail: `${s.killed} žuvo · ${s.injured} sužeista · ${nf.format(s.all)} visų įv.`,
              }))}
            />
            <p className="mt-3 text-xs text-[var(--muted)]">
              Įvykiai su nukentėjusiais {years[0]}–{years.at(-1)} m. Gatvė skaičiuojama atskirai kiekvienoje savivaldybėje.{" "}
              <Link href="/" className="text-[var(--accent)] hover:underline">
                Žiūrėti žemėlapyje →
              </Link>
            </p>
          </Card>

          {/* 2.3 ages */}
          <Card id="amzius" kicker="2.3 · Amžius" title="Kaltininkai pagal amžių" wide>
            <AgeChart ages={stats.ages} />
          </Card>

          {/* Extra: when */}
          <Card kicker="Laikas" title="Kada pavojingiausia?" wide>
            <HourWeekGrid grid={stats.hourWeek} />
          </Card>

          <Card kicker="Tendencija" title="Žuvusieji pagal metus">
            <Columns
              height={160}
              items={years.map((y) => ({
                label: y,
                value: stats.yearTotals[y].killed,
                detail: `${y} m.: ${stats.yearTotals[y].killed} žuvo, ${nf.format(stats.yearTotals[y].injured)} sužeista`,
              }))}
            />
          </Card>

          <Card kicker="Šaltiniai" title="Iš kur duomenys?">
            <ul className="space-y-2 text-sm">
              {stats.sources.map((s) => (
                <li key={s.url}>
                  <a href={s.url} className="text-[var(--accent)] hover:underline" target="_blank" rel="noreferrer">
                    {s.name}
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-[var(--muted)]">
              Atnaujinta {stats.generatedAt.slice(0, 10)}. Policijos duomenų rinkinyje kai kurie metai registruoja daugiau
              susidūrimų su gyvūnais ar tik materialinės žalos įvykių nei kiti – lyginkite atsargiai.
            </p>
          </Card>
        </div>
      </main>
    </div>
  );
}
