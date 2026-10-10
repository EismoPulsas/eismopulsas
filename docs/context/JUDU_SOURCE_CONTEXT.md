# JUDU_SOURCE_CONTEXT.md

> Source context for the new Hack4Vilnius mobility product.
> URLs in the official JUDU hackathon document are included exactly so agents can inspect them.
> Do not infer what an unclassified ArcGIS/portal URL contains without opening it.

# 1. Official Hack4Vilnius challenge

https://hack4vilnius.lt/

Challenge 02:

**„Kaip padėti vilniečiams priimti geriausius judumo sprendimus realiu laiku?“**

The challenge asks for a solution using JUDU and other city data to help select the most suitable trip mode or route in real time according to a particular user's needs, circumstances and mobility habits.

# 2. Official JUDU hackathon Google Doc

https://docs.google.com/document/d/11XlkRaXwQeVgky3R-ePHL31gQkm42ghR14gp5sZk2Cs/edit

The document currently contains these links:

## Public transport / feed links

### Static GTFS
https://www.stops.lt/vilnius/vilnius/gtfs.zip

Purpose:
- routes,
- stops,
- trips,
- stop times,
- schedules and other standard GTFS entities.

Status:
**JUDU-PROVIDED / VERIFY INTEGRATION DETAILS**

### Live vehicle data
https://stops.lt/vilnius/gps_full.txt

Purpose:
- current public-transport vehicle information.

Status:
**JUDU-PROVIDED / LIVE FEED**

Inspect its current schema before building integration code.

# 3. Other links from the official JUDU hackathon document

These were supplied by JUDU but their exact role must be inspected before assigning them to product architecture.

https://portal.sisp.lt/portal/apps/experiencebuilder/experience/?id=695f78d237024a8cae396575103928f8

https://portal.sisp.lt/portal/apps/webappviewer/index.html?id=77456a13ed0041a9857cb3f810204111

https://portal.sisp.lt/portal/apps/experiencebuilder/experience/?id=1741b3ca76c64faab74fe6343723c2ab

https://portal.sisp.lt/portal/apps/experiencebuilder/experience/?id=0a32c6aeab2643aab001ab34fa4f0a4e

https://maps.vilnius.lt/lt/map/transportas?zoom=1&x=581205.618491415&y=6064062.254991416&transportas=999!13!22!21!6!3!0!&allLayers=999!&basemap=base-dark&identify=#layers

https://data-vplanas.opendata.arcgis.com/search

https://arcgis.sviesoforai.lt/arcgis/rest/services/VIS/Vilnius_sde_dynamic/MapServer

Status for all above:
**OFFICIALLY PROVIDED / CLASSIFY AFTER INSPECTION**

Do not invent layer meaning from URL names alone.

# 4. JUDU public open-data catalogue

https://judu.lt/atviri-duomenys/

Useful categories visible in the JUDU catalogue include:

- GTFS timetable/route information,
- real-time public-transport movement information,
- traffic flows,
- transport infrastructure,
- parking-related information,
- cycling-related information,
- other mobility datasets.

Status:
**OFFICIAL REFERENCE CATALOGUE**

# 5. Current JUDU app — important competitive/product context

https://judu.lt/programele/

Official JUDU information indicates that the current app already supports important functions such as:

- public-transport trip planning,
- real-time public-transport information,
- public-transport tickets,
- parking,
- increasingly integrated city-mobility services.

Additional official product announcements:

https://judu.lt/judu-pristato-naujaja-miesto-judumo-programele-visas-judumas-vilniuje-vienoje-vietoje/

https://judu.lt/vilniuje-pristatyta-naujoji-judu-programele-vienoje-vietoje-visos-miesto-judumo-paslaugos-ir-patogesnis-dviraciu-marsrutu-planavimas/

Product implication:

**Do not make “multiple modes in one app” the primary differentiation.**

Focus on personalized comparison, costs, environmental impact, reliability and explainable multimodal recommendations.

# 6. Park & Ride

Official JUDU page:

https://judu.lt/vairuotojams/statyk-ir-vaziuok-aiksteles/

This is an important source for:

- current P+R locations,
- official rules,
- pricing,
- relationship with public transport.

Status:
**OFFICIAL / PRODUCT-RELEVANT**

Verify current values in the source rather than hard-coding assumptions from conversation.

# 7. JUDU parking facilities

https://judu.lt/vairuotojams/stovejimo-aiksteles-vilniuje/

Useful for:
- facility list,
- locations,
- parking context.

Status:
**OFFICIAL**

# 8. Real-time parking occupancy

Official JUDU announcement:

https://judu.lt/nuo-siol-atvira-realaus-laiko-informacija-apie-judu-uzdaru-aiksteliu-uzimtuma/

JUDU states that real-time occupancy information is publicly shown for its gated parking facilities.

Important engineering question:

**What machine-readable endpoint/API powers this view, and is its use supported for the hackathon?**

Do not reverse-engineer or rely on an undocumented endpoint if JUDU mentors can provide a supported source.

Status:
**OFFICIAL FUNCTIONALITY / MACHINE-READABLE API TO VERIFY**

# 9. Weather

Official Lithuanian Hydrometeorological Service API:

https://api.meteo.lt/

Potential use:
- rain,
- snow/ice,
- temperature,
- other conditions affecting walking/biking/scooter suitability.

Status:
**VERIFIED EXTERNAL OFFICIAL SOURCE**

# 10. Existing project data

The existing Eismo Pulsas repository already contains traffic-safety datasets and processing logic.

Potential future reuse:
- historical accident density,
- bicycle/scooter accident context,
- optional safety score.

Status:
**CURRENT IN LEGACY PRODUCT / OPTIONAL FOR NEW PRODUCT**

Do not let this legacy dataset dominate P0 mobility scope.

# 11. Source-validation rule

For every external source added to the architecture, document:

- owner/institution,
- stable source URL,
- whether it is officially provided,
- data format,
- refresh frequency if known,
- real-time vs static,
- terms/licence if relevant,
- whether it is actually integrated,
- fallback behaviour,
- known limitations.

Use status labels such as:

- CURRENT
- VERIFIED AVAILABLE
- RESEARCHED
- POSSIBLE
- BLOCKED / PARTNER ACCESS NEEDED

Never mark a source as integrated merely because a link exists.
