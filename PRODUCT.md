# PRODUCT.md — what we are building and why

> Owns: the product definition — problem, users, use cases, value proposition, product principles, the Version 0.1 definition of done, non-goals and product vocabulary.
> Does **not** own: priorities and task order (PLAN.MD), recommendation algorithm and API contract (ROUTING.md), data sources (DATA.md), UI rules (DESIGN.md).
> Status (2026-10-10): **PARTIAL — v0.1-alpha.** The end-to-end slice exists:
> - the Expo app (`mobile/`) calls `POST /api/mobility/plan`, which compares car, public transport and P+R, recommends one and explains why;
> - **route legs are still synthetic (demo)** until a real routing provider is connected ([ADR-0002](docs/adr/0002-routing-provider-strategy.md));
> - per-item status is in "Version 0.1" below.
>
> The legacy web product is described in STRUCTURE.md › Part A.
> Decision records: [ADR-0001](docs/adr/0001-pivot-to-personalized-multimodal-mobility.md), [ADR-0002](docs/adr/0002-routing-provider-strategy.md). Raw input that informed this file: [docs/context/PRODUCT_PIVOT_CONTEXT.md](docs/context/PRODUCT_PIVOT_CONTEXT.md). **This file is canonical**; the context file is not kept in sync.

## Product status in one table

| Product | Status | Where |
|---|---|---|
| Personalised multimodal mobility decision app for Vilnius (Android-first) | **PRIMARY — v0.1-alpha (demo routing)** | `mobile/` + BFF in `app/api/mobility/*`, `lib/mobility/*` |
| Eismo Pulsas road-safety web app (accident map, statistics, danger reports) | **LEGACY — CURRENT, maintained, not extended** | `app/`, `components/`, `lib/`, `public/data/`, `scripts/` |

"Eismo Pulsas" is the **working name** for the hackathon (decision 2026-10-10). The name appears only in `mobile/app.json` (`name`), the Home header (`mobile/src/app/_layout.tsx`) and the docs, so a later rename is cheap.

## Context: Hack4Vilnius challenge 02 (JUDU)

"Kaip padėti vilniečiams priimti geriausius judumo sprendimus realiu laiku?" The task is to help a resident choose the most suitable way to travel in real time, given their own needs, circumstances and habits, using JUDU and other city data.
- The event runs 2026-10-09 → 2026-10-11.
- Pre-pitch videos are due Sunday at 11:30; the final starts at 14:00.
- A prototype or idea is pitched, followed by jury Q&A; no scoring criteria are published.

Source: https://hack4vilnius.lt/, checked 2026-10-10.

## The problem

People can already ask existing apps *how* to get somewhere. Those answers are mode-by-mode: one tab for driving, one for transit. The user has to compare them alone, and the apps ignore what matters to *this* user: the car they drive and what it burns, how far they are willing to walk, what parking will cost at the destination, whether leaving the car at a Park & Ride and taking public transport would be nearly as fast and much cheaper.

The question we answer is different:

> **"What is the best way for me to make this trip today?"**

## Value proposition

For people in Vilnius who have more than one way to travel, the app compares complete **mobility strategies** for a specific trip (for example car, public transport, or car → P+R → public transport → walk), using **their own** car, preferences and constraints, and **recommends one, explaining why** in a single human sentence.

Example (illustrative numbers, not real data):

| Option | Time | Cost | CO₂ |
|---|---|---|---|
| A — Car | 42 min | €5.80 | 4.8 kg |
| B — Public transport | 58 min | €1.10 | ~0.7 kg |
| **C — Car → P+R → public transport → walk** | **47 min** | **€2.40** | **2.1 kg** |

**Recommended: C.** "Only 5 minutes slower than driving directly, €3.40 cheaper, about 56 % less CO₂, and you avoid parking in the city centre."

The differentiation is **not** multimodal routing. It is that the app makes the trade-off explicit, personal, and explained, and does not hide it behind an opaque score.

