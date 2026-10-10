# Eismo Pulsas – kuo važiuoti iš A į B?

Įrankis, padedantis išsirinkti geriausią būdą nukeliauti iš taško A į tašką B Lietuvoje: **automobiliu, viešuoju
transportu, Cyclocity dviračiu, paspirtuku, savo dviračiu ar pėsčiomis**. Kiekvienam būdui parodomas laikas (su spūstimis ir A juostomis), kaina (degalai,
parkavimas, bilietai) ir CO₂, o skiltis „Jei vietoj automobilio…“ – kiek pinigų, laiko ir CO₂ sutaupytumėte
(ar prarastumėte) per kelionę ir per metus, ir kiek medžių tiek CO₂ sugertų.

Naudojami valstybės ir miestų atviri duomenys bei pasirenkama TomTom eismo paslauga. Žemėlapis – tik Lietuva.

## Kas veikia

- A / B: adresų ir stotelių paieška rašant, smeigtukas žemėlapyje, „mano vieta“, tempiami žymekliai, nuoroda pasidalinti (`?from=&to=`)
- Išvykimas dabar arba pasirinktu laiku
- **Automobilis:** TomTom Orbis maršrutas su dabartiniu arba prognozuojamu eismu pagal išvykimo laiką; be rakto ar paslaugai neveikiant – pažymėtas OSRM / Via Lietuva atsarginis vertinimas.
  Pasirinkus parkavimą perskaičiuojama tik važiavimo atkarpa iki tos vietos; atskirai rodomas ėjimas iki automobilio, vietos paieška ir ėjimas iki B. Meteo.lt orų perspėjimai nekeičia ETA. Waze mygtukas atidaro važiavimą į pasirinktą vietą.
- **Viešasis transportas:** visos Lietuvos tvarkaraščiai (miestai, rajonai, tarpmiestiniai), RAPTOR maršrutizavimas su
  persėdimais, kiek kelio eina gatvėmis su A juosta, bilieto kaina pagal miestą, kitas reisas
- **Cyclocity dviratis (Vilnius):** gyvi GBFS duomenys – artimiausia stotelė su laisvu dviračiu, stotelė prie B su laisva vieta
- **Paspirtukai:** žemėlapio sluoksnis ir maršrutas iki artimiausio paspirtuko. Tikrų duomenų kol kas nėra (Bolt ir kt.
  Lietuvoje atvirų GBFS neskelbia), todėl preview aplinkoje rodomi aiškiai pažymėti **DEMO** duomenys – žr. „Paspirtukų duomenys“
- **Dviratis ir pėsčiomis:** laikas, sudeginamos kalorijos
- **Orai:** Meteo.lt prognozė ir Open-Meteo lietaus tikimybė kelionės pradžioje – kortelė rezultatuose ir žymė žemėlapyje.
  Esant lietui, sniegui, slidžiai dangai ar stipriam vėjui dviratis ir paspirtukas nerekomenduojami (lieka sąraše su perspėjimu)
- **VT stotelės žemėlapyje:** priartinus matomos visos stotelės maršrutų spalvomis; užvedus – maršrutai, paspaudus – artimiausi išvykimai
- **Telefone:** žemėlapis per visą ekraną, kompaktiška paieška viršuje, tempiamas rezultatų skydelis
- „Geriausias pasirinkimas“ pagal prioritetą: subalansuotai / greičiausia / pigiausia / žaliausia
- **Parkavimas:** „Kur palikti automobilį“ – gatvė prie tikslo, stovėjimas gatvėse, aikštelės (JUDU, UNIPARK, prekybos centrai,
  OpenStreetMap) per jūsų ėjimo atstumą: kaina jūsų stovėjimui, ėjimas, tikimybė rasti vietą (JUDU istorija ir gyvi duomenys);
  parinkta pagal prioritetą, galima pasirinkti kitą. Elektromobiliams – ir įkrovimo vietos (jungtys, kW, kaina, gyva būsena).
  Kai stovėjimo vietos tik vienoje gatvės pusėje, maršrutas atveda iš tos pusės (TomTom `arrivalSidePreference: curbSide`,
  OSRM `approaches=curb`; vienos krypties gatvėse kairė pusė leidžiama, KET 142). Waze pasirenka savo maršrutą
