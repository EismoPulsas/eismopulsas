# Planas — Hack4Vilnius (atnaujinta 2026-10-10)

> Šis failas – **vykdymo planas**: prioritetai (P0 / P1 / P2), darbų eiliškumas ir darbo srautai. Tai ketinimai, ne faktai apie kodą.
> Produkto apibrėžimas – [PRODUCT.md](PRODUCT.md), rekomendacijų logika – [ROUTING.md](ROUTING.md), duomenys – [DATA.md](DATA.md), dizainas – [DESIGN.md](DESIGN.md), architektūra – [STRUCTURE.md](STRUCTURE.md), sprendimai – [ADR-0001](docs/adr/0001-pivot-to-personalized-multimodal-mobility.md), [ADR-0002](docs/adr/0002-routing-provider-strategy.md), [ADR-0003](docs/adr/0003-mobile-project-isolation-and-contract-sharing.md).
> Ankstesnis planas (eismo įvykių žemėlapis, statistika, laiko juosta) **įgyvendintas** ir dabar yra senoji (LEGACY) žiniatinklio versija. Jos nebeplėtojame, tik taisome klaidas.

## Tikslas

Android programėlė, kuri į klausimą **„Kaip man geriausia nuvykti šiandien?“** atsako palygindama kelionės būdus pagal laiką, kainą ir CO₂, rekomenduoja vieną ir paaiškina kodėl.

**Svarbiausia taisyklė: geriau vienas nušlifuotas veikiantis kelias nuo pradžios iki galo, nei daug pusiau veikiančių funkcijų.**

**Terminai:**
- **sekmadienį, spalio 11 d., 11:30** – pre-pitch vaizdo įrašas;
- **13:00** – pristatymai;
- **14:00** – finalas.

## Dabartinė būsena (2026-10-10)

| Dalis | Būsena |
|---|---|
| Senoji žiniatinklio versija (žemėlapis, statistika, pranešimai, API) | VEIKIA (LEGACY), `npm run build` praeina |
| `mobile/` (Expo SDK 57) | **v0.1-alpha SUKURTA**: Pradžia → Palyginimas → Maršrutas su žemėlapiu, Išsaugotos, Profilis. **Dar neišbandyta telefone** |
| `POST /api/mobility/plan` (BFF) | **VEIKIA**: 3 strategijos, rekomendacija, paaiškinimas iš skaičių, duomenų kilmė |
| Maršrutų tiekėjas | **Demonstracinis (sintetinis)**; kitas žingsnis – OpenTripPlanner + JUDU GTFS (ADR-0002) |
| P+R aikštelės, P+R bilietas, VT bilietų kainos, gatvių zonų tarifai | **TIKRI JUDU duomenys** (DATA.md › A4b, A6) |
| Stovėjimo zona tikslo vietoje | **Gyvai iš JUDU ArcGIS sluoksnio** |
| P+R ir aikštelių laisvos vietos realiu laiku | Šaltinis rastas ir patikrintas (JUDU sluoksnis, atnaujinamas kas 30 s), **dar neprijungtas** |
| CO₂ koeficientai | JK Vyriausybės 2025 m. (artinys, pažymėta „~“) |
| Kuro kaina | Prielaida (pažymėta), vartotojas gali nurodyti savo |

## P0 — Versija 0.1 (hakatono MVP)

