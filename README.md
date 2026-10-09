# Eismo Pulsas

**Hack4Vilnius projektas, kuris keičia kryptį.** Kuriame Android programėlę Vilniui, atsakančią į klausimą **„Kaip man geriausia nuvykti šiandien?“**. Ji palygina kelionės būdus pagal laiką, kainą ir CO₂:
- automobiliu;
- viešuoju transportu;
- automobiliu iki „Statyk ir važiuok“ (P+R) aikštelės, toliau viešuoju transportu.

Lyginama atsižvelgiant į vartotojo automobilį ir prioritetus. Programėlė rekomenduoja vieną būdą ir **paaiškina kodėl**.

Esamas eismo saugumo žiniatinklis (eismo įvykių žemėlapis, statistika, pavojingų vietų žymėjimas) **lieka veikti** kaip senoji (LEGACY) versija ir kaip serverio, API bei duomenų pagrindas naujai programėlei.

| Dalis | Būsena |
|---|---|
| Mobilioji programėlė (`mobile/`, Expo SDK 57 + React Native) | **v0.1-alpha veikia** (dar neišbandyta telefone) |
| Mobiliosios programėlės API (`POST /api/mobility/plan`) | **Veikia**. Maršrutai kol kas **demonstraciniai**; P+R, bilietų kainos ir stovėjimo zonos – tikri JUDU duomenys |
| Eismo saugumo žiniatinklis (`/`, `/statistika`, `/apie`) ir jo API | **Veikia** (LEGACY: tik taisymai) |

Daugiau:
- [PRODUCT.md](PRODUCT.md) – produktas;
- [PLAN.MD](PLAN.MD) – planas (P0 / P1 / P2);
- [STRUCTURE.md](STRUCTURE.md) – architektūra;
- [DATA.md](DATA.md) – duomenys;
- [DESIGN.md](DESIGN.md) – dizainas;
- [ROUTING.md](ROUTING.md) – rekomendacijų logika;
- [TESTING.md](TESTING.md) – tikrinimas;
- [docs/adr/](docs/adr/README.md) – sprendimai: kryptis (0001), maršrutų tiekėjas (0002), `mobile/` atskyrimas (0003).

Programavimo agentams: [AGENTS.md](AGENTS.md).

## Repozitorijos struktūra

```
app/            Next.js: senieji puslapiai ir visi API maršrutai (app/api/*, įskaitant app/api/mobility/plan)
components/     senojo žiniatinklio sąsaja (žemėlapis, statistika)
lib/            domeno logika ir saugykla; lib/mobility/* – palyginimo ir rekomendacijų variklis
public/data/    sugeneruoti eismo įvykių duomenys (nekeisti rankomis)
scripts/        duomenų paruošimo skriptas
db/             pranešimų lentelių schema
docs/adr/       architektūriniai sprendimai
docs/context/   pradinė informacija apie naują kryptį ir JUDU šaltinius (ne kanoninė)
docs/archive/   senojo produkto aprašymas (istorinis)
mobile/         Expo programėlė su atskiru package.json (ne npm workspace)
```

## Senoji žiniatinklio versija — kas veikia

**Žemėlapis (`/`)**
- Oficialūs policijos eismo įvykiai 2021–2025 m. (~108 tūkst.), spalvos pagal sunkumą, legenda su kiekiais.
- Šaltinio perjungiklis: **Oficialūs / Vartotojų / Mix**.
- Filtrai: savivaldybė, kategorija (dviratininkai, pėstieji, paspirtukai, motociklai, neblaivūs, vaikai), metai ir mėnesiai, sunkumas.
- Vaizdai: taškai, šilumos žemėlapis, savivaldybių choropletas (10 000 gyv. per metus arba iš viso).
- TOP 10 pavojingiausių vietų (~100 m kvadratai) su kiekiais; policijos „juodosios dėmės“ (per `/api/blackspots`).
- Paspaudus įvykį ar vietą – visos gatvės ir spindulio statistika.
- Pavojingos vietos žymėjimas. Tos pačios kategorijos žyma per 35 m skaičiuojama kaip balsas („+1 Aš irgi“). Balsas skaičiuojamas vienas vienai naršyklei.
- Laiko juosta: ▶ paleidžia įvykius mėnuo po mėnesio.

**Statistika (`/statistika`)**: markės, savivaldybių reitingas, kaltininkų amžius, BMW × stotelių skaitiklis, pavojingiausios gatvės, savaitės dienos × valandos lentelė.

**Apie / API (`/apie`)**: šaltiniai ir atviras API.

### Duomenų šaltiniai (senoji versija)