### Differentiation from the official JUDU app (verified 2026-10-10)

JUDU's app (https://judu.lt/programele/; announcements of 2026-07-07 and 2026-08-25) already offers:
- public-transport trip planning with real-time information;
- tickets;
- parking payment and the nearest zone;
- saved places;
- bicycle route planning that shows the share of bike infrastructure.

JUDU also publishes P+R sites, parking tariffs and a live occupancy map on its website.

**What none of them do, and what we do:**
1. Compare **different strategies for the same trip**, including car → P+R → public transport.
2. Use **the user's own car**: fuel, consumption, pass, walking limit.
3. Price the whole trip, including **parking at the destination for the stay** and the P+R ticket.
4. Show **CO₂**.
5. **Recommend one option and say why**, in numbers.

We do not compete on "all modes in one app", ticketing or payment. JUDU's planner and data are inputs, not rivals.

**Pitch:** "Google Maps ir JUDU parodo, kaip nuvykti. Mes parodome, kaip *jums* šiandien verta nuvykti."

## Users

- **Primary:** Vilnius residents and commuters who own or can use a car *and* could use public transport. They are the people for whom a strategy choice exists. Typical commuters are office workers, university staff and students, and parents. This includes people **driving in from the Vilnius district**: the origin may be up to 40 km from the centre, and the destination must be in Vilnius. P+R matters most for them.
- **Secondary:** occasional visitors to the city centre (for example an appointment in the Old Town) who are unsure about parking.
- **Later:** people without a car choosing between public transport, walking, cycling and shared mobility (P1/P2).

## Primary use cases

### UC1 — Recurring commute

Home → work or university, arriving by a fixed time (e.g. 08:45).
1. The user enters the origin, destination and "arrive by" time. Their profile supplies the mobility options and preference.
2. The app compares alternatives and recommends one with a reason.
3. The user saves the trip under a name, e.g. **"Darbas"**.
4. Later (beyond v0.1): today's recommendation for the saved trip, a recommended departure time, and weekly, monthly or yearly savings projections ("choosing P+R three days a week saves about €X per month").

### UC2 — Occasional trip

A doctor's appointment in Vilnius Old Town. The questions the app should help with:
- Should I drive all the way?
- What will parking cost?
- Is parking likely to be available? (P1. JUDU publishes live free spaces for its gated lots, including the P+R sites; see DATA.md › A4b.)
- Should I park outside the centre and walk?
- Should I use P+R and public transport?
- Should I take public transport for the whole trip?

When a chosen strategy leaves the car somewhere (P+R, a park-and-walk spot), the app must **remember where the car is** and eventually support the **return trip to the car**. That is P1. The v0.1 data model must not make it hard (see ROUTING.md § 10).

## Product principles

1. **Decision first, map second.** The answer is a recommendation and a comparison. The map is supporting context, opened on demand.
2. **Explain, don't score.** Every recommendation states its reason as concrete differences (minutes, euros, kilograms, parking). A score may exist internally but is never the explanation.
3. **Personal by default.** Results depend on the user's profile (car, fuel, consumption, walking limit, bicycle, preference). Without a profile, ask, or state which assumptions are used.
4. **Honest about data.** Show estimates as estimates ("~0,7 kg"). Show what is static timetable data and what is live. Say when a source is missing ("Parkavimo užimtumo duomenų nėra").
5. **One good answer over many options.** At most a handful of alternatives, with one clearly recommended.
6. **Lithuanian first.** Copy, number formats, place names and the grammar of the explanation are Lithuanian.
7. **Real time is additive.** v0.1 must work on static data. Live data improves the answer and never blocks it.

## Version 0.1 (hackathon MVP) — definition of done

v0.1 corresponds exactly to **P0 in PLAN.MD**. It is done when the following works on a real Android phone. Status as of 2026-10-10:
- **CURRENT** = implemented and checked by the means in TESTING.md, **not yet on a physical phone**;
- **PARTIAL** = partly implemented.

