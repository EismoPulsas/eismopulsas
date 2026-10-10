# Naudojami API ir duomenys

Visi išoriniai šaltiniai, iš kurių Eismo Pulsas ima duomenis. Pridėjus naują šaltinį ar pakeitus esamą, atnaujinkite šią lentelę (taip pat `README.md` ir `/apie` puslapio `SOURCES` sąrašą `app/apie/page.tsx`).

**Kaip gaunama:**
- **Gyvai**: serveris kreipiasi kiekvienos užklausos metu (su trumpu podėliu atmintyje).
- **Paruošta**: atsisiunčiama `npm run data` (`scripts/build-data.mjs`) ir laikoma repozitorijoje.
- **Naršyklė**: kreipiasi tiesiai naršyklė.

## Gyvi API

| Šaltinis | Endpoint | Kas naudoja | Podėlis | Raktas | Licencija |
|---|---|---|---|---|---|
| Via Lietuva, eismoinfo.lt: eismo intensyvumas | `https://eismoinfo.lt/traffic-intensity-service` | `lib/server/traffic.ts` → `/api/traffic`, automobilio laikas `/api/plan` | 5 min | nereikia | atviri duomenys |
| Cyclocity Vilnius (JCDecaux): GBFS v3 | `https://api.cyclocity.fr/contracts/vilnius/gbfs/v3/` (`station_information`, `station_status`) | `lib/server/bikeshare.ts` → `/api/bikeshare` | stotelės 6 val., būsena 60 s | nereikia | JCDecaux open licence |
| OSRM (FOSSGIS) | `https://routing.openstreetmap.de` | `lib/server/osrm.ts` → `/api/plan` | – | nereikia | ODbL (OSM) |
| OpenStreetMap Nominatim | `https://nominatim.openstreetmap.org` | `app/api/geocode/route.ts` → `/api/geocode` | – | nereikia (būtinas User-Agent, ≤1 užkl./s) | ODbL |

## Žemėlapis (naršyklė)

| Šaltinis | Endpoint | Kas naudoja | Raktas | Licencija |
|---|---|---|---|---|
| OpenFreeMap: vektorinės plytelės, stiliai `dark`, `fiord`, `positron`, `liberty` (tamsiame pašviesintos gatvės, visur lietuviški pavadinimai) | `https://tiles.openfreemap.org/styles/{stilius}` | `components/planner/MapView.tsx` (`VectorBasemap`, MapLibre GL per `@maplibre/maplibre-gl-leaflet`) | nereikia | OpenMapTiles, ODbL (OSM) |

Atmesti variantai: CARTO `dark_all` reikalauja API rakto (be jo grąžina „API KEY REQUIRED“ plyteles). Esri Canvas veikia, bet tai rastras per HTTP/1.1, todėl slenkant žemėlapį kraunasi lėtai.

## Paruošti duomenys (`npm run data`)

| Šaltinis | Endpoint | Rezultatas | Atnaujinti |
|---|---|---|---|
| LTSA nacionalinis prieigos taškas (GTFS) | `https://www.visimarsrutai.lt/gtfs/google_transit.zip` | `data/transit.json.gz` | bent kartą per mėnesį (tvarkaraščiai galioja 6 sav.) |
| stops.lt Šiaulių GTFS | `https://www.stops.lt/siauliai/siauliai/gtfs.zip` | `data/transit.json.gz` | kartu su aukščiau |
| SĮ „Susisiekimo paslaugos“: A / A+ juostos | `https://services1.arcgis.com/vVI5TNykiYD9EhM5/arcgis/rest/services/A_juostos_WFL1_per%C5%BEi%C5%ABra/FeatureServer/0` | `public/data/bus-lanes.json` | kai keičiasi juostos |
| OpenStreetMap (Overpass): autobusų juostos kituose miestuose | `https://overpass-api.de/api/interpreter` | `public/data/bus-lanes.json` | kai keičiasi juostos |
| Vilniaus m. sav. (vplanas): vietinės rinkliavos zonos | `https://zemelapiai.vplanas.lt/arcgis/rest/services/Open_Data/Vietines_rinkliavos_zonos/MapServer/1` | `public/data/parking.json` | kai keičiasi zonos ar kainos |
| Klaipėdos m. sav.: parkavimo zonos | `https://maps.klaipeda.lt/arcgis/rest/services/Parkavimo_zonos/MapServer/0` | `public/data/parking.json` | kai keičiasi zonos ar kainos |
| geoBoundaries (OSM): Lietuvos siena | `https://www.geoboundaries.org/api/current/gbOpen/LTU/ADM0/` | `public/data/lithuania.json` | retai |

## Ranka įvestos reikšmės

| Kas | Kur | Šaltinis |
|---|---|---|
| VT bilietų kainos | `lib/fares.ts` | Vilnius: [JUDU](https://judu.lt/viesojo-transporto-keleiviams/bilietu-rusys-ir-kainos-3/); Kaunas: [kaunas.lt](https://www.kaunas.lt/transportas/viesasis-transportas/); kiti miestai ir tarpmiestiniai: apytiksliai (UI rodo „≈“) |
| Degalų kainos, CO₂, nusidėvėjimas | `lib/metrics.ts` | LEA vidurkiai; vartotojas gali pasikeisti nustatymuose |

## Tikrinta, bet nenaudojama

| Šaltinis | Kodėl |
|---|---|
| Bolt, Dott, TIER, Lime, nextbike: dviračiai ir paspirtukai | Vieno Lietuvai skirto GBFS feed'o nėra (patikrinta 2026-10-10). MobilityData sąraše Lietuvai yra tik Cyclocity Vilnius. |
| OpenStreetMap `amenity=bicycle_rental` | Vilniuje tik 36 Cyclocity stotelės (jau turime gyvai) ir 1 privati nuoma. Kitur Lietuvoje apie 20 privačių nuomos punktų (Palanga, Nida, Druskininkai, Birštonas) be gyvo dviračių skaičiaus. |