- **Deriniai su automobiliu:** dalį kelio automobiliu, tada VT, Cyclocity ar paspirtuku. Automobilis paliekamas P+R (1 € su VT visai dienai),
  pigioje ar nemokamoje aikštelėje / gatvėje, elektromobiliui – prie tinkamo įkroviklio, ir visada šalia kitos transporto priemonės
  (stotelės, Cyclocity stotelės, JUDU paspirtukų vietos). Kaina apima ir grįžimą iki automobilio. Geriausias derinys rodomas sąraše tik
  kai lenkia važiavimą iki pat tikslo, kiti – „Kiti deriniai“. Senamiestyje paspirtukas paliekamas pažymėtoje vietoje
- **Kiek stovės automobilis** spėjama, ne klausiama: pagal tai, ką vartotojas pataisė anksčiau šiai vietai ir laikui, kaip ilgai iš tikrųjų
  stovėjo (vėlesnė kelionė iš tos pačios vietos), kokia tai vieta (biuras ryte – darbo diena, prekybos centras – 2 val.) ir paros laiką.
  Viskas saugoma tik naršyklėje
- `/profilis`: automobilis (kuras, sąnaudos, kaina), elektromobilis (jungtys, AC/DC galia, baterija, JUDU leidimas), stovėjimo trukmė,
  didžiausias ėjimas, bilietai, prioritetas – saugoma tik naršyklėje
- Nustatymai: kuro tipas, sąnaudos, kaina, stovėjimo trukmė, vienkartinis ar 30 d. bilietas, nuolaidos, kelionių per savaitę
- Žemėlapio sluoksniai (telefone – po mygtuku „Sluoksniai“): A juostos, VT stotelės, gyvas eismas (eismoinfo.lt), Cyclocity stotelės, parkavimas (zonos, aikštelės su gyvu laisvų vietų skaičiumi, stovėjimas
  gatvėse ir draudžiamos zonos priartinus, kortelė su kainomis ir užimtumo grafiku), įkrovimas (tik elektromobiliams)
- `/apie` – kaip skaičiuojame, visos formulės ir šaltiniai

## Duomenų šaltiniai

