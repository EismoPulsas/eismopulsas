# TESTING.md — how changes are verified

Three parts:
- **Part A — Rules for every change.**
- **Part B — Mobile + BFF checks (CURRENT, v0.1-alpha).** Includes the verification record of 2026-10-10 (B0).
- **Part C — Legacy web checks (CURRENT).** These are the checks that exist today for the Eismo Pulsas web app.

---

# PART A — RULES FOR EVERY CHANGE

- **No automated test suite exists**: no test runner, no `test` script, no CI config. Verification today means the two automated checks (`npm run lint`, `npm run build`) plus deliberate manual checks.
- **Identify the area first** (AGENTS.md): mobile, BFF, legacy web, shared data, or docs. Then run that area's checks, **and** the root checks whenever root files change.
- Verify the behaviour you changed **and** its neighbours.
- Data and recommendation changes are verified against numbers, not by eye.
- **Report honestly:** what you ran (with results), what you checked manually, and what you could not check.
- **Adding a test framework is a team decision with an ADR.** Do not add one as a side effect of another task. B6 proposes when it becomes worth it.

**Root checks, required before every push that touches root code or config:**

| Command | What it does | Expected (2026-10-09 baseline) |
|---|---|---|
| `npm run lint` | `eslint` with `eslint-config-next` core-web-vitals + typescript (flat config) | exit 0, no output (~85 s on the dev machine) |
| `npm run build` | `next build` (Turbopack) incl. TypeScript check | exit 0; routes `○ /`, `○ /apie`, `○ /statistika`, `ƒ /api/*` including `ƒ /api/mobility/plan` |

`npm run build` while `npm run dev` is running worked on this machine and did not modify tracked files.

**Docs-only changes:** no build is needed. Instead:
- check that links and section references resolve;
- check that statuses (CURRENT / PLANNED …) match the code;
- check that the `AGENTS.md` Next.js block is intact. It is current when `node -e 'console.log(require("next/dist/server/lib/generate-agent-files.js").hasCurrentAgentRules(process.cwd()))'` prints `true`.

---

# PART B — MOBILE APP AND BFF

> **Status (2026-10-10): CURRENT for the v0.1-alpha.** The commands below are real. What has **not** been done yet: any run on a physical Android phone or an emulator (no Android SDK on the machine that built the alpha), TalkBack, and font-scale checks (B5).

## B0. Verification record — v0.1-alpha (2026-10-10)

| Check | Result |
|---|---|
| Root `npm run lint` | exit 0 |
| Root `npm run build` | exit 0. Routes `○ /`, `○ /apie`, `○ /statistika`, `ƒ /api/*` incl. `ƒ /api/mobility/plan`; no workspace-root warning |
| `mobile/`: `npx tsc --noEmit` | exit 0. `--listFiles` includes `../lib/mobility/types.ts`, so the shared contract is type-checked |
| `mobile/`: `npm run lint` (`expo lint`) | exit 0 |
| `mobile/`: `npx expo-doctor` | 21/21 checks passed |
| `mobile/`: `npx expo export --platform android` | Hermes bundle built (2,8 MB); the type-only contract import is stripped |
| `mobile/`: `npx expo export --platform web` (static rendering) | all 5 routes render with their Lithuanian content (initial states) |
| BFF curl (B2) with `lib/mobility/scenarios/*.json` | 3 strategies, recommendation, sentences; live JUDU zone lookup (Gedimino pr. 9 → Raudona, Vokiečių g. 2 → Mėlyna); validation 400s; GET 405 |
| B3 scenarios against the pure pipeline (ad-hoc `tsx` script, not committed — see B6a) | 13 scenarios, 0 invariant failures: sentence deltas = displayed metrics, leg order, arrive-by, determinism, all-late, no-car, EV units, zone-lookup failure |
| App client code (`mobile/src/api`, `domain`) run in Node against the dev BFF | geocode → build request → plan for all four preferences → error path OK. This found and fixed a bug: a "Pigiausias" headline was shown when cheaper options were excluded by the walking limit |
| Android device / emulator, TalkBack, font scale | **not done** |

