# DATA.md — data sources, contracts and limits

> Authoritative description of where data comes from, how it is transformed, and what its limits are.
> **Part A** covers the mobility data for the PRIMARY product. Sources were re-verified against primary sources on 2026-10-10, including the official JUDU links in `docs/context/JUDU_SOURCE_CONTEXT.md`. The v0.1-alpha BFF uses some of them (marked CURRENT). **Part B** covers the LEGACY Eismo Pulsas road-safety data (CURRENT, verified against code and generated files on 2026-10-09).
> Status labels — use them exactly:
>
> | Label | Meaning |
> |---|---|
> | **CURRENT** | Read by code on this branch today |
> | **VERIFIED AVAILABLE** | We fetched it ourselves and inspected the format (date given); **not** integrated |
> | **RESEARCHED** | Listed by the team or by JUDU, or found publicly; not fetched, not machine-readable, or its meaning is undocumented |
> | **POSSIBLE** | An idea or candidate; availability unknown |
> | **BLOCKED / PARTNER ACCESS NEEDED** | Exists, but no supported public access; ask JUDU / the provider |
>
> Never promote a source to CURRENT until code reads it **and** this file is updated in the same PR. A web viewer (ArcGIS app, Power BI, map page) is **not** a machine-readable source; only the service behind it is, and only after inspection. Raw context: `docs/context/JUDU_SOURCE_CONTEXT.md`; team research list outside the repo: `../EISMO_PULSAS_DATA_SOURCES.md`.

---

# PART A — MOBILITY DATA (primary product)

## A1. Mobility data architecture

```
Phone (mobile/, CURRENT alpha)        BFF (Next.js, CURRENT alpha)                          Sources
──────────────────────────────        ─────────────────────────────────────────            ──────────────────────────────────────
profile, saved trips      ──plan──▶   app/api/mobility/plan → lib/mobility/plan.ts
(AsyncStorage, on device)             ├─ providers/demo.ts      CURRENT (DEMO) ─────────▶  none — synthetic legs, basis "demo"
                                      ├─ providers/otp.ts       PLANNED (ADR-0002) ─────▶  OpenTripPlanner ← JUDU GTFS + OSM
                                      ├─ providers/judu-park-ride.ts  CURRENT ──────────▶  judu.lt P+R page (static list)
                                      ├─ providers/judu-parking-zones.ts CURRENT ───────▶  JUDU ArcGIS paid-zone layer (live lookup)
                                      ├─ config.ts  CURRENT (fares, tariffs, CO₂, prices) ▶ judu.lt, JUDU ArcGIS, DESNZ 2025, assumptions
                                      └─ enrichers  PLANNED: P+R occupancy, live transit, weather
address search            ─────────▶  /api/geocode (CURRENT, legacy) ──────────────────▶  OSM Nominatim
```

Kinds of data:
- **Static, versioned:** the P+R site list, fares, zone tariffs and emission factors live in code (`lib/mobility/config.ts`, `providers/judu-park-ride.ts`). Each cites a source and a "verified on" date.
- **Live, proxied:** routing (when real), geocoding, the paid-zone lookup, and (P1) occupancy, vehicle delays and weather. Each goes through the BFF with a timeout, a cache and a fallback.
- **Personal, on device:** profile and saved trips (and, in P1, the parked car). These are never stored on the server (ROUTING.md § 10).

Every option metric carries a `basis` (`demo` / `estimate` / `official` / `live`, ROUTING.md § 4). Every response carries `dataMode` and `sources[]`.

## A2. Mobility source inventory (re-verified 2026-10-10)

