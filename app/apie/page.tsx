import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { FARES } from "@/lib/fares";
import { BIKESHARE_EXTRA_PER_30, DEFAULT_SETTINGS, FUELS, SCOOTER_CO2_KM, TREE_KG_YEAR, WEAR_PER_KM, WEEKS_PER_YEAR } from "@/lib/metrics";

export const metadata: Metadata = { title: "Kaip skaičiuojame" };

const SOURCES = [
  {
    name: "Automobilio maršrutas ir eismas",
    who: "TomTom Orbis Routing",
    url: "https://docs.tomtom.com/routing-api/",
    use: "Važiavimo trukmė pagal išvykimo laiką: dabartinis eismas arba prognozė. Kelio darbai, uždarymai ir eismo įvykiai ten, kur paslauga turi duomenų.",
  },
  {
    name: "Orų prognozė",
    who: "Lietuvos hidrometeorologijos tarnyba (Meteo.lt), CC BY-SA 4.0",
    url: "https://api.meteo.lt/",
    use: "Perspėjimai maršruto pradžioje, viduryje ir pabaigoje, pagal kelionės laiką; orai kelionės pradžioje (temperatūra, krituliai, vėjas). Prognozė nekeičia važiavimo trukmės.",
  },
  {
    name: "Lietaus tikimybė",
    who: "Open-Meteo, CC BY 4.0",
    url: "https://open-meteo.com/",
    use: "Kritulių tikimybė kelionės valandomis – Meteo.lt jos neskelbia. Naudojama sprendžiant, ar rekomenduoti dviratį ir paspirtuką.",
  },
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
    use: "Atsarginio automobilio vertinimo jutikliai nacionaliniuose keliuose. Naudojami tik švieži matavimai tinkama važiavimo kryptimi, jei išvykstate dabar.",
  },
  {
    name: "Vilniaus rinkliavos zonos (nuo 2025-07-01)",
    who: "JUDU (SĮ „Susisiekimo paslaugos“), CC BY-NC 4.0; Klaipėdos – Klaipėdos m. savivaldybė",
    url: "https://services1.arcgis.com/vVI5TNykiYD9EhM5/arcgis/rest/services/rinkliavos_zonos_2025_07/FeatureServer/5",
    use: "Mėlynoji, raudonoji, geltonoji (ir paplūdimių), žalioji zonos: ribos, kaina, kada mokama.",
  },
  {
    name: "JUDU aikštelės ir jų užimtumas",
    who: "JUDU: aikštelių ribos (CC BY 4.0), užimtumas dabar ir istorija kas 30 s (CC BY-NC 4.0)",
    url: "https://judu.lt/vairuotojams/stovejimo-aiksteles-vilniuje/",
    use: "Vietų skaičius, tarifai, užtvarai, P+R; gyvos laisvos vietos ir tikimybė rasti vietą pagal savaitės dieną ir valandą.",
  },
  {
    name: "Stovėjimas gatvėse ir draudžiamos zonos",
    who: "OpenStreetMap (parking:left/right/both) ir JUDU",
    url: "https://wiki.openstreetmap.org/wiki/Street_parking",
    use: "Kur gatvėse galima stovėti (kaina – pagal zoną), vietos ant šaligatvio, draudžiamo stovėjimo zonos, gyventojų leidimų zonų užimtumas.",
  },
  {
    name: "Privačios ir prekybos centrų aikštelės",
    who: "UNIPARK svetainė, prekybos centrų svetainės, OpenStreetMap",
    url: "https://unipark.lt/parkavimas-mieste/vilnius/",
    use: "UNIPARK aikštelių koordinatės ir tarifai; didžiųjų prekybos centrų taisyklės (surinkta rankiniu būdu); kitos aikštelės – iš OpenStreetMap.",
  },
  {
    name: "Elektromobilių įkrovimo prieigos",
    who: "AB „Via Lietuva“ – viešai prieinamų įkrovimo prieigų informacinė sistema, CC BY 4.0",
    url: "https://ev.vialietuva.lt/atviri-duomenys-1",
    use: "Visos Lietuvos įkrovimo vietos: jungtys, galia, kainos ir gyva būsena (OCPI 2.3.0).",
  },
  {
    name: "Gatvių maršrutai",
    who: "OSRM (FOSSGIS) pagal OpenStreetMap",
    url: "https://routing.openstreetmap.de/",
    use: "Dviračio, pėsčiųjų ir atsarginiai automobilio maršrutai bei pradinis važiavimo laikas.",
  },
  {
    name: "Adresų paieška",
    who: "Photon (komoot) pagal OpenStreetMap, atsarginis – Nominatim",
    url: "https://photon.komoot.io/",
    use: "Adresai ir vietos tik Lietuvoje; VT stotelės – iš tvarkaraščių.",
  },
  {
    name: "Dviračių nuomos stotelės",
    who: "Cyclocity Vilnius (JCDecaux), GBFS",
    url: "https://www.cyclocity.lt/",
    use: "Stotelių vietos ir kiek jose dabar yra dviračių bei laisvų vietų (atnaujinama kas minutę) – žemėlapiui ir viešojo dviračio maršrutui.",
  },
  {
    name: "Žemėlapio pagrindas",
    who: "OpenFreeMap, OpenMapTiles pagal OpenStreetMap",
    url: "https://openfreemap.org/",
    use: "Vektorinis tamsus žemėlapis.",
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
            sutaupytumėte ar prarastumėte palikę automobilį namie. Naudojame valstybės ir miestų atvirus duomenis bei TomTom eismo paslaugą, kai ji sukonfigūruota.
          </p>
          <div className="lane-divider mt-6" />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-display text-xl font-bold">Laikas</h2>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed">
            <li>
              <b>Automobilis:</b> TomTom apskaičiuotas maršrutas ir važiavimo trukmė pagal išvykimo laiką. Dabartinėms kelionėms naudojamas dabartinis eismas, būsimoms – prognozuojamas.
              Spūstys jau įskaičiuotos, papildomų eismo priedų nepridedame. Atskirai skaičiuojame 2 min. iki automobilio, vietos paiešką ir ėjimą nuo pasirinkto parkavimo iki tikslo.
              Pasirinkus kitą parkavimą, važiavimo atkarpa perskaičiuojama iki tos vietos. Kelio darbai ir uždarymai įvertinami pagal paslaugos turimus duomenis; kiekvieno kelio aprėptis negarantuojama.
            </li>
            <li>
              <b>Atsarginis automobilio vertinimas:</b> be TomTom prieigos, pasiekus limitą ar paslaugai neatsakius naudojamas OSRM ir Via Lietuva. Jutiklių matavimai turi būti ne senesni nei 30 min.
              Kitoms miesto atkarpoms taikomos apytikslės eismo prielaidos: darbo dienomis 7:00–9:30 ir 16:00–18:30 Vilniuje +55 %, Kaune +40 %, Klaipėdoje +30 %.
              Šis vertinimas pažymimas kaip apytikslis; dabartiniai kelio darbai ir uždarymai gali būti neįvertinti.
            </li>
            <li>
              <b>Orai ir atnaujinimas:</b> Meteo.lt prognozė tikrinama kelionės pradžioje, viduryje ir pabaigoje. Lietaus, sniego, rūko ir kiti perspėjimai rodomi atskirai, papildomų minučių nepridedama.
              Eismas tikrinamas skaičiuojant maršrutą arba paspaudus „Atnaujinti eismą“. Kortelėje rodome šaltinį, skaičiavimo laiką ir duomenų ribotumą.
            </li>
            <li>
              <b>Orai ir dviratis / paspirtukas:</b> tikriname orus A taške kelionės valandomis. Jei lietaus tikimybė ≥ 60 %, prognozuojamas lietus,
              šlapdriba ar sniegas, kritulių ≥ 0,5 mm/val., vėjo gūsiai ≥ 15 m/s ar slidu (≤ 0 °C su krituliais) – dviratis, Cyclocity ir paspirtukas
              lieka sąraše, bet nebūna rekomenduojami („Nerekomenduojama: …“). Jei kitų būdų nėra, rekomenduojamas vis tiek greičiausias iš jų.
              Tikimybė 30–60 %, nedidelis lietus, gūsiai ≥ 11 m/s ar ≤ 2 °C – perspėjame „atsargiai“, bet rekomendacijos nekeičiame.
            </li>
            <li>
              <b>Waze:</b> „Atidaryti Waze“ parodo Waze žemėlapį su abiem automobilio atkarpos taškais – išvykimo vieta ir tikslu (pasirinktu parkavimu).
              „Naviguoti nuo mano vietos“ atidaro navigaciją į tą patį tikslą nuo dabartinės jūsų vietos. Waze parenka savo maršrutą, kuris gali skirtis nuo mūsų žemėlapyje rodomo kelio.
            </li>
            <li>
              <b>Viešasis transportas:</b> tikri tvarkaraščiai. Ieškome greičiausios kelionės (RAPTOR algoritmas) su iki 4 persėdimų, ėjimu iki stotelės (≈ 4,5 km/h) ir minute
              persėdimui. Persėdimas turi sutaupyti bent 4 min. Laikas skaičiuojamas nuo išėjimo iš namų „tiksliai laiku“ iki atvykimo.
            </li>
            <li>
              <b>A juostos:</b> autobuso maršrutas sutapatinamas su A / A+ juostų gatvėmis (±15 m). Tvarkaraščiai jau įskaičiuoja, kad autobusas ten nestovi spūstyje, o
              automobilio trukmė vertinama pagal jo atskirą eismo maršrutą.
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
              <b>Parkavimas:</b> kelionei siūlome vietas per jūsų nurodytą ėjimo atstumą nuo B – gatvėje prie tikslo, pažymėtą stovėjimą gatvėse, aikšteles
              (JUDU, UNIPARK, prekybos centrų, OpenStreetMap) ir, elektromobiliams, įkrovimo vietas. Kiekvienai paskaičiuojame jūsų stovėjimo kainą: mokama tik
              tai, kas patenka į mokamą laiką, įskaitant nemokamas pirmąsias minutes, brangesnę pirmą valandą (mėlynoji zona), tarifus pagal laiką ir dieną,
              paros maksimumą ir apvalinimą (pvz. „už kiekvieną pradėtą valandą“). P+R – 1 € dienai su viešuoju transportu. Jei taisyklių nežinome, kaina
              rodoma „?“ ir tokia vieta automatiškai nesiūloma – niekada nelaikome jos nemokama.
            </li>
            <li>
              <b>Kur palikti automobilį:</b> pagal prioritetą sveriame kainą, ėjimą ir vietos paiešką (subalansuotai minutė – 0,15 €) bei tikimybę rasti vietą;
              vietos, kur ji maža, nesiūlomos, jei yra kitų. OpenStreetMap žymėtoms kainoms pridedame 0,50 € neapibrėžtumo, nes jos gali būti pasenusios.
            </li>
            <li>
              <b>Tikimybė rasti vietą:</b> JUDU užtvarinėse aikštelėse matuojamos laisvos vietos kas 30 s. Iš 12 savaičių istorijos kiekvienai savaitės dienai ir
              valandai skaičiuojame įprastą laisvų vietų skaičių (valandos vidurkių mediana) ir kiek dienų tą valandą visą laiką buvo bent viena laisva vieta.
              Jei išvykstate dabar, rodome ir gyvą laisvų vietų skaičių. Gatvėms – JUDU tyrimo duomenys, kiek procentų vietų gyventojų leidimų zonoje paprastai
              užimta (ne gyvi).
            </li>
            <li>
              <b>Elektromobiliai:</b> įkrovimo vietos rodomos ir skaičiuojamos tik elektromobiliams ir įkraunamiems hibridams (profilyje). Su JUDU elektromobilio
              leidimu Vilniuje stovite nemokamai geltonojoje, žaliojoje ir raudonojoje zonose bei JUDU aikštelėse be užtvarų; mėlynojoje – pirma valanda
              nemokama, antra 3,50 €, toliau 4 €/val. Galima įkrauti: mažesnė iš įkroviklio ir automobilio galių × stovėjimo laikas × 0,9, bet ne daugiau kaip
              70 % baterijos.
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
            Statiniai duomenys atnaujinami komanda <code className="rounded bg-[var(--chip)] px-1">npm run data</code>. Automobilio eismas tikrinamas skaičiuojant ar rankiniu būdu atnaujinant maršrutą. Via Lietuva jutikliai laikomi iki 5 min., orų prognozės – iki 30 min.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-display text-xl font-bold">API</h2>
          <p className="text-sm text-[var(--muted)]">Tą patį palyginimą galima gauti JSON formatu:</p>
          <pre className="overflow-x-auto rounded-xl bg-[var(--chip)] p-3 text-xs">
            {`GET /api/plan?from=54.7329,25.2236&to=54.6812,25.2876&depart=2026-10-12T08:00
GET /api/drive?from=54.7329,25.2236&to=54.6800,25.2800&depart=2026-10-12T05:02:00Z
GET /api/traffic          # gyvi Via Lietuva jutikliai
GET /api/bikeshare        # Cyclocity stotelės realiu laiku
GET /api/scooters?bbox=…  # paspirtukai (GBFS arba DEMO)
GET /api/stops?bbox=…     # VT stotelės ir jų maršrutai
GET /api/stops?id=…       # artimiausi išvykimai iš stotelės
GET /api/geocode?q=Gedimino pr. 9, Vilnius`}
          </pre>
        </section>
      </main>
    </div>
  );
}
