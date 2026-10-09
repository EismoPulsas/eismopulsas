# AGENTS.md — operating rules for Eismo Pulsas

Applies to every coding agent (Claude, Codex, GPT, Gemini, …) and to humans. `CLAUDE.md` only imports this file.

## PRODUCT STATUS — READ FIRST

The project pivoted on 2026-10-10 ([ADR-0001](docs/adr/0001-pivot-to-personalized-multimodal-mobility.md)).

| | Product | Status | Code |
|---|---|---|---|
| **PRIMARY** | Android-first personalised multimodal mobility decision app for Vilnius: compares car / public transport / car → P+R → public transport by time, cost and CO₂, recommends one, explains why | **v0.1-alpha CURRENT** (2026-10-10). Route legs come from a **demo** provider until OpenTripPlanner lands (ADR-0002). Not yet tested on a physical phone | `mobile/` (Expo SDK 57 + Expo Router, routes in `mobile/src/app/`), BFF in `app/api/mobility/plan` + `lib/mobility/*` |
| **LEGACY** | Eismo Pulsas road-safety web app (Leaflet accident map, `/statistika`, `/apie`, danger reports, public API, accident datasets) | **CURRENT, working, deployed.** Fixes only; do not extend it with mobility features; do not reuse its UI for mobile | `app/` pages, `components/`, `lib/data.ts`, `lib/reports*.ts`, `public/data/`, `scripts/` |

Reusable from legacy: Next.js route handlers as the BFF, `GET /api/geocode` (unchanged, used by the app), server-side proxy/caching patterns, Lithuanian conventions. See STRUCTURE.md › Reuse map.

**Raw context vs canonical docs:**
- `docs/context/` holds the **raw inputs** of the pivot (product brief, JUDU link list). They informed PRODUCT.md and DATA.md and are not kept in sync. When they disagree, the canonical docs and the code win; never edit the context files to match.
- `docs/archive/` describes the **previous** safety product. It is historical only and must never override PRODUCT.md.

## MANDATORY PRE-TASK WORKFLOW

Before analyzing a problem, proposing a solution, or modifying files:

1. Read AGENTS.md completely (including the Next.js block below).
2. Read [STRUCTURE.md](STRUCTURE.md) (Part A legacy, Part B mobile app + BFF).
3. Read [DATA.md](DATA.md) if the task touches datasets, APIs, statistics, persistence, GIS, transformations, mobility sources or constants.
4. Read [DESIGN.md](DESIGN.md) if the task touches UI, UX, CSS, layout, components, responsiveness, interaction or accessibility (Part B for mobile, Part C for legacy web, Part A always).
5. Read [TESTING.md](TESTING.md) to understand required verification.
6. Read task-specific documentation referenced by those files: [PRODUCT.md](PRODUCT.md) for product scope, [ROUTING.md](ROUTING.md) for option generation / recommendation / the mobile API contract, ADRs in [docs/adr/](docs/adr/README.md), and the Next.js guide in `node_modules/next/dist/docs/` for any framework API you use. For Expo/React Native, use the docs of the versions pinned in `mobile/package.json` (Expo SDK 57, React Native 0.86); `https://docs.expo.dev/versions/v57.0.0/` covers SDK 57.
7. **Classify the task by area** and say so in your plan and final report — one or more of:
   - **mobile** (`mobile/`),
   - **backend/BFF** (`app/api/mobility/*`, `lib/mobility/*`, and any shared `app/api/*` change),
   - **legacy web** (map, `/statistika`, `/apie`, reports, `components/`),
   - **shared data** (`public/data/`, `scripts/`, data sources, constants, DB schema),
   - **docs**.
   A task that touches a public API (`/api/*`) or root config (`package.json`, `tsconfig.json`, `eslint.config.mjs`, `next.config.ts`, `.gitignore`) affects **both** the legacy web and the mobile path — check both.
8. Inspect the relevant implementation **and confirm it exists** — the PRIMARY product is an alpha and many items are still PLANNED (e.g. the OTP provider, enrichers); if the files you are asked to change don't exist yet, say so instead of inventing them.
9. Inspect adjacent code and dependencies that may be affected (legacy map features meet in `components/map/Dashboard.tsx`; mobile and BFF meet at the contract in ROUTING.md § 9).
10. Do not rely on assumptions from model memory or previous conversations when repository evidence is available. For non-trivial changes, establish an implementation plan before editing.

**DO NOT START EDITING MERELY BECAUSE THE REQUEST SOUNDS OBVIOUS.**

Doc map — one fact lives in one place:

| File | Owns |
|---|---|
| AGENTS.md | operating rules and product status (this file) |
| PRODUCT.md | product definition: problem, users, use cases, value proposition, v0.1 definition of done, non-goals, product vocabulary, open product questions |
| STRUCTURE.md | how the repository works: legacy architecture (Part A) and mobile/BFF architecture (Part B), routes, APIs, state, env var names, fragile areas |
| ROUTING.md | strategies, metric models, feasibility, recommendation rules, explanation generation, provider abstraction, mobile ↔ BFF API contract, on-device data model |
| DATA.md | data sources and their status (mobility Part A, legacy Part B), schemas, pipelines, constants and their sources, generated files, data quality, privacy |
| DESIGN.md | shared principles (Part A), mobile design and its implementation status (Part B), legacy web audit and rules (Part C), review checklists |
| TESTING.md | how changes are verified (rules, mobile/BFF checks and verification record, legacy checks, checklists) |
| docs/adr/ | why durable architectural decisions were made |
| docs/context/ | raw pivot inputs (not canonical; see above) |
| docs/archive/ | historical description of the legacy product |
| PLAN.MD | hackathon execution plan, P0/P1/P2 (Lithuanian) — intentions, not facts about the code |
| README.md | human-facing introduction, status and setup (Lithuanian) |

Planning documents (PLAN.MD, PRODUCT.md targets, ROUTING.md proposals, DESIGN.md Part B) describe intent. Never claim a feature exists because a document mentions it — verify in code (and, for UI, in the running app or on a device). Label things CURRENT / PARTIAL / PLANNED / PROPOSED / POSSIBLE when writing about them; for data sources use DATA.md's CURRENT / VERIFIED AVAILABLE / RESEARCHED / POSSIBLE / BLOCKED (PARTNER ACCESS NEEDED).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

Project notes on the block above: Next.js here is **16.3.8** with React 19.2 and Turbopack. Route handlers use the Web `Request`/`Response` API and the generated global `RouteContext<"/path">` type for params (see `app/api/reports/[id]/vote/route.ts`). Do not edit between the `nextjs-agent-rules` markers — `next dev` rewrites that block; put project rules outside it.

## IMPLEMENTATION RULES