| Source | Status | URL | Purpose | Format / notes |
|---|---|---|---|---|
| Hack4Vilnius challenge 02 (JUDU) | reference | https://hack4vilnius.lt/ | Problem statement | Event 2026-10-09 → 11; pre-pitch videos due Sunday 11:30, final 14:00; no judging criteria published |
| JUDU open-data catalogue | reference | https://judu.lt/atviri-duomenys/ | Index of JUDU datasets | 26 links: GTFS, vehicle feed, Power BI/PDF reports, ArcGIS viewers. **No P+R or occupancy entry**; parking only as two viewer apps |
| JUDU / Stops.lt static GTFS | **VERIFIED AVAILABLE** | https://www.stops.lt/vilnius/vilnius/gtfs.zip | Timetables for a real transit router (ADR-0002) | GTFS zip; on 2026-10-10 `Last-Modified: 2026-10-09 18:31 UTC`, 3 532 619 bytes. Details A3. **Not integrated yet** (OTP is the next step) |
| JUDU / Stops.lt live vehicles `gps_full.txt` | **VERIFIED AVAILABLE** | https://stops.lt/vilnius/gps_full.txt | Delays and reliability (P1) | Custom CSV, **not GTFS-Realtime**. Details A4 |
| Stops.lt GTFS-Realtime for Vilnius | **RESEARCHED** | `https://www.stops.lt/vilnius/{trip_updates,vehicle_positions,gtfs_realtime}.pb` | Live delays inside a router (P1) | All three returned HTTP 200 `application/octet-stream` (4–11 KB at 00:40). **Not listed by JUDU**; found through Transitous's public feed list (Kaunas uses the same pattern). Not decoded. Confirm with JUDU before relying on it |
| JUDU journey planner (stops.lt) | **BLOCKED / PARTNER ACCESS NEEDED** | https://www.stops.lt/vilnius/sisp.html#plan (linked from judu.lt) | — | Web UI only; no documented API. We do not reverse-engineer it |
| **JUDU P+R ("Statyk ir važiuok") page** | **CURRENT** (static list + ticket) | https://judu.lt/vairuotojams/statyk-ir-vaziuok-aiksteles/ | P+R sites and price for `park_and_ride` | 3 sites: Ukmergės g. 246, Savanorių pr. 124, V. Pociūno g. 8 (coordinates from the page's map links). One ticket = **1,00 €**: parking for one car + public transport for one person until the end of the day; +1 € per overdue day. Details A4b |
| **JUDU paid street-parking zones** (ArcGIS layer `rinkliavos_zonos_2025_07`) | **CURRENT** (live point lookup) | https://services1.arcgis.com/vVI5TNykiYD9EhM5/arcgis/rest/services/rinkliavos_zonos_2025_07/FeatureServer/5 | Destination zone → parking cost for `car` | Public FeatureServer published by JUDU (item `a9f4b1b0…`); **licence CC BY-NC 4.0, © JUDU**. 22 polygons; fields `Zona`, `Mokama`, `Rinkliava`, `Pastaba`. Tariffs transcribed into `config.ts` (A6). The viewer "Naujas parkavimo zonų žemėlapis" in the catalogue shows the same zones |
| **JUDU gated-lot occupancy** (ArcGIS layer `aiksteliu_uzimtumas_actual`) | **VERIFIED AVAILABLE** | https://arcgis.sisp.lt/arcgis/rest/services/Hosted/aiksteliu_uzimtumas_actual/FeatureServer/0 | Live free spaces at P+R sites and gated lots (P1 enricher) | Public layer behind JUDU's official occupancy map (judu.lt/parkavimo-zemelapis → ArcGIS Experience `68a6513f…`; announced 2026-02-11). The item metadata documents it: updated **every 30 s**, sources "softra" and "citypro", **CC BY-NC 4.0**. 31 lots incl. **all 3 P+R sites**. Fields: `capacity`, `occupied`, `vacant`, `status`, `timestamp_ms`, `pavadinimas`. Quality: negative `occupied` seen; one lot in `status=error`. Not in the open-data catalogue, so confirm intended reuse with JUDU mentors |
| JUDU lot boundaries (`aiksteliu_ribos`) | **VERIFIED AVAILABLE** | https://services1.arcgis.com/vVI5TNykiYD9EhM5/arcgis/rest/services/aiksteliu_ribos/FeatureServer/9 | Lot polygons, capacity, price | 42 polygons, CC BY 4.0. P1 "park and walk" |
| JUDU parking facilities page | **VERIFIED AVAILABLE** | https://judu.lt/vairuotojams/stovejimo-aiksteles-vilniuje/ | 26 JUDU lots (19 gated, 7 open) with minimum fee and hourly rate | HTML table; not used in v0.1 (the car option uses street zones) |
| **JUDU fares** | **CURRENT** (static) | https://judu.lt/viesojo-transporto-keleiviams/bilietu-rusys-ir-kainos/ | Transit cost | 30 min 1,00 €; 60 min 1,25 €; unlimited transfers within validity; 30-day pass 38 €. Effective date not stated on the page |
| JUDU app (competitor context) | reference | https://judu.lt/programele/ + announcements of 2026-07-07 and 2026-08-25 | Differentiation (PRODUCT.md) | PT planning with real-time info, tickets, parking payment, bike routing. **No mode comparison, cost/CO₂, P+R or recommendation.** No API mentioned |
| JUDU congestion / traffic flows / Waze apps (`portal.sisp.lt` Experience `695f78d2…`, `1741b3ca…`, `0a32c6ae…`) | **RESEARCHED** | (links in JUDU_SOURCE_CONTEXT.md) | Car reliability (P1/P2) | Public apps backed by web maps "Grūstys" and "VIS_TRAFFIC" (portal items). No documented query endpoint confirmed |
| `arcgis.sviesoforai.lt` VIS MapServer | **RESEARCHED** (partner confirmation needed) | https://arcgis.sviesoforai.lt/arcgis/rest/services/VIS/Vilnius_sde_dynamic/MapServer | Possibly traffic events, restrictions, load | Public MapServer; layers named Autoįvykis, Darbai kelyje, Eismo apribojimas, Grūstis (incl. "Grūstis (auto)", 0 features at check), VT įvykis, Apkrovimas (1 050 polylines), Rinkliavos zonos… Meaning and refresh are **undocumented**; do not assign meaning from layer names |
| Signalised intersections & green corridors (portal app `77456a13…`) | RESEARCHED | portal.sisp.lt web app | — | Public view of `arcgis.sisp.lt` hosted layers; not needed for P0 |
| VPlan open-data hub | RESEARCHED | https://data-vplanas.opendata.arcgis.com/ | City GIS catalogue | Includes a "Viešasis transportas" ArcGIS **Stream Service** (geoevent.vilnius.lt), PT stops, PT lanes, monthly traffic volumes (SĮSP) |
| maps.vilnius.lt transport layers (bike network, racks, plans) | RESEARCHED | maps.vilnius.lt/transportas (JUDU links) | Cycling (P1) | Web map; service not inspected |
| Meteo.lt forecast API | **VERIFIED AVAILABLE** (re-checked 2026-10-10) | https://api.meteo.lt/v1/places/vilnius/forecasts/long-term | Weather for walking/cycling (P1) | JSON; hourly `forecastTimestamps[]` (`airTemperature`, `totalPrecipitation`, `conditionCode`, …). Terms/rate limits not yet reviewed |
| OSM Nominatim (via `/api/geocode`) | **CURRENT** (legacy endpoint, used by the app) | see B9 | Origin/destination search | ≤ 1 req/s, identify the app, **no autocomplete on the public server**. The app searches on submit |
| JUDU open-data terms of use | RESEARCHED | https://judu.lt/wp-content/uploads/2022/03/Duomenu-naudojimo-salygos-lt.pdf | Licence/attribution | Must be read before the demo; ArcGIS items carry their own CC licences (above) |
| CO₂ factors (UK DESNZ 2025) | **CURRENT** (proxy) | https://www.gov.uk/government/publications/greenhouse-gas-reporting-conversion-factors-2025 | CO₂ metric | Official UK government factors, used as a proxy (A6). No Lithuania-specific set verified |
| Fuel / electricity prices | **CURRENT** (team assumption) | — | Car energy cost when the user gives no price | Primary source (EU Weekly Oil Bulletin) not verified; values are labelled assumptions (A6) |
| Cyclocity, scooter/car sharing, trains | POSSIBLE | — | P1/P2 | Not checked |
| Legacy accident data (Part B) | CURRENT in repo (legacy) | `public/data/accidents-YYYY.json` | P2 safety scoring | Vilnius subset via `muni = "13"` |

## A3. JUDU static GTFS (VERIFIED AVAILABLE, first fetched 2026-10-10)

