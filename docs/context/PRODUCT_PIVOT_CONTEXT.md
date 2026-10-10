# PRODUCT_PIVOT_CONTEXT.md

> Context file for the Hack4Vilnius 2026 product pivot.
> This file describes the **new product intent and user problems**. It is not a claim about what is already implemented.
> Repository code remains the source of truth for CURRENT implementation.

# 1. Hackathon challenge

The project is now primarily targeting Hack4Vilnius challenge 02:

**„Kaip padėti vilniečiams priimti geriausius judumo sprendimus realiu laiku?“**

The challenge asks for a solution that uses JUDU and other city data to help a person choose the most suitable way to travel or route in real time, taking into account that specific user's needs, circumstances and mobility habits.

Official challenge page:
https://hack4vilnius.lt/

# 2. Product pivot

The previous Eismo Pulsas concept focused on traffic accidents, dangerous places and community safety reports.

That implementation should be retained as a **legacy/reusable web, backend and data prototype**, but it is no longer the primary hackathon product.

The new primary product is an **Android-first personalized multimodal mobility decision application for Vilnius**.

The core question is not:

> “How can I get there?”

Existing products already answer that.

The core question is:

> **“What is the best way for ME to make this trip today?”**

The product should compare realistic mobility strategies and explain the trade-off between them.

# 3. Origin of the idea

One team member regularly drives long distances and spends roughly €300/month on fuel. A recurring question is whether it would make sense to:

- drive only part of the way,
- park somewhere convenient,
- continue by public transport,
- and later return to the car.

The important unknowns are:

- How much money would this save?
- Would it save or cost time?
- How much lower would the environmental impact be?
- Is parking available and affordable?
- Is the transfer convenient enough to be worth it?

A hackathon mentor described a similar behavioural change: after parking in/near the centre became expensive, public transport became more attractive and turned out to be more convenient than expected.

This suggests the product's job is not only route finding. It should make hidden mobility trade-offs visible.

# 4. Primary value proposition

**The application compares ways of making the same trip and recommends the option that best fits the user today.**

Potential comparison dimensions:

- travel time,
- monetary cost,
- CO2 / environmental impact,
- reliability / uncertainty,
- parking cost,
- parking availability,
- walking amount,
- transfers,
- current public-transport conditions,
- weather,
- user preferences,
- optionally safety.

Recommendations must be explainable.

Example:

> “We recommend Car → P+R → 4G. It is only 5 minutes slower than driving directly, €3.40 cheaper, emits ~56% less CO2 and avoids parking in the city centre.”

Avoid unexplained 0–100 scores as the primary explanation.

# 5. Important trip classes

## 5.1 Recurring trips

Examples:

- home → work,
- home → university.

The user may repeatedly travel at similar times.

Input can include:

- origin,
- destination,
- desired arrival time,
- preferred mobility options,
- personal priorities.

The trip should be savable as something like:

**„Darbas“**

Future useful output:

- today’s recommended mode,
- recommended departure time,
- weekly savings,
- monthly savings,
- yearly savings,
- cumulative CO2 difference.

Example:

> Today P+R + public transport is recommended because congestion is high in the centre and the relevant public-transport connection is operating close to schedule.

## 5.2 One-off trips

Examples:

- doctor appointment,
- meeting,
- event,
- unfamiliar destination.

Questions may include:

- Should I drive all the way?
- Where can I park?
- What will parking cost?
- Is parking likely to be available?
- Would it be better to park outside the centre and walk?
- Would P+R be better?
- Could public transport be better?
- Could cycling or a scooter be practical?

If the user leaves their car somewhere, the system should remember the car location and eventually support the return route to that car.

# 6. “Arrive by” is important

The user may care more about arrival time than departure time.

Example:

> “I must be there by 08:45.”

The system can work backwards and include a reliability buffer.

Possible preference:

- minimal buffer,
- normal buffer,
- “I really do not want to be late”.

Eventually the product should distinguish between a nominal ETA and uncertain real-world ETA.

Examples:

- `42–48 min`,
- or `42 min · reliability: high`.

# 7. Mobility options

The long-term vision can consider:

- car,
- public transport,
- walking,
- bicycle,
- shared bicycle,
- scooter,
- train,
- multimodal combinations.

Important hybrid examples:

- Car → Park & Ride → public transport
- Car → parking → walk
- Car → parking → public transport
- Bike → public transport
- Walk → public transport

The hackathon MVP should NOT implement every possible combination.

# 8. Minimal user profile

Keep configuration small.

Useful initial preferences:

- car available yes/no,
- fuel type,
- fuel consumption (l/100 km),
- bicycle available yes/no,
- scooter available yes/no (optional later),
- maximum acceptable walking time,
- priority:
  - fastest,
  - cheapest,
  - greener,
  - balanced,
- desired reliability / lateness buffer.

Avoid building a complex account/profile system during the hackathon.

# 9. P0 — Version 0.1

The first product version should prove one complete end-to-end decision flow.

Required:

1. Android app running on a real phone/emulator.
2. Origin.
3. Destination.
4. “Arrive by” time.
5. Minimal mobility profile/preferences.
6. Generate at least:
   - Car
   - Public transport
   - Car → P+R → public transport
