# Eismo Pulsas — Project Overview

## 1. Project Summary

**Eismo Pulsas** is a civic traffic-safety and mobility intelligence platform for Lithuania.

The product combines official traffic accident data, user-reported dangerous locations, traffic and mobility data, demographic and vehicle statistics, geographic data, and potentially weather, road-condition, infrastructure, and municipal datasets.

The central idea is to show not only **where accidents have already happened**, but also **where people believe danger exists before an accident happens**.

The platform is designed around an interactive map and supporting statistical views that help residents, municipalities, cyclists, pedestrians, drivers, researchers, and potentially real-estate platforms better understand traffic risk.

## 2. Problem

Traffic-safety information is fragmented across many public institutions and data portals.

Typical users may find it difficult to answer questions such as:

- Where are the most dangerous streets in my city?
- Which locations are dangerous for cyclists or pedestrians?
- Is a location dangerous because many accidents happen there, or simply because traffic volume is high?
- Are local residents reporting hazards before official accidents occur?
- How does risk change by season, month, hour, weather, or road condition?
- Which municipalities have the highest accident rate relative to population?
- Which car brands or age groups appear most often in traffic incidents relative to their prevalence?
- Are there infrastructure problems around accident hotspots?

Eismo Pulsas aims to bring these signals into one understandable product.

## 3. Core Product Idea

The product has two complementary safety layers.

### Official layer

Shows historical traffic incidents from public-sector datasets.

This answers:

> **Where did accidents happen?**

### Community layer

Allows users to mark locations they consider dangerous and vote on existing reports.

This answers:

> **Where might an accident happen next?**

### Mix layer

Combines both.

This makes it possible to identify locations where:

- official accidents already confirm a known problem,
- residents report danger even without many official accidents,
- or community reports and official accident history strongly overlap.

## 4. Main Users

### Residents

People who want to understand road safety in their neighbourhood or city.

### Drivers

People interested in dangerous intersections, streets, black spots, and historical incident patterns.

### Cyclists and scooter users

Users who need safety information specific to vulnerable road users.

### Pedestrians

People interested in unsafe crossings, streets, intersections, and walking routes.

### Families

Users who may evaluate neighbourhood safety around schools, homes, parks, or daily routes.

### Municipalities and public institutions

Potential users for identifying recurring problem areas and citizen-reported risks.

### Researchers and journalists

Users who want access to structured traffic-safety statistics and open public data.

### Real-estate platforms

A possible future integration where neighbourhood or property listings could include traffic-safety indicators.

## 5. Main Features

### Interactive Map

The map is the core experience.

Current and planned map functionality includes:

- official traffic accident points,
- severity-based colour coding,
- Official / User / Mix data modes,
- municipality filtering,
- category filtering,
- filtering by year and month,
- filtering by accident severity,
- cyclist-related incidents,
- pedestrian-related incidents,
- scooter-related incidents,
- motorcycle-related incidents,
- drunk-driving-related incidents,
- child-related incidents,
- accident point view,
- heatmap view,
- municipality choropleth view,
- dangerous-location ranking,
- official police black spots,
- street/location details,
- local radius statistics,
- address search,
- user danger reporting,
- voting on nearby user reports,
- timeline playback of accidents over time.

## 6. Community Danger Reporting

Users can report a dangerous place by clicking on the map or searching for an address.

A report contains a category such as:

- speeding,
- dangerous intersection,
- unsafe crossing,
- dangerous cycling location,
- poor visibility / lighting,
- bad road surface,
- other.

If another report of the same category is created very close to an existing one, it is treated as another vote instead of a completely separate marker.

The idea is to reduce duplicate reports and build a simple crowdsourced confidence signal.

One browser/user should count as one vote for a specific reported location.

## 7. Statistics Section

The statistics section turns raw traffic data into more understandable rankings and visualisations.

Current or discussed statistics include:

- total traffic incidents,
- incidents with injuries,
- fatalities,
- injured people,
- accident rate by municipality,
- accident rate relative to population,
- car-brand rankings,
- car-brand rankings relative to registered vehicles,
- responsible driver age rankings,
- age-normalised accident rates,
- most dangerous streets,
- weekday × hour heatmap,
- fatalities by year,
- unusual or interesting facts,
- BMW × bus-stop collision counter,
- other editorial or shareable statistics.

The statistical experience should feel more like a public-data intelligence product than an internal admin dashboard.

## 8. Timeline

The map includes a time-based playback mode.

Users can press play and see accident points appear month by month.

This can be used to:

- visualise seasonal patterns,
- see changes over multiple years,
- make the product more engaging during a demo,
- expose periods with unusually high accident activity.

## 9. Data Strategy

A major part of Eismo Pulsas is combining datasets that normally live in separate systems.

### Core data currently used

- Lithuanian Police / EĮIS traffic accident data
- State Data Agency population data
- municipality boundaries
- Regitra vehicle registration data
- Police GIS black spots
- OpenStreetMap / Nominatim geocoding

### Valuable additional datasets

Potential or researched sources include:

- JUDU open mobility data
- Vilnius open-data portal
- “Tvarkau miestą” citizen-reported urban problems
- Via Lietuva traffic intensity
- Via Lietuva road-weather data
- road restrictions and roadworks
- Meteo.lt historical weather API
- Kaunas monthly accident GIS data
- Lithuanian Geoportal layers
- OpenStreetMap Overpass API
- Grinda road-condition / laser-scanning data

These additional datasets could enable deeper analysis, for example:

> accident count ÷ traffic volume

instead of only showing raw accident totals.