Atlikta = veikia **tikrame Android telefone** pagal [PRODUCT.md › Version 0.1](PRODUCT.md#version-01-hackathon-mvp--definition-of-done).

| # | Funkcija | Būsena |
|---|---|---|
| 1 | Android programėlė (Expo) | Sukurta; **reikia paleisti telefone** (Expo Go) |
| 2–3 | Pradžios taškas ir tikslas | Adreso paieška per `/api/geocode` |
| 4 | „Atvykti iki“ laikas | Šiandien / Rytoj + laikas |
| 5 | Minimalus profilis | Automobilis, kuras, sąnaudos, VT bilietas, ėjimas, prioritetas |
| 6 | 3 variantai | Automobiliu; viešuoju transportu; P+R (**demonstraciniai maršrutai**) |
| 7 | Palyginimas | Laikas, kaina, CO₂ su „~“ |
| 8 | Viena rekomendacija | Dominavimas + prioritetas (ROUTING.md § 6) |
| 9 | Paaiškinimas „kodėl“ | Iš tikrų skirtumų; skaičiai sutampa |
| 10 | Maršrutas žemėlapyje | Atkarpos, A / P / B žymos |
| 11 | Išsaugota kelionė „Darbas“ | Vienu paspaudimu |
| 12 | Paruošta realaus laiko duomenims | Tiekėjų sąsaja, `basis` / `dataMode` / `sources` |

**Demonstraciniai scenarijai** (`lib/mobility/scenarios/`):
- **A:** kelionė į darbą iš Vilniaus rajono (Lindiniškės → Gedimino pr. 9). Rekomenduojama P+R; kaina iš tikro Raudonos zonos tarifo.
- **B:** vizitas Senamiestyje (Lazdynai → Vokiečių g. 2, Mėlyna zona).

## Likęs laikas — eiliškumas

1. **Šiandien, pirmiausia (~1 val.):** paleisti programėlę telefone per Expo Go (README). Praeiti A ir B scenarijus ir užrašyti klaidas. Tai didžiausia neišbandyta rizika.
2. **Lygiagrečiai (4 srautai, žr. žemiau):**
   - OpenTripPlanner tiekėjas;
   - P+R laisvų vietų rodymas;
   - telefono / dizaino klaidų taisymas;
   - demonstracija ir pristatymas.
3. **Šiandien vakare:** sujungti tai, kas veikia. Jei OTP nespėja – demonstruojame su demonstraciniais maršrutais ir **atvirai tai sakome** (programėlė tai rodo).
4. **Sekmadienio rytas:** BFF diegimas Vercel'yje; programėlė nukreipta į Vercel URL. Repeticija, atsarginis ekrano įrašas, pre-pitch vaizdo įrašas iki 11:30.

## Darbo srautai (4 žmonės) — galima dirbti lygiagrečiai

| Srautas | Užduotis | Failai | Liečia sutartį? |
|---|---|---|---|
| **1. Maršrutai (OTP)** | Docker OTP 2.x su JUDU GTFS + Vilniaus OSM; `providers/otp.ts`, `MOBILITY_ROUTING_PROVIDER=otp`, `OTP_BASE_URL` | `lib/mobility/providers/otp.ts`, `providers/index.ts` | Ne |
| **2. Gyvi P+R duomenys** | JUDU užimtumo sluoksnis → `parking.availability` (laisvos vietos P+R) su laiku ir „© JUDU“; ekrane – „Laisvų vietų: 90“ | naujas `lib/mobility/providers/judu-occupancy.ts`, `plan.ts`, `mobile/src/app/route/[id].tsx`, `ui/option-row.tsx` | Ne (laukas jau yra) |
| **3. Programėlė telefone** | Expo Go bandymas, klaidų taisymas, didelis šriftas, TalkBack, šviesi / tamsi tema | `mobile/src/**` | Ne |
| **4. Demo ir pristatymas** | Scenarijų paruošimas, „Darbas“ kelionė, Vercel diegimas, skaidrės, vaizdo įrašas; klausimai JUDU mentoriams (DATA.md › A2) | `README.md`, scenarijai | Ne |

Sutartis tarp programėlės ir BFF – **ROUTING.md § 9** ir `lib/mobility/types.ts`. Programėlė ją importuoja tiesiogiai (ADR-0003), todėl pakeitimas iš karto matomas abiejose pusėse.

## P1 — tik kai P0 veikia telefone

- P+R ir aikštelių laisvos vietos (šaltinis yra – žr. 2 srautą).
- Realaus laiko vėlavimai (stops.lt GTFS-RT, jei JUDU patvirtins) per OTP.
- Orai (Meteo.lt) pėstiesiems ir dviratininkams.
- Ėjimas pėsčiomis, dviratis, „parkuok ir eik“ (JUDU aikštelės).
- Patikimumo intervalai, rekomenduojamas išvykimo laikas.
- Automobilio vietos įsiminimas ir „Grįžti prie automobilio“.
- Sutaupymų prognozė išsaugotai kelionei.

## P2 — vėliau

Paspirtukai, traukiniai, saugumo vertinimas (senieji eismo įvykių duomenys), paskyros, pranešimai, ML, monetizacija, žaidybinimas.

## Ko nedarome

- Neplėtojame senosios žiniatinklio versijos naujomis funkcijomis.
- Nedarome P1/P2, kol P0 neveikia telefone.
- Neišgalvojame duomenų: kiekviena konstanta turi šaltinį arba pažymėta kaip prielaida (DATA.md › A6). Demonstraciniai maršrutai visada pažymėti.
- Nekuriame paskyrų ir nesaugome asmeninių vietų serveryje.

## Rizikos

| Rizika | Poveikis | Mažinimas |
|---|---|---|
| Programėlė dar nebandyta telefone | Demo gali neveikti | Pirmas darbas – Expo Go bandymas; atsarginis ekrano įrašas |
| OTP nespės | Maršrutai lieka demonstraciniai | `demo` tiekėjas lieka; pristatyme sakome atvirai |
| OTP veikia tik komandos kompiuteryje | Vienas gedimo taškas | `MOBILITY_ROUTING_PROVIDER=demo` kaip atsarginis |
| Google Maps raktas APK'ui | Žemėlapis neveikia įdiegtoje versijoje | Demo per Expo Go (rakto nereikia) arba raktas su apribojimais (README) |
| Venue Wi-Fi blokuoja telefoną ↔ kompiuterį | Programėlė nepasiekia BFF | Naudoti Vercel URL |
| Netikslūs skaičiai (kaina, CO₂) | Prarandamas pasitikėjimas | „~“, šaltiniai, „Kodėl?“ su prielaidomis |
| JUDU ArcGIS sluoksniai nėra kataloge | Naudojimo leidimas neaiškus | Paklausti JUDU mentorių; licencija CC BY-NC 4.0 nurodyta metaduomenyse |

## Atviri klausimai

Žr.:
- [PRODUCT.md › Open product questions](PRODUCT.md#open-product-questions-need-a-human-decision);
- [DESIGN.md › B21](DESIGN.md#b21-open-design-questions-need-a-human-decision);
- klausimus JUDU mentoriams (DATA.md › A2: užimtumo sluoksnio ir GTFS-RT naudojimas, maršrutų planavimo API).
