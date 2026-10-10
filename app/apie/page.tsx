import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { FARES } from "@/lib/fares";
import { BIKESHARE_EXTRA_PER_30, DEFAULT_SETTINGS, FUELS, SCOOTER_CO2_KM, TREE_KG_YEAR, WEAR_PER_KM, WEEKS_PER_YEAR } from "@/lib/metrics";

export const metadata: Metadata = { title: "Kaip skaičiuojame" };

const SOURCES = [
  {
    name: "Viešojo transporto tvarkaraščiai (GTFS)",
    who: "Lietuvos transporto saugos administracija – nacionalinis prieigos taškas",
    url: "https://www.visimarsrutai.lt/gtfs/",
    use: "Visų miestų, rajonų ir tarpmiestinių autobusų, troleibusų ir keltų reisai. Šiaulių miesto maršrutai – iš stops.lt.",
  },
  {
    name: "Vilniaus A ir A+ juostos",
    who: "SĮ „Susisiekimo paslaugos“ (JUDU)",
    url: "https://services1.arcgis.com/vVI5TNykiYD9EhM5/arcgis/rest/services/A_juostos_WFL1_per%C5%BEi%C5%ABra/FeatureServer",
    use: "Kiek autobuso kelio eina gatvėmis su A juosta – ten jis aplenkia spūstis.",
  },
  {
    name: "Autobusų juostos kituose miestuose",
    who: "OpenStreetMap bendruomenė (Overpass API)",
    url: "https://www.openstreetmap.org/copyright",
    use: "Kauno, Klaipėdos ir kitų miestų viešojo transporto juostos.",
  },
  {
    name: "Eismo intensyvumas ir greitis",
    who: "AB „Via Lietuva“, eismoinfo.lt",
    url: "https://eismoinfo.lt/traffic-intensity-service",
    use: "Gyvas vidutinis greitis kas 15 min. kelių jutikliuose – koreguoja automobilio laiką, jei išvykstate dabar.",
  },
  {
    name: "Vietinės rinkliavos (parkavimo) zonos",
    who: "Vilniaus miesto savivaldybė (vplanas) ir Klaipėdos miesto savivaldybė",
    url: "https://zemelapiai.vplanas.lt/arcgis/rest/services/Open_Data/Vietines_rinkliavos_zonos/MapServer",
    use: "Zonos ribos, kaina už valandą ir kada mokama – automobilio kainai.",
  },
  {
    name: "Cyclocity Vilnius viešieji dviračiai (GBFS)",
    who: "JCDecaux / Cyclocity",
    url: "https://api.cyclocity.fr/contracts/vilnius/gbfs/v3/gbfs.json",
    use: "Stotelės, laisvi dviračiai ir vietos realiu laiku – viešojo dviračio maršrutui.",
  },
  {
    name: "Gatvių maršrutai",
    who: "OSRM (FOSSGIS) pagal OpenStreetMap",
    url: "https://routing.openstreetmap.de/",
    use: "Automobilio, dviračio ir pėsčiųjų maršrutai bei laikas laisvu keliu.",
  },
  {
    name: "Adresų paieška",
    who: "Photon (komoot) pagal OpenStreetMap, atsarginis – Nominatim",
    url: "https://photon.komoot.io/",
    use: "Adresai ir vietos tik Lietuvoje; VT stotelės – iš tvarkaraščių.",
  },
];

