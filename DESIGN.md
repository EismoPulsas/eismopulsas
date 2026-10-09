# DESIGN.md — design constitution

Three parts:

- **Part A — Shared principles.** These apply to every surface in this repository, mobile and legacy web.
- **Part B — Mobile design (PRIMARY).** The Android-first mobility decision app. The first implementation (v0.1-alpha) exists; B0 records what is built and where it differs from the target.
- **Part C — Legacy web design (CURRENT, secondary).**
  - C1–C9: the audit of the existing Eismo Pulsas web app, from a browser inspection of the running dev app on 2026-10-09 at 1440, 1024 and 390 px plus a code read.
  - C10–C14: the condensed rules for any fixes to it. Items not built there are marked **FUTURE**.

Product context: [PRODUCT.md](PRODUCT.md). Recommendation logic and the data the UI receives: [ROUTING.md](ROUTING.md). Decision record: [ADR-0001](docs/adr/0001-pivot-to-personalized-multimodal-mobility.md).
References were used for principles only, not for visual style: [WCAG 2.2](https://www.w3.org/TR/WCAG22/), [Material Design 3 accessibility](https://m3.material.io/foundations/accessible-design/overview), [GOV.UK Design System](https://design-system.service.gov.uk/), [Apple HIG](https://developer.apple.com/design/human-interface-guidelines/).

---

# PART A — SHARED PRINCIPLES

## A1. Principles

1. **Meaning before colour.** Every colour maps to one semantic role. If a colour does not encode anything, use neutral ink. Never encode with colour alone; add a glyph, a label, a shape or a position.
2. **Numbers must agree.** Numbers shown together must come from the same data and the same assumptions, or say plainly why they differ.
3. **Honest data.** Show estimates as estimates ("~"). Put denominators, assumptions, freshness and sources next to the number, not at the bottom of the page. Say when data is missing rather than showing 0.
4. **Lithuanian first.** Design for long Lithuanian words and diacritics. Format numbers, currency and dates with `lt-LT`.
5. **Delete before adding.** A new control must replace or demote an existing one in the same area.
6. **Accessible by construction.** WCAG 2.2 AA is the floor, not a polish item.
7. **Calm over clever.** No decoration that does not carry information.

## A2. Lithuanian language

- **Word length.** Words are long ("Savivaldybės", "dviratininkams", "Rekomenduojama", "Subalansuota"). Budget about 30–40 % more width than English. Allow two-line labels. Never truncate a place, category or line name without exposing the full name to the accessibility API.
- **Diacritics** (ą č ę ė į š ų ū ž) need fonts with Latin Extended and a line height ≥ 1.3 so the marks don't clip.
- **Numbers:** use `Intl.NumberFormat("lt-LT")` everywhere, **including decimals**, e.g. `3,40 €`, `16,7 %`, `2,1 kg`. Never `toFixed`, which produces dots. Thousands use a (narrow) no-break space.
- **Currency:** `3,40 €`, with the symbol after the number and a no-break space.
- **Time:**
  - 24-hour clock `07:58`;
  - durations "47 min" (and "1 val. 12 min" for an hour or more);
  - dates in prose "spalio 12 d.", with "Šiandien" / "Rytoj" for nearby days.
- **Grammatical number:** use 1 minutė, 2–9 minutės, 10–20 minučių, 21 minutė, and so on, through one shared plural helper per codebase. It is needed for minutes, trips, transfers and events.
- **Case:** sentence case. No uppercase with letter-spacing for Lithuanian labels longer than one word.
- **Language mixing:** avoid English UI words ("Mix", "LIVE", "Park & Ride" on its own) unless the team deliberately keeps them as brand terms. P+R is written „Statyk ir važiuok“ (P+R).

## A3. Accessibility baseline (WCAG 2.2 AA where practical)

- **Contrast:** text ≥ 4.5:1 (large ≥ 3:1). Control boundaries, focus indicators and meaningful graphics ≥ 3:1 (1.4.11).
- **Every function** is reachable without a pointer: keyboard on web; TalkBack and switch access on Android.
- **Visible focus:** on the web, a 2 px accent outline with a 2 px offset, never `outline: none` without a replacement. On Android, keep the platform focus indication for external keyboards and D-pad.
- **Targets:** ≥ 24 × 24 CSS px on the web (2.5.8); ≥ **48 × 48 dp** on Android (Material guidance) for anything tappable.
- **Text scaling:** 200 % on the web (1.4.4) and 320 px reflow (1.4.10). Android system font scale up to the largest setting without clipped or overlapping text.
- **Motion:** no auto-playing loops longer than 5 s; honour reduced motion (web `prefers-reduced-motion`, Android "Remove animations").
- **Status messages** are announced (web `aria-live="polite"`; React Native `accessibilityLiveRegion` / `AccessibilityInfo.announceForAccessibility`).
- **Errors** describe what happened and how to fix it, next to the cause.

## A4. Motion rules

- **Allowed:** state change (≤ 200 ms fade/slide), spatial change (map camera ≤ 800 ms, instant under reduced motion), feedback.
- **Not allowed:** infinite decorative loops, count-up numbers, glow pulses, parallax.
- Everything respects reduced motion.

## A5. Shared anti-patterns

- Glassmorphism, blur overlays, neon glow, glow shadows, decorative or random gradients.
- Cards for every block, cards inside cards, a bordered rectangle around every group.
- Pills for everything; chips used as single-select radios.
- Emoji as interface icons.
- Hex literals in components; colours without a semantic token.
- Red for anything except errors (and, in the legacy app, deaths).
- Decorative metrics, vanity counters, "dashboard widgets".
- Hover-only or long-press-only information.
- Internal plan numbering ("2.1 ·") or English jargon in user-facing text.
- Numbers that disagree without explanation.

---

# PART B — MOBILE DESIGN (PRIMARY, Android-first)

> **Status (2026-10-10): first implementation CURRENT (v0.1-alpha)** in `mobile/src/`. B0 lists what is built and where it deliberately differs from the target below. Proposed values (tokens, sizes) must still be re-checked **on a real Android device**: the alpha was verified only by type-check, lint, static rendering and data-path tests (TESTING.md › B0). When a pattern changes, update this part in the same PR.

## B0. Implementation status (v0.1-alpha)

| Area | Built | Differs from the target / not yet |
|---|---|---|
| Screens | `index` (Home = trip input + saved trips), `plan` (comparison), `route/[id]` (detail **with the map inline**), `saved`, `profile` | No separate Plan/Results split and no separate Map screen (fewer screens, same flow). No first-launch setup: defaults are shown in the profile line on Home |
| Navigation | `Stack`, no tab bar; header actions "Išsaugotos", "Profilis" | — |
| Recommendation (B6) | Label "Rekomenduojama", 3 dp accent rule, large time, "Išvykite", cost/CO₂, sentence | "Kodėl?" shows assumptions + sources, not yet the Δ table |
| Comparison rows (B5) | Rows with hairlines, leg strip, Kaina / CO₂ (and Laikas for alternatives), one-line summary | Leg strip is **text with mode colour** (no SVG icon set yet); best values are not yet bold |
| Preference | Segmented control on the comparison screen (sends a new request) + radio list in Profile | No bottom sheet |
| Map (B8) | `react-native-maps`: legs coloured by mode, walking dotted, A / P / B markers, fit to route | No bottom sheet; the leg list sits below the map. Web shows a placeholder |
| States (B11) | Loading (text + static skeleton), error with retry, all-late heading, unavailable strategies, demo-data note | Offline cached result: only the last-recommendation summary on saved trips |
| Saved trips (B10) | Save from the comparison screen (default name „Darbas“), one-tap open, delete with undo | Rename / edit time not yet |
| Profile (B9) | Car, fuel, consumption, PT pass, walking limit, priority; saved immediately | No "Išsaugota" toast; no fuel-price field (the contract supports `fuelPriceEur`) |
| Tokens (B12–B14) | `mobile/src/ui/tokens.ts`: B13 colours (light/dark), spacing, radius, type scale in sp, 48 dp targets | — |
| Typography | **System font** (Roboto), no custom font (decision 2026-10-10) | — |
| Accessibility (B17) | Roles and Lithuanian labels on controls; rows announced as one sentence; live regions for loading/errors | Not yet tested with TalkBack or the largest font scale |

## B1. Personality

Premium, calm, extremely clear. It should feel like a well-made Lithuanian public utility with good taste, not like a startup dashboard or an AI demo. One strong answer per screen, typography doing the work, colour used sparingly and meaningfully. **Decision-first, not map-first.**

## B2. Information architecture

```
Pradžia (Home)
├─ Išsaugotos kelionės ("Darbas", …) ─▶ Rezultatai (for that trip, today)
├─ "Kur vykstate?" ─▶ Kelionės planavimas (Plan) ─▶ Rezultatai (Results)
│                                                   ├─ Kodėl? (explanation breakdown, inline expand)
│                                                   └─ Variantas (Option detail) ─▶ Žemėlapis (Map)
│                                                                               └─ Išsaugoti kelionę
└─ Profilis (Profile)  [header action]
First launch: Profilio sąranka (3 short questions, skippable) ─▶ Pradžia
```

| Level | Screen | Question it answers |
|---|---|---|
| 1 | Pradžia | "What do I usually need, and where am I going now?" |
| 2 | Kelionės planavimas | "From where, to where, arriving by when?" |
| 3 | **Rezultatai** (the product's core) | "Which way should I go, and why?" |
| 4 | Variantas | "What exactly do I do, and when do I leave?" |
| 5 | Žemėlapis | "Where is it?" (supporting context) |
| — | Profilis | "What can I use, and what matters to me?" |

## B3. Primary flow

1. **Kur?** Origin and destination: search fields, plus saved places.
2. **Atvykti iki.** Time (default: next full quarter-hour plus one hour, or the saved trip's time) and day (Šiandien / Rytoj / a date).
3. **Palyginti** (single primary button).
4. **Results:** the recommended option and its one-sentence reason first; the alternatives below as aligned rows.
5. Optional: open an option → legs and departure time → map.
6. Optional: "Išsaugoti kaip…" → name ("Darbas").

The happy path for a saved trip: Home → tap "Darbas" → Results. That is **one tap**.

## B4. Screens

### Pradžia (Home)

- **Header:** product name (text, no animated logo); profile action (icon button with an accessible label "Profilis").
- **Primary:** a large "Kur vykstate?" field-like button that opens Plan.
- **Saved trips:** a list (not cards).
  - Each row: name ("Darbas"), "Namai → Universiteto g. 3", "atvykti iki 08:45".
  - If a cached result exists: "Paskutinė rekomendacija: Statyk ir važiuok · 47 min" and its time.
- **Empty state** (no saved trips): one sentence explaining saving ("Išsaugokite dažną kelionę, pvz., į darbą – rekomendaciją matysite vienu paspaudimu."). No illustration needed.
- No map on Home.

### Kelionės planavimas (Plan)

- Two stacked fields, **Iš** and **Į**, with a swap button between them (accessible label "Sukeisti vietas").
- **Search is submit-based:** the user types and presses search (keyboard action or button) to see a result list. Nominatim's usage policy forbids autocomplete on the public server (DATA.md › A2).
- Results show a short first line (street + number) and a muted second line (district/town).
- **Quick picks** above the results: saved places, and "Mano vieta" (P1, needs location permission).
- **Atvykti iki:** native Android time picker; day selector Šiandien / Rytoj / Kita data.
- **Optional "Kiek laiko būsite?"** for the parking cost, with a stated default. Whether it is visible in v0.1 is an open question (B21).
- **Primary button "Palyginti"** pinned at the bottom (above the keyboard), disabled until both places are set. A disabled button must still meet text contrast, or show the reason as helper text.

### Rezultatai (Results), the core screen

Top to bottom:
1. **Context line:** "Į Universiteto g. 3 · atvykti iki 08:45 · Šiandien". Tap to edit.
2. **Preference selector:** "Svarbiausia: Subalansuota ▾". It opens a small sheet with Greičiausia / Pigiausia / Žaliausia / Subalansuota. It defaults to the profile and re-ranks without a new network request where possible.
3. **Recommendation block** (B6).
4. **Alternatives:** comparison rows (B5).
5. **Unavailable strategies:** one muted line each, with the reason (e.g. "Statyk ir važiuok – pakeliui P+R aikštelių nerasta").
6. **Data note:** one line, e.g. "Tvarkaraštis: JUDU (atnaujinta spalio 9 d.). Kaina ir CO₂ – apytiksliai." It is tappable for sources.
7. **Action:** "Išsaugoti kelionę" (secondary) if the trip is not saved.

### Variantas (Option detail)

- **Summary:** total time, "Išvykite 07:58", "Atvyksite 08:41", cost, CO₂.
- **Leg timeline** (vertical): each leg shows a mode glyph, an instruction, a time and a duration.
  - "07:58 Važiuokite automobiliu iki P+R „…“ · 14 min"
  - "08:12 Palikite automobilį · ~3 min"
  - "08:15 Autobusas **3G** link „…“ · 6 stotelės · 18 min"
  - "08:35 Eikite pėsčiomis · 6 min"
- Assumptions appear inline where they apply ("įskaitant ~5 min. parkavimui").
- **Actions:** "Rodyti žemėlapyje" (secondary). P1: "Pradėti" stores the parked car (ROUTING.md § 10).

### Žemėlapis (Map)

See B8.

### Profilis (Profile)

See B9. On first launch the same questions appear as a short setup: three screens at most, every one skippable. Defaults are stated ("Jei praleisite, laikysime, kad automobilio neturite").

## B5. Route comparison UI

- **Rows, not cards.** Each option is one row separated by hairlines. The whole row is the tap target (≥ 48 dp tall; usually ~72–88 dp).
- **Row anatomy:**
  - Left: the option name in plain Lithuanian ("Automobiliu", "Viešuoju transportu", "Automobiliu + P+R + autobusu"), and under it a **leg strip**: mode glyphs with line badges (e.g. car glyph → P → **3G** → walk glyph). The glyphs come from one SVG icon set, not emoji.
  - Right: three **aligned numeric columns** — time, cost, CO₂ — using `tabular-nums`, right-aligned, with the same order and units in every row.
- **Headers:** the columns get a small header once ("Laikas · Kaina · CO₂"), not repeated units in every cell.
- **Best values:** the best value in each column is shown in **semibold**, without colour. The recommendation is marked by position (first) and a label, not by colour alone.
- **Line badges** use the GTFS `route_color` / `route_text_color` only if the pair meets 4.5:1; otherwise use a neutral badge.
- **Maximum options:** 3 in P0 (car, transit, P+R) + "Kiti variantai" for any extras. Dominated options (ROUTING.md § 5) are collapsed.
- **Late options:** show "vėluosite 6 min" in the time column in the error/warning colour **with** the text. Never colour alone.
- **Large font scale:** the numeric columns wrap below the name instead of truncating.

## B6. Recommendation and explanation UI

- **Placement:** the recommendation is the first thing under the context line.
- **Contents, in order:**
  1. a label "Rekomenduojama" (text, not a badge pill);
  2. the option name;
  3. the leg strip;
  4. a **large total time** (numeric emphasis) with "Išvykite 07:58";
  5. cost and CO₂ in the same line style as the alternatives.
- **The sentence** (ROUTING.md § 7) sits directly under the numbers in body size: "Tik 5 min. lėčiau nei automobiliu, 3,40 € pigiau ir ~56 % mažiau CO₂. Nereikės parkuotis centre." It holds at most 3 facts.
- **Visual separation:** a 3 dp accent rule on the left edge **plus** the "Rekomenduojama" label. No filled card, no glow, no badge.
- **"Kodėl?"** expands inline into a small table: rows "Palyginti su automobiliu" / "Palyginti su viešuoju transportu", columns Δ time, Δ cost, Δ CO₂. Below it come the assumptions in use (stay duration, fuel price, missing parking data) and the sources.
- **No score** is ever shown ("87/100" is forbidden).
- **No recommendation** if all options are infeasible: say "Laiku atvykti nepavyks" and show the least-late option first.

## B7. Mobile navigation

- **Stack navigation** (Expo Router) with Home as root. **No bottom tab bar in v0.1**: two top-level destinations (Home and Profile) do not justify one. Revisit if a third appears.
- The Android system back (gesture/button) always goes one level up. Editing the trip from Results returns to Plan with its fields filled.
- **Screen titles** are short Lithuanian nouns. The header shows a back arrow with an accessible label "Atgal".
- **Deep state:** a saved trip opens Results directly. Route params carry ids, not whole objects.
- **No modals** except the preference sheet and system pickers.

## B8. Role of the map

- The map is **supporting context**, opened from Option detail ("Rodyti žemėlapyje"). It is never the home screen and never required to understand the answer.
- **Map content:**
  - the selected option's legs, each with mode colour **and** line style: car solid, transit solid with line badges at boarding, walking dotted;
  - markers for origin (A), destination (B), P+R (P) and boarding/alighting stops;
  - nothing else in P0: no accident layer, no traffic layer.
- **Camera:** fitted to the route with padding for the sheet; no auto-rotation.
- **Bottom sheet:** a compact leg list (the same content as Option detail) in a collapsed and an expanded state. A close button exists as well as dragging (WCAG 2.5.7).
- **Map style:** a quiet basemap. Use a muted/low-saturation style if the provider allows it, so route colours dominate.
- **Accessibility:** the map is not the only way to get any information. Everything on it is also in the leg list.
- **Platform note:** `react-native-maps` uses Google Maps on Android, so its attribution and logo must stay visible (STRUCTURE.md › B6).

## B9. Profile and preferences

| Field | Control | Notes |
|---|---|---|
| Ar turite automobilį? | yes/no switch | If no, the car fields are hidden and car strategies are not generated |
| Kuro tipas | radio list: Benzinas, Dyzelinas, Dujos (LPG), Hibridas, Elektra | Electric switches the unit to kWh/100 km |
| Sąnaudos | numeric input with unit "l/100 km" or "kWh/100 km" | sane range hints; lt-LT decimal comma accepted |
| Kiek daugiausia norite eiti pėsčiomis? | segmented 5 / 10 / 15 / 20+ min | |
| Kas svarbiausia? | radio list with one-line descriptions: Greičiausia, Pigiausia, Žaliausia, Subalansuota | The default if skipped: Subalansuota |
| Turiu periodinį viešojo transporto bilietą | switch | Decided: in v0.1 (marginal fare 0 €) |
| Kuro kaina (optional, not yet in the UI) | numeric input €/l or €/kWh | If empty, a labelled default is used and shown as an assumption |
| Dviratis (P1) | — | Not asked in v0.1, since no bike options exist yet; the profile screen says so |

- Changes save immediately and are confirmed by a short status message ("Išsaugota").
- Profile data is stored only on the phone. Say so in one line on the screen.

## B10. Recurring commute presentation

- A **saved trip** is a named row on Home ("Darbas"), with the endpoints, the arrive-by time and the last recommendation.
- Opening it runs a fresh comparison for **today** (or the next weekday if it is past the time). Results show "Šiandien, atvykti iki 08:45".
- **Editing:** rename, change the time, delete. Deleting asks for confirmation through an undo snackbar, not a dialog.
- **P1:**
  - recommended departure ("Išvykite iki 07:58");
  - a savings projection ("Renkantis P+R 3 d. per savaitę – ~40 € per mėnesį mažiau"), always labelled as an estimate with its assumptions;
  - "Grįžti prie automobilio" when a parked car is stored.

## B11. States

| State | Treatment |
|---|---|
| **Loading results** | Skeleton rows the same height as the final rows, plus the text "Lyginame variantus…". Nothing shifts when results arrive. The context line stays visible. Cancelling is possible (back). |
| **Partial results** | Show the available options; a muted line per missing strategy with its reason. The recommendation uses only available options and says so in "Kodėl?". |
| **No feasible option / all late** | Clear heading "Laiku atvykti nepavyks", the least-late option first, a suggestion ("Pabandykite vėlesnį atvykimo laiką"). |
| **Network error** | Inline message where the results would be: "Nepavyko gauti maršrutų. Patikrinkite interneto ryšį." + primary "Bandyti dar kartą". For a saved trip, also show the cached result with its time: "Rodomas paskutinis rezultatas (šiandien 07:42)". |
| **Provider/real-time failure** | Results still shown from static data. The data note says "Tikralaikiai duomenys nepasiekiami – rodoma pagal tvarkaraštį." No blocking error. |
| **Fixture/demo data** | A persistent, neutral line "Demonstraciniai duomenys" at the top of Results. Never hidden. |
| **Address not found** | "Adreso nerasta. Patikrinkite rašybą arba nurodykite miestą." Keep the typed text. |
| **Out of service area** | "Kol kas palyginame tik keliones Vilniuje." |
| **Empty Home** | See B4. |
| **Stale cached result** | Always show its timestamp. Older than today → "Paskutinį kartą skaičiuota …" in muted text. |

## B12. Typography (Android)

- **Font:** the **system font** (Roboto on Android). Decided 2026-10-10: native, loads nothing, full Latin Extended. A custom font (e.g. Inter for brand continuity) is a later option. Tabular figures come from `fontVariant: ["tabular-nums"]`. Space Grotesk is **not** used in the app.
- **Sizes** are in sp so they scale with the system font setting. Never disable `allowFontScaling`.

| Role | Size / line height | Weight | Use |
|---|---|---|---|
| Screen title | 24/30 | 600 | Header title on Home, Results |
| Numeric emphasis | 32/38, `tabular-nums` | 600 | the recommended option's total time |
| Section title | 17/22 | 600 | "Kiti variantai", profile groups |
| Body | 16/24 | 400 | explanation sentence, instructions |
| Row title | 16/22 | 500 | option name, saved trip name |
| Numeric cell | 16/22, `tabular-nums` | 400, best value 600 | comparison columns |
| Label | 14/20 | 500 | buttons, field labels |
| Meta | 13/18 | 400, muted | data note, timestamps, second lines |

- The minimum size for information is 13 sp. No uppercase tracked labels.

## B13. Colour (semantic tokens; proposed, contrast-checked 2026-10-10)

Light and dark themes follow the system setting. Tokens live in `mobile/src/ui/tokens.ts` (CURRENT). **No hex literals in components.** Contrast ratios were computed with the WCAG formula.

| Role | Token | Light | Dark | Checked contrast (on `bg` / on `surface`) |
|---|---|---|---|---|
| Background | `bg` | `#F6F6F3` | `#0E1014` | — |
| Surface (sheets, header) | `surface` | `#FFFFFF` | `#171A21` | — |
| Primary text | `ink` | `#15171C` | `#EDEFF3` | L 16.6 / 17.9 · D 16.5 / 15.1 |
| Secondary text | `ink2` | `#3B404B` | `#C6CBD4` | L 9.6 / 10.4 · D 11.7 / 10.7 |
| Muted text (meta only) | `muted` | `#5C6370` | `#9AA1AD` | L 5.6 / 6.1 · D 7.3 / 6.7 |
| Hairline (decorative only) | `line` | `#E2E3E6` | `#2A2F3A` | 1.2–1.4 (**not** for control boundaries) |
| Control boundary | `control` | `#858B97` | `#6E7583` | L 3.2 / 3.4 · D 4.1 / 3.8 |
| Accent: primary action, focus, recommendation rule | `accent` | `#0A6B5D` | `#45D3BC` | L 5.9 / 6.4 · D 10.2 / 9.4. Text on accent fill: light `#FFFFFF` 6.4; dark uses `bg` ink 10.2 (white fails at 1.9) |
| Transit mode | `mode.transit` | `#1D5FC2` | `#6EA2F2` | L 5.6 / 6.1 · D 7.4 / 6.7 |
| Car mode | `mode.car` | `#4A505C` | `#A9AFBA` | L 7.5 / 8.1 · D 8.6 / 7.9 |
| Bike mode (P1) | `mode.bike` | `#2F7A34` | `#6CC070` | L 4.9 / 5.3 · D 8.5 / 7.8 |
| Walk mode | `mode.walk` | `#6A707C` | `#9AA1AD` | L 4.6 / 5.0 · D 7.3 / 6.7 (always dotted, not colour alone) |
| Warning (late, assumption) | `warning` | `#8A5A00` | `#E8B34A` | L 5.5 / 5.9 · D 10.0 / 9.1 |
| Error | `error` | `#B3261E` | `#FF8A80` | L 6.0 / 6.5 · D 8.3 / 7.6 |

Rules:
- The accent marks **interaction and the recommendation only**. It is not a decorative brand colour.
- Mode colours appear only on mode glyphs, route lines and line badges, always with a glyph or label.
- No green-means-good / red-means-bad colouring of metric values. Differences are stated in words and signs (−3,40 €).
- **Map lines** must be re-checked against the actual basemap tiles; target ≥ 3:1.

## B14. Spacing, surfaces, shape

- **Spacing** uses a 4 dp base: 4, 8, 12, 16, 24, 32. Screen side padding is 16 dp; 24 dp between groups.
- **Surfaces:** default to *no container*. Group with spacing and section titles; separate rows with hairlines. Use sheets for the preference picker and the map leg list only.
- **Radius:** 8 dp for inputs and buttons, 16 dp for sheet top corners, full radius only for line badges and the map's A/B markers.
- **Elevation:** one level for sheets and the pinned bottom button area. No shadows on rows.
- The icon set is one SVG family (outline, 24 dp grid, `currentColor`), with mode glyphs designed as a set.

## B15. Components (one implementation each, in `mobile/src/ui/`)

| Component | Rule |
|---|---|
| Primary button | Accent fill, ≥ 48 dp tall, full width at the bottom of the input flows. One per screen. |
| Secondary button | `control` outline, ink text. |
| Text button | For "Kodėl?", "Redaguoti", "Atgal". |
| Search field | Label above, submit action, clear button with an accessible label "Išvalyti". |
| Result list row | Two lines; whole row tappable; ≥ 48 dp. |
| Comparison row | B5 anatomy; one component used for the recommendation and the alternatives (the recommendation variant adds the label + rule + sentence). |
| Leg strip | Mode glyphs + line badges, wraps on large font scale, has an accessible summary ("Automobilis, tada autobusas 3G, tada pėsčiomis"). |
| Leg timeline | Vertical; time column `tabular-nums`. |
| Segmented control | 2–4 short options only (walking minutes). Otherwise a radio list. |
| Switch | Binary settings only; the label is the accessible name. |
| Bottom sheet | Drag handle + close button; collapsed and expanded states. |
| Inline message | Info / warning / error with an icon **and** text; an optional action. |
| Snackbar | Undo for deletions, "Išsaugota" confirmations; announced to TalkBack. |

## B16. Motion (mobile)

- Native stack transitions (platform default).
- The "Kodėl?" expand runs ≤ 200 ms.
- Map camera fit ≤ 800 ms, and instant with "Remove animations".
- No skeleton shimmer loops longer than the loading itself; prefer static skeletons.

## B17. Accessibility (Android specifics, on top of A3)

- **Every tappable element** has an `accessibilityRole` and a Lithuanian `accessibilityLabel`. Icon-only buttons always do.
- **Comparison rows are announced as one sentence:** "Rekomenduojama. Automobiliu ir autobusu per P+R. 47 minutės, 2,40 euro, apie 2,1 kilogramo CO₂. Išvykite 07:58." Numbers are read in words where the screen reader would mangle symbols ("€", "~", "CO₂").
- **Reading order** matches the visual order: context → recommendation → sentence → alternatives.
- **TalkBack and font scale:** test with TalkBack on and at the largest font scale (TESTING.md › Part B).
- **Targets** are ≥ 48 × 48 dp, including the swap, clear and back buttons.
- **The map** is never the only source of information (B8).
- **Colour contrast** follows B13; don't rely on mode colour alone.
- **Time pickers** use the native picker (accessible), not a custom wheel.

## B18. Lithuanian copy for core concepts (proposed)

| Concept | UI copy |
|---|---|
| Recommended | Rekomenduojama |
| Why? | Kodėl? |
| Arrive by | Atvykti iki |
| Leave at | Išvykite |
| Compare | Palyginti |
| Save trip | Išsaugoti kelionę |
| Car | Automobiliu |
| Public transport | Viešuoju transportu |
| Park & Ride | Statyk ir važiuok (P+R) |
| Walking | Pėsčiomis |
| Bicycle | Dviračiu |
| Fastest / Cheapest / Greener / Balanced | Greičiausia / Pigiausia / Žaliausia / Subalansuota |
| Estimate marker | apie / ~ |
| Static timetable | pagal tvarkaraštį |
| Live | tikralaikiai duomenys |

## B19. Mobile anti-patterns (in addition to A5)

- **Map-first home screen**, or a map that must be read to understand the recommendation.
- **Scores, stars, gauges** or "eco points" in v0.1.
- A **card per option** with shadows; coloured option backgrounds.
- **Tab bars with one or two tabs**; hamburger menus.
- **Autocomplete against public Nominatim.**
- **Toasts for errors** that need action (use inline messages).
- **Hidden assumptions:** a cost or CO₂ figure without "~" when it is an estimate.
- **Spinners without text**, and full-screen loaders that hide the trip context.
- **Mixing live and fixture data**, or hiding the "Demonstraciniai duomenys" label.
- **Custom gesture-only controls** without a button alternative.

## B20. Mobile design review checklist

- [ ] Checked on a real Android phone **and** a small emulator (≈ 360 × 640 dp) and a large one (≈ 412 × 915 dp), in light and dark.
- [ ] Largest system font scale: nothing clipped, numbers wrap rather than truncate.
- [ ] TalkBack: every control named; rows read as one meaningful sentence; order correct.
- [ ] Targets ≥ 48 dp; contrast per B13; no colour-only meaning.
- [ ] Lithuanian: diacritics, plural forms, lt-LT decimals and currency, longest labels.
- [ ] Loading, partial, error, offline, all-late and fixture states designed and reachable.
- [ ] The recommendation sentence matches the numbers shown (principle A1.2).
- [ ] No anti-pattern from A5 or B19.
- [ ] DESIGN.md updated if a durable pattern changed.

## B21. Open design questions (need a human decision)

Resolved on 2026-10-10:
- font → system font;
- parking stay → optional on Home, default 2 h stated in the result;
- preference → on the comparison screen (per search) and in Profile (default).

1. **Light-first or dark-first** visual identity for screenshots and the demo? (Both themes are supported either way.)
2. Final product name and wordmark ("Eismo Pulsas" is the working name, PRODUCT.md).
3. Icon set for the leg strip (an SVG family, B14) — today it is text.

---

# PART C — LEGACY WEB DESIGN (Eismo Pulsas web, CURRENT, secondary)

> The legacy web app is maintained for fixes only (AGENTS.md). Part C keeps the verified audit (C1–C9) and the rules for any legacy UI fix (C10–C14). Do not start a legacy redesign without a team decision.

Audit method and its limits:
- The Chrome window could not be resized below the screen width, so the 1440, 1024 and 390 px widths were rendered in a same-origin `<iframe>` of that width. Media queries respond to the iframe width. The mobile check therefore covers layout only, not real touch input, the on-screen keyboard or OS zoom.
- No screen reader was used. The accessibility notes come from the DOM, computed styles and contrast math.
- The report form was filled in but **not submitted**, so no test data was written. The submit, merge and vote paths were checked in code and with API calls that only exercise validation errors.

## C1. Overall impression

The product already has a strong functional foundation:
- a dark, quiet basemap;
- a clear official vs. community concept, exposed in the header;
- fast client-side filtering of about 108 000 points;
- detail statistics for any place;
- a real reporting flow;
- a statistics page with genuinely interesting content.

The problems come from **structure, not effort**. Almost every capability is exposed permanently and with similar visual weight. Several accents (turquoise, red, magenta, emoji, glow) compete with each other. On mobile, the desktop layout is compressed rather than redesigned.

## C2. Map page (`/`) at 1440 px

**Layout.** A single-row header (about 45 px), then a static left sidebar (about 368 px, scrolls independently), then the map. Floating on the map:
- the zoom control, top right;
- the basemap toggle and the main CTA, bottom right;
- the timeline card, bottom centre.

**Header.**
- The animated ECG logo loops forever (2.4 s).
- The `Oficialūs / Vartotojų / Mix` switch is a pill segmented control; the selected item is filled with solid accent turquoise.
- The navigation sits on the right.
- The source switch is the most visually prominent control in the UI. That fits its importance, but turquoise is also used for the CTA, the timeline play button, chips, toggles, chart bars, links and kickers, so "selected" and "primary action" share one colour.

**Sidebar, idle state, top to bottom.** All sections are always visible.

| Group | Contents | Classification | Notes |
|---|---|---|---|
| Address search | text field + ⌕ glyph | PRIMARY | Results show the full Nominatim label (3–4 lines each). The native ✕ clear button and the ⌕ glyph appear side by side. |
| Savivaldybė | native `<select>` with 60 options | PRIMARY | Flies the map to the municipality. In points view the selected municipality is not outlined. |
| Kas nukentėjo / dalyvavo | 7 emoji pill chips | SECONDARY | Single-select, but styled like multi-select chips. Emoji render differently per OS. |
| Laikotarpis | two year `<select>`s + 12 month toggles + helper line | SECONDARY / ADVANCED | The 12 month toggles take more space than any other filter, yet they are an advanced refinement. |
| Sunkumas | 3 toggle rows with live counts, ✓ marks and a "rodoma N" count | PRIMARY (doubles as legend) | Good: counts, a colour dot, a check mark and an opacity change, so it does not rely on colour alone. The fatal dot pulses forever. |
| Vaizdas | Taškai / Šiluma / Savivaldybės segmented control | SECONDARY | Choosing Savivaldybės reveals a second segmented control and a legend. |
| Layer toggles | "Pavojingiausios vietos (TOP 10)"; "Policijos „juodosios dėmės" LIVE" | SECONDARY | The pink "LIVE" badge suggests real-time data, but the designations date from 2018 onwards. |
| Pavojingiausios vietos list | ranked list, count pill, ✝ deaths | CONTEXTUAL | Below the fold at 880 px height. Street names have no town, so "Klaipėdos" appears three times nationally. |
| Vartotojų pranešimai legend | 7 categories with counts (Mix/Users only) | CONTEXTUAL | Doubles as the empty state. |

**Map content.**
- The default view is centred on Lithuania at zoom 7, but Lithuania fills only about 40 % of the map width at 1440, and at 390 px the west of the country is cut off.
- With the defaults (2025, fatal + injury) there are 2 789 dots that overlap into a solid yellow mass at zoom 7. Nothing is clustered.
- Hotspot badges overlap in cities. The format "1 6" (rank, count) has to be learned.
- Black spots (magenta), fatal dots (red) and hotspot rings (red glow) form three red-family marker types without an on-map legend.
- Clicking a dot does **not** recentre the map. Clicking a hotspot on the map does not fly to it, while clicking it in the list does.

**Detail state.**
- The sidebar content is **replaced** (filters disappear; "← Atgal į filtrus" returns).
- A hotspot detail runs to about 1 300 px of scrolling.
- **Count mismatch:** the hotspot badge said "4 įv." while its 120 m block said "15 įvykiai". The panel counts all severities and the map does not. This is footnoted at the bottom.
- "mirtingumas 100.0%" appears for 1 death and 0 injuries, with no small-sample warning.

**View modes.**
- Heat uses a purple → red → orange → cream gradient.
- The choropleth uses 5 quantile classes (maroon → pink) at fill opacity 0.78, which hides labels.
  - Its legend is only in the sidebar.
  - Breaks are written with a decimal dot.
  - It ignores the timeline.
- Three different sequential palettes are in use.

**Timeline.** A floating blurred card with play and a histogram scrubber. While playing, it shows "266 įvykiai šį mėnesį" while the sidebar says "rodoma 755", so two numbers are shown at once.

**Reporting flow.**
- The CTA pulses forever.
- Report mode shows a banner, a crosshair and a 3-step form.
- Two address searches are visible at once.
- After a map click the location shows raw coordinates, and the banner keeps asking the user to click.
- Messages are well written but appear only below the button.
- The timeline stays visible during reporting.

**Users mode empty state.** It is clear: a dashed box with "Dar niekas nepažymėjo pavojingų vietų…".

**Loading and errors.**
- "Kraunamas eismo pulsas…" with a pulse; "kraunama…" while the year files load.
- Errors appear as small pink text.
- A light-grey flash appears before tiles load at street level.
- No console errors.

## C3. Map page at 1024 px

The sidebar stays static (`lg` = 1024), leaving ~640 px of map. The timeline spans almost the full map width. The CTA and basemap pill sit directly above it, so the floating controls cover the bottom ~170 px of the map.

## C4. Map page at 390 px

- The header wraps into **3 rows, 133 px**.
- **"Apie / API" is hidden** (`hidden sm:block`).
- The bottom overlays take ~190 px. With the header, almost 40 % of an 844 px screen is covered.
- ☰ opens a full-width sidebar overlay with no close button inside and no "show results".
- Selecting an item opens the same overlay and hides the map.
- **Touch targets:** ☰ 31 × 30, source switch items 28 px tall, zoom buttons 30 × 30, layer switches 36 × 20, month bars ~23 × 32. Only the CTA (224 × 44) meets 44 pt.

## C5. Statistics (`/statistika`)

- **Layout:** a centred `max-w-6xl` column with a sticky blurred header and a 48 px Space Grotesk hero. There are stat tiles, then a two-column grid of `rounded-2xl` cards with tiles inside (cards within cards).
- **Kickers** expose plan numbering ("2.1 · Automobilių markės").
- **Content is strong:** makes per 1 000 plates, municipality ranking, top-15 streets, age chart, weekday × hour grid, fatalities by year, sources with caveats.
- **Charts:** single-series turquoise. BMW is highlighted in **fatal red**.
- **Counters:** `Counter` counts up from 0. The server HTML contains **"0"** for every counter (verified with `curl`), and the animation ignores reduced motion.
- **At 390 px the page is 694 px wide** because the card grid has no mobile column template and its `auto` track grows to the widest `whitespace-nowrap` row.

## C6. About / API (`/apie`) and 404

- `/apie` is a readable prose column with an endpoint list. It credits "OpenStreetMap ir CARTO", but the map uses Esri. At 390 px it is 409 px wide.
- The 404 page is the Next.js default (white, English).

## C7. Cross-cutting findings

| Topic | Observation |
|---|---|
| Typography | Inter + Space Grotesk. The 10 and 11 px sizes carry real information. Uppercase tracked micro-headings are used for every sidebar section. |
| Colour tokens | Defined in `globals.css`, but many components hard-code hex values (`#ff2e88`, `#ff8597`, `#22c55e`, `#ffb020`, `cyan-400`, `emerald-*`, `rose-*`, `slate-*`, the report palette in `lib/reports.ts`). |
| Contrast | Text passes (`--muted` on `--panel` 6.2:1; `--ink` 16:1; accent 11.5:1; fatal 5.6:1). **Control boundaries fail** 1.4.11: `--line` vs `--panel` 1.31:1, vs `--bg` 1.39:1; `--chip` vs `--bg` 1.23:1. "Off" severity rows at 45 % opacity. |
| Focus | Browser default thin outline. Inputs use `outline-none` with a 1 px border change. The accessible names of markers are "!" or "1 6". Canvas dots are unreachable by keyboard. |
| Semantics | No `h1`/`h2` on the map page. The two segmented controls are built two ways (`aria-pressed` vs `role=radio`). |
| Motion | The logo ECG, CTA glow and fatal legend dot loop forever (disabled only under reduced motion). Counters count up. |
| Lithuanian | Diacritics are fine. Thousands use `lt-LT`, but decimals use a dot. "Mix" is English. |
| Icons | Emoji serve as the icon set. |
| URL state | No view can be shared or bookmarked. |

## C8. What to retain (legacy)

- The dark cartographic basemap; severity as the primary visual variable (fatal drawn largest and last).
- Severity rows as filter + legend + counter; the Official / Users / Mix concept.
- Click anywhere → street + radius statistics; merge-as-vote reporting with plain Lithuanian copy.
- The histogram-as-scrubber timeline; the editorial statistics content and honest caveats; canvas rendering for points.

## C9. Overloaded, duplicated, misplaced (legacy)

- **Overloaded:** the idle sidebar; the detail panel; the statistics chrome.
- **Duplicated:** two address searches in report mode; two `Segmented` implementations; two headers; "rodoma N" vs the timeline count; two accident-file decoders.
- **Should collapse:** months, view mode + metric, police layers, the report legend.
- **Should move:** the TOP 10 list; the choropleth legend onto the map; mobile detail into a bottom sheet.
- **Remove / reconsider:** looping animations, the "LIVE" wording, plan numbers in kickers, BMW in fatal red, count-ups rendering 0, emoji icons.

## C10. Legacy layout and disclosure rules (for fixes)

- **Desktop ≥ 1280:**
  - a one-row header of 48 px;
  - a left panel 360–400 px with a sticky header/footer;
  - floating controls only in map corners, covering ≤ ~15 % of the map.
- **1024–1279:** a 320 px panel; the timeline docked to the map bottom; the CTA never stacked on the timeline.
- **Mobile < 1024:** a one-row header ≤ 56 px with an overflow menu; a full-screen map; a bottom sheet (peek/half/full) for filters and detail. **FUTURE.**
- **Always visible:** source mode, search, municipality, severity with counts, category, year range, report CTA, TOP list (top 3–5 + "Rodyti visas").
- **One step away:** months, view mode, region metric, black spots, basemap.
- **Opening a detail must not destroy filter context. FUTURE.**

## C11. Legacy map composition and markers

- **Z-order:** basemap → choropleth/heat → accident points → black-spot lines → reports → hotspot labels → selection ring → draft marker → controls → panels.
- **At most 3 marker shapes:** dot (official), drop/pin (community), line/diamond (black spot).
- **Collision-avoid** hotspot labels.
- **Black spots** get one non-red hue with an on-map legend. **FUTURE.**
- **Selected item:** 2 px `--accent` ring + dark halo, no glow.
- **Accidents by severity:**
  - fatal: r 6 `--fatal`, drawn last;
  - injury: r 4.5 `--injury`;
  - damage: r 3 `--damage`.
- **Accessible names** for focusable markers (e.g. "Pavojinga vieta Nr. 1, Tilžės g., 6 įvykiai"). **FUTURE.**

## C12. Legacy colour tokens (`app/globals.css`)

| Role | Token | Value | Rule |
|---|---|---|---|
| Page background | `--bg` | `#0b0d12` | |
| Elevated surface | `--panel` | `#12151d` | |
| Subtle surface | `--chip` | `#1d2230` | |
| Hairline | `--line` | `#262c3b` | decorative only (1.3:1) |
| Control border | `--control-border` | **FUTURE** e.g. `#636d88` (3.5:1 on `--panel`, 3.8:1 on `--bg`, 3.1:1 on `--chip`) | inputs, selects, segmented tracks |
| Text | `--ink` / `--muted` | `#eef1f7` / `#8e97ab` | |
| Accent | `--accent` | `#2ee6c8` | primary action, focus, selection only |
| Fatal / injury / damage | `--fatal` / `--injury` / `--damage` | `#ff4d5e` / `#ffb020` / `#7d8db0` | deaths only / injuries (conflicts with the "official" amber dot; decision pending) / damage |
| Error, success, warning, black spot, official/community source, sequential ramp | — | **FUTURE** tokens (today hex literals) | see C7 |

## C13. Legacy components, data visualisation and responsive rules

- **One implementation each:** segmented control (`role="radiogroup"` + arrow keys), search, header, chart primitives (`components/stats/charts.tsx`).
- **Charts answer a sentence:** a finding title, a denominator line and a source line. Single series in neutral ink with one highlight. Direct labels; no hover-only values. If n < 20, no percentage without "maža imtis". Numbers render server-side with their real value.
- **Statistics on mobile:** a single column with no horizontal overflow (`grid-cols-1` / `min-w-0`).
- **Breakpoints to test:** 1440 / 1024 / 390 (+ 320 reflow).

## C14. Legacy priorities (only if the team decides to invest in the legacy app)

- **P0:**
  - `/statistika` overflow at 390;
  - the mobile map header and bottom-sheet model;
  - detail replacing the filters and the count mismatch;
  - focus visibility and control-boundary contrast;
  - the initial view not fitted to Lithuania;
  - counters rendering 0 in HTML.
- **P1:** semantic tokens and the colour collisions; one segmented control/search/header; typography roles (no 10–11 px info text); SVG icons instead of emoji; lt-LT decimals and a plural helper; an on-map legend.
- **P2:** the statistics editorial layout; report-flow polish; a docked timeline; a Lithuanian 404; the `/apie` basemap credit.
- **P3:** URL state (needs an ADR); a light UI theme; subtle transitions.

Do not implement legacy redesign items as part of mobility work.