| Šaltinis | Kam naudojama |
|---|---|
| [Policijos departamentas – EĮIS eismo įvykiai](https://data.gov.lt/datasets/509/) | visi įvykiai, dalyviai, amžius, markės |
| [VDA SDMX API](https://osp.stat.gov.lt/rdb-rest) | gyventojai pagal savivaldybes ir amžių |
| [VDA ArcGIS](https://osp-sdg.stat.gov.lt/arcgis/rest/services/sav_11_2_1/FeatureServer) | savivaldybių ribos |
| [Regitra (get.data.gov.lt)](https://get.data.gov.lt/datasets/gov/regitra/ktpr/ValstybinisNumeris) | numerių skaičius pagal markę |
| [Policijos IRD GIS](https://maps.ird.lt/server/rest/services/EIIS/EIIS/MapServer) | juodosios dėmės (gyvai, per `/api/blackspots`) |
| OpenStreetMap Nominatim | adresų paieška (per `/api/geocode`) |
| Esri Canvas | žemėlapio pagrindas |

Naujai programėlei numatyti šaltiniai (JUDU GTFS, JUDU transporto priemonių GPS srautas, Meteo.lt ir kt.) ir jų būsenos aprašyti [DATA.md › Part A](DATA.md).

## Paleidimas lokaliai (žiniatinklis ir API)

```bash
npm install
npm run dev
```

Atidaryti http://localhost:3000. Duomenų failai jau yra `public/data/`, todėl nieko daugiau nereikia.
Be `DATABASE_URL` vartotojų žymos saugomos `.data/reports.json` faile.

### Duomenų atnaujinimas (senoji versija)

```bash
npm run data              # visi metai (rekomenduojama)
npm run data -- 2025      # tik nurodyti metai – DĖMESIO: stats.json bus perskaičiuotas tik iš šių metų
```

Skriptas (`scripts/build-data.mjs`) parsisiunčia policijos JSON (~100 MB per metus, talpinama `.cache/`). Jis perskaičiuoja LKS-94 koordinates į WGS-84, sujungia su gyventojų ir Regitros duomenimis ir įrašo `public/data/accidents-YYYY.json`, `stats.json`, `municipalities.geojson`.

Naujiems metams pridėkite data.gov.lt distribucijos id į `OFFICIAL` ir metus į `YEARS` (`lib/data.ts`), taip pat žr. [DATA.md › B16](DATA.md).

Windows aplinkoje skriptas gali neveikti dėl kelio skaičiavimo (žr. [STRUCTURE.md › A14](STRUCTURE.md)); naudokite WSL, macOS arba Linux.

### Duomenų bazė (Vercel + Neon, tik senosios versijos pranešimams)

```bash
npx vercel link
npx vercel env pull .env.local   # DATABASE_URL
```

Lentelės sukuriamos automatiškai (žr. `db/schema.sql`).

## Mobilioji programėlė (`mobile/`) — paleidimas

Reikia: Node 22.13+ ir Android telefono su **Expo Go** (Google Play) arba Android emuliatoriaus.

1. Paleiskite serverį (BFF) šakniniame kataloge: `npm run dev`. Patikrinkite, kad veikia:
   ```bash
   curl -s -X POST localhost:3000/api/mobility/plan -H 'content-type: application/json' -d @lib/mobility/scenarios/uc1-commute-from-district.json
   ```
2. Nurodykite programėlei serverio adresą. Nukopijuokite `mobile/.env.example` į `mobile/.env` (jis neįkeliamas į git) ir palikite **vieną** reikšmę:
   - **emuliatorius:** `EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:3000`;
   - **telefonas tame pačiame Wi-Fi:** `http://<kompiuterio LAN IP>:3000`. IP rodo `npm run dev` eilutė „Network“; Windows ugniasienė turi leisti 3000 prievadą. `localhost` telefone reiškia patį telefoną, ne kompiuterį;
   - **Vercel:** `https://<diegimas>.vercel.app`. Preview su Vercel apsauga programėlė nepasieks.

   Šis adresas įdedamas į programėlę ir yra viešas – jokių slaptažodžių ar raktų.
3. Paleiskite programėlę:
   ```bash
   cd mobile
   npm install
   npx expo start        # nuskenuokite QR kodą su Expo Go arba spauskite "a" emuliatoriui
   ```
   Pakeitus `.env`, Expo reikia paleisti iš naujo.
4. Patikrinimai prieš commit (`mobile/`): `npx tsc --noEmit`, `npm run lint`, `npx expo-doctor`. Šakniniame kataloge – `npm run lint`, `npm run build` (žr. [TESTING.md](TESTING.md)).

**Žemėlapis:** Expo Go Android'e veikia be rakto. Savarankiškam APK (EAS Build arba vietinis build) reikės **Google Maps Android API rakto**:
- per `react-native-maps` konfigūracijos įskiepį (`androidGoogleMapsApiKey`), skaitomą iš aplinkos kintamojo `app.config` faile;
- raktas apribotas paketu `lt.eismopulsas.app` ir pasirašymo SHA-1;
- **raktų į git nekelti**.

Duomenys: maršrutų laikai kol kas demonstraciniai, ir programėlė tai rodo. Profilis ir išsaugotos kelionės saugomos tik telefone. Daugiau – [STRUCTURE.md › Part B](STRUCTURE.md), [ROUTING.md](ROUTING.md).

## Darbo tvarka

1. `git checkout main && git pull`
2. `git checkout -b feature/<sritis>-<uzduotis>` (sritis: `mobile`, `bff`, `legacy`, `data`, `docs`)
3. Prieš commit: `npm run lint` ir `npm run build` (žr. [TESTING.md](TESTING.md))
4. Commit, push, atidaryti Pull Request GitHub'e
5. Patikrinti Vercel preview nuorodą, tada merge