7. Compare:
   - time
   - cost
   - CO2
8. Recommend one option.
9. Explain why.
10. Show selected route on a map.
11. Save a recurring trip such as „Darbas“.
12. Architecture allows real-time data to be integrated incrementally.

A polished vertical slice is more important than many incomplete features.

# 10. P1

Only after P0 works:

- real-time parking occupancy,
- weather,
- walking,
- cycling,
- bike-infrastructure quality,
- Cyclocity/shared mobility,
- travel-time reliability ranges,
- richer real-time context.

# 11. P2 / future

- Bolt/RIDE live availability if access becomes available,
- trains,
- advanced safety score,
- accounts/login,
- notifications,
- machine-learning prediction,
- gamification,
- monetization,
- partner integrations.

# 12. Park & Ride

P+R is strategically important because it provides a clear hybrid option between car and public transport.

The product should treat it as a first-class route strategy, not just a POI.

Known official JUDU information should be verified before implementation:
https://judu.lt/vairuotojams/statyk-ir-vaziuok-aiksteles/

# 13. Parking

Parking is a key part of the decision, especially for city-centre trips.

Useful factors:

- parking price,
- parking duration,
- availability,
- distance from destination,
- time needed to find a place,
- whether walking/transit from the parking location is better than driving closer.

Some data may not be publicly machine-readable today.

Lack of current API access should be recorded as a dependency/future integration opportunity, not treated as proof that the feature is impossible.

# 14. Public transport

Important distinction:

- static timetable = what should happen,
- live vehicle/real-time data = what is happening now.

Known JUDU-provided feeds include GTFS and live vehicle information. See `JUDU_SOURCE_CONTEXT.md`.

Real-time data should help adjust:

- expected departure/arrival,
- transfer confidence,
- reliability.

# 15. Weather

Weather can influence recommended mobility mode.

Examples:

- strong rain reduces bike/scooter suitability,
- snow/ice can heavily reduce bike/scooter suitability.

For the hackathon this can be rule-based and explainable.

Do not overcomplicate this with ML.

# 16. Cycling / scooters / safety

Vilnius has bicycle and pedestrian infrastructure data.

Possible later evaluation:

- share of route on dedicated cycling infrastructure,
- historical cycling/scooter accidents near the route,
- safer vs faster routing preference.

The old Eismo Pulsas accident data may become a useful optional safety layer.

This is not P0 unless implementation becomes unexpectedly easy.

# 17. Environmental impact

CO2 should be shown as a transparent estimate with documented assumptions.

Prefer:

- kg CO2,
- percentage reduction.

Avoid presenting playful equivalents such as “trees saved” as the main scientific metric unless assumptions are very clearly documented.

# 18. New product UX principle

The previous product was map-first.

The new product is **decision-first**.

Suggested main flow:

1. Where from?
2. Where to?
3. Arrive by when?
4. Find options.
5. Compare options.
6. Show recommendation and explanation.
7. Open the route map if needed.

The map supports the decision. It should not dominate the first screen.

# 19. Differentiation from existing JUDU / maps products

The product should not compete primarily on:

> “All transport types in one app.”

JUDU already provides major mobility functions including public-transport trip planning, real-time public-transport information, parking and bicycle-route planning.

Differentiation should instead be:

> **Personalized decision comparison and explainable trade-offs between modes and multimodal strategies.**

Short pitch:

> **Google Maps tells you how to get there. We tell you how it makes sense for you to get there today.**

# 20. Technical direction

Keep the existing repository.

Recommended direction:

- existing Next.js app/backend remains,
- add a separate `mobile/` Expo / React Native application,
- reuse backend/data logic where valuable,
- do not convert the existing Leaflet dashboard into the mobile UI.

Proposed mobile stack:

- Expo,
- React Native,
- TypeScript,
- Expo Router,
- react-native-maps.

The existing Next.js application can progressively become a backend-for-frontend for normalized mobility data.

# 21. Critical hackathon constraint

Do not attempt to build a complete mobility platform in 48 hours.

Priority:

> **one real, convincing, polished vertical slice**

rather than:

> many partially functional integrations.

# 22. Open questions to resolve with JUDU mentors

High-value questions:

1. Is there a machine-readable API for real-time occupancy of JUDU parking facilities?
2. Is there a supported endpoint for traffic/congestion data?
3. What is the recommended way to join the live vehicle feed with GTFS trips?
4. Is there an existing JUDU journey-planner API available to hackathon teams?
5. Is current P+R occupancy available?
6. Can Bolt/RIDE/shared-mobility partner data be provided during the hackathon?
7. Are historical real-time feeds available for travel-time reliability modelling?
8. Most importantly: what important mobility decision problem is **not already solved** by the current JUDU application?

# 23. Product-development rule

Every idea in this file should be evaluated critically.

The file intentionally contains more ideas than should be implemented.

When deciding scope, prioritize:

1. direct fit with the official challenge,
2. user value,
3. demonstrability,
4. availability/quality of data,
5. implementation time,
6. reliability during the final demo.
