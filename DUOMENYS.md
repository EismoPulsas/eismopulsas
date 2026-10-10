# Duomenys ir šaltiniai

| Duomenys | Iš kur |
|---|---|
| Gyvas eismo greitis kelių jutikliuose | Via Lietuva, eismoinfo.lt: `https://eismoinfo.lt/traffic-intensity-service` |
| Dviračių nuomos stotelės, laisvi dviračiai ir vietos | Cyclocity Vilnius (JCDecaux), GBFS: `https://api.cyclocity.fr/contracts/vilnius/gbfs/v3/` |
| Dviračio, paspirtuko ir pėsčiųjų maršrutai | Valhalla (FOSSGIS): `https://valhalla1.openstreetmap.de/route` |
| Ėjimas iki stotelių / tarp jų, atsarginiai maršrutai | OSRM (FOSSGIS): `https://routing.openstreetmap.de` |
| Adresų paieška | Photon (komoot, OpenStreetMap): `https://photon.komoot.io/api/`; atsarginis – Nominatim: `https://nominatim.openstreetmap.org` |
| VT stotelių paieška | iš LTSA GTFS (`data/transit.json.gz`) |
| Paspirtukai | bet koks operatoriaus GBFS srautas per `SCOOTER_GBFS_URL`; kol jo nėra – DEMO duomenys tik dev / preview aplinkose |
| Paspirtukų stovėjimo vietos, Senamiesčio paspirtukų zona | JUDU: `https://services1.arcgis.com/vVI5TNykiYD9EhM5/arcgis/rest/services/Stov%C4%97jimo_vietos_per%C5%BEi%C5%ABra/FeatureServer/0`, `…/Senamiestis_paspirtukai/FeatureServer/0` |
| Žemėlapio pagrindas | OpenFreeMap: `https://tiles.openfreemap.org/styles/` |
| Viešojo transporto tvarkaraščiai | LTSA nacionalinis prieigos taškas (GTFS): `https://www.visimarsrutai.lt/gtfs/google_transit.zip` |
| Šiaulių miesto maršrutai | stops.lt GTFS: `https://www.stops.lt/siauliai/siauliai/gtfs.zip` |
| Vilniaus A / A+ juostos | SĮ „Susisiekimo paslaugos“: `https://services1.arcgis.com/vVI5TNykiYD9EhM5/arcgis/rest/services/A_juostos_WFL1_per%C5%BEi%C5%ABra/FeatureServer/0` |
| Autobusų juostos kituose miestuose | OpenStreetMap (Overpass): `https://overpass-api.de/api/interpreter` |
| Vilniaus parkavimo zonos ir kainos | Vilniaus m. sav. (vplanas): `https://zemelapiai.vplanas.lt/arcgis/rest/services/Open_Data/Vietines_rinkliavos_zonos/MapServer/1` |
| Klaipėdos parkavimo zonos ir kainos | Klaipėdos m. sav.: `https://maps.klaipeda.lt/arcgis/rest/services/Parkavimo_zonos/MapServer/0` |
| Lietuvos siena | geoBoundaries: `https://www.geoboundaries.org/api/current/gbOpen/LTU/ADM0/` |
| Vilniaus VT bilietų kainos | JUDU: `https://judu.lt/viesojo-transporto-keleiviams/bilietu-rusys-ir-kainos-3/` |
| Kauno VT bilietų kainos | kaunas.lt: `https://www.kaunas.lt/transportas/viesasis-transportas/` |
| Degalų kainos | LEA vidurkiai |
| Orai kelionės pradžioje | LHMT Meteo.lt: `https://api.meteo.lt/v1/places/{vieta}/forecasts/long-term` |
| Lietaus tikimybė | Open-Meteo: `https://api.open-meteo.com/v1/forecast?hourly=precipitation_probability` |
| VT stotelės ir artimiausi išvykimai žemėlapyje | iš LTSA GTFS (`data/transit.json.gz`, per `/api/stops`) |