| # | Requirement | Status |
|---|---|---|
| 1 | Minimal profile: car yes/no, fuel type, consumption, **public-transport pass yes/no**, maximum walking time, preference (fastest / cheapest / greener / balanced). Stored on the phone | CURRENT (bicycle moved to P1, since no bike options exist yet) |
| 2 | Origin, destination and "arrive by" (today/tomorrow + time) with Lithuanian address search; optional parking stay ("Kiek laiko būsite?", default 2 h, stated) | CURRENT |
| 3 | **Car**, **public transport** and **car → P+R → public transport** with time, cost and CO₂ | CURRENT. **Legs are demo data**; P+R sites, fares and zone tariffs are official JUDU data |
| 4 | One recommended option, with a sentence built from real metric differences | CURRENT |
| 5 | The selected option on a map with its legs | CURRENT (react-native-maps; geometry is demo until a real provider) |
| 6 | Save a trip under a name ("Darbas") and reopen it with one tap | CURRENT |
| 7 | Data limitations visible: "~" estimates, demo/official/live provenance, missing data shown as unknown, never 0 | CURRENT |
| 8 | Two prepared scenarios, UC1 commute and UC2 Old Town (`lib/mobility/scenarios/`), computed live or clearly labelled | PARTIAL: they run on demo legs with a live zone lookup |
| 9 | A new real-time source is added as a provider/enricher without rewriting the comparison or the UI | CURRENT by design (ROUTING.md § 8); first real provider: OTP (ADR-0002) |

## Non-goals for v0.1

- Turn-by-turn navigation, ticket purchase, payments.
- Accounts, sync between devices, notifications.
- Scooters, trains, intercity trips, trips outside Vilnius.
- ML/prediction, gamification, monetisation.
- Rebuilding or extending the legacy accident dashboard.
- iOS-specific work. Expo keeps iOS possible, but it is not tested.

## Product vocabulary (UI terms are DESIGN.md's to finalise)

| Concept | Meaning | Proposed Lithuanian UI term |
|---|---|---|
| Trip | origin + destination + arrive-by (+ date) | Kelionė |
| Option / strategy | one complete way of making the trip, possibly multimodal | Variantas / Būdas |
| Leg | one segment in one mode (drive, park, ride, walk) | Atkarpa |
| Recommended option | the option chosen for this user's preference | Rekomenduojama |
| Explanation | the human sentence with differences | Kodėl? |
| P+R | Park & Ride car park next to public transport | „Statyk ir važiuok“ (P+R) |
| Profile | the user's mobility options and preference | Profilis |
| Saved trip | named recurring trip | Išsaugota kelionė, e.g. „Darbas“ |
| Arrive by | latest acceptable arrival time | Atvykti iki |

## Decisions taken (2026-10-10, project owner)

| Question | Decision |
|---|---|
| Name | Keep "Eismo Pulsas" as the working hackathon name; no rebranding now |
| Public-transport pass | In the profile (`transitPass`). The marginal fare is 0 €, but the P+R ticket (1,00 €) still applies |
| Balanced preference | A documented tolerance rule with dominance first, no hidden score (ROUTING.md § 6). Weights are in `config.ts` and tunable |
| Parking stay | Optional in the request and on Home; default 2 h, stated in the result |
| Legacy web | Frozen for features; it must keep building and working |

## Open product questions (need a human decision)

1. **Demo format:** an installed APK on a phone (needs a Google Maps key, see README), Expo Go on a phone, a mirrored screen, or a recording. Deadline: Sunday 2026-10-11, pre-pitch at 11:30.
2. **Language:** Lithuanian only in v0.1, or Lithuanian plus English? (The pitch may be in English.)
3. **Licence** of the public repository (none today; required by some data services, see ADR-0002).
4. **What JUDU mentors confirm:**
   - is reuse of the occupancy layer and the stops.lt GTFS-RT files allowed?
   - is there a journey-planner API?
   (DATA.md › A2.)