## B1. Automated checks

| Command | Where | Expected |
|---|---|---|
| `npx tsc --noEmit` | `mobile/` | exit 0 |
| `npm run lint` (runs `expo lint` with `mobile/eslint.config.js`) | `mobile/` | exit 0 |
| `npx expo-doctor` | `mobile/` | no issues |
| `npx expo export --platform android --output-dir <temp dir>` | `mobile/` | bundle builds (catches Metro/import problems without a device). Do not export into the repo |
| `npm run lint` + `npm run build` | root | still pass, i.e. **root tooling isolation works** (STRUCTURE.md › B5); `git status` shows no `mobile/node_modules`, `mobile/.expo`, `mobile/.env` |

## B2. BFF contract checks (curl, no writes)

Run against `npm run dev` (root) or a Preview URL. Expected shapes are in ROUTING.md § 9; request bodies are in `lib/mobility/scenarios/` (move `arriveBy` forward when it is more than 30 days old).

```bash
# happy path: car + transit + P+R
curl -s -X POST localhost:3000/api/mobility/plan -H 'content-type: application/json' -d @lib/mobility/scenarios/uc1-commute-from-district.json
curl -s -X POST localhost:3000/api/mobility/plan -H 'content-type: application/json' -d @lib/mobility/scenarios/uc2-old-town-appointment.json
# validation
curl -s -X POST localhost:3000/api/mobility/plan -H 'content-type: application/json' -d '{}'          # 400 invalid_place
curl -s -X POST localhost:3000/api/mobility/plan -H 'content-type: application/json' -d 'nope'        # 400 invalid_json
curl -s -X POST localhost:3000/api/mobility/plan -H 'content-type: application/json'   -d '{"origin":{"lat":10,"lng":10},"destination":{"lat":54.68,"lng":25.28},"arriveBy":"2026-10-12T08:45:00+03:00"}'  # 400 out_of_service_area
# geocode reused unchanged (legacy endpoint)
curl -s "localhost:3000/api/geocode?q=Gedimino%20pr.%201,%20Vilnius"
```

Check on every response:
- `version` is 1;
- `dataMode` matches the provider (`demo` today);
- each option has `metrics`, `basis`, `legs`, `status` and `summary`;
- `recommendation.optionId` exists in `options` and is listed first;
- `sources[]`, `assumptions[]`, `warnings[]` and `unavailable[]` are present;
- no request bodies in the server logs.

## B3. Recommendation scenarios (the core regression check)

Maintain a small set of **scenario fixtures**: request + expected outcome. Request bodies live in `lib/mobility/scenarios/` (README there lists the expected outcome per file). Each scenario states the expected **strategy set**, **recommended strategy per preference**, and **explanation facts**. Numbers may move within stated tolerances, but the strategy must not change silently.

Minimum set:

| # | Scenario | Expect |
|---|---|---|
| 1 | Commute (UC1), car available, `balanced` | car, transit, P+R generated. The recommendation and its sentence agree with the displayed numbers. |
| 2 | Same, `fastest` / `cheapest` / `greener` | Each preference picks the min of its metric (ROUTING.md § 6). |
| 3 | Old Town appointment (UC2), car available | Parking cost is present or explicitly "nežinoma"; P+R or transit is likely recommended for `balanced`. |
| 4 | No car | No car or P+R options; transit recommended; no car wording in the explanation. |
| 5 | `maxWalkMin` = 5 | Options exceeding it are flagged, not silently recommended. |
| 6 | Impossible arrive-by (e.g. in 5 min) | "all late" handling; the least-late option first. |
| 7 | Electric car | CO₂ and cost use kWh units; no litres in the text. |
| 8 | Arrive-by outside GTFS validity | Clear error/warning, not empty results. |

Explanation checks:
- every number in the sentence equals the difference computed from the displayed metrics (after rounding);
- Lithuanian plurals are correct;
- lt-LT decimals are used;
- "~" appears for estimates.

## B4. Failure and fallback behaviour

Simulate each failure (via provider configuration, an invalid key in a local env, or by blocking the host) and verify:

| Failure | Expected |
|---|---|
| Routing provider down / timeout | The affected strategies disappear with a warning. If none are left: a clear error. With fixture mode on: results labelled "Demonstraciniai duomenys". |
| Transit provider down, car OK | Car shown; transit and P+R are unavailable with reasons; no recommendation claims about missing options. |
| Live enricher (vehicle feed, weather) down or slow | Results arrive within the time budget, from static data; the data note says live data is unavailable. |
| `gps_full.txt` malformed / truncated rows | The parser skips bad rows; no 500. |
| Nominatim 502 / slow | Inline "Adreso paieška nepavyko" with retry; the typed text is kept. |
| P+R list empty for the corridor | No P+R option; reason line shown. |
| Constant missing (e.g. no CO₂ factor) | The metric shows "—", not 0. |

## B5. Android device testing

Manual, per PR that touches UI. Record the device and Android version in the PR.

**Devices:**
- At least one **real Android phone** (the demo device).
- Emulator **small** ≈ 360 × 640 dp.
- Emulator **large** ≈ 412 × 915 dp.
- Light **and** dark theme.

**Accessibility and display settings:**
- System font scale at default **and** largest, plus display size "large".
- TalkBack on for the core flow.

**Navigation:**
- The Android back gesture/button at every level.
- Back from Results returns to Plan with its fields preserved.
- A saved trip opens Results in one tap.
- Rotation: the app either supports it or is locked (decide when building), with nothing broken.

**Core flow (P0):**
1. Profile → Plan → Palyginti → Results → Option → Map → back.
2. Save a trip as "Darbas", reopen it from Home.
3. Change the preference on Results.

Expected:
- the recommendation is first, with a sentence;
- the three numeric columns are aligned;
- the leg strip is readable;
- the map shows the route with A/B/P markers and the leg list.

**Map:**
- the route fits the screen with padding for the sheet;
- the sheet can be closed by button;
- the Google attribution is visible;
- it works in a release/dev build (the API key is configured), not only in Expo Go.

**Input:**
- Lithuanian diacritics typed in search;
- the decimal comma accepted in the consumption field;
- the native time picker;
- the keyboard does not cover the primary button.

**Performance:**
- Results appear within the BFF budget (target set in ROUTING.md);
- no jank when opening the map;
- cold start is acceptable on the demo device.

## B6. Offline and network behaviour

| Condition | Expected |
|---|---|
| Airplane mode, open a saved trip | The last cached result with its timestamp + offline message + retry |
| Airplane mode, new search | Inline error; the input is kept |
| Network restored | Retry works without restarting the app |
| Slow network (throttled or a weak signal) | Skeleton + text; the user can go back; no duplicate requests from repeated taps |
| BFF unreachable in development | Check `EXPO_PUBLIC_API_BASE_URL` (the phone cannot reach `localhost` on the dev machine; STRUCTURE.md › B4) |

## B6a. When to add a test runner (PROPOSED, needs an ADR)

`recommend.ts`, `explain.ts`, `metrics.ts`, `validate.ts`, `plan.ts` and `providers/demo.ts` are pure: no `server-only`, relative imports only. So the B3 scenarios run in plain Node with a `PlanDeps` that injects a fake zone provider and a fixed `now`. On 2026-10-10 they were run with an ad-hoc `npx tsx` script outside the repo (B0). Committing such a runner (e.g. `node:test` + `tsx`) is the recommended next step and needs the ADR. Until then, run B2 via curl and record the results in the PR.

## B7. Pre-demo checklist (mobility)

- [ ] Demo APK/dev build installed on the demo phone; the map renders (API key OK).
- [ ] The BFF production/Preview URL is reachable on venue Wi-Fi **and** mobile data.
- [ ] Both demo scenarios (UC1, UC2) give sensible results live; fixtures ready and labelled as a fallback.
- [ ] Profile prepared; the "Darbas" saved trip exists.
- [ ] Airplane-mode behaviour rehearsed once (cached result).
- [ ] Data sources and estimates stated honestly in the pitch (DATA.md › A2 statuses).
- [ ] Screen recording of the full flow as a backup.

