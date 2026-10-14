import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { BusIcon, CarIcon, CoinIcon, RainIcon, TreeIcon, UserIcon } from "@/components/planner/icons";

export const metadata: Metadata = {
  title: "Apie mus",
  description: "Eismo Pulsas – ne dar vienas žemėlapis: palygina visus būdus nukeliauti iš A į B Lietuvoje ir parodo visą kelionės kainą, parkavimą ir sutaupymą per metus.",
};

const P = () => <b className="font-display text-[15px] leading-none">P</b>;
const FEATURES: { icon: React.ReactNode; color: string; title: string; text: string }[] = [
  {
    icon: <CoinIcon size={20} />,
    color: "#059669",
    title: "Visa kelionės kaina",
    text: "Degalai pagal jūsų automobilį, parkavimas pagal zoną ir tai, kiek stovėsite, bilietai pagal miestą. Kainos, kurios nežinome, nerodome kaip nemokamos.",
  },
  {
    icon: <P />,
    color: "#2f6fdf",
    title: "Kur palikti automobilį",
    text: "Gatvės ir aikštelės prie tikslo: kaina, ėjimas ir tikimybė rasti laisvą vietą (Vilniuje – pagal JUDU gyvus ir istorinius duomenis). Elektromobiliui – ir įkrovimas.",
  },
  {
    icon: <BusIcon size={20} />,
    color: "#7c3aed",
    title: "Automobilis + autobusas",
    text: "Dalį kelio automobiliu, tada P+R ir viešasis transportas, Cyclocity dviratis ar paspirtukas – kai tai greičiau ar pigiau nei stumtis iki pat centro.",
  },
  {
    icon: <TreeIcon size={20} />,
    color: "#16a34a",
    title: "Sutaupymas per metus",
    text: "Kiek pinigų, laiko ir CO₂ sutaupytumėte per metus, dalį kelionių atlikdami kitaip – ir kiek medžių tiek CO₂ sugertų.",
  },
  {
    icon: <RainIcon size={20} />,
    color: "#d97706",
    title: "Spūstys, A juostos ir orai",
    text: "Automobilio laikas – su eismu pagal išvykimo laiką, autobuso – su A juostomis. Per lietų ar stiprų vėją dviračio ir paspirtuko nesiūlome.",
  },
  {
    icon: <UserIcon size={20} />,
    color: "#475569",
    title: "Be registracijos",
    text: "Jūsų automobilis, bilietai ir kelionių įpročiai saugomi tik jūsų naršyklėje ir niekur nesiunčiami.",
  },
];

const DATA = ["LTSA – visos Lietuvos VT tvarkaraščiai", "JUDU – zonos, aikštelės, A juostos", "Via Lietuva – eismas ir įkrovimas", "Meteo.lt – orai", "Registrų centras – adresai", "OpenStreetMap"];

export default function AboutUs() {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--bg)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Logo />
          <Link href="/" className="ml-auto rounded-md bg-[var(--marking)] px-3 py-1.5 text-sm font-semibold text-white">
            Planuoti kelionę
          </Link>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-12 px-4 py-8 sm:py-12">
        <section>
          <p className="eyebrow">Apie mus</p>
          <h1 className="mt-2 font-display text-[32px] leading-[1.1] font-bold sm:text-[40px]">
            Ne dar vienas žemėlapis.
            <br />
            <span className="text-[var(--marking)]">Atsakymas, kuo verta važiuoti.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-[var(--muted)]">
            Navigacija parodo, kaip nuvažiuoti. Eismo Pulsas padeda nuspręsti, <b className="text-[var(--ink)]">kuo</b> važiuoti: greta palygina automobilį, viešąjį transportą, dviratį, paspirtuką ir
            ėjimą pėsčiomis – laiką, visą kainą ir CO₂ – ir parodo, ką tas pasirinkimas reiškia per metus.
          </p>
          <div className="lane-divider mt-8" />
        </section>

        {/* The question each tool answers, side by side. */}
        <section className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-3xl border border-[var(--line)] bg-[var(--panel)] p-5">
            <span className="eyebrow">Navigacijos programėlė</span>
            <p className="mt-2 font-display text-2xl font-bold">„Kaip nuvažiuoti?“</p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">Greičiausias kelias jau pasirinktu būdu – automobiliu, autobusu ar pėsčiomis.</p>
          </div>
          <div className="rounded-3xl border-2 border-[var(--marking)] bg-gradient-to-b from-[var(--accent-soft)] to-[var(--panel)] p-5 shadow-[0_12px_30px_rgba(5,150,105,0.12)]">
            <span className="eyebrow !text-[var(--marking)]">Eismo Pulsas</span>
            <p className="mt-2 font-display text-2xl font-bold">„Kuo verta važiuoti?“</p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
              Visi būdai greta su laiku, kaina ir CO₂; kur palikti automobilį ir kiek tai kainuos; deriniai su P+R; sutaupymas per metus.
            </p>
          </div>
          <p className="flex items-center gap-2.5 text-sm text-[var(--muted)] sm:col-span-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--chip)] text-[var(--ink)]">
              <CarIcon size={16} />
            </span>
            Išsirinkę būdą, spaudžiate „Pradėti navigaciją“ ir keliaujate su Waze ar Google Maps – mes juos papildome, o ne pakeičiame.
          </p>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="font-display text-2xl font-bold">Kuo mes kitokie</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex gap-3.5 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white shadow-[inset_0_0_0_2px_rgba(255,255,255,0.85)]" style={{ background: f.color }}>
                  {f.icon}
                </span>
                <span>
                  <span className="block font-semibold">{f.title}</span>
                  <span className="mt-1 block text-sm leading-relaxed text-[var(--muted)]">{f.text}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-display text-2xl font-bold">Kodėl tai darome</h2>
          <p className="leading-relaxed text-[var(--muted)]">
            Automobilį dažnai renkamės iš įpročio, nes nežinome, kiek iš tikrųjų kainuoja kelionė su parkavimu ir kiek laiko užtruktų kitaip. Eismo Pulsas tai parodo skaičiais, o sprendimas lieka jums:
            kartais automobilis tikrai geriausias, kartais autobusas A juosta ar dviratis – greitesnis ir pigesnis.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-display text-2xl font-bold">Lietuvos atviri duomenys</h2>
          <p className="text-sm leading-relaxed text-[var(--muted)]">Skaičiuojame iš valstybės ir miestų atvirų duomenų – todėl žemėlapis ir paieška apima tik Lietuvą.</p>
          <ul className="flex flex-wrap gap-2">
            {DATA.map((d) => (
              <li key={d} className="rounded-full border border-[var(--line)] bg-[var(--panel)] px-3 py-1.5 text-sm">
                {d}
              </li>
            ))}
          </ul>
          <Link href="/apie" className="text-sm font-semibold text-[var(--marking)] underline">
            Visos formulės ir šaltiniai – „Kaip skaičiuojame“
          </Link>
        </section>

        <section className="road-sign">
          <div className="road-sign-inner flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <p className="font-display text-xl font-bold">Pabandykite savo kasdienę kelionę</p>
            <Link href="/" className="rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-[var(--sign-green)] sm:ml-auto">
              Planuoti kelionę →
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