- HTTP 200, `application/zip`, 3.53 MB compressed, about 32 MB uncompressed. On 2026-10-10 the server reported `Last-Modified: Fri, 09 Oct 2026 18:31:47 GMT`. A daily regeneration is plausible but **not verified**.
- Files: `agency.txt`, `areas.txt`, `calendar.txt`, `calendar_dates.txt`, `routes.txt`, `shapes.txt`, `stops.txt`, `stop_areas.txt`, `stop_times.txt` (23 MB), `trips.txt`.
- **Absent:** `fare_attributes.txt` / `fare_rules.txt` (**no fares**, so fares come from A6), `feed_info.txt`, `transfers.txt`, `frequencies.txt`.
- Agency: `vilnius`, SĮ "Susisiekimo paslaugos", timezone `Europe/Vilnius`, language `lt`.
- **Routes: 115** by `route_type`:
  - `3` bus: 98;
  - **`800` trolleybus: 16.** This is an *extended* route type, so consumers must accept it. Check that OTP maps it at graph build (ADR-0002).
  - `4` ferry: 1 (`L1`).
- **Stops: 1 552**, with `stop_areas.txt` grouping them into named areas. **Trips: 21 634.**
- **Service validity:** `calendar.txt` runs 2026-03-23 → 2027-10-01; `calendar_dates.txt` runs 2026-10-10 → 2027-08-15. A query outside the window must return a clear error.

## A4. JUDU live vehicle feed `gps_full.txt` (VERIFIED AVAILABLE)

- HTTP 200, `text/plain`. 2026-10-10 00:3x local: 402 data rows, 43 KB. An earlier fetch the same evening had 439 rows.
- It is a **custom comma-separated file, not GTFS-Realtime**, even though JUDU titles it "(GTFS)". The header line ends with a trailing comma.
  `Transportas, Marsrutas, ReisoID, MasinosNumeris, Ilguma, Platuma, Greitis, Azimutas, ReisoPradziaMinutemis, NuokrypisSekundemis, MatavimoLaikas, MasinosTipas, KryptiesTipas, KryptiesPavadinimas, ReisoIdGTFS, IntervalasPries, IntervalasPaskui`
- Interpretations to confirm:
  - `Ilguma` / `Platuma` are WGS-84 × 1e6;
  - `MatavimoLaikas` is seconds since the start of the service day (values > 86 400 occur around midnight);
  - `NuokrypisSekundemis` is the schedule deviation.
- **`ReisoIdGTFS` is often empty**: 65 of 402 rows (00:3x) and 125 of 439 earlier. Joining to GTFS trips is therefore partial.
- Some rows are truncated, so the parser must tolerate short rows.
- If stops.lt GTFS-Realtime (A2) is confirmed, prefer it for a router (OTP consumes GTFS-RT natively).

## A4b. Parking and P+R data (2026-10-10)

**P+R sites (CURRENT, `lib/mobility/providers/judu-park-ride.ts`)**

| Site | Coordinates (from the JUDU page) | Capacity (occupancy layer) |
|---|---|---|
| Ukmergės g. 246 (šalia PC „Senukai“) | 54.7232424, 25.2426627 | 94 |
| Savanorių pr. 124 | 54.6602247, 25.2349708 | 100 |
| V. Pociūno g. 8 (šalia PC „Vilnius Outlet“) | 54.7020718, 25.2067528 | 250 |

**P+R rules (JUDU page):**
- the ticket costs 1,00 € and covers parking for one car and public transport for one person until the end of the day;
- it is bought at the machine or in the JUDU app and must be activated;
- the car plate is first linked by SMS;
- leaving the site ends the ticket;
- +1 € per overdue day.

The model counts 1,00 € per trip for P+R and **no separate transit fare**.

**Street-zone tariffs (CURRENT, `config.ts › PARKING_ZONES`, from layer `rinkliavos_zonos_2025_07`):**

| `Zona` | Paid | Tariff | Note |
|---|---|---|---|
| Mėlyna | 24/7 | 4,0 €/h | first hour 3,5 € |
| Raudona | Mon–Sat 8–22 | 2,5 €/h | |
| Geltona | Mon–Fri 8–20 | 1,0 €/h | |
| Geltona1 | Mon–Sun 8–20 | 1,0 €/h | beach zone, paid 1 May – 30 Sep |
| Žalia | Mon–Fri 8–18 | 0,5 €/h | |

- Cost = minutes of the stay inside paid hours, pro rata (`metrics.ts › zoneParkingCost`). The result is an estimate: JUDU billing granularity was not verified.
- Outside every zone, street parking is treated as free (0 €, labelled).
- If the lookup fails, the car cost is `null` ("nežinoma"), never 0.

**Occupancy (VERIFIED AVAILABLE, not integrated).** Query pattern for the P1 enricher, a public ArcGIS REST query:
`…/aiksteliu_uzimtumas_actual/FeatureServer/0/query?where=1=1&outFields=pavadinimas,capacity,occupied,vacant,status,timestamp_ms&returnGeometry=false&f=json`.
- Match on `pavadinimas`.
- Treat `status ≠ "ok"` or a negative `occupied` as unknown.
- Show the observation time.
- Attribute "© JUDU, CC BY-NC 4.0".

## A5. Data needed per mode and metric

| Need | P | Data | Status | Fallback if missing |
|---|---|---|---|---|
| **Transit** itineraries | P0 | GTFS + walking network via a router | **DEMO provider today**; OTP + JUDU GTFS next (ADR-0002) | demo legs, `basis: "demo"`, labelled |
| Transit fare | P0 | JUDU fares (A2) | **CURRENT** (official constant) | — ; pass holders pay 0 € |
| **Car** route time and distance | P0 | road routing | DEMO today; OTP (free-flow) next | demo, labelled |
| Car energy cost | P0 | consumption (profile) × price | profile CURRENT; price = labelled assumption unless the user gives one | — |
| **P+R** sites + price | P0 | JUDU P+R page | **CURRENT** | if none is on the way: no P+R option, reason shown |
| **Parking** cost at destination | P0 | zone lookup + tariffs + stay | **CURRENT** (live lookup, official tariffs, estimate per minute) | lookup failure → cost "nežinoma" + warning |
| Parking / P+R availability | P1 | occupancy layer | VERIFIED AVAILABLE | not shown; never guessed |
| **Walking** legs | P0 | router | DEMO today | — |
| Walking/cycling comfort | P1 | Meteo.lt | VERIFIED AVAILABLE | ignore weather |
| Cycling, bike share | P1 | OSM / city layers / Cyclocity | RESEARCHED / POSSIBLE | not offered |
| **CO₂** | P0 | factors (A6) | **CURRENT** (proxy) | "—" if a factor is missing |
| **Real-time reliability** | P1 | GTFS-RT or `gps_full.txt`; congestion | RESEARCHED / VERIFIED AVAILABLE | timetable only, labelled |
| Safety of walking/cycling legs | P2 | legacy accident data | CURRENT (legacy) | not scored |

