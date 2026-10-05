# Eismo Pulsas

Interaktyvus Lietuvos eismo įvykių žemėlapis, pavojingų vietų žymėjimas („balsavimas“) ir statistika – viskas iš atvirų valstybės duomenų.

## Kas veikia

**Žemėlapis (`/`)**
- Oficialūs policijos eismo įvykiai 2021–2025 m. (~108 tūkst.), spalvos pagal sunkumą, legenda su kiekiais
- Aiškus šaltinio perjungiklis: **Oficialūs / Vartotojų / Mix**
- Filtrai: savivaldybė (priartina), kategorija (dviratininkai, pėstieji, paspirtukai, motociklai, neblaivūs, vaikai), metai ir mėnesiai, sunkumas
- Vaizdai: taškai, šilumos žemėlapis, savivaldybių choropletas (10 000 gyv. per metus arba iš viso)
- TOP 10 pavojingiausių vietų (~100 m kvadratai) su kiekiais
- Policijos „juodosios dėmės“ – gyvai iš policijos GIS
- Paspaudus įvykį ar bet kurią vietą – visos gatvės ir 200 m spindulio statistika (įvykiai, žuvę, sužeisti, mirtingumas, paros valandos, metai, rūšys)
- Pavojingos vietos žymėjimas: spustelėkite žemėlapį arba įveskite adresą, pasirinkite kategoriją. Tos pačios kategorijos žyma per 35 m skaičiuojama kaip balsas („+1 Aš irgi“), vienas žmogus – vienas balsas
- Laiko juosta: ▶ paleidžia įvykius mėnuo po mėnesio, su mėnesių histograma ir pulsuojančiais mirtinais įvykiais

**Statistika (`/statistika`)** – markės (absoliučiai ir 1 000 Regitros numerių), savivaldybių reitingas (absoliučiai ir 10 000 gyv.), kaltininkai pagal amžių (ir 1 000 to amžiaus gyventojų), BMW × stotelių skaitiklis, pavojingiausių gatvių TOP 15, savaitės dienos × valandos šilumos lentelė, keisti faktai.

**Apie / API (`/apie`)** – šaltiniai ir atviras API.

## Duomenų šaltiniai

| Šaltinis | Kam naudojama |
|---|---|
| [Policijos departamentas – EĮIS eismo įvykiai](https://data.gov.lt/datasets/509/) | visi įvykiai, dalyviai, amžius, markės |
| [VDA SDMX API](https://osp.stat.gov.lt/rdb-rest) | gyventojai pagal savivaldybes ir amžių |
| [VDA ArcGIS](https://osp-sdg.stat.gov.lt/arcgis/rest/services/sav_11_2_1/FeatureServer) | savivaldybių ribos |
| [Regitra (get.data.gov.lt)](https://get.data.gov.lt/datasets/gov/regitra/ktpr/ValstybinisNumeris) | numerių skaičius pagal markę |
| [Policijos IRD GIS](https://maps.ird.lt/server/rest/services/EIIS/EIIS/MapServer) | juodosios dėmės (gyvai, per `/api/blackspots`) |
| OpenStreetMap Nominatim | adresų paieška (per `/api/geocode`) |
| Esri Canvas | žemėlapio pagrindas |

## Paleidimas lokaliai

```bash
npm install
npm run dev
```

Atidaryti http://localhost:3000. Duomenų failai jau yra `public/data/`, todėl nieko daugiau nereikia.
Be `DATABASE_URL` vartotojų žymos saugomos `.data/reports.json` faile.

### Duomenų atnaujinimas

```bash
npm run data              # visi metai
npm run data -- 2025      # tik vieni metai
```

Skriptas (`scripts/build-data.mjs`) parsisiunčia policijos JSON (~100 MB per metus, talpinama `.cache/`),
perskaičiuoja LKS-94 koordinates į WGS-84, sujungia su gyventojų ir Regitros duomenimis ir įrašo
`public/data/accidents-YYYY.json`, `stats.json`, `municipalities.geojson`. Naujiems metams pridėkite
data.gov.lt distribucijos id į `OFFICIAL` ir metus į `YEARS` (`lib/data.ts`).

### Duomenų bazė (Vercel + Neon)

```bash
npx vercel link
npx vercel env pull .env.local   # DATABASE_URL
```

Lentelės sukuriamos automatiškai (žr. `db/schema.sql`).

## Struktūra

- `app/page.tsx` → `components/map/Dashboard.tsx` – žemėlapio būsena, filtrai, sluoksniai
- `components/map/layers.tsx` – Leaflet sluoksniai (taškai ant canvas, šiluma, savivaldybės, juodosios dėmės, žymos)
- `components/map/panels.tsx` – šoninė juosta: filtrai, vietos detalės, žymėjimo forma, adresų paieška
- `components/map/Timeline.tsx` – laiko juosta
- `components/map/heat-layer.ts` – šilumos žemėlapis be papildomų bibliotekų
- `app/statistika/` + `components/stats/charts.tsx` – statistikos puslapis
- `app/api/*` – API (`accidents`, `reports`, `reports/[id]/vote`, `blackspots`, `geocode`)
- `lib/data.ts` – duomenų tipai, vėliavėlės, filtrai; `lib/reports-store.ts` – Postgres / failo saugykla
- `scripts/build-data.mjs` – duomenų paruošimas

## Darbo tvarka

1. `git checkout main && git pull`
2. `git checkout -b feature/tavo-uzduotis`
3. Commit, push, atidaryti Pull Request GitHub'e
4. Patikrinti Vercel preview nuorodą, tada merge
