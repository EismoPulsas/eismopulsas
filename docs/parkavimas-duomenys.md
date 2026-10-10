# Parkavimo ir įkrovimo duomenys

Visi šaltiniai, kuriuos patikrinome parkavimui (aikštelėms, stovėjimui gatvėse, užimtumui) ir elektromobilių
įkrovimui. Patikrinta **2026-10-10**: kiekvieną šaltinį atsisiuntėme ir peržiūrėjome patys.

Būsenos: **NAUDOJAMA** – įeina į `npm run data` ir programėlę; **GALIMA** – veikia, bet dar nenaudojame;
**NETINKA** – patikrinta, tačiau netinka arba neprieinama.

Atnaujinimas:

```bash
npm run data -- parking    # zonos, aikštelės, stovėjimas gatvėse, užimtumo istorija (~6 min. pirmą kartą)
npm run data -- chargers   # elektromobilių įkrovimo vietos (paleisti po parking – susieja su aikštelėmis)
```

Atsisiuntimai talpinami `.cache/` 20 val. UNIPARK puslapiai skaitomi ne dažniau kaip vienas per sekundę.

## Rezultatai (`public/data/`)

| Failas | Kas jame | Dydis |
|---|---|---|
| `parking.json` | Vilniaus (nuo 2025-07-01) ir Klaipėdos rinkliavos zonos; Vilniaus gyventojų leidimų zonos (vietų gatvėse skaičius, įprastas užimtumas) | ~60 KB |
| `lots.json` | Visos Vilniaus aikštelės su ribomis ir visos ne-OSM aikštelės Lietuvoje (JUDU, UNIPARK, prekybos centrai) | ~0,9 MB |
| `lots-lt.json` | Kitų Lietuvos vietų OpenStreetMap aikštelės (taškai); žemėlapis įkelia tik priartinus ne Vilniuje | ~1,9 MB |
| `street-parking.json` | Stovėjimas gatvėse (linijos prie šaligatvio; OSM atkarpos su `side`, `oneway`, `lanes` – iš kurios pusės privažiuoti), stovėjimo vietos prie gatvės, vietos ant šaligatvio, draudžiamo stovėjimo atkarpos ir zonos | ~0,3 MB |
| `scooter-spots.json` | JUDU paspirtukų stovėjimo vietos ir Senamiesčio paspirtukų zona (`npm run data -- scooters`) | ~0,05 MB |
| `lot-occupancy.json` | JUDU užtvarinės aikštelės: įprastas laisvų vietų skaičius ir tikimybė rasti vietą pagal savaitės dieną × valandą | ~50 KB |
| `chargers.json` | Visos Lietuvos viešos įkrovimo vietos: jungtys, galia, kainos, kurioje aikštelėje | ~0,5 MB |
| `data/curated-parking.json` | Rankiniu būdu surinktos prekybos centrų taisyklės su šaltiniais (redaguojama ranka) | – |

Gyvi duomenys (ne failuose): `GET /api/parking` – laisvos vietos JUDU aikštelėse (kas 30 s) ir, jei `?chargers=1`, įkrovimo vietų būsena.

## Savivaldybių zonos ir JUDU