## A6. Constants and their sources

All constants live in `lib/mobility/config.ts` with a source comment and a `status`: `official`, `proxy` or `assumption`. Assumptions surface in the API response (`assumptions[]`), so the app can show them under "Kodėl?".

| Constant | Unit | Value | Source | Status / verified |
|---|---|---|---|---|
| Single fare 30 / 60 min | € | 1,00 / 1,25 | JUDU fare page | official, 2026-10-10 |
| P+R ticket (parking + PT, 1 person, day) | € | 1,00 | JUDU P+R page | official, 2026-10-10 |
| Street-zone tariffs and paid hours | €/h | A4b | JUDU ArcGIS layer `rinkliavos_zonos_2025_07` | official, 2026-10-10 |
| Petrol (average biofuel blend) | kg CO2e/l | 2.06916 | UK DESNZ 2025 flat file, Scope 1 Fuels | proxy, 2026-10-10 |
| Diesel (average biofuel blend) | kg CO2e/l | 2.57082 | same | proxy |
| LPG | kg CO2e/l | 1.55713 | same | proxy |
| Electricity (**UK grid**) | kg CO2e/kWh | 0.177 | same, Scope 2 | proxy; the Lithuanian grid factor is not verified |
| Average local bus (all Vilnius PT rides) | kg CO2e/pkm | 0.10385 | same, Business travel – land | proxy; UK occupancy; trolleybuses have no own factor yet |
| Petrol / hybrid, diesel, LPG, electricity price | €/l, €/kWh | 1,80 / 2,00 / 0,85 / 0,25 | team assumption (a third-party republication of the EU Oil Bulletin showed ~1,80 €/l petrol and ~2,00 €/l diesel for LT in Aug 2026) | **assumption**; replace with the Commission's Oil Bulletin |
| Car: find a space + walk | min | 8 in a paid zone, 4 otherwise | team assumption | assumption |
| P+R: park | min | 3 | team assumption | assumption |
| Default parking stay | min | 120 | team assumption (stated in the response) | assumption |
| P+R "on the way" | ratio / km | detour ≤ 1,4 × direct; site ≥ 2 km from destination | team assumption | assumption |
| Balanced tolerance; explanation thresholds | min, €, % | ROUTING.md § 6–7 | team assumption | assumption |
| Service area | bbox / km | destination in the Vilnius bbox; origin ≤ 40 km from Katedros a. | team decision | assumption |

Do not copy numbers from model memory or blog posts into this table. An assumption is allowed only if it is labelled as one, in code and here.

## A7. Personal data and privacy (mobility)

- Home and work locations, regular arrival times and the parked-car position are **sensitive** because they reveal routines and where someone lives.
- v0.1 keeps them **on the device only** (ADR-0001), in AsyncStorage (`mobile/src/state/storage.ts`). The BFF receives coordinates per request, does not persist them and does not log request bodies; `app/api/mobility/plan/route.ts` logs only error messages.
- Third parties that receive request data:
  - **Nominatim:** geocoding text, as in the legacy app;
  - **JUDU's ArcGIS zones layer:** the exact destination point, on ArcGIS Online (Esri-hosted);
  - **future routing provider:** origin and destination. OTP is self-hosted, so they stay in-house (ADR-0002).
- Mention all of them in the privacy notice.
- No analytics in v0.1 unless the team decides otherwise and documents it.
- No privacy notice exists yet. Writing one is a human decision, but it must exist before any public release.

## A8. Adding a mobility data source — checklist

1. Fetch it yourself and record the status, URL, format, size, update frequency and licence/terms in A2 (VERIFIED AVAILABLE only after you have fetched and inspected it).
2. Decide whether it is required (a provider) or optional (an enricher, which needs a timeout and a fallback). ROUTING.md § 8.
3. Proxy and cache it in the BFF. Never call it from the phone if it needs keys, rate limiting or joining.
4. Every value it produces carries `basis` and `source` in the response.
5. Document derived constants in A6 with a citation.
6. Add failure-mode checks to TESTING.md › Part B (the source down, slow, or returning malformed data).
7. If it adds hosting, a cost or a paid key, write an ADR.

---

# PART B — LEGACY ROAD-SAFETY DATA (Eismo Pulsas web, CURRENT)

Status labels in Part B: **CURRENT** (used by legacy code on `main`), **RESEARCHED** (listed in team research, not used), **POSSIBLE** (idea only). Verified against code and generated files on 2026-10-09.

## B1. Data architecture overview

```
Build time (manual)                      Committed static files           Runtime
──────────────────────────────           ───────────────────────          ─────────────────────────────
data.gov.lt #509 (police) ─┐
VDA SDMX population ───────┤  scripts/   public/data/accidents-YYYY.json → browser (map) / /api/accidents
VDA ArcGIS boundaries ─────┼─ build-  →  public/data/stats.json          → browser (map) + /statistika (build import)
Regitra plates API ────────┘  data.mjs   public/data/municipalities.geojson → browser (map)

                                                                          /api/reports  ↔ Neon Postgres | .data/reports.json
                                                                          /api/blackspots → Police IRD ArcGIS (live, 6 h cache)
                                                                          /api/geocode   → OSM Nominatim (live, 24 h cache)
                                                                          Esri Canvas tiles (browser)
```

Official and reference data are **pre-aggregated, versioned files**; user data is **mutable, in a database**; two sources are **live proxies**.

## B2. Legacy source inventory