Or:

> accident hotspot + repeated citizen complaint + poor road condition + poor weather

which gives a much stronger explanation of risk.

## 10. Technical Stack

The current implementation uses:

- **Next.js**
- **React**
- **TypeScript**
- **Tailwind CSS**
- **Leaflet**
- **React Leaflet**
- **Neon Postgres**
- **Vercel**
- **GitHub**

The app contains:

- map interface,
- statistics page,
- about/API page,
- server API routes,
- static preprocessed accident data,
- user-report storage,
- geocoding and black-spot integrations.

## 11. Data Storage Architecture

Official accident data is not stored in Postgres.

It is preprocessed and stored as static files under the application’s public data directory. This keeps large historical datasets separate from user-generated content.

Postgres is mainly used for:

- user-reported dangerous places,
- votes on reports.

If `DATABASE_URL` is not configured locally, the application can fall back to local JSON storage for reports.

This allows development without requiring a live production database.

## 12. Deployment

The repository is hosted on GitHub.

The application is deployed through Vercel.

The intended workflow is:

1. update local `main`,
2. create a feature branch,
3. implement changes,
4. run checks,
5. commit,
6. push branch,
7. create a Pull Request,
8. inspect the Vercel Preview,
9. merge after review.

Vercel Preview deployments allow the team to test and share a branch before merging it into production.

## 13. Team Workflow

The team consists of four people with different skill sets.

The intended collaboration model is to avoid multiple people or coding agents changing the same area at the same time. Instead, work should be divided into relatively independent features or layers.

Typical workflow:

```bash
git switch main
git pull --ff-only origin main
git switch -c feature/my-task
```

Before pushing important changes:

```bash
npm run lint
npm run build
```

Then:

```bash
git add -A
git commit -m "feat: describe change"
git push -u origin feature/my-task
```

## 14. AI-Assisted Development

A significant part of development may be done using coding agents and LLMs.

Possible tools include:

- Codex,
- Claude Code,
- GPT models,
- Gemini,
- other development agents.

The safest workflow is:

1. ask the agent to inspect the repository first,
2. ask for a plan before code,
3. limit the scope of each task,
4. avoid unrelated refactors,
5. run lint and build,
6. inspect the Git diff,
7. test visually in browser,
8. review a Vercel Preview before merge.

Agents should read repository instructions such as `AGENTS.md` before modifying code.

## 15. Design Direction

The current interface is functional and contains a strong feature foundation, but the design is visually dense and should be refined.

The desired design direction is:

- precise,
- calm,
- premium,
- trustworthy,
- modern,
- cartographic,
- data-focused,
- civic rather than SaaS-like.

The product should avoid:

- generic AI dashboard styling,
- excessive cards,
- unnecessary gradients,
- glassmorphism,
- glowing effects,
- too many pill controls,
- decorative animations,
- visual clutter,
- making every element equally important.

### Design principles

1. The map is the primary canvas.
2. Controls should recede until needed.
3. Use progressive disclosure.
4. Colour should communicate meaning.
5. Prefer spacing and typography over borders.
6. Statistics should feel editorial rather than administrative.
7. Dense information is acceptable; visual noise is not.
8. Mobile should be intentionally designed rather than compressed from desktop.
9. Important actions should be obvious.
10. Secondary functionality should not compete with the main task.

## 16. Potential Future Features

Ideas discussed for later exploration include:

- route risk scoring,
- safer route recommendations,
- weather-related risk overlays,
- icy-road risk,
- road-surface quality,
- Grinda road-condition integration,
- unsafe road-sign or infrastructure reporting,
- community reputation and badges,
- notifications,
- photo attachments for reports,
- safety quizzes,
- neighbourhood safety score,
- school-area safety,
- property / real-estate safety indicator,
- municipality dashboards,
- predictive or explanatory risk scoring.

These ideas should be prioritised carefully rather than all being implemented during the hackathon.

## 17. Hackathon Goal

For the hackathon, the priority should be a convincing, polished demonstration of the strongest concept rather than maximum feature count.

The strongest story is:

> **Official data shows where accidents happened.  
> People show where danger is felt.  
> Eismo Pulsas combines both to understand where the next problem may appear.**

A strong final demo should clearly communicate:

1. the problem,
2. the map,
3. Official / User / Mix modes,
4. user danger reporting,
5. meaningful statistics,
6. one or two deeper insights from additional data,
7. why this matters to residents and cities.

## 18. Recommended Hackathon Priorities

### Must have

- stable map,
- clear filters,
- Official / User / Mix modes,
- community reporting and voting,
- useful location details,
- strong statistics,
- reliable deployment,
- polished design,
- clear demo narrative.

### High-value additions

- traffic-intensity normalisation,
- weather context,
- city-specific fresh data,
- infrastructure complaints around hotspots,
- strong mobile presentation,
- better visual hierarchy.

### Lower priority

- large-scale predictive AI,
- complicated gamification,
- too many new datasets,
- extensive user accounts,
- large notification systems,
- features that are hard to explain during the demo.

## 19. One-Sentence Description

**Eismo Pulsas is an interactive Lithuanian traffic-safety platform that combines official accident data with community-reported danger signals to reveal where roads are dangerous, why they may be dangerous, and where attention is needed next.**

## 20. Short Pitch

**Eismo Pulsas turns fragmented public traffic data and citizen observations into one interactive safety map. Official records show where crashes happened; residents show where they believe danger exists now. By combining both, Eismo Pulsas helps people and cities identify risk earlier, understand dangerous locations more clearly, and make better mobility decisions.**
