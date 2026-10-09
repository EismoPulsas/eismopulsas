# ADR-0002: Own plan contract + deterministic demo routing now; OpenTripPlanner with JUDU GTFS as the first real provider

Status: Accepted

Date: 2026-10-10

Deciders: Hack4Vilnius team (Eismo Pulsas). Recorded by a coding agent after a bounded source and provider check on 2026-10-10. The project owner asked for this decision.

## Context

- v0.1 must compare **car**, **public transport** and **car → P+R → public transport** with arrive-by times (PRODUCT.md). Each needs legs from a routing source. The previous session flagged routing as the largest technical risk (ADR-0001).
- **Hackathon clock.** Hack4Vilnius runs 2026-10-09 → 2026-10-11. Pre-pitch videos are due Sunday at 11:30 and the final is at 14:00 (hack4vilnius.lt, checked 2026-10-10). That is roughly a day of work.
- **JUDU data, verified 2026-10-10** (DATA.md › A2):
  - static GTFS (`stops.lt/vilnius/vilnius/gtfs.zip`, rebuilt 2026-10-09);
  - the custom `gps_full.txt` vehicle CSV;
  - publicly reachable but unlisted GTFS-Realtime files at `stops.lt/vilnius/*.pb` (RESEARCHED).
  - JUDU's trip planner (stops.lt) has **no documented public API**.
- **Options considered** (from official docs):

| Option | JUDU data | Transit + arrive-by | Car / walk | P+R | Hosting / cost | Verdict for today |
|---|---|---|---|---|---|---|
| A. JUDU / stops.lt planner | yes | yes (web UI) | no | no | — | **No supported API** → PARTNER ACCESS NEEDED. We do not reverse-engineer it |
| B. OpenTripPlanner 2.10 + JUDU GTFS + OSM | **directly** | yes (GraphQL, `arriveBy`) | yes (no live traffic) | composed by us | Java 25 or Docker; GBs of RAM; **not on Vercel** | Best fit; not runnable in time with demo reliability |
| C1. Google Routes API | unknown source | TRANSIT `arrivalTime` | yes (traffic-aware) | not in one request | key + billing | Fallback only; Vilnius transit source unverified; P+R still composed by us |
| C2. Transitous (MOTIS, community) | includes Vilnius feeds | yes | yes | — | free, best effort | Policy needs an OSS licence (our public repo has none) and prior contact for routing; not usable today without team action |
| D. Own GTFS planner | yes | — | — | — | — | Too much work; rejected (ROUTING.md § 8) |

- Machine facts: no Java on the main dev laptop; Docker 29 present; 15.8 GB RAM.

## Decision

1. **The mobile app depends only on our contract**, `POST /api/mobility/plan` (ROUTING.md § 9, `lib/mobility/types.ts`). Providers sit behind `RoutingProvider` in `lib/mobility/providers/types.ts`: `drive(from, to, at)` and `transit(from, to, arriveBy)`.
2. **Today's provider is `DemoRoutingProvider`** (`lib/mobility/providers/demo.ts`). It is deterministic and synthetic.
   - Every leg it returns has `basis: "demo"`.
   - The response says `dataMode: "demo"` and lists the demo source and assumption.
   - The app shows a neutral "Demonstraciniai maršrutų duomenys" note.
   - It never invents line numbers.
   - It is selected by `MOBILITY_ROUTING_PROVIDER` (default `demo`). An unknown value fails loudly; it never falls back silently.
3. **What is real today:**
   - P+R composition from the **official JUDU P+R site list**;
   - official JUDU fares and the P+R ticket;
   - official paid-zone tariffs, with the zone looked up live from JUDU's public ArcGIS layer;
   - the recommendation and explanation logic itself.
4. **The first real provider is OpenTripPlanner 2.x** with the JUDU GTFS and an OSM extract of Vilnius. It runs in the official Docker image, outside Vercel: a team laptop on venue Wi-Fi for the demo, or a small VM.
   - Add `lib/mobility/providers/otp.ts` implementing `RoutingProvider` via OTP's GraphQL API with `arriveBy`.
   - Add the server env var `OTP_BASE_URL` and `MOBILITY_ROUTING_PROVIDER=otp`.
   - The P+R composition stays in our BFF: car leg to the site + transit leg from the site.
5. **Migration path:**
   - (a) OTP for transit, walk and car (free-flow);
   - (b) GTFS-Realtime trip updates into OTP, once JUDU confirms the `.pb` feeds;
   - (c) live P+R occupancy enricher from JUDU's occupancy layer (DATA.md › A2);
   - (d) a traffic-aware car source only if needed (Google Routes as a car-only adapter, with an ADR for the key and billing).

## Alternatives considered

- **Google Routes for everything, now.** Rejected for today: it needs a billing account, which the team has not supplied; Vilnius transit provenance is unverified; and P+R must be composed anyway. It remains a car-only option later.
- **Transitous now.** Rejected for today: its usage policy requires an open-source licence and asks routing users to contact them first. Revisit if the team licenses the repo.
- **Block the mobile app until OTP runs.** Rejected: the mobile app and the recommendation engine can be built against the contract in parallel.

## Consequences

- **Positive:**
  - Mobile, BFF and data work proceed in parallel.
  - A real provider replaces only `providers/*`; recommendation, explanation, contract and UI stay the same.
  - Provenance (`basis`, `dataMode`, `sources`) is part of the contract from day one, so demo data cannot be mistaken for live data.
- **Negative / accepted risks:**
  - Times, transfers and geometry are synthetic until OTP lands, so the pitch must say so.
  - OTP adds a server outside Vercel: a laptop-hosted OTP is a single point of failure for the demo. Keep `demo` as the fallback provider.
  - Privacy: OTP is self-hosted, so origins and destinations stay within our infrastructure. A future Google adapter would send them to Google, and its ADR must state this.
- **Docs updated:** ROUTING.md § 8–9, STRUCTURE.md › B3, B6–B7, DATA.md › A2, A6, PLAN.MD, TESTING.md › B2–B3.

## References

- OTP basic tutorial (version 2.10, Java 25, `--build --serve`): https://docs.opentripplanner.org/en/latest/Basic-Tutorial/
- Google Routes transit (`arrivalTime`): https://developers.google.com/maps/documentation/routes/transit-route
- Transitous API usage policy: https://transitous.org/api/
- JUDU planner page (links stops.lt only): https://judu.lt/viesojo-transporto-keleiviams/marsruto-paieska/
- Code: `lib/mobility/providers/{types,demo,index}.ts`, `lib/mobility/plan.ts`
