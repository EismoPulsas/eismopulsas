# ADR-0001: Pivot to a personalised multimodal mobility decision app (Android-first), keeping the existing repository

Status: Accepted. Amended by [ADR-0003](0003-mobile-project-isolation-and-contract-sharing.md): the contract is shared by a type-only import, not mirrored. The routing provider was decided in [ADR-0002](0002-routing-provider-strategy.md).

Date: 2026-10-10

Deciders: Hack4Vilnius team (Eismo Pulsas), as directed by the project owner. Recorded by a coding agent from the project owner's brief; the stack choice reflects the owner's stated preference.

## Context

- Until 2026-10-10 the repository contained one product: **Eismo Pulsas**, a Lithuanian road-safety web app (Next.js 16, Leaflet map of police accident data 2021–2025, statistics page, user danger reports stored in Neon Postgres). It works, it is documented in STRUCTURE.md / DATA.md / DESIGN.md, and it is deployed through Vercel.
- The team pivoted the hackathon product. The new question is not "where are accidents?" or "how do I get there?" but **"What is the best way for me to make this trip today?"**: compare mobility *strategies* (car, public transport, car → Park & Ride → public transport, later walking/cycling/shared) by time, money, CO₂, reliability and parking, personalised to the user's profile, and explain the recommendation in plain language. See [PRODUCT.md](../../PRODUCT.md).
- Primary platform: **Android phone**. The legacy UI is a desktop-first, map-first web dashboard whose mobile layout already fails basic checks (DESIGN.md › Part C).
- Hackathon constraints: a four-person team, TypeScript/React skills, very limited time, a demo on a real phone, no budget for paid infrastructure beyond free tiers unless agreed.
- Official mobility data exists and is reachable: JUDU / Stops.lt static GTFS and a live vehicle-position CSV (verified 2026-10-10, see DATA.md › Part A). Parking, P+R, fares and CO₂ factors have **no verified machine-readable source yet**.
- The repo's existing server layer (`app/api/*` route handlers on Vercel, a Nominatim proxy with caching, the habit of proxying third-party APIs server-side) is directly useful to a mobile client.

## Decision

1. **Keep the existing repository.** The new product is developed in the same Git repo and the same GitHub/Vercel workflow.
2. **Keep the legacy web application** (map, statistics, about/API, user reports, accident datasets) unchanged and working. It is reclassified as **LEGACY / REUSABLE web, backend and data prototype**: maintained only for fixes, not extended with mobility features, and not used as the mobile UI.
3. **Add the mobile app as a separate application in `mobile/`**, with its own `package.json`, lockfile, tooling and `.gitignore`. Preferred stack: **Expo + React Native + TypeScript + Expo Router + `react-native-maps`**. It is a separate npm project, not an npm workspace, so the root `package.json` and the Next.js build stay untouched.
4. **Use the Next.js app as the backend-for-frontend (BFF)** for the mobile app: new route handlers under `app/api/mobility/*` and server code under `lib/mobility/*` (both **PLANNED**). The mobile app never calls routing, geocoding, GTFS or other third-party services directly when they need keys, caching, rate limiting or data joining; it calls the BFF.
5. **Routing provider is deliberately not chosen in this ADR.** The BFF hides it behind a provider interface ([ROUTING.md](../../ROUTING.md)); the choice (hosted API vs self-hosted OpenTripPlanner vs other) is the subject of a time-boxed spike and **ADR-0002**.
6. **Personal data stays on the device in v0.1**: profile, saved trips ("Darbas"), and (P1) the parked-car location are stored locally in the app. No accounts, no server-side storage of home/work locations in v0.1.

## Why Expo / React Native for this hackathon

- Same language (TypeScript) and component model (React) the team already uses in this repo; types and domain logic concepts transfer.
- Expo Go / development builds give a working app on a team member's Android phone within minutes; EAS (or a local build) produces an installable APK for the demo.
- Expo Router's file-based routing mirrors Next.js App Router conventions the team knows.
- `react-native-maps` is the most widely used React Native map component; the map is a supporting view in this product, so the mature default is enough.

## Alternatives considered