---

# PART C — LEGACY WEB CHECKS (Eismo Pulsas web, CURRENT)

## C1. Development smoke test (2 minutes)

1. `npm run dev`, open http://localhost:3000. The loading text "Kraunamas eismo pulsas…" is replaced by the map.
2. DevTools console: no errors (React DevTools/HMR info lines are normal).
3. Network: `stats.json`, `municipalities.geojson`, `/api/reports`, `accidents-2025.json` all return 200.
4. Visit `/statistika` and `/apie`: both render, and the header links work.

## C2. Map smoke test

Defaults to expect on first load (data as of `stats.json` 2026-10-05):
- source **Mix**, year 2025–2025, all of Lithuania, "Visi";
- severities Žuvusieji 124 ✓ / Sužeistieji 2 665 ✓ / Tik materialinė žala 13 332, "rodoma 2 789";
- view Taškai, TOP 10 on, black spots off;
- timeline "2 789 įvykių · paspauskite ▶".

| # | Action | Expected |
|---|---|---|
| 1 | Map loads | Dark basemap tiles; yellow/red dots over Lithuania; numbered hotspot badges |
| 2 | Click **Oficialūs** | Dots stay; the "Vartotojų pranešimai" section disappears from the sidebar |
| 3 | Click **Vartotojų** | Dots, hotspots and timeline disappear; the sidebar shows only search + report categories (empty-state text when there are no reports) |
| 4 | Click **Mix** | Both layers back |
| 5 | Savivaldybė → "Vilniaus m." | Map flies to Vilnius; "rodoma" drops (625 for the 2025 defaults) |
| 6 | Category chip (e.g. Dviratininkai) | Counts and dots reduce; the chip shows as selected |
| 7 | Year range 2021–2025 | "kraunama…" then larger counts; all five year files load |
| 8 | Toggle a month | Helper text changes to "Rodomi tik pažymėti mėnesiai" |
| 9 | Toggle a severity row | The row dims, ✓ disappears, dots of that colour vanish |
| 10 | Click a dot | Sidebar shows the accident card + "Visa gatvė" + radius block + "Vartotojų pranešimai šalia"; turquoise ring on the dot |
| 11 | "← Atgal į filtrus" | Filters back with their previous values |
| 12 | Click a hotspot badge / list item | Place detail with the street name and the 120 m block; the list item also flies to zoom 17 |
| 13 | Click an empty map spot | "Ieškoma gatvė…" then a street name (reverse geocode) or "Gatvė nenustatyta" |
| 14 | View **Šiluma** | Heat overlay; redraws on pan/zoom |
| 15 | View **Savivaldybės** | Choropleth + legend + metric switch; hover tooltip "N įvykių · X / 10 000 gyv. per metus"; click selects/deselects a municipality |
| 16 | Toggle black spots | Magenta lines/diamonds appear (26 features on 2026-10-09); the tooltip shows road + km; or a red error text if IRD is down |
| 17 | Timeline ▶ | The month label advances every ~0.9 s; the histogram bar highlights; fatal events pulse; ❚❚ pauses; ✕ restores the full period |
| 18 | Address search "Gedimino pr. 1, Vilnius" | Dropdown results within ~1–2 s; picking flies to zoom 16 and opens the place detail |
| 19 | ☀ / ☾ basemap | Tiles switch light/dark |

## C3. API smoke tests

Run against the dev server (no writes except where marked):