- **Keep scope narrow.** Do what was asked; note other problems instead of fixing them in passing. No unrelated refactors, renames or formatting sweeps.
- **Primary vs legacy.** New product work goes to `mobile/` and the BFF (`app/api/mobility/*`, `lib/mobility/*`). Do not add mobility features to the legacy dashboard, do not port legacy UI components into the mobile app, and do not delete or "clean up" legacy code as part of mobility work.
- **P0 first.** Do not build P1/P2 items (PLAN.MD) or add architecture for them unless the task says so; keep P0 simple but leave the documented extension points (providers/enrichers, ROUTING.md § 8).
- **Mobile is a separate npm project** (ADR-0003). `mobile/` has its own `package.json`, lockfile, `tsconfig.json` and `eslint.config.js`. Never add mobile dependencies to the root `package.json`, and never make it an npm workspace without an ADR. The root isolation (`tsconfig` exclude, ESLint ignore, `.gitignore`) is in place; do not remove it. Run mobile commands from `mobile/`.
- **Mobile ↔ BFF contract** (ROUTING.md § 9): `lib/mobility/types.ts` is the single source; the app imports it **type-only** through `mobile/src/api/contract.ts` (ADR-0003). Keep `types.ts` **types-only with no imports**. Change ROUTING.md § 9 and `types.ts` in the same PR, and run `npx tsc --noEmit` in `mobile/`. New endpoints go under `/api/mobility/`; existing `/api/*` contracts stay unchanged.
- **No invented data.** Fares, tariffs, emission factors, P+R sites and any availability claim need a cited source recorded in DATA.md › A6/A2; otherwise mark them as assumptions (`status: "assumption"` in `config.ts`) or leave them out. Every number carries its `basis` (`demo` / `estimate` / `official` / `live`), and every response carries `dataMode` and `sources`.
- **Demo data stays honest.** `lib/mobility/providers/demo.ts` is synthetic: keep `basis: "demo"`, never give it real line numbers, never tune it so a chosen option wins, and never let a configured real provider fall back to demo silently.
- **Do not reverse-engineer private APIs.** Use public, documented or JUDU-provided endpoints. Mark everything else BLOCKED / PARTNER ACCESS NEEDED (DATA.md).
- **Personal data** (profile, saved trips, home/work, parked car) stays on the device in v0.1; the BFF must not persist or log it.
- **Preserve the legacy architecture** (static official data + client-side filtering, Postgres only for reports, `Dashboard` as the single map-state owner) unless the task is explicitly to change it — and then write an ADR.
- **Respect contracts:** `/api/*` request/response shapes (documented publicly on `/apie`; `/api/geocode` is also used by the mobile app), the `accidents-YYYY.json` format, the `FLAG` bit values (append-only, mirrored in `scripts/build-data.mjs`), the report merge rule, and the DB schema (`lib/reports-store.ts` and `db/schema.sql` must stay identical).
- **Secrets:** never print, log, commit or paste secret values (e.g. `DATABASE_URL`) into code, docs, PRs or chat. Refer to environment variables by name only. Never commit `.env*`.
- **Generated data:** do not hand-edit `public/data/*`. Regenerate with `npm run data` only when the task requires it, and read DATA.md first (partial runs shrink `stats.json`; the script's root-path computation resolves wrongly on Windows — see STRUCTURE.md › A14).
- **Shared databases:** do not create, vote on or delete reports in a Preview/Production database without the team's explicit agreement.
- **Lithuanian text:** UI copy is Lithuanian. Preserve diacritics (ą č ę ė į š ų ū ž) and existing wording; save files as UTF-8; do not "translate" or ASCII-fy strings. Format numbers with `lt-LT`.
- **UI work:** follow DESIGN.md Part A always. Mobile: Part B (rules, states, anti-patterns, B20 checklist); verify on a real Android device + small/large emulator, largest font scale and TalkBack. Legacy web: Part C; verify at 1440 / 1024 / 390 px and with keyboard; check contrast and target sizes.
- **Prefer existing patterns** over new systems. Legacy: extend `lib/data.ts`, `lib/reports.ts`, the primitives in `components/map/panels.tsx` / `components/stats/charts.tsx`, and tokens in `app/globals.css`. Mobile: one primitive per component in `mobile/src/ui/`, colours only from `mobile/src/ui/tokens.ts`, text through `AppText`. BFF: follow the proxy/caching style of `app/api/geocode/route.ts`.
- **Inspect current behaviour before replacing it** — in code and in the running app (`npm run dev`) or on the device.
- **Dependencies:** do not add packages, change `package.json`/lockfile, Next.js config or tsconfig unless the task requires it; say why in the PR. This applies to `mobile/package.json` too (prefer Expo-compatible versions via `npx expo install`).
- **Git:** work on a feature branch from up-to-date `main`; never commit or push unless asked; never force-push `main`.

## POST-TASK WORKFLOW

After implementing a task:

1. Run the relevant checks from TESTING.md for every affected area (at minimum root `npm run lint` and `npm run build` for root code/config changes; TESTING.md › Part B for mobile/BFF).
2. Inspect `git status` (no `node_modules`, `.expo`, `.env*`, `.data/`, `.cache/` anywhere).
3. Inspect `git diff`.
4. Verify the requested behaviour (in the browser for legacy UI/map work; on a device for mobile; with curl for the BFF).
5. Check whether repository documentation became inaccurate — including statuses: anything you built moves from PLANNED to CURRENT in STRUCTURE.md / DATA.md / DESIGN.md / TESTING.md in the same task.

**Repository documentation is part of the implementation.** If a task changes a documented architectural, data, design, testing or operational fact, update the relevant document **in the same task**:

| Update | When you change |
|---|---|
| PRODUCT.md | product scope, target users, use cases, v0.1 definition of done, non-goals, product vocabulary; answers to its open questions |
| STRUCTURE.md | architecture, directories/responsibilities, routes, API routes, services, environment variables, important state ownership, important dependencies, major data flow, fragile areas, PLANNED → CURRENT status of mobile/BFF parts |
| ROUTING.md | strategies, metric formulas, feasibility or recommendation rules, explanation templates, providers/enrichers, the mobile ↔ BFF API contract, on-device data model |
| DATA.md | source datasets and their status, data schema, transformations, flags, generated files, database schema, refresh workflow, external data contracts, derived-metric definitions, constants and their sources |
| DESIGN.md | durable UI patterns, screens/flows, interaction rules, responsive architecture, component conventions, design tokens, accessibility expectations (and tick off legacy audit findings you fixed in Part C) |
| TESTING.md | verification workflow, added/removed checks or tests, a regression check or scenario that became necessary, changed smoke-test expectations, real commands once `mobile/` exists |
| PLAN.MD / README.md | priorities or status changed (e.g. a P0 item done, the mobile app now runnable — add its run instructions to README) |
| docs/adr/ | a significant, durable architectural decision whose rationale future developers must understand (e.g. routing provider, map provider, test runner, shared packages/workspaces, server-side storage of personal data) |

Do not update documentation mechanically after every edit. Ask: **"Would the existing documentation now mislead the next developer or coding agent?"** If yes, update it. If no, leave it alone.

A product or architectural change (new strategy, new data source, contract change, change of PRIMARY/LEGACY status) is not done until PRODUCT.md / STRUCTURE.md / ROUTING.md / DATA.md agree with each other and with the code.

At task completion, report:

- area(s) affected (mobile / BFF / legacy web / shared data / docs),
- files changed,
- behaviour changed,
- tests/checks run (with results),
- documentation updated,
- remaining uncertainty or things not verified.