| Šaltinis | Kam naudojama |
|---|---|
| [LTSA nacionalinis prieigos taškas (GTFS)](https://www.visimarsrutai.lt/gtfs/) | visų VT reisų tvarkaraščiai |
| [stops.lt Šiaulių GTFS](https://www.stops.lt/siauliai/siauliai/gtfs.zip) | Šiaulių miesto maršrutai (nacionaliniame rinkinyje jų nėra) |
| [SĮ „Susisiekimo paslaugos“ – A juostos](https://services1.arcgis.com/vVI5TNykiYD9EhM5/arcgis/rest/services/A_juostos_WFL1_per%C5%BEi%C5%ABra/FeatureServer) | Vilniaus A / A+ juostos |
| OpenStreetMap (Overpass) | autobusų juostos kituose miestuose |
| [Via Lietuva – eismoinfo.lt](https://eismoinfo.lt/traffic-intensity-service) | gyvas vidutinis greitis kelių jutikliuose (kas 15 min.) |
| [TomTom Orbis Routing API](https://docs.tomtom.com/routing-api/) | važiavimo maršrutas, trukmė su eismu, maršruto eismo sutrikimai |
| [LHMT – Meteo.lt API](https://api.meteo.lt/) | orų prognozės maršruto pradžioje, viduryje ir pabaigoje bei kelionės pradžioje; CC BY-SA 4.0 |
| [Open-Meteo](https://open-meteo.com/) | lietaus tikimybė (Meteo.lt jos neskelbia); CC BY 4.0 |
| [JUDU – rinkliavos zonos nuo 2025-07-01](https://services1.arcgis.com/vVI5TNykiYD9EhM5/arcgis/rest/services/rinkliavos_zonos_2025_07/FeatureServer/5) | Vilniaus zonų kainos ir laikas (CC BY-NC 4.0) |
| [Klaipėdos m. sav. – parkavimo zonos](https://maps.klaipeda.lt/arcgis/rest/services/Parkavimo_zonos/MapServer) | parkavimo kainos ir laikas |
| JUDU – aikštelės, užimtumas (dabar ir istorija), gyventojų leidimų zonos, stovėjimas gatvėse, draudžiamos zonos | aikštelės, tikimybė rasti vietą, gatvės |
| [UNIPARK aikštelių puslapiai](https://unipark.lt/parkavimas-mieste/vilnius/), prekybos centrų svetainės | privačių aikštelių kainos |
| OpenStreetMap (Overpass) | kitos aikštelės, stovėjimas gatvėse |
| [Via Lietuva – įkrovimo prieigos (OCPI)](https://ev.vialietuva.lt/atviri-duomenys-1) | elektromobilių įkrovimas, gyva būsena (CC BY 4.0) |
| [OSRM (FOSSGIS)](https://routing.openstreetmap.de/) | dviračio, pėsčiųjų ir atsarginiai automobilio maršrutai |
| [Photon (komoot)](https://photon.komoot.io/), atsarginis Nominatim | adresų paieška rašant (per `/api/geocode`) |
| geoBoundaries (OSM) | Lietuvos siena žemėlapio kaukei |
| [Cyclocity Vilnius (GBFS)](https://api.cyclocity.fr/contracts/vilnius/gbfs/v3/gbfs.json) | dviračių nuomos stotelės ir laisvi dviračiai, gyvai |
| [OpenFreeMap](https://openfreemap.org) | vektorinis žemėlapio pagrindas (MapLibre) |

Visas sąrašas su endpoint'ais, podėliu ir licencijomis: [DUOMENYS.md](DUOMENYS.md).
Visas parkavimo ir įkrovimo šaltinių sąrašas (ir netinkami) – [docs/parkavimas-duomenys.md](docs/parkavimas-duomenys.md).

Bilietų kainos – `lib/fares.ts` (Vilnius – JUDU, Kaunas – kaunas.lt; kitų miestų ir tarpmiestinių – apytikslės, UI rodo „≈“).
Degalų kainos – LEA vidurkiai, vartotojas gali pasikeisti.

## Paleidimas lokaliai

```bash
npm install
npm run dev
```

Atidaryti http://localhost:3000. Paruošti duomenys jau yra repozitorijoje (`data/`, `public/data/`).

### Driving traffic setup (free tier only)

Copy `.env.example` to `.env.local` and set `TOMTOM_API_KEY` to a server-side key for TomTom Orbis Routing v3. Restart the dev server. In Vercel, set the same server environment variable and redeploy. Never use a `NEXT_PUBLIC_` key or commit `.env.local`.

Use TomTom's **Start building** account without enabling billing or a paid plan. [Current pricing](https://docs.tomtom.com/pricing) includes 20,000 routing requests per month without a credit card; check the account's quota before deployment. The provider enforces that free account limit; HTTP 429 switches the app to its labelled fallback. The app cannot prevent charges if an operator supplies a key belonging to a paid account.

Routing refreshes on trip/time changes, on a chosen parking change, or through **Atnaujinti eismą**. There is no routing polling. One initial comparison makes one provider routing call; a different selected parking endpoint makes one additional call. Other parking candidates are not routed in bulk. Concurrent identical requests share in-flight work; completed traffic routes are not cached. Meteo public place data is cached for 24 hours and forecasts for 30 minutes. Via Lietuva readings older than 30 minutes, future readings, invalid speeds and wrong-direction sensors are excluded.

TomTom's duration already includes traffic: no city multiplier, sensor delay or guessed weather penalty is added. Closures, roadworks and incidents are considered where the provider has coverage, not guaranteed for every road. A confirmed no-route response stays unavailable instead of falling back through a closure. Future trips use departure-time prediction, not a claim of live measurements. The OSRM fallback is approximate and cannot reliably account for current closures or roadworks.

**Atidaryti Waze** opens a [Live Map route permalink](https://support.google.com/waze/answer/6274015?hl=en) with both car-leg endpoints prefilled (`from=ll.lat,lng&to=ll.lat,lng`). Waze calculates and displays its own route, which may differ from the app's route. **Naviguoti nuo mano vietos** keeps the [official native-app deep link](https://developers.google.com/waze/deeplinks) with `ll`, `navigate=yes` and `utm_source`; native navigation starts from the driver's GPS location, not a custom planned origin. Live Map's permalink parameters were verified in its browser UI; they are not custom-origin parameters for the native deep-link API. A verified `navigationPos` is preferred over parking coordinates when present. `CarLeg`, `/api/drive` and `CarDriveDetails` can also serve a later hybrid planner; generating complete hybrid trips is outside this change.

### Validation

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Tests use deterministic provider/sensor/weather fixtures, including quota/authentication/timeouts, confirmed no-route, DST transitions, stale sensors and selected-parking ETA/geometry/fuel/CO₂/Waze consistency. Before release with a real key, compare TomTom estimates against observed driving times for city peak/off-peak, a motorway trip and an alternate parking endpoint. Verify Waze handoff on Android and iOS, both with and without Waze installed. These real-provider and physical-device checks require the deployment key/devices; fixture tests do not establish real-world ETA accuracy.

### Duomenų atnaujinimas

```bash
npm run data              # viskas
npm run data -- transit   # tik dalis: transit | lanes | parking | street | scooters | chargers | border
```

Tvarkaraščiai galioja 6 savaites nuo paruošimo dienos (vėlesnei datai imama ta pati savaitės diena), todėl
`npm run data -- transit` verta paleisti bent kartą per mėnesį. Atsisiuntimai talpinami `.cache/`.

## Paspirtukų duomenys

`lib/server/scooters.ts` skaito bet kurį GBFS srautą. Aplinkos kintamieji (Vercel → Settings → Environment Variables):

| Kintamasis | Reikšmė |
|---|---|
| `SCOOTER_GBFS_URL` | operatoriaus `free_bike_status` (GBFS 2) arba `vehicle_status` (GBFS 3) adresas |
| `SCOOTER_GBFS_TOKEN` | jei srautui reikia `Bearer` žetono (niekada nekelkite jo į kodą) |
| `SCOOTER_OPERATOR` | pavadinimas žemėlapyje, pvz. `Bolt` |
| `SCOOTER_DEMO` | `1` – rodyti demo net produkcijoje, `0` – niekur nerodyti |

Be `SCOOTER_GBFS_URL` demo duomenys (išgalvoti paspirtukai prie tikrų gatvių) rodomi tik `npm run dev` ir Vercel
preview aplinkose – produkcijoje jų nėra, nebent `SCOOTER_DEMO=1`. Visur jie pažymėti „DEMO“.

## API

```
GET /api/plan?from=54.7329,25.2236&to=54.6812,25.2876[&depart=2026-10-12T08:00]
GET /api/drive?from=54.7329,25.2236&to=54.6800,25.2800[&depart=2026-10-12T05:02:00Z]
GET /api/traffic
GET /api/bikeshare
GET /api/scooters?bbox=54.66,25.24,54.70,25.32
GET /api/geocode?q=Gedimino pr. 9, Vilnius[&near=54.68,25.28]
GET /api/parking[?chargers=1]
GET /api/hybrid?from=54.7329,25.2236&to=54.6812,25.2876&depart=2026-10-12T05:00:00Z&car=1320&stay=9[&ev=1&conn=T2,CCS][&prio=cheap][&modes=transit,bikeshare,scooter]
```

`/api/hybrid` – vietos palikti automobilį pakeliui ir tolesnė kelionė (iki 5 variantų, ne daugiau kaip 2 kiekvienam būdui). Važiavimas iki jų –
vienas OSRM `table` užklausimas, padaugintas iš TomTom A → B laiko santykio (`car`), todėl TomTom kvota nenaudojama; kainas ir galutinį
reitingą skaičiuoja naršyklė (`summarizeHybrids`). `/api/drive?curb=1` – atvykti iš stovėjimo vietų pusės. OSRM atsakymai talpinami 10 min.,
o serveriams neatsakant jie 30 s neklausiami (deriniai tada naudoja tiesios linijos vertinimą).

`/api/plan` priima ir `walk=10` (didžiausias ėjimas nuo automobilio, min.) ir grąžina `car.parkingOptions`; kainas pagal profilį skaičiuoja naršyklė.
`/api/parking` – gyvos laisvos vietos JUDU aikštelėse ir (su `chargers=1`) įkrovimo vietų būsena.

`/api/plan` departure is the door departure; it includes a 2-minute access assumption before driving. `/api/drive` departure is the start of the driving leg itself. Both accept Lithuanian local time or ISO time with an explicit offset and return ISO instants. Nonexistent spring DST times are rejected; ambiguous autumn local times use the earlier occurrence (send an explicit offset to choose the later one). `/api/drive` returns a `CarLeg`; optional `parkingFor=lat,lng&walk=10` adds parking options around the final destination evaluated at the new driving arrival. Route responses use `Cache-Control: no-store`. The key and raw provider errors are never returned to the browser.

## Struktūra

- `app/page.tsx` → `components/planner/Planner.tsx` – paieška, rezultatai, nustatymai
- `components/planner/MapView.tsx` – Leaflet žemėlapis (maršrutai, A juostos, eismas, parkavimas, Lietuvos kaukė)
- `components/planner/Results.tsx`, `Savings.tsx`, `SettingsPanel.tsx` – kortelės, VT laiko juosta, sutaupymas
- `lib/metrics.ts` – kaina, CO₂, kalorijos, reitingas, sutaupymas (skaičiuojama naršyklėje)
- `lib/fares.ts` – bilietų kainos
- `lib/server/transit.ts` – RAPTOR maršrutizatorius per `data/transit.json.gz`
- `lib/server/traffic.ts` – eismoinfo.lt jutikliai ir piko valandų vertinimas
- `lib/server/driving.ts`, `tomtom.ts`, `weather.ts` – car-leg orchestration, traffic provider and weather alerts
- `lib/departure.ts`, `driving.ts` – Lithuanian time conversion, car-leg projection and Waze links
- `lib/server/osrm.ts`, `lanes.ts` – gatvių maršrutai, A juostos
- `lib/server/parking.ts` – parkavimo vietos prie B (zonos, gatvės, aikštelės, įkrovimas) ir `hubsAround` – kur palikti automobilį pakeliui; `live-parking.ts` – gyvi JUDU ir įkrovimo duomenys
- `lib/server/hybrid.ts`, `app/api/hybrid` – deriniai su automobiliu; `components/planner/HybridCard.tsx`, `useHybrids.ts` – jų kortelės
- `lib/stay.ts`, `components/planner/habits.ts` – kiek stovės automobilis (vieta, laikas, įpročiai naršyklėje)
- `lib/server/micromobility.ts` – Cyclocity GBFS ir paspirtuko maršrutas
- `lib/server/scooters.ts` – paspirtukų srautas (GBFS arba DEMO)
- `components/planner/BottomSheet.tsx` – tempiamas rezultatų skydelis telefone
- `components/planner/ParkingCard.tsx` – aikštelės / gatvės / įkroviklio kortelė su užimtumo grafiku; `parking-meta.ts` – spalvos ir klasės
- `app/profilis/page.tsx` → `components/profile/ProfileView.tsx` – profilis; `components/planner/settings.ts` – jo saugojimas naršyklėje
- `app/api/*` – `plan`, `drive`, `traffic`, `bikeshare`, `scooters`, `geocode`, `parking`
- `scripts/build-data.mjs` – duomenų paruošimas; `scripts/build-parking.mjs` – parkavimas ir įkrovimas; `data/curated-parking.json` – prekybos centrai

## Darbo tvarka

1. `git checkout main && git pull`
2. `git checkout -b feature/tavo-uzduotis`
3. Commit, push, atidaryti Pull Request GitHub'e
4. Patikrinti Vercel preview nuorodą, tada merge