- **Extend the legacy Next.js web app into a responsive/PWA mobility app.** Fastest code reuse and no app build pipeline. Rejected as the primary path: the requirement is an Android application; the existing UI is map-first and would need to be rebuilt anyway; native feel (back gesture, system font scaling, local storage, location permission, map performance) is weaker. Remains a fallback demo path if the mobile build is blocked.
- **Wrap the web app with Capacitor/TWA.** Produces an APK quickly but inherits the dashboard UI and its mobile problems; it is a packaging trick, not a product decision.
- **Native Android (Kotlin/Compose).** Best platform fit, but a new language and toolchain for the team and no reuse of TypeScript domain code. Too slow for a hackathon.
- **Flutter.** Good tooling, but Dart is new to the team and nothing in the repo is reusable.
- **New, separate repository for the mobile app.** Cleaner tooling isolation, but splits documentation, issues and PR review, and loses the shared history and the BFF next to its client. Rejected; isolation is achieved with a separate `mobile/` package instead.
- **npm workspaces / monorepo tooling (Turborepo, shared `packages/`).** Enables shared TypeScript packages, but requires changing the root `package.json` and lockfile, and Metro/Next bundler configuration. Deferred: the API contract is documented in ROUTING.md and mirrored in the mobile app for v0.1; revisit with an ADR if duplication becomes painful.
- **Delete or archive the legacy web app.** Rejected: it works, it is deployed, it holds verified data pipelines (accidents, Nominatim proxy) that may feed P2 safety scoring, and deleting it gains nothing.

## Consequences

Positive:
- One repository, one review workflow; the BFF sits next to existing, proven API patterns.
- Legacy product and data remain available and demonstrable.
- Third-party keys, caching and data joining stay server-side; the mobile app stays thin.
- Personal locations are not stored on a server in v0.1 (simpler privacy story).

Negative / accepted risks:
- **Tooling collisions (must be fixed when `mobile/` is scaffolded):** the root `tsconfig.json` includes `**/*.ts(x)`, so `next build` would type-check `mobile/`; the root ESLint flat config would lint `mobile/`; the root `.gitignore` ignores only `/node_modules` (root-anchored), so `mobile/node_modules` would be committed unless `mobile/.gitignore` covers it; a second lockfile may make Next/Turbopack warn about the workspace root. Each fix touches root configuration and therefore needs explicit approval in that task (see STRUCTURE.md › Part B).
- **Two TypeScript projects without shared code:** the BFF response types are mirrored in `mobile/`; they can drift. Mitigation: ROUTING.md is the contract; change both sides in the same PR.
- **The routing provider is the main technical risk.** Car + public transport + P+R in one comparison requires a routing source for each leg; if the spike fails, v0.1 falls back to a narrower but honest demo (fixed demo trips with clearly labelled cached results).
- **`react-native-maps` on Android uses Google Maps**: an installable build needs a Google Maps API key restricted to the app's package and signing certificate (Expo Go works without one during development). This is a setup step and a possible cost/terms question.
- **Vercel functions are the BFF runtime**: request time limits and per-instance in-memory caches apply (as they already do for `/api/geocode`). A self-hosted routing engine could not run on Vercel and would need separate hosting.
- The team must resist adding P1/P2 features before the P0 vertical slice works (PLAN.MD).

Follow-up work:
- ADR-0002: routing provider(s) for car, public transport and P+R legs (after a spike).
- ADR (when scaffolding): root tooling isolation for `mobile/` (tsconfig/eslint exclusions, gitignore), and the map provider/key handling.
- ADR (if needed): adding a test runner for `lib/mobility` recommendation logic (TESTING.md).
- Docs updated in this task: AGENTS.md, STRUCTURE.md, DATA.md, DESIGN.md, TESTING.md, PLAN.MD, README.md; created PRODUCT.md and ROUTING.md.

## References

- [PRODUCT.md](../../PRODUCT.md), [ROUTING.md](../../ROUTING.md), [STRUCTURE.md](../../STRUCTURE.md), [DATA.md](../../DATA.md), [DESIGN.md](../../DESIGN.md), [TESTING.md](../../TESTING.md), [PLAN.MD](../../PLAN.MD)
- JUDU open data: https://judu.lt/atviri-duomenys/ — GTFS https://www.stops.lt/vilnius/vilnius/gtfs.zip, vehicles https://stops.lt/vilnius/gps_full.txt
- Expo maps guide (Google Maps key for Android builds): https://docs.expo.dev/versions/latest/sdk/map-view/
- Existing BFF-style patterns: `app/api/geocode/route.ts`, `app/api/blackspots/route.ts`
