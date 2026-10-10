# Architecture Decision Records

An **ADR** is a short document that records one significant decision: the context, what was decided, the alternatives, and the consequences. It explains *why* the code is the way it is, so that a future developer or coding agent does not "clean up" something that was deliberate — or keeps something whose reason has expired.

## When to write one

Write an ADR when a decision is

- architecturally significant (storage, data pipeline, rendering strategy, external services, state architecture, security model),
- hard or expensive to reverse,
- likely to look accidental or wrong to someone reading the code later, or
- a trade-off the team argued about.

Examples for this repo: choosing a routing provider, adding a paid API, storing personal data server-side, adding a test framework, introducing npm workspaces; for the legacy web app: moving official data into Postgres, adding URL state, introducing authentication for reports, replacing Leaflet, changing the basemap provider.

## When NOT to write one

- Ordinary implementation details, refactors with no behavioural trade-off, styling tweaks, bug fixes, dependency patch bumps.
- Things already fully explained by STRUCTURE.md / DATA.md / DESIGN.md. (Those describe *what is*; ADRs record *why it was chosen*.)
- Retroactive guesses. Do not invent rationale for past decisions; if the reason is unknown, say so or don't write the ADR.

## Naming and format

- File: `docs/adr/NNNN-kebab-case-title.md`, numbered sequentially (`0001-…`, `0002-…`). `0000-template.md` is the template.
- Copy the template, fill every section, keep it to one page.
- Link the ADR from the relevant section of STRUCTURE.md / DATA.md / DESIGN.md.
- ADRs are immutable once Accepted: to change a decision, write a new ADR and mark the old one `Superseded by ADR-NNNN`.

## Statuses

| Status | Meaning |
|---|---|
| Proposed | Under discussion; not yet the rule |
| Accepted | The current rule |
| Deprecated | No longer applies, nothing replaced it |
| Superseded by ADR-NNNN | Replaced by a newer decision |
| Rejected | Considered and declined (worth keeping so it is not re-proposed blindly) |

## Index

| ADR | Title | Status |
|---|---|---|
| [0001](0001-pivot-to-personalized-multimodal-mobility.md) | Pivot to a personalised multimodal mobility decision app (Android-first), keeping the existing repository | Accepted (2026-10-10), amended by 0003 |
| [0002](0002-routing-provider-strategy.md) | Own plan contract + deterministic demo routing now; OpenTripPlanner with JUDU GTFS as the first real provider | Accepted (2026-10-10) |
| [0003](0003-mobile-project-isolation-and-contract-sharing.md) | Isolate `mobile/` from the root Next.js tooling; share the contract by a type-only import | Accepted (2026-10-10) |

## Candidate ADRs — mobility product (decide when the work reaches them)

1. Map provider and key handling on Android (`react-native-maps` with Google Maps vs alternatives) — before the first standalone build.
2. Test runner for `lib/mobility` recommendation/explanation logic (TESTING.md › B6a).
3. Hosting of OpenTripPlanner (laptop vs VM vs managed) once ADR-0002's migration step (a) starts.
4. Any server-side storage of personal data (accounts, synced saved trips) — reverses ADR-0001 point 6.
5. Repository licence (needed for e.g. Transitous; ADR-0002).

## Candidate ADRs — legacy web (not yet written)

These decisions are visible in the code, but their rationale was never recorded. Write them only with the people who made them, or mark the context as "reconstructed from code":

1. Official accident data as committed, columnar static JSON in `public/data/` (not Postgres), filtered client-side.
2. Dual report storage: Neon Postgres when `DATABASE_URL` is set, JSON file / memory fallback otherwise.
3. Anonymous per-browser voter id (`localStorage` UUID) instead of accounts — and its abuse limits.
4. Merge-as-vote rule: same category within 35 m.
5. Imperative canvas rendering for accident points and a hand-written heatmap layer (no plugins).
6. Server-side proxies with in-memory caches for Nominatim and Police IRD.
7. Esri Canvas basemap tiles (keyless) — terms of use and attribution.
8. Dark-first UI.
9. No URL state (and whether to add it).
10. No automated test suite (and when to add one).