```bash
curl -s "localhost:3000/api/accidents?year=2025&muni=13&category=bike&limit=2"   # FeatureCollection, 2 features
curl -s "localhost:3000/api/accidents?year=2019"                                  # 400, year list
curl -s localhost:3000/api/reports                                                # JSON array
curl -s localhost:3000/api/blackspots | head -c 200                               # FeatureCollection (or 502 JSON error)
curl -s "localhost:3000/api/geocode?q=Gedimino%20pr.%201,%20Vilnius"              # array with lat/lng/label/street/city
curl -s "localhost:3000/api/geocode?lat=54.6862&lng=25.2860"                      # {label, street, city}
# Validation (no writes):
curl -s -X POST localhost:3000/api/reports -H 'content-type: application/json' -d '{"lat":54.7,"lng":25.2,"category":"bike"}'            # 400 Trūksta x-voter-id
curl -s -X POST localhost:3000/api/reports -H 'x-voter-id: test-voter-0001' -H 'content-type: application/json' -d '{"lat":10,"lng":10,"category":"bike"}'   # 400 Vieta turi būti Lietuvoje
curl -s -X POST localhost:3000/api/reports -H 'x-voter-id: test-voter-0001' -H 'content-type: application/json' -d '{"lat":54.7,"lng":25.2,"category":"nope"}' # 400 Nežinoma pavojaus kategorija
curl -s -X POST localhost:3000/api/reports/999999/vote -H 'x-voter-id: test-voter-0001'   # 404 Pranešimas nerastas
```

Geocode calls hit Nominatim, so keep manual use light (≤ 1 req/s policy). `/api/geocode` is planned to serve the mobile app, so any change to it must keep this contract.

## C4. User-report flow

**Writes data.** Locally without `DATABASE_URL` it writes `.data/reports.json` (gitignored). **Never run it against a Preview/Production deployment that uses the shared Neon database unless the team agrees.** There is no delete endpoint; cleanup requires SQL.

1. Click "⚠ Pažymėti pavojingą vietą": a banner, a crosshair cursor and a form with steps 1–3 appear, and the CTA reads "✕ Atšaukti žymėjimą".
2. The submit button stays disabled until a location and a category are chosen.
3. Click the map: a turquoise draggable pin appears and the coordinates are shown. Drag it: the coordinates update.
4. Use the form's address search: the pin moves there.
5. Choose a category: focus moves to the comment. Type ≤ 280 chars.
6. Submit: "Ačiū! Vieta pažymėta…", and a report marker with badge 1 appears (the source switches to Mix if it was Oficialūs).
7. Submit again with the same category within 35 m: "Jūs jau esate pažymėję šią vietą…" (same browser); the vote count is unchanged.
8. In a second browser profile / private window, submit the same category nearby: "…jūsų balsas pridėtas! Iš viso: 2."
9. A different category at the same spot creates a new, separate report.
10. Open a report popup and click "+1 Aš irgi". After voting the button reads "✓ Balsavote" and the count increments once; a reload keeps the disabled state (`localStorage["ep-voted"]`).
11. Click near the report on the map: the detail panel lists it under "Vartotojų pranešimai šalia" (≤ 250 m).
12. Clean up local test data: stop the server, delete `.data/reports.json`.

## C5. Data regression checks (after `npm run data` or any change to the script / decoders)

```bash
node -e 'const s=require("./public/data/stats.json");console.log(s.generatedAt,s.years,Object.fromEntries(s.years.map(y=>[y,s.yearTotals[y]])),s.municipalities.length,s.makes.filter(m=>m.registered==null).length)'
```

- `years` contains **every** year in `YEARS` (a partial run shrinks it; see DATA.md › B13).
- Per-year `all`/`counted`/`killed`/`injured` are within plausible ranges of the previous version (2026-10-05 baseline: all 23 511 / 23 225 / 23 997 / 20 908 / 16 121; killed 146 / 118 / 158 / 123 / 136). Investigate any change > ~5 % for an already-published year.
- `municipalities.length` = 60, and the geojson has 60 features with codes matching `stats.municipalities`.
- `makes[].registered` has no `null` (Regitra failures).
- Build console: note "praleista N" skipped counts and any "Nesuderintos savivaldybės".
- Each `accidents-YYYY.json` has equal-length columns (`n` = length of `t`, `lat`, …) and a time range inside its year.
- Spot-check 2–3 accidents on the map against the raw source location (e.g. a known street) to catch coordinate-conversion errors.
- Flag consistency: `FLAG` in `lib/data.ts` equals `F` in the script.
- `git diff --stat public/data`: size changes should be explainable.
- `npm run build`, then check that the `/statistika` totals match `stats.json` (it is a build-time import).

## C6. Responsive checks (legacy)

