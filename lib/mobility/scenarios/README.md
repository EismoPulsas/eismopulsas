# Mobility plan scenarios

Request bodies for `POST /api/mobility/plan` used by the checks in TESTING.md › B2–B3.
Coordinates come from `GET /api/geocode` (OSM Nominatim), not from memory.

| File | Use case | What to expect (demo routing) |
|---|---|---|
| `uc1-commute-from-district.json` | UC1: commuter driving in from Lindiniškės (Vilniaus r.) to Gedimino pr. 9 (Raudona zone, live lookup), 9 h stay | car, transit, P+R (Ukmergės g. 246); `balanced` → P+R (2026-10-10) |
| `uc1-commute-in-city.json` | UC1: Pašilaičiai → Gedimino pr. 9, 9 h stay | car, transit, P+R; `balanced` → transit, P+R dominated (2026-10-10) |
| `uc2-old-town-appointment.json` | UC2: Lazdynai → Vokiečių g. 2 (Mėlyna zone), 1 h stay | car, transit, P+R (Savanorių pr. 124); `balanced` → transit (2026-10-10) |

The service area is a coarse bounding box (`SERVICE_AREA` in `config.ts`), so Lindiniškės, just outside the city, still counts as inside the public-transport area.

`arriveBy` must be within 30 days of today (validation). Move the date forward when it expires.

```bash
curl -s -X POST localhost:3000/api/mobility/plan -H 'content-type: application/json' -d @lib/mobility/scenarios/uc1-commute-from-district.json
```