export default function About() {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--bg)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Logo />
          <Link href="/" className="ml-auto rounded-md bg-[var(--marking)] px-3 py-1.5 text-sm font-semibold text-black">
            Planuoti kelionę
          </Link>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-8">
        <section>
          <h1 className="font-display text-3xl font-bold">Kaip skaičiuojame</h1>
          <p className="mt-2 text-[var(--muted)]">
            Eismo Pulsas palygina būdus nukeliauti iš A į B – automobiliu, viešuoju transportu, viešuoju dviračiu, paspirtuku, savo dviračiu ir pėsčiomis – ir parodo, kiek laiko, pinigų ir CO₂
            sutaupytumėte ar prarastumėte palikę automobilį namie. Viskas skaičiuojama iš atvirų valstybės ir miestų duomenų.
          </p>
          <div className="lane-divider mt-6" />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-display text-xl font-bold">Laikas</h2>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed">
            <li>
              <b>Automobilis:</b> laikas laisvu keliu (OSRM) + spūstys + kelios minutės iki automobilio ir vietos paieškai (ilgiau mokamose zonose). Jei išvykstate dabar, magistralių
              atkarpos koreguojamos pagal gyvą Via Lietuva jutiklių greitį. Miestų gatvėse taikomas piko valandų priedas (darbo dienomis 7:00–9:30 ir 16:00–18:30): Vilniuje
              +55 %, Kaune +40 %, Klaipėdoje +30 %, kituose miestuose mažiau. Tai vertinimas, ne matavimas.
            </li>
            <li>
              <b>Viešasis transportas:</b> tikri tvarkaraščiai. Ieškome greičiausios kelionės (RAPTOR algoritmas) su iki 4 persėdimų, ėjimu iki stotelės (≈ 4,5 km/h) ir minute
              persėdimui. Persėdimas turi sutaupyti bent 4 min. Laikas skaičiuojamas nuo išėjimo iš namų „tiksliai laiku“ iki atvykimo.
            </li>
            <li>
              <b>A juostos:</b> autobuso maršrutas sutapatinamas su A / A+ juostų gatvėmis (±15 m). Tvarkaraščiai jau įskaičiuoja, kad autobusas ten nestovi spūstyje, o
              automobiliui toje pačioje gatvėje taikomas spūsčių priedas.
            </li>
            <li>
              <b>Cyclocity dviratis (Vilnius):</b> ėjimas iki artimiausios stotelės, kurioje dabar yra laisvas dviratis, važiavimas (≈ 16 km/h) iki stotelės prie B su
              laisva vieta ir ėjimas iki tikslo. Duomenys – oficialus Cyclocity GBFS srautas. Sistema veikia balandžio–spalio mėn.
            </li>
            <li>
              <b>Paspirtukas:</b> ėjimas iki artimiausio laisvo paspirtuko, ≈ 17 km/h važiuojant, 1 min. pastatyti. Bolt ir kiti operatoriai Lietuvoje
              neskelbia atvirų GBFS duomenų (Bolt viešai juos teikia tik keliems miestams užsienyje). Kol negauta prieiga, bandomojoje versijoje
              rodomi aiškiai pažymėti <b>DEMO</b> paspirtukai, o tikrojoje – vertinimas (≈ 3 min. rasti paspirtuką).
            </li>
            <li>
              <b>Dviratis ir pėsčiomis:</b> OSRM dviračio ir pėsčiųjų profiliai. Ilgesnės nei 75 min. (dviračiu) ar 50 min. (pėsčiomis) kelionės nelaikomos rimta alternatyva.
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-display text-xl font-bold">Pinigai</h2>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed">
            <li>
              <b>Degalai:</b> atstumas × sąnaudos × kaina. Numatytieji (galite pakeisti):{" "}
              {Object.values(FUELS)
                .map((f) => `${f.label.toLowerCase()} ${f.consumption} ${f.unit}/100 km po ${f.price.toFixed(2)} €`)
                .join("; ")}
              . Kainos – LEA 2026 m. rugpjūčio vidurkiai.
            </li>
            <li>
              <b>Parkavimas:</b> jei B taškas savivaldybės mokamoje zonoje, mokate už tas stovėjimo valandas, kurios patenka į mokamą laiką.
            </li>
            <li>
              <b>Nusidėvėjimas</b> (pasirinktinai): {WEAR_PER_KM} €/km padangoms, servisui ir vertės kritimui.
            </li>
            <li>
              <b>Cyclocity:</b> pirmos 30 min. kiekvienos kelionės nemokamos su bilietu (nuo 2,90 € / 3 d.), toliau ≈ {BIKESHARE_EXTRA_PER_30} € už 30 min.
              <b> Paspirtukas:</b> atrakinimas + minutės (numatyta {DEFAULT_SETTINGS.scooterUnlock.toFixed(2)} € + {DEFAULT_SETTINGS.scooterPerMin.toFixed(2)} €/min, galite pakeisti).
            </li>
            <li>
              <b>Bilietai:</b>{" "}
              {Object.values(FARES)
                .map((f) =>
                  f.kind === "time"
                    ? `${f.name} ${f.tiers.map(([m, p]) => `${m} min – ${p.toFixed(2)} €`).join(", ")}${f.approx ? " (apytiksliai)" : ""}`
                    : `${f.name.toLowerCase()} ≈ ${f.perKm} €/km (min. ${f.min.toFixed(2)} €)`,
                )
                .join("; ")}
              . Persėdimai tame pačiame mieste galioja vienu laiko bilietu. Pasirinkus 30 d. bilietą, jo kaina padalijama iš jūsų kelionių per mėnesį.
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-display text-xl font-bold">CO₂ ir medžiai</h2>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed">
            <li>
              <b>Automobilis:</b> sudegintas kuras × emisijos koeficientas ({Object.values(FUELS).map((f) => `${f.label.toLowerCase()} ${f.co2} kg/${f.unit}`).join(", ")}).
            </li>
            <li>
              <b>Paspirtukas:</b> ≈ {Math.round(SCOOTER_CO2_KM * 1000)} g/km per visą gyvavimo ciklą (gamyba, baterijos, surinkimo furgonai). Dviratis ir ėjimas – 0.
            </li>
            <li>
              <b>Viešasis transportas</b> vienam keleiviui: miesto autobusas ≈ 75 g/km, troleibusas ≈ 20 g/km, tarpmiestinis autobusas ≈ 35 g/km, keltas ≈ 120 g/km.
            </li>
            <li>
              <b>Medžiai:</b> vienas suaugęs medis per metus sugeria ≈ {TREE_KG_YEAR} kg CO₂. Metiniai skaičiai = vienos kelionės skirtumas × jūsų kelionės per savaitę ×{" "}
              {WEEKS_PER_YEAR} savaitės.
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-display text-xl font-bold">Duomenų šaltiniai</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {SOURCES.map((s) => (
              <a key={s.name} href={s.url} target="_blank" rel="noreferrer" className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4 hover:border-[var(--marking)]">
                <div className="font-semibold">{s.name}</div>
                <div className="text-xs text-[var(--marking)]">{s.who}</div>
                <p className="mt-1.5 text-sm text-[var(--muted)]">{s.use}</p>
              </a>
            ))}
          </div>
          <p className="text-xs text-[var(--muted)]">
            Duomenys atnaujinami komanda <code className="rounded bg-[var(--chip)] px-1">npm run data</code>. Gyvas eismas – kas 5 min. tiesiai iš eismoinfo.lt.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-display text-xl font-bold">API</h2>
          <p className="text-sm text-[var(--muted)]">Tą patį palyginimą galima gauti JSON formatu:</p>
          <pre className="overflow-x-auto rounded-xl bg-[var(--chip)] p-3 text-xs">
            {`GET /api/plan?from=54.7329,25.2236&to=54.6812,25.2876&depart=2026-10-12T08:00
GET /api/traffic          # gyvi Via Lietuva jutikliai
GET /api/bikeshare        # Cyclocity stotelės realiu laiku
GET /api/scooters?bbox=…  # paspirtukai (GBFS arba DEMO)
GET /api/geocode?q=Gedimino pr. 9, Vilnius`}
          </pre>
        </section>
      </main>
    </div>
  );
}