| Šaltinis | Būsena | Prieiga | Licencija | Pastabos |
|---|---|---|---|---|
| JUDU rinkliavos zonos nuo 2025-07-01 (`rinkliavos_zonos_2025_07`) | NAUDOJAMA | [FeatureServer/5](https://services1.arcgis.com/vVI5TNykiYD9EhM5/arcgis/rest/services/rinkliavos_zonos_2025_07/FeatureServer/5) | CC BY-NC 4.0 | 22 poligonai. Mėlynoji 4 €/val. (pirma 3,5 €), 24/7; raudonoji 2,5 €, I–VI 8–22; geltonoji 1 €, I–V 8–20; geltonoji paplūdimių 1 €, I–VII 8–20, tik 05-01–09-30; žalioji 0,5 €, I–V 8–18 |
| Vilniaus savivaldybės (vplanas) rinkliavos zonos | NETINKA | zemelapiai.vplanas.lt › Open_Data/Vietines_rinkliavos_zonos | – | **Pasenusios kainos** (iki 2025-07-01: raudonoji 1,50 €, mėlynoji 2,50 €). Anksčiau naudota programėlėje – pakeista |
| Klaipėdos parkavimo zonos | NAUDOJAMA | [MapServer/0](https://maps.klaipeda.lt/arcgis/rest/services/Parkavimo_zonos/MapServer/0) | – | Kaina ir laikas laisvu tekstu, išskaidoma skripte |
| JUDU aikštelių ribos (`aiksteliu_ribos`) | NAUDOJAMA | [FeatureServer/9](https://services1.arcgis.com/vVI5TNykiYD9EhM5/arcgis/rest/services/aiksteliu_ribos/FeatureServer/9) | CC BY 4.0 | 42 aikštelės: ribos, vietų skaičius, kaina (`kaina_NUO` – dabartinė), mokamas laikas, užtvaras, gyventojų leidimai, nuoroda į judu.lt |
| JUDU aikštelių užimtumas dabar (`aiksteliu_uzimtumas_actual`) | NAUDOJAMA (gyvai) | [FeatureServer/0](https://arcgis.sisp.lt/arcgis/rest/services/Hosted/aiksteliu_uzimtumas_actual/FeatureServer/0) | CC BY-NC 4.0 | 31 užtvarinė aikštelė, kas 30 s. Kelios aikštelės dalijasi tuo pačiu `code` (pvz. V. Gerulaičio g. 1-1…1-3), todėl raktas – `code/pavadinimas` |
| JUDU užimtumo istorija (`aiksteliu_uzimtumas_history`) | NAUDOJAMA | [FeatureServer/0](https://arcgis.sisp.lt/arcgis/rest/services/Hosted/aiksteliu_uzimtumas_history/FeatureServer/0) | CC BY-NC 4.0 | 19 mln. įrašų nuo 2025-12-29, kas 30 s. Serveris agreguoja (`EXTRACT(YEAR/MONTH/DAY/HOUR)`; `DOW` nepalaikoma, todėl savaitės dieną skaičiuojame patys pagal Vilniaus laiką). Paimame 12 savaičių |
| JUDU P+R puslapis | NAUDOJAMA | [judu.lt](https://judu.lt/vairuotojams/statyk-ir-vaziuok-aiksteles/) | – | 3 aikštelės (Ukmergės g. 246, Savanorių pr. 124, V. Pociūno g. 8); 1 € – parkavimas ir VT vienam žmogui iki dienos pabaigos |
| JUDU aikštelių puslapis | NAUDOJAMA (patikrai) | [judu.lt](https://judu.lt/vairuotojams/stovejimo-aiksteles-vilniuje/) | – | 26 aikštelių kainos ir minimalus mokestis; sutampa su `aiksteliu_ribos` |
| JUDU gyventojų leidimų zonos nuo 2025-07-01 | NAUDOJAMA | `Gyventoju_leidimu_zonos_nuo_25_07_01/FeatureServer/0` | nenurodyta | 45 zonos: **15 340 vietų gatvėse**, `Užimtumas_zonos_gatvėse` (%). Tyrimo data nenurodyta – rodome kaip „paprastai“, ne gyvai |
| JUDU įrengtos stovėjimo vietos gatvėse | NAUDOJAMA | `automobiliu_stovėjimo_vietos_peržiūra/FeatureServer/0` | nenurodyta | 45 įrengtos (+7 planuojamos) linijos, 730 vietų; atnaujinta 2023 m. |
| JUDU vietos ant šaligatvio | NAUDOJAMA | `Stovėjimo_vietos_ant_saligatvio_Vietos_ant_saligatvio_1/FeatureServer/0` | nenurodyta | 52 taškai, 891 vieta (2020 m.) |
| JUDU draudžiamo stovėjimo zonos | NAUDOJAMA | `Draudžiamo_stovėjimo_zona_viešinimui/FeatureServer/0` | nenurodyta | 119 zonų (Katedros a., Rotušės a., Vilniaus g., mokyklų teritorijos…) |
| JUDU parkomatai | GALIMA | `Parkomatai_2024_05_21/FeatureServer/0` | nenurodyta | 217 taškų (2024 m.) |
| JUDU neįgaliųjų vietos | GALIMA | `neigaliuju_parkavimo_vietos_view/FeatureServer/0` | nenurodyta | 140 taškų su vietų skaičiumi – tiktų profiliui „turiu neįgaliojo kortelę“ |
| JUDU nemokamas biudžetinių įstaigų parkavimas | GALIMA | `Biudzetiniu_imoniu_parkavimas_nemokamas_peržiūra/FeatureServer/0` | nenurodyta | 119 taškų (2022 m.), rezervuota konkrečioms įstaigoms |
| JUDU „Stovėjimo vietų zona“, „Riboto stovėjimo zona su apribojimais“ | NETINKA | – | – | Poligonai be atributų; reikšmė neaprašyta |
| JUDU `Stovėjimo_vietos_peržiūra` (1022 taškai) | NAUDOJAMA (deriniams) | `Stovėjimo_vietos_peržiūra/FeatureServer/0` | nenurodyta | **Paspirtukų** stovėjimo vietos (ne automobilių): derinys „automobilis + paspirtukas“ baigia važiavimą prie jų, Senamiestyje kelionė paspirtuku baigiasi jose → `scooter-spots.json` |
| JUDU `Senamiestis_paspirtukai` | NAUDOJAMA (deriniams) | `Senamiestis_paspirtukai/FeatureServer/0` | nenurodyta | Senamiesčio zona, kurioje paspirtukus galima palikti tik pažymėtose vietose |
| 2020 m. kilpiniai užimtumo tyrimai (`arcgis.sisp.lt/…/Parkavimas_*`, `Kilpinio_*`) | NETINKA | – | – | Viešai neužklausiami |

Visi JUDU sluoksniai – iš [JUDU ArcGIS organizacijos](https://services1.arcgis.com/vVI5TNykiYD9EhM5/arcgis/rest/services) ir [arcgis.sisp.lt](https://arcgis.sisp.lt/arcgis/rest/services/Hosted).
**CC BY-NC** reiškia, kad komerciniam produktui reikėtų JUDU leidimo; hakatonui – gerai.

## Privačios aikštelės

| Šaltinis | Būsena | Prieiga | Pastabos |
|---|---|---|---|
| UNIPARK aikštelių puslapiai | NAUDOJAMA | [parkings-sitemap.xml](https://unipark.lt/parkings-sitemap.xml) → LT puslapiai | API nėra. Kiekviename puslapyje – schema.org `ParkingFacility` (koordinatės, adresas, kodas) ir „Kainos“ blokas. 243 aikštelės (150 Vilniuje). Kainų taisyklės išskaidomos griežtai: ko neatpažįstame – „taisyklės nežinomos“ (33 aikštelės), bet paskelbtas tekstas vis tiek rodomas. „Parduotuvės darbo laikas“ laikomas 8–22 val. (pažymėta). robots.txt leidžia. |
| Prekybos centrų svetainės | NAUDOJAMA | `data/curated-parking.json` | Akropolis (nemokama, ≤ 24 val.), Ozas (daugiaaukštė 3 val., lauko 30 min. nemokamai, toliau 1 €/val.), Domus galerija (3 val. nemokamai, toliau 2 €/val.), Europa (mokama, kaina neskelbiama). Panorama, CUP, Mandarinas – per UNIPARK. BIG, Vilnius Outlet – taisyklių neradome |
| m.Parking, ADCParking | NETINKA | – | Tik mokėjimo programėlės; viešo aikštelių sąrašo nėra |

## OpenStreetMap

| Kas | Būsena | Pastabos |
|---|---|---|
| `amenity=parking` | NAUDOJAMA | Visa Lietuva 10 646, Vilniuje ~2 900. Užpildymas Vilniuje: `parking` 86 %, `access` 53 %, `fee` 45 %, `operator` 7 %, `capacity` 3 %, `charge` 0,5 %. Tarifų beveik nėra, todėl daugumos aikštelių kaina „nežinoma“. Privačios (`access=private` ir pan.) praleidžiamos |
| `parking:left/right/both` gatvėse | NAUDOJAMA | 384 atkarpos su leidžiamu stovėjimu, 850 – su draudžiamu (Vilniuje). Gerai pažymėtas senamiestis ir centras, prastai – miegamieji rajonai. Kaina – pagal zoną, kurioje yra atkarpa |
| `amenity=parking` + `parking=street_side/lane` | NAUDOJAMA | 1 241 stovėjimo vieta prie gatvės |
| `shop=supermarket/mall/…` | NAUDOJAMA | Kad nepavadintai aikštelei parašytume „prie Maxima“ (80 m spinduliu) |

Overpass serveris dažnai grąžina 504 – skriptas tada kreipiasi į veidrodį `overpass.private.coffee`.

## Elektromobilių įkrovimas

| Šaltinis | Būsena | Prieiga | Licencija | Pastabos |
|---|---|---|---|---|
| Via Lietuva, OCPI 2.3.0 vietos | NAUDOJAMA | [ocpi/2.3.0/locations](https://ev.vialietuva.lt/ocpi/2.3.0/locations) (`offset`, `limit`) | CC BY 4.0 + ODC-BY | 3 273 vietos (1 984 su viešai paskelbtais įkrovikliais): jungtys (Type 2, CCS, CHAdeMO), AC/DC, kW, darbo laikas, operatorius, **gyva būsena** kiekvienam įkrovikliui |
| Via Lietuva, OCPI tarifai | NAUDOJAMA | [ocpi/2.3.0/tariffs](https://ev.vialietuva.lt/ocpi/2.3.0/tariffs) | CC BY 4.0 | 1 704 tarifai: €/kWh, €/val., stovėjimo laikas, pradinis mokestis |
| Via Lietuva, DATEX II | GALIMA | [statiniai](https://ev.vialietuva.lt/publicdata/EnergyInfrastructureTablePublication), [būsenos](https://ev.vialietuva.lt/publicdata/EnergyInfrastructureStatusPublication) | CC BY 4.0 | Tie patys duomenys kitu formatu |
| Open Charge Map | NETINKA | – | – | Reikia rakto; valstybinis registras pilnesnis |

Įkrovimo vietos rodomos ir skaičiuojamos **tik** elektromobiliams ir įkraunamiems hibridams (profilyje).

**JUDU elektromobilio leidimas** ([judu.lt](https://judu.lt/en/for-drivers/permits-concessions/parking-permits-for-electric-vehicles/)) – nemokamas, tik grynai elektriniams.
Modelyje: nemokama geltonojoje, žaliojoje ir raudonojoje zonose bei JUDU aikštelėse be užtvarų; mėlynojoje pirma valanda nemokama,
antra 3,50 €, toliau 4 €/val. JUDU puslapio formuluotės dėl raudonosios zonos nevienodos – tai pažymėta profilyje.

## Ribos ir neapibrėžtumai

- **Tikimybė rasti vietą** žinoma tik 30 JUDU užtvarinių aikštelių (įskaitant P+R). Privačių aikštelių užimtumo niekas viešai neskelbia.
- Gatvėms yra tik gyventojų leidimų zonų užimtumo procentas (tyrimas, data nenurodyta), ne gyvi duomenys.
- OpenStreetMap kainos gali būti pasenusios – parenkant vietą pridedama 0,50 € neapibrėžtumo.
- UNIPARK puslapių struktūra gali pasikeisti: tada daugiau tarifų taps „nežinomi“ (bet ne klaidingi).
- Nepažymėta gatvė ≠ draudžiama stovėti; žemėlapyje tai parašyta.