Widths: **1440**, **1024**, **390** (plus 320 for reflow when touching layout). If you cannot resize the real window, an iframe of the target width works for layout (media queries respond to the iframe) but not for touch/keyboard behaviour. Say so in your report.

- No page-level horizontal scroll: `document.documentElement.scrollWidth === innerWidth`. **Known failures today:** `/statistika` at 390 (694 px), `/apie` at 390 (409 px).
- **Map at 390:**
  - header height (today 133 px);
  - whether floating controls overlap each other or the timeline;
  - sidebar overlay open/close via ☰;
  - whether all destinations are reachable (today "Apie / API" is hidden on the map page).
- **1024:** the sidebar is static from `lg`; check the timeline/CTA overlap.
- Lithuanian long labels wrap instead of overflowing.

## C7. Accessibility checks (legacy)

- **Keyboard only:** Tab through header → sidebar → map controls. Every control must be reachable and operable (Enter/Space), with focus always visible and not hidden behind floating UI. Check Esc where implemented.
- **Accessible names:** icon-only buttons (☰, ✕, ▶) and map markers.
- **Contrast:** text ≥ 4.5:1; control boundaries/focus ≥ 3:1 (DESIGN.md › C7, C12).
- **Target size** ≥ 24 × 24 px (measure with `getBoundingClientRect`).
- **Reduced motion:** with `prefers-reduced-motion: reduce` (DevTools › Rendering), the looping animations stop.
- **200 % zoom:** no lost content in the sidebar/forms.
- **Non-colour cues** remain (✓ on severity rows, labels on categories).
- **Optional:** Lighthouse/axe in DevTools for a quick scan. Record the findings; don't treat a score as a pass.

## C8. Browser checks (legacy)

- Latest Chrome (primary). Add Firefox and Safari/iOS Safari when touching layout, canvas, `color-mix()`, `dvh` units, or `crypto.randomUUID` (secure context required; `localhost` and HTTPS are fine).
- Private window: voting works with a fresh voter id. If `localStorage` throws, the app falls back to an in-memory id.
- Throttled network ("Fast 4G"): the first map load fetches ~1.2 MB of data for the default year; selecting 2021–2025 loads ~6.6 MB in total.

---

# CHECKLISTS (all areas)

## Pre-PR checklist

- [ ] Read AGENTS.md and the docs for the affected area(s); scope matches the request; area(s) named in the PR.
- [ ] Root: `npm run lint` and `npm run build` pass (if root code/config changed, or always once `mobile/` isolation matters).
- [ ] Mobile: B1 checks pass; B5 device checks for UI changes (device + Android version listed).
- [ ] BFF: B2 contract checks; B3 scenarios for recommendation/explanation changes; B4 for new providers.
- [ ] Legacy web: C1–C3 as relevant; 1440/1024/390 for UI.
- [ ] `git status` shows only intended files: no `.env*`, `.data/`, `.cache/`, `.next/`, `mobile/node_modules`, `mobile/.expo`; generated data changed only if intended.
- [ ] `git diff` reviewed line by line; Lithuanian diacritics intact.
- [ ] Docs updated if a documented fact changed (AGENTS.md › POST-TASK WORKFLOW).
- [ ] The PR description lists what was verified and what wasn't.

## Pre-merge checklist

- [ ] The Vercel Preview builds and opens; `/api/mobility/plan` responds on the Preview.
- [ ] Legacy: map smoke test C2 on the Preview URL if legacy code changed.
- [ ] If report storage changed: confirm the Preview's `DATABASE_URL` points where the team expects before submitting anything.
- [ ] Mobile changes were seen on a real phone by the reviewer or the author.
- [ ] No unresolved review comments.

## Pre-demo checklist (legacy web, if it is shown)

- [ ] The production URL loads on venue Wi-Fi and on mobile data; first map render < ~5 s.
- [ ] `/api/blackspots` and `/api/geocode` respond; have a fallback narrative if IRD is down.
- [ ] The demo database contents were decided (no test junk, no personal data in notes).
- [ ] Browser zoom 100 %, dark basemap, DevTools closed.