| Source | Status | Stable URL | Purpose | Format | Coverage | Refresh |
|---|---|---|---|---|---|---|
| Policijos departamentas — EĮIS eismo įvykiai | **CURRENT** (build) | https://data.gov.lt/datasets/509/ (distribution ids per year in `OFFICIAL`) | All accident points, participants, vehicles, ages, makes | JSON yearly snapshot `ei_YYYY_12_31.json`, ~100 MB/yr | Lithuania, 2021–2025 in repo | Yearly; the previous year is published in summer (per the `/apie` text) |
| VDA — residents by municipality (`S3R167_M3010214`) | **CURRENT** (build) | `https://osp-rs.stat.gov.lt/rest_json/data/S3R167_M3010214/?startPeriod=2021` | Per-capita municipality rates | SDMX-JSON | 60 municipalities; start-of-year 2021–2026 present in `stats.json` | Yearly |
| VDA — residents by single year of age (`S3R167_M3010205`) | **CURRENT** (build) | `https://osp-rs.stat.gov.lt/rest_json/data/S3R167_M3010205/?startPeriod=2025&endPeriod=2025` | Age-normalised culprit rates | SDMX-JSON | Whole country, **2025 only** | Yearly |
| VDA ArcGIS `sav_11_2_1` FeatureServer/0 | **CURRENT** (build) | https://osp-sdg.stat.gov.lt/arcgis/rest/services/sav_11_2_1/FeatureServer | Municipality polygons (simplified: `maxAllowableOffset=0.003`, 4 dp) | GeoJSON | 60 polygons (Visaginas included in the current file) | Ad hoc |
| Regitra `ValstybinisNumeris` | **CURRENT** (build) | https://get.data.gov.lt/datasets/gov/regitra/ktpr/ValstybinisNumeris | Plates issued per make (fleet proxy) | UAPI JSON `count()` | Plates since 2005 (per `/apie`) | Unknown |
| Police IRD ArcGIS EIIS MapServer/0 | **CURRENT** (runtime) | https://maps.ird.lt/server/rest/services/EIIS/EIIS/MapServer | "Juodosios dėmės" / dangerous sections on state roads | GeoJSON LineStrings, fields `KELIONR, PRADZIAKM, PABAIGAKM, PAVAD, IVEDIMODATA` | 26 features on 2026-10-09 (`PAVAD` ∈ "Juoda dėmė", "Avaringas ruožas") | Upstream-managed |
| OSM Nominatim | **CURRENT** (runtime) | https://nominatim.openstreetmap.org (`search`, `reverse`, `countrycodes=lt`) | Address search, reverse geocoding | JSON v2 | OSM coverage | Live |
| Esri ArcGIS Online Canvas World Dark/Light Gray Base + Reference | **CURRENT** (browser) | `server.arcgisonline.com/ArcGIS/rest/services/Canvas/…` | Basemap tiles | Raster tiles, native ≤ z16 | Global | — |
| Vilniaus m. sav. nusižengimai | RESEARCHED | get.data.gov.lt/datasets/gov/vilniaus_m_sav/nusizengimai/Pazeidimas | Traffic violations | UAPI | Vilnius | — |
| „Tvarkau miestą" (data.gov.lt #3894) | RESEARCHED | https://data.gov.lt/datasets/3894/ | Citizen infrastructure complaints | — | Vilnius | — |
| Via Lietuva traffic intensity (#4375) | RESEARCHED | https://data.gov.lt/datasets/4375/ | Exposure normalisation (accidents ÷ traffic) | — | State roads | — |
| Via Lietuva road weather (#1248) | RESEARCHED | https://data.gov.lt/datasets/1248/ | Surface/air temp, precipitation, visibility | — | Road weather stations | — |
| Via Lietuva restrictions (#1250) | RESEARCHED | https://data.gov.lt/datasets/1250/ | Roadworks, closures | — | State roads | — |
| Via Lietuva road elements (#1251), road network (#1255), traffic statistics incl. black spots (#1254) | RESEARCHED | data.gov.lt/datasets/1251, /1255, /1254 | Infrastructure, geometry, alternative black-spot source | — | State roads | — |
| Kaunas accident points | RESEARCHED | digital.kaunas.lt …/Transportas/Transporto_atviri/MapServer/0 | Fresher (monthly) city accident data | ArcGIS REST | Kaunas, 2020→ | Monthly (per research) |
| Regitra driving licences (#2934) | RESEARCHED | https://data.gov.lt/datasets/2934/ | Normalise age stats by licence holders instead of residents | — | LT | — |
| Police registered events (#1667) | RESEARCHED | https://data.gov.lt/datasets/1667/ | Broader incident context | — | LT | — |
| OSM Overpass, Geoportal.lt, Grinda road scanning | RESEARCHED / POSSIBLE | see research file | Infrastructure objects, road-surface defects | — | — | — |

JUDU, opendata.vilnius.lt and Meteo.lt moved to Part A, where their mobility status is tracked.

## B3. Official accident data (CURRENT)

**Input:** data.gov.lt dataset 509, one yearly snapshot per year. The distribution ids are in `scripts/build-data.mjs`:
`OFFICIAL = { 2021: 10856, 2022: 14438, 2023: 15652, 2024: 17389, 2025: 19566 }`. Download URL pattern: `https://data.gov.lt/datasets/509/distribution/<id>/download/` (cookie-carrying manual redirect handling).

**Fields read from each raw record** (Lithuanian names from the source): `dataLaikas`, `platuma`/`ilguma` (LKS-94; note that `platuma` is passed as X/easting and `ilguma` as Y/northing to the converter), `savivaldybe`, `gatve`, `kelioPavadinimas`, `rusis`, `zuvusiuSkaicius`, `suzeistuSkaicius`, `zuvVaiku`, `suzeistaVaiku`, `iskaitinis`, `neblaivusKaltininkai`, `apsvaigeKaltininkai`, `atsisakeTikrintisKaltininkai`, `kelioElementas1/2`, `schema1`, `ivykioVieta`, `registrokodas`, `eismoDalyviai[]` (`kategorija`, `kaltininkas`, `amzius`, `busena`, `bukle`, `pasisalino`, `tpId`), `eismoTranspPreimone[]` (`kategorija`, `marke`, `modelis`, `pasisalino`, `tpId`).

**Record filtering:** a record is dropped when the timestamp does not parse, the timestamp year ≠ the file year (snapshots contain late-registered prior-year events), coordinates are missing, or the converted point falls outside 53.8–56.5 N / 20.8–26.9 E. Skipped counts are only printed to the console, not stored.

**Output: `public/data/accidents-YYYY.json`.** Columnar and dictionary-encoded to stay ~1–1.4 MB per year:

| Key | Meaning |
|---|---|
| `year`, `n` | file year, row count |
| `dict.muni[]`, `dict.street[]`, `dict.kind[]` | string dictionaries (muni = LAU code string; kind = `rusis`) |
| `lat[]`, `lng[]` | WGS-84 × 1e5, rounded integers (~1 m precision) |
| `t[]` | minutes since 2020-01-01 00:00 **local wall-clock stored as naive UTC** (read back with `getUTC*`) |
| `k[]`, `i[]` | killed, injured |
| `m[]`, `s[]`, `r[]` | dictionary indices into muni/street/kind, `-1` = missing |
| `f[]` | bit flags (below) |
| `id[]` | police `registrokodas` |

**Derived severity** (client and API): `fatal` if killed > 0, else `injury` if injured > 0, else `damage`.

**Flag bits:** identical in `lib/data.ts` (`FLAG`) and the script (`F`). Append only; never renumber.

| Bit | Name | Rule (from script) |
|---|---|---|
| 1 | BIKE | participant category starts "Dviračio", vehicle "Dviratis", or `rusis` "Susidūrimas su dviračiu" |
| 2 | PEDESTRIAN | participant "Pėsčiasis" or `rusis` "Užvažiavimas ant pėsčiojo" |
| 4 | SCOOTER | participant category contains "paspirtuk" or vehicle "Elektrinis paspirtukas" |
| 8 | MOTO | participant/vehicle category matches Motociklo/Mopedo/Motociklas/Mopedas |
| 16 | DRUNK | culprit drunk **or** intoxicated **or** refused testing |
| 32 | CHILD | `zuvVaiku + suzeistaVaiku > 0` |
| 64 | COUNTED | `iskaitinis === 1` ("įskaitinis" = accident with casualties, the official count) |
| 128 | BUS_STOP | road element "Keleivinio transporto sustojimo vieta" |
| 256 | BMW | any vehicle make normalises to BMW |
| 512 | CROSSING | road element "Pėsčiųjų perėja" or `schema1` contains "perėjoje" |
| 1024 | TRUCK | vehicle category starts "Krovininis" |
| 2048 | FLED | **any** participant or vehicle `pasisalino === "Taip"` |
| 4096 | ANIMAL | `rusis` "Užvažiavimas ant gyvūno" |

**Current file contents (verified):**

| Year | Rows | Missing street | Missing municipality | Time range |
|---|---|---|---|---|
| 2021 | 23 511 | 1 120 | 1 | 2021-01-01 → 2021-12-31 |
| 2022 | 23 225 | 983 | 0 | full year |
| 2023 | 23 997 | 1 424 | 0 | full year |
| 2024 | 20 908 | 1 200 | 0 | full year |
| 2025 | 16 121 | 466 | 0 | full year |

Totals (`stats.json › yearTotals`): 107 762 accidents; 13 954 *counted* (with casualties); 681 killed; 16 026 injured. The 2025 total is markedly lower while its *counted* number is stable (2 789): the damage-only share varies between years, and `/statistika` warns readers to compare carefully.

## B4. User-generated data (CURRENT)

There are two entities: **reports** (a dangerous place) and **votes** (one row per voter per report). A report's vote count is the number of its votes; the creator's vote is added on creation.

- **Categories** (`lib/reports.ts`): `speeding` Viršijamas greitis, `intersection` Pavojinga sankryža, `crossing` Nesaugi perėja, `bike` Pavojinga dviratininkams, `visibility` Blogas matomumas / apšvietimas, `road` Duobės / bloga danga, `other` Kita. Unknown ids render as "Kita".
- **Merge rule:** the same category within 35 m (`MERGE_RADIUS_M`) becomes a vote on the existing report. The Postgres store pre-filters with a ±0.001° lat / ±0.0016° lng box, then applies exact haversine.
- **Voter id:** a client-generated UUID in `localStorage["ep-voter"]`, sent as header `x-voter-id`, regex `^[a-zA-Z0-9-]{8,64}$`. Pseudonymous and spoofable.
- **Note:** free text ≤ 280 chars, trimmed; empty → `null`. Rendered as React text (escaped).
- **Coordinates** are rounded to 6 dp and must be inside 53.85–56.5 N, 20.9–26.9 E.
- There is no edit, delete, moderation, expiry or rate limit.

### Database schema (Postgres / Neon)

Created automatically by `pgStore` on first use; mirrored in `db/schema.sql` (keep both identical).

```sql
reports(
  id SERIAL PRIMARY KEY, lat DOUBLE PRECISION NOT NULL, lng DOUBLE PRECISION NOT NULL,
  category TEXT NOT NULL, note TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now())
report_votes(
  report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  voter TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (report_id, voter))
INDEX reports_category_lat_lng ON reports(category, lat, lng)
```

`category` is free `TEXT` (validated only in the API). `GET /api/reports` returns all rows with a correlated `count(*)` per report, with no pagination. The mobility product does **not** use this database in v0.1.

### Local development fallback

When `DATABASE_URL` is absent, `fileStore()` keeps `{ nextId, reports: [{id,lat,lng,category,note,createdAt,voters[]}] }` in `.data/reports.json` (gitignored).
- Mutations are serialised through an in-process promise queue.
- If the file cannot be written (read-only FS), it logs a warning and keeps data **in memory only**.
- Voter ids are stored in the file in plain form.

On 2026-10-09 the local dev server had no `.data/` directory and `GET /api/reports` returned `[]`.

## B5. Population / demographic data (CURRENT)

- **Municipality population per year** (`stats.municipalities[].population`, years 2021–2026). The map choropleth "10 000 gyv. / metus" = accidents ÷ number of years ÷ **mean population of the selected years** × 10 000. It falls back to the latest year's population. The `/statistika` ranking uses the same formula.
- **National population by age bucket** (2025 only), with buckets `<18, 18–20, 21–24, 25–29, …, 75–79, 80+`. Age rate = culprits ÷ **5** ÷ population × 1 000; the `5` is a literal in `AgeChart`. The UI notes that the denominator is residents, not licence holders.

## B6. Regitra data (CURRENT)

For the 30 makes most involved in accidents, the script counts plates via `marke.startswith("<MAKE>")` plus aliases (`VOLKSWAGEN` + `VW`, `MERCEDES-BENZ` + `MERCEDES BENZ`). This counts plates issued (since 2005, per `/apie`) and is used as a **fleet-size proxy**, not active registrations.
- Make rankings count only vehicles with the category "Keleivinis automobilis".
- The per-1 000 view excludes makes with ≤ 3 000 plates.
- A Regitra failure yields `registered: null`; none are currently null.

## B7. Municipality / GIS data (CURRENT)

- **Codes** are LAU codes as strings (e.g. `"13"` Vilniaus m. sav., `"19"` Kauno m. sav., `"30"` Visagino sav.). Names are normalised by `normMuni` ("miesto" → "m.", "rajono" → "r.").
- **Sources:**
  - `stats.municipalities` (60) comes from the population dataset; abolished units with no population are dropped.
  - `municipalities.geojson` (60 features, `properties: {code, name}`) comes from ArcGIS.
- **Visaginas:** all 60 codes currently have a polygon. Code comments in `Dashboard.tsx` and the script say Visaginas lacks a boundary; that is no longer true of the committed file. The fallback (fit to Visaginas accident points) is harmless.
- Unmatched municipality names are printed during the build, not stored.

## B8. Black spots (CURRENT, live)

`/api/blackspots` queries IRD layer 0 with `where=1=1`, `outSR=4326`, `f=geojson`. The map draws each LineString (magenta, 9 px) plus a diamond marker at its middle vertex.
- These cover **state roads only** and are the police's own designation, distinct from the app's computed "Pavojingiausios vietos" (TOP 10 hotspots).
- The UI badge says "LIVE". The data is fetched live (with a 6 h server cache), but the designations themselves change rarely (`IVEDIMODATA` values start in 2018).

## B9. Geocoding (CURRENT, live; also used by the mobile app)

`/api/geocode` calls Nominatim with:
- `User-Agent: EismoPulsas/0.1 (+GitHub URL)`, `Accept-Language: lt`;
- `countrycodes=lt`, `limit=6`.

Behaviour:
- Results are re-ranked so that results in the town typed after a comma come first.
- If a house number is not found, it retries at street level.
- Reverse geocoding (`zoom=17`) supplies the street name when a user clicks an empty map spot; that street name drives the "Visa gatvė" statistics.
- Results are cached for 24 h per server instance.

Nominatim's usage policy applies: ≤ 1 req/s, identify the app, no heavy use, no client-side autocomplete. The spacing is enforced per instance only. The mobile app calls this endpoint unchanged, on submit only (`mobile/src/ui/place-field.tsx`; STRUCTURE.md › Reuse map).

## B10. Weather / road-condition data (legacy)

**Not used by the legacy app.** Via Lietuva road weather, Grinda and road restrictions are RESEARCHED only. The police record has weather and road-condition fields per the dataset description, but the build script does not read them. For mobility weather, see Part A (Meteo.lt, VERIFIED AVAILABLE).

## B11. Coordinate systems

| CRS | Where |
|---|---|
| LKS-94 / EPSG:3346 (Transverse Mercator, GRS80, k0 0.9998, central meridian 24°, false easting 500 000) | Raw police records; Vilnius city GIS often uses it too (maps.vilnius.lt URLs carry LKS-94 x/y) |
| WGS-84 / EPSG:4326 | Everything in the app, GeoJSON, API, GTFS, the JUDU vehicle feed (× 1e6) |

Conversion: a hand-written inverse TM series in `lks94ToWgs84(x, y)` (`scripts/build-data.mjs`), followed by a Lithuania bounding-box sanity check. Boundaries and black spots are requested directly in 4326 (`outSR=4326`). Leaflet displays Web Mercator tiles. If you add a dataset in LKS-94, reuse this function (or a vetted library) and spot-check a few known addresses.

## B12. Static / generated application data

| File | Size (approx.) | Consumers | Hand-edit? |
|---|---|---|---|
| `public/data/accidents-YYYY.json` ×5 | 0.95–1.43 MB each | `lib/data.ts loadYear` (browser), `/api/accidents` | No |
| `public/data/stats.json` | 41 KB | map (runtime fetch), `/statistika` (**build-time import**), `/apie` advertises it | No |
| `public/data/municipalities.geojson` | 161 KB | map choropleth + municipality zoom | No |

All three are produced only by `npm run data` and are committed. The committed version's `stats.json › generatedAt` is `2026-10-05T17:24:44.658Z`.

## B13. Data preprocessing (`scripts/build-data.mjs`)

1. Parse year args (`npm run data -- 2024 2025`); the default is all keys of `OFFICIAL`.
2. In parallel: municipality population, age population, boundaries.
3. Per year: download (cached in `.cache/ei_YYYY.json`), filter, convert coordinates, derive flags, intern strings, accumulate aggregates, write `accidents-YYYY.json`.
4. Regitra counts for the top-30 makes (sequential API calls, 3 retries on 5xx).
5. Write `stats.json` and `municipalities.geojson`.

No keys are required. Node ≥ 18 is needed for global `fetch` and `Headers.getSetCookie` (local machine: Node 24.15). Known issues: see STRUCTURE.md › A14 (#4 partial runs, #5 Windows path).

## B14. Derived statistics

**Build-time (`stats.json`):**

| Key | Definition |
|---|---|
| `yearTotals[y]` | sums over all rows: `all`, `counted` (COUNTED flag), `killed`, `injured` |
| `municipalities[].years[y]` | same + `bike` count, by municipality code |
| `makes[]` | top 30 by passenger-car involvement: `all` vehicles, `culprit` (the vehicle's `tpId` belongs to a culprit participant), `killed` (vehicles in accidents with ≥ 1 death), `byYear`, `registered` |
| `ages[]` | per bucket: `drivers`, `culprits`, `drunk` (culprit whose `busena` ≠ "Blaivus"), `killed`, `population`. Only participants whose category ends in "vairuotojas" |
| `streets[]` | top 60 `municipality|street` by `counted`, then `all` (street = `gatve` or `kelioPavadinimas`, raw string) |
| `hourWeek[7][24]` | all accidents by weekday (Mon = 0) × hour |
| `busStopsBmw[]` | BUS_STOP ∧ BMW accidents with date, place, model |
| `fun` | `drunkCulprits`, `culprits`, `fled` (FLED flag count), `friday13`, `animals`, `scooters`, `bikes`, `busStops`, `busStopMakes` top 6, `topAddresses` top 10 (`ivykioVieta`) |

**Client-side (map):**

| Metric | Definition |
|---|---|
| Hotspots "Pavojingiausios vietos (TOP 10)" | Grid cells of 0.001° lat × 0.0016° lng (~110 × 100 m) over the *visible* accidents (filters + severity + timeline window). Cells need ≥ 3 accidents and are sorted by count, then killed. Label = the most frequent street in the cell |
| "Visa gatvė" | Accidents whose normalised `streetKey` equals the selected street's key **and** that lie within 6 km (avoids same-named streets elsewhere). `streetKey` keeps only the last word after removing street-type words, e.g. "Dariaus ir Girėno" → "girėno" |
| Radius block | 200 m around a clicked place, 120 m for a hotspot, 150 m for an accident |
| "mirtingumas" | `killed / (killed + injured)`: the share of casualties who died, not a population mortality rate |
| Choropleth classes | 5 quantile classes (20/40/60/80 %) over the 60 municipalities |
| Heat weight | fatal 3, injury 1.5, damage 1 |

Detail-panel statistics ignore the severity toggle and the timeline (by design, footnoted in the UI).

## B15. External API contracts (that the legacy app depends on)

| Contract | Assumption in code | What breaks if it changes |
|---|---|---|
| data.gov.lt distribution download | cookie + redirect chain; a JSON array of records with the field names above | data build |
| Field names / Lithuanian enum strings in police data (e.g. "Taip", "Pėsčiasis", "Keleivinis automobilis") | exact string matches | flags and statistics silently become zero |
| VDA SDMX dimension names ("Miestas ir kaimas", "Vyrai ir moterys", ids starting "Vietove", "Demogr_amzius", "Lytis") | exact names | population lookups |
| ArcGIS `lau1`, `lau1_name` fields, `type='SAV'` | exact names | boundaries |
| Regitra UAPI `count()` + `startswith` query syntax | — | `registered` becomes `null` |
| IRD layer 0 fields `KELIONR, PRADZIAKM, PABAIGAKM, PAVAD, IVEDIMODATA`, `features[]` | — | black spots 502 / blank tooltips |
| Nominatim `jsonv2` with `address.road/city/town/…` | — | search/street resolution (legacy **and** mobile) |
| Esri tile URL scheme | keyless public tiles | blank basemap |

**Our own published contracts:**
- `/api/accidents`: GeoJSON properties `id, datetime, severity, killed, injured, municipality, street, type, bicycle, pedestrian, intoxicated`.
- `/api/reports`: objects `{id, lat, lng, category, note, votes, createdAt}`.
- `/api/geocode`: as above; the mobile app depends on it.

`/apie` documents these for third parties. Treat any change as breaking and update `/apie` in the same task.

## B16. Refresh / update process

**Refresh existing years:**
1. Delete `.cache/ei_YYYY.json` if the upstream snapshot changed.
2. Run `npm run data` for all years (see the partial-run warning).
3. Review the console output: skipped counts, unmatched municipalities.
4. Check the diff size of `public/data/`.
5. Run `npm run build`, then smoke-test `/` and `/statistika`.

**Add a new year (e.g. 2026):**
1. Find the yearly snapshot's distribution id on data.gov.lt #509 and add it to `OFFICIAL` in `scripts/build-data.mjs`.
2. Add the year to `YEARS` in `lib/data.ts`.
3. Update the hard-coded year text:
   - `components/stats/charts.tsx`: the MakesChart note "2021–2025", MunicipalityRanking `<option value="all">2021–2025</option>`, and the AgeChart divisor `5`;
   - `app/statistika/page.tsx`: the metadata description;
   - `app/apie/page.tsx`: the endpoint text "year (2021–2025)";
   - README.
4. Consider whether the age population year (`startPeriod=2025`) should move.
5. Run the full build, then everything in TESTING.md › Data regression checks.

There is no scheduled or automatic refresh.

## B17. Known data-quality limitations (verified)

- **Missing coordinates:** the record is dropped (the count is not persisted). Per `/apie`, "kai kurie įvykiai neturi koordinačių".
- **Missing street** for 466–1 424 accidents per year (see the table above). They never appear in street statistics.
- **Inconsistent street names:**
  - Raw strings vary across different towns *and* within one. The 2024 dictionary contains "Taikos", "Taikos pr.", "Taikos g.", "Taikos al.", "Taikos p" and "Savanorių", "Savanorių pr.", "Savanorių a.".
  - The `streetKey` heuristics merge some variants, and can over-merge different streets that share a last word within 6 km.
  - `stats.streets` uses raw strings, so one street can be split across several ranking rows.
  - The hotspot list shows bare street names without the town: three entries read "Klaipėdos" for 2025 nationally.
- **Damage-only coverage varies by year** (2025 total 16 121 vs ~23 000 in 2021–2023).
- **`topAddresses` contains non-addresses** (e.g. "Vilniaus miesto sav."); `/statistika` filters to entries containing a digit.
- **Label vs definition mismatches to verify:**
  - `fun.fled` (38 052) counts accidents where *anyone* left the scene, while the UI says "kartų kaltininkas pasišalino".
  - `ages[].drunk` counts any `busena` ≠ "Blaivus" (the full set of `busena` values was not inspected).
- **Fleet denominator** is plates issued since 2005, not vehicles currently registered.
- **Update latency:** a full year appears about half a year later.

## B18. Privacy considerations (legacy)

- **Police data** in the repo contains no names.
  - Per-accident files contain exact coordinates, timestamps and the police `registrokodas`, all shown in the accident card.
  - Participant ages and vehicle models appear only in aggregates. The exception is `busStopsBmw`, which lists individual accidents with date, place and model.
  - Combining these with other sources could make individual incidents identifiable. Avoid adding further per-person attributes without a decision.
- **Reports** store coordinates, free text and a pseudonymous voter id per vote. Notes are public via `GET /api/reports`. Users may type personal data into notes, and there is no moderation or deletion path.
- **Server logs** (`console.error`) contain upstream error messages, not request bodies.
- **Third parties:** searches are forwarded to Nominatim from the server, and click positions are reverse-geocoded the same way.
- No privacy policy or terms exist in the repo. Writing one is a human decision.

## B19. Adding a legacy dataset — checklist

1. Confirm the licence/terms and rate limits. Record the stable URL, institution, format, coverage and update frequency in B2 (RESEARCHED → CURRENT only when code reads it).
2. Decide between **build-time** (a static file via the script, preferred for historical data) and a **runtime proxy** (`app/api/<name>/route.ts` with a cache, User-Agent and stale-on-error).
3. Never call third-party APIs directly from the browser if they need identification, rate limiting or caching.
4. Convert to WGS-84 at build time, and document the source CRS here.
5. Keep generated output compact (columnar/dictionary encoding like `accidents-YYYY.json`) and measure the file-size impact on first map load.
6. Join on stable codes (LAU municipality codes), not names, and log unmatched keys.
7. Add or extend the TypeScript types (`lib/stats.ts`, `lib/data.ts`) together with the script.
8. Update the `/apie` sources (and the `sources` array in the script) for attribution.
9. Add a regression check to TESTING.md if the dataset feeds a headline number.
10. If the decision is hard to reverse (new storage, a new paid service), write an ADR.
