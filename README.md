# Eismo Pulsas – kuo važiuoti iš A į B?

Įrankis, padedantis išsirinkti geriausią būdą nukeliauti iš taško A į tašką B Lietuvoje: **automobiliu, viešuoju
transportu, dviračiu ar pėsčiomis**. Kiekvienam būdui parodomas laikas (su spūstimis ir A juostomis), kaina (degalai,
parkavimas, bilietai) ir CO₂, o skiltis „Jei vietoj automobilio…“ – kiek pinigų, laiko ir CO₂ sutaupytumėte
(ar prarastumėte) per kelionę ir per metus, ir kiek medžių tiek CO₂ sugertų.

Viskas skaičiuojama iš atvirų valstybės ir miestų duomenų. Žemėlapis – tik Lietuva.

## Kas veikia

- A / B: adresų paieška, spustelėjimas žemėlapyje, „mano vieta“, tempiami žymekliai, nuoroda pasidalinti (`?from=&to=`)
- Išvykimas dabar arba pasirinktu laiku
- **Automobilis:** OSRM maršrutas + spūstys (gyvi Via Lietuva jutikliai magistralėse, piko valandų priedas miestuose) +
  parkavimo vietos paieška; kaina = degalai + mokamo parkavimo zona tikslo vietoje (+ pasirinktinai nusidėvėjimas)
- **Viešasis transportas:** visos Lietuvos tvarkaraščiai (miestai, rajonai, tarpmiestiniai), RAPTOR maršrutizavimas su
  persėdimais, kiek kelio eina gatvėmis su A juosta, bilieto kaina pagal miestą, kitas reisas
- **Dviratis ir pėsčiomis:** laikas, sudeginamos kalorijos
- „Geriausias pasirinkimas“ pagal prioritetą: subalansuotai / greičiausia / pigiausia / žaliausia
- Nustatymai: kuro tipas, sąnaudos, kaina, stovėjimo trukmė, vienkartinis ar 30 d. bilietas, nuolaidos, kelionių per savaitę
- Žemėlapio sluoksniai: A juostos, gyvas eismas (eismoinfo.lt), mokamo parkavimo zonos
- `/apie` – kaip skaičiuojame, visos formulės ir šaltiniai

## Duomenų šaltiniai

| Šaltinis | Kam naudojama |
|---|---|
| [LTSA nacionalinis prieigos taškas (GTFS)](https://www.visimarsrutai.lt/gtfs/) | visų VT reisų tvarkaraščiai |
| [stops.lt Šiaulių GTFS](https://www.stops.lt/siauliai/siauliai/gtfs.zip) | Šiaulių miesto maršrutai (nacionaliniame rinkinyje jų nėra) |
| [SĮ „Susisiekimo paslaugos“ – A juostos](https://services1.arcgis.com/vVI5TNykiYD9EhM5/arcgis/rest/services/A_juostos_WFL1_per%C5%BEi%C5%ABra/FeatureServer) | Vilniaus A / A+ juostos |
| OpenStreetMap (Overpass) | autobusų juostos kituose miestuose |
| [Via Lietuva – eismoinfo.lt](https://eismoinfo.lt/traffic-intensity-service) | gyvas vidutinis greitis kelių jutikliuose (kas 15 min.) |
| [Vilniaus m. sav. – vietinės rinkliavos zonos](https://zemelapiai.vplanas.lt/arcgis/rest/services/Open_Data/Vietines_rinkliavos_zonos/MapServer) | parkavimo kainos ir laikas |
| [Klaipėdos m. sav. – parkavimo zonos](https://maps.klaipeda.lt/arcgis/rest/services/Parkavimo_zonos/MapServer) | parkavimo kainos ir laikas |
| [OSRM (FOSSGIS)](https://routing.openstreetmap.de/) | automobilio, dviračio, pėsčiųjų maršrutai |
| OpenStreetMap Nominatim | adresų paieška (per `/api/geocode`) |
| geoBoundaries (OSM) | Lietuvos siena žemėlapio kaukei |
| [Cyclocity Vilnius (GBFS)](https://api.cyclocity.fr/contracts/vilnius/gbfs/v3/gbfs.json) | dviračių nuomos stotelės ir laisvi dviračiai, gyvai |
| [OpenFreeMap](https://openfreemap.org) | vektorinis žemėlapio pagrindas (MapLibre) |

Visas sąrašas su endpoint'ais, podėliu ir licencijomis: [DUOMENYS.md](DUOMENYS.md).

Bilietų kainos – `lib/fares.ts` (Vilnius – JUDU, Kaunas – kaunas.lt; kitų miestų ir tarpmiestinių – apytikslės, UI rodo „≈“).
Degalų kainos – LEA vidurkiai, vartotojas gali pasikeisti.

## Paleidimas lokaliai

```bash
npm install
npm run dev
```

Atidaryti http://localhost:3000. Paruošti duomenys jau yra repozitorijoje (`data/`, `public/data/`).

### Duomenų atnaujinimas

```bash
npm run data              # viskas
npm run data -- transit   # tik dalis: transit | lanes | parking | border
```

Tvarkaraščiai galioja 6 savaites nuo paruošimo dienos (vėlesnei datai imama ta pati savaitės diena), todėl
`npm run data -- transit` verta paleisti bent kartą per mėnesį. Atsisiuntimai talpinami `.cache/`.

## API

```
GET /api/plan?from=54.7329,25.2236&to=54.6812,25.2876[&depart=2026-10-12T08:00]
GET /api/traffic
GET /api/geocode?q=Gedimino pr. 9, Vilnius
```

## Struktūra

- `app/page.tsx` → `components/planner/Planner.tsx` – paieška, rezultatai, nustatymai
- `components/planner/MapView.tsx` – Leaflet žemėlapis (maršrutai, A juostos, eismas, parkavimas, Lietuvos kaukė)
- `components/planner/Results.tsx`, `Savings.tsx`, `SettingsPanel.tsx` – kortelės, VT laiko juosta, sutaupymas
- `lib/metrics.ts` – kaina, CO₂, kalorijos, reitingas, sutaupymas (skaičiuojama naršyklėje)
- `lib/fares.ts` – bilietų kainos
- `lib/server/transit.ts` – RAPTOR maršrutizatorius per `data/transit.json.gz`
- `lib/server/traffic.ts` – eismoinfo.lt jutikliai ir piko valandų vertinimas
- `lib/server/osrm.ts`, `lanes.ts`, `parking.ts` – gatvių maršrutai, A juostos, parkavimo zonos
- `app/api/*` – `plan`, `traffic`, `geocode`
- `scripts/build-data.mjs` – duomenų paruošimas

## Darbo tvarka

1. `git checkout main && git pull`
2. `git checkout -b feature/tavo-uzduotis`
3. Commit, push, atidaryti Pull Request GitHub'e
4. Patikrinti Vercel preview nuorodą, tada merge
