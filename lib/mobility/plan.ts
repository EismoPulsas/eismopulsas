// Trip planning pipeline (ROUTING.md § 1): strategies → legs from providers → cost and
// CO₂ → feasibility → recommendation → explanation. It depends only on PlanDeps, so a
// real routing provider replaces the demo one without changes here. Nothing personal
// is stored or logged.

import { CO2, DEFAULT_ENERGY_PRICE, FARES, MODEL, PARK_AND_RIDE_TICKET, PARKING_ZONES_SOURCE } from "./config";
import { explainRecommendation, summarizeAlternative, summarizeDominated, type Explainable } from "./explain";
import { eur, hoursMinutes, minutes } from "./format";
import { addMin, haversineKm, insideServiceArea, round2, straightLine } from "./geo";
import { carEnergy, transitCo2, transitFare, weakest, zoneParkingCost } from "./metrics";
import { rank, type Candidate } from "./recommend";
import type { ParkRideSite, PlanDeps, StreetPath, TransitItinerary } from "./providers/types";
import type {
  Assumption,
  Basis,
  CostItem,
  DataMode,
  Leg,
  MobilityProfile,
  ParkingInfo,
  Place,
  PlanResponse,
  PlanWarning,
  RouteOption,
  SourceRef,
  Unavailable,
} from "./types";
import type { ValidRequest } from "./validate";

type Draft = Omit<RouteOption, "status" | "summary" | "dominatedBy">;
/** undefined = the zone lookup failed (cost unknown); null = not in a paid zone. */
type ZoneLookup = { zone: string | null } | undefined;

const FARES_SOURCE: SourceRef = {
  id: "judu-fares",
  name: "JUDU bilietų kainos",
  basis: "official",
  url: FARES.url,
  note: `30 min. – ${eur(FARES.single30)}, 60 min. – ${eur(FARES.single60)}; patikrinta ${FARES.verifiedOn}.`,
};
const CO2_SOURCE: SourceRef = {
  id: "desnz-2025-co2",
  name: "JK Vyriausybės ŠESD konversijos koeficientai 2025 (DESNZ)",
  basis: "estimate",
  url: CO2.petrol.url,
  note: "Naudojami kaip artinys: Lietuvai skirti koeficientai dar nepatikrinti.",
};
const ENERGY_PRICE_SOURCE: SourceRef = {
  id: "energy-price-assumption",
  name: "Kuro ir elektros kainos (komandos prielaida)",
  basis: "estimate",
  note: "Pirminis šaltinis nepatikrintas; profilyje galima nurodyti savo kainą.",
};

const sumWalk = (legs: Leg[]) => legs.filter((l) => l.mode === "walk").reduce((s, l) => s + l.durationMin, 0);
const sumKm = (legs: Leg[]) => Math.round(legs.reduce((s, l) => s + (l.distanceKm ?? 0), 0) * 10) / 10;
const minutesBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000);

function carLeg(from: Place, to: Place, departAt: Date, path: StreetPath): Leg {
  return {
    mode: "car",
    from,
    to,
    departAt: departAt.toISOString(),
    arriveAt: addMin(departAt, path.durationMin).toISOString(),
    durationMin: path.durationMin,
    distanceKm: path.distanceKm,
    line: null,
    geometry: path.geometry ?? straightLine(from, to),
    note: "Važiuokite automobiliu",
    basis: path.basis,
  };
}

function parkLeg(at: Place, start: Date, durationMin: number, note: string): Leg {
  return {
    mode: "park",
    from: at,
    to: at,
    departAt: start.toISOString(),
    arriveAt: addMin(start, durationMin).toISOString(),
    durationMin,
    distanceKm: null,
    line: null,
    geometry: null,
    note,
    basis: "estimate",
  };
}

function fareLabel(fare: number, hasPass: boolean): string {
  if (hasPass) return "Periodinis bilietas (papildomai 0 €)";
  if (fare === FARES.single30) return "30 min. bilietas";
  const n = Math.round(fare / FARES.single60);
  return n === 1 ? "60 min. bilietas" : `${n} × 60 min. bilietai`;
}

function energyItem(eurValue: number, priceAssumed: boolean, legBasis: Basis): CostItem {
  return { kind: "energy", label: "Kuras / elektra", eur: eurValue, basis: weakest(legBasis, priceAssumed ? "estimate" : "official") };
}

// ── Strategies ───────────────────────────────────────────────────────────────

function transitDraft(it: TransitItinerary, profile: MobilityProfile, routingId: string): Draft {
  const legs = it.legs;
  const legBasis = weakest(...legs.map((l) => l.basis));
  const fare = transitFare(it.rideSpanMin, profile.transitPass);
  const departAt = legs[0].departAt;
  const arriveAt = legs[legs.length - 1].arriveAt;
  return {
    id: "transit",
    strategy: "transit",
    title: "Viešuoju transportu",
    departAt,
    arriveAt,
    metrics: {
      durationMin: minutesBetween(departAt, arriveAt),
      costEur: fare,
      co2Kg: transitCo2(it.ridePassengerKm),
      walkMin: sumWalk(legs),
      transfers: it.transfers,
      distanceKm: sumKm(legs),
    },
    basis: { duration: legBasis, cost: weakest(legBasis, "official"), co2: weakest(legBasis, "estimate") },
    cost: [{ kind: "fare", label: fareLabel(fare, profile.transitPass), eur: fare, basis: weakest(legBasis, "official") }],
    legs,
    parking: null,
    feasibility: { lateMin: 0, overWalk: false },
    sources: [routingId, FARES_SOURCE.id, CO2_SOURCE.id],
  };
}

function carDraft(
  origin: Place,
  destination: Place,
  arriveBy: Date,
  stayMinutes: number,
  path: StreetPath,
  lookup: ZoneLookup,
  car: MobilityProfile["car"],
  routingId: string,
  zoneSourceId: string,
): Draft {
  const zone = lookup?.zone ?? null;
  const parkMin = zone ? MODEL.carParkAndWalkMin.paidZone : MODEL.carParkAndWalkMin.other;
  const parkStart = addMin(arriveBy, -parkMin);
  const departAt = addMin(parkStart, -path.durationMin);
  const energy = carEnergy(path.distanceKm, car);

  let parking: ParkingInfo;
  if (lookup === undefined) {
    parking = { kind: "street_zone", name: "Stovėjimo kaina nežinoma", costEur: null, paidMinutes: null, availability: null, basis: "estimate" };
  } else if (zone === null) {
    parking = { kind: "street_zone", name: "Ne rinkliavos zona (gatvėje nemokamai)", costEur: 0, paidMinutes: 0, availability: null, basis: "official" };
  } else {
    const c = zoneParkingCost(zone, arriveBy, stayMinutes);
    parking = c
      ? { kind: "street_zone", name: c.tariff.label, costEur: c.eur, paidMinutes: c.paidMinutes, availability: null, basis: "estimate" }
      : { kind: "street_zone", name: `Zona „${zone}“ (tarifas nežinomas)`, costEur: null, paidMinutes: null, availability: null, basis: "estimate" };
  }

  const legs = [
    carLeg(origin, destination, departAt, path),
    parkLeg(destination, parkStart, parkMin, zone ? `Raskite vietą (${parking.name}) ir nueikite iki tikslo` : "Pasistatykite automobilį ir nueikite iki tikslo"),
  ];
  const costEur = parking.costEur === null ? null : round2(energy.eur + parking.costEur);
  return {
    id: "car",
    strategy: "car",
    title: "Automobiliu",
    departAt: departAt.toISOString(),
    arriveAt: arriveBy.toISOString(),
    metrics: { durationMin: path.durationMin + parkMin, costEur, co2Kg: energy.co2Kg, walkMin: 0, transfers: 0, distanceKm: path.distanceKm },
    basis: { duration: path.basis, cost: weakest(path.basis, energy.priceAssumed ? "estimate" : "official", parking.basis), co2: weakest(path.basis, "estimate") },
    cost: [
      energyItem(energy.eur, energy.priceAssumed, path.basis),
      { kind: "parking", label: `Stovėjimas: ${parking.name}`, eur: parking.costEur, basis: parking.basis },
    ],
    legs,
    parking,
    feasibility: { lateMin: 0, overWalk: false },
    sources: [routingId, CO2_SOURCE.id, ...(lookup ? [zoneSourceId] : []), ...(energy.priceAssumed ? [ENERGY_PRICE_SOURCE.id] : [])],
  };
}

function onTheWay(site: ParkRideSite, origin: Place, destination: Place): number | null {
  const od = haversineKm(origin, destination);
  const os = haversineKm(origin, site);
  const sd = haversineKm(site, destination);
  if (os >= od || sd < MODEL.parkAndRideMinKmFromDestination) return null;
  const detour = (os + sd) / od;
  return detour <= MODEL.parkAndRideDetourRatio ? detour : null;
}

async function parkAndRideDraft(
  site: ParkRideSite,
  origin: Place,
  destination: Place,
  arriveBy: Date,
  car: MobilityProfile["car"],
  deps: PlanDeps,
): Promise<Draft | null> {
  const sitePlace: Place = { lat: site.lat, lng: site.lng, label: `P+R ${site.name}` };
  const it = await deps.routing.transit(sitePlace, destination, arriveBy);
  if (!it) return null;
  const transitStart = new Date(it.legs[0].departAt);
  const parkStart = addMin(transitStart, -MODEL.parkAndRideParkMin);
  // Driving time depends on the time of day; use the time we would actually be driving.
  const path = await deps.routing.drive(origin, sitePlace, addMin(parkStart, -20));
  const departAt = addMin(parkStart, -path.durationMin);
  const energy = carEnergy(path.distanceKm, car);
  const ticket = PARK_AND_RIDE_TICKET.eur;

  const legs = [
    carLeg(origin, sitePlace, departAt, path),
    parkLeg(sitePlace, parkStart, MODEL.parkAndRideParkMin, `Pasistatykite „Statyk ir važiuok“ aikštelėje (${site.name}). Bilietas ${eur(ticket)} galioja ir viešajam transportui iki dienos pabaigos`),
    ...it.legs,
  ];
  const legBasis = weakest(path.basis, ...it.legs.map((l) => l.basis));
  const arriveAt = legs[legs.length - 1].arriveAt;
  return {
    id: "park_and_ride",
    strategy: "park_and_ride",
    title: "„Statyk ir važiuok“ (P+R)",
    departAt: departAt.toISOString(),
    arriveAt,
    metrics: {
      durationMin: minutesBetween(departAt.toISOString(), arriveAt),
      costEur: round2(energy.eur + ticket),
      co2Kg: energy.co2Kg + transitCo2(it.ridePassengerKm),
      walkMin: sumWalk(it.legs),
      transfers: it.transfers,
      distanceKm: sumKm(legs),
    },
    basis: {
      duration: legBasis,
      cost: weakest(legBasis, energy.priceAssumed ? "estimate" : "official"),
      co2: weakest(legBasis, "estimate"),
    },
    cost: [
      energyItem(energy.eur, energy.priceAssumed, path.basis),
      { kind: "park_and_ride", label: "„Statyk ir važiuok“ bilietas (stovėjimas + viešasis transportas)", eur: ticket, basis: "official" },
    ],
    legs,
    parking: { kind: "park_and_ride", name: site.name, costEur: ticket, paidMinutes: null, availability: null, basis: "official" },
    feasibility: { lateMin: 0, overWalk: false },
    sources: [deps.routing.source.id, "judu-park-ride", CO2_SOURCE.id, ...(energy.priceAssumed ? [ENERGY_PRICE_SOURCE.id] : [])],
  };
}

// ── Pipeline ─────────────────────────────────────────────────────────────────

/** Shift an option that would have to leave in the past: leave now, arrive late. */
function applyLateness(d: Draft, now: Date): Draft {
  const late = Math.ceil((now.getTime() - new Date(d.departAt).getTime()) / 60_000);
  if (late <= 0) return d;
  const shift = (iso: string) => addMin(new Date(iso), late).toISOString();
  return {
    ...d,
    departAt: shift(d.departAt),
    arriveAt: shift(d.arriveAt),
    legs: d.legs.map((l) => ({ ...l, departAt: shift(l.departAt), arriveAt: shift(l.arriveAt) })),
    feasibility: { ...d.feasibility, lateMin: late },
  };
}

function providerFailed(strategy: Unavailable["strategy"], err: unknown, warnings: PlanWarning[], unavailable: Unavailable[]) {
  console.error(`Mobility provider failed (${strategy}):`, err instanceof Error ? err.message : "unknown error");
  warnings.push({ code: `${strategy}_provider_failed`, text: "Dalies maršrutų šaltinis laikinai nepasiekiamas." });
  unavailable.push({ strategy, code: "provider_failed", text: "Maršruto gauti nepavyko – bandykite vėliau." });
}

export async function planTrip(req: ValidRequest, deps: PlanDeps): Promise<PlanResponse> {
  const now = deps.now();
  const { origin, destination, profile, arriveByDate: arriveBy } = req;
  const stayMinutes = req.stayMinutes ?? MODEL.defaultStayMin;
  const stayAssumed = req.stayMinutes === undefined;
  const routing = deps.routing;
  const car = profile.car;

  const warnings: PlanWarning[] = [];
  const unavailable: Unavailable[] = [];
  const drafts: Draft[] = [];
  let occupancySource: SourceRef | undefined;

  // Public transport (JUDU network: both ends inside the city).
  const transitTask = (async () => {
    if (!insideServiceArea(origin)) {
      unavailable.push({ strategy: "transit", code: "outside_transit_area", text: "Viešąjį transportą vertiname tik Vilniaus mieste (JUDU tinklas)." });
      return;
    }
    try {
      const it = await routing.transit(origin, destination, arriveBy);
      if (it) drafts.push(transitDraft(it, profile, routing.source.id));
      else unavailable.push({ strategy: "transit", code: "no_connection", text: "Viešojo transporto maršruto nerasta (per trumpas atstumas arba nėra jungties)." });
    } catch (err) {
      providerFailed("transit", err, warnings, unavailable);
    }
  })();

  // Car, with the destination's paid parking zone looked up in parallel.
  const zoneState: { lookup: ZoneLookup } = { lookup: undefined };
  const carTask = (async () => {
    if (!car.available) {
      unavailable.push({ strategy: "car", code: "no_car", text: "Profilyje nurodyta, kad automobilio neturite." });
      return;
    }
    const zonePromise = deps.parkingZones.zoneAt(destination).then(
      (zone) => ({ zone }),
      (err) => {
        console.error("Parking zone lookup failed:", err instanceof Error ? err.message : "unknown error");
        warnings.push({ code: "parking_zone_unavailable", text: "Nepavyko nustatyti stovėjimo zonos – automobilio kaina nežinoma." });
        return undefined;
      },
    );
    try {
      const [path, lookup] = await Promise.all([routing.drive(origin, destination, addMin(arriveBy, -30)), zonePromise]);
      zoneState.lookup = lookup;
      drafts.push(carDraft(origin, destination, arriveBy, stayMinutes, path, lookup, car, routing.source.id, deps.parkingZones.source.id));
    } catch (err) {
      providerFailed("car", err, warnings, unavailable);
    }
  })();

  // Car → P+R → public transport, from the official JUDU P+R sites on the way.
  const parkRideTask = (async () => {
    if (!car.available) {
      unavailable.push({ strategy: "park_and_ride", code: "no_car", text: "„Statyk ir važiuok“ reikia automobilio." });
      return;
    }
    const sites = deps.parkRide.sites
      .map((s) => ({ s, detour: onTheWay(s, origin, destination) }))
      .filter((x): x is { s: ParkRideSite; detour: number } => x.detour !== null)
      .sort((a, b) => a.detour - b.detour)
      .slice(0, 3)
      .map((x) => x.s);
    if (sites.length === 0) {
      unavailable.push({ strategy: "park_and_ride", code: "no_site_on_the_way", text: "Pakeliui nėra „Statyk ir važiuok“ aikštelės." });
      return;
    }
    // Availability is optional and never removes a route or changes its metrics.
    const occupancyPromise = deps.parkingAvailability?.snapshot().catch(() => null);
    try {
      const built = (await Promise.all(sites.map(async (site) => ({ site, draft: await parkAndRideDraft(site, origin, destination, arriveBy, car, deps) })))).filter(
        (entry): entry is { site: ParkRideSite; draft: Draft } => entry.draft !== null,
      );
      if (built.length === 0) {
        unavailable.push({ strategy: "park_and_ride", code: "no_connection", text: "Nuo „Statyk ir važiuok“ aikštelės viešojo transporto jungties nerasta." });
        return;
      }
      // One P+R option: the best site for this preference.
      const key = (d: Draft) =>
        profile.preference === "cheapest" ? (d.metrics.costEur ?? Infinity) : profile.preference === "greener" ? (d.metrics.co2Kg ?? Infinity) : d.metrics.durationMin;
      built.sort((a, b) => key(a.draft) - key(b.draft) || a.draft.metrics.durationMin - b.draft.metrics.durationMin);
      const selected = built[0];
      if (occupancyPromise) {
        const occupancy = await occupancyPromise;
        const availability = occupancy?.bySiteId[selected.site.id] ?? null;
        if (selected.draft.parking) selected.draft.parking.availability = availability;
        if (occupancy) {
          occupancySource = occupancy.source;
          selected.draft.sources.push(occupancy.source.id);
        }
        if (availability === null) warnings.push({
          code: "parking_availability_unknown",
          text: "„Statyk ir važiuok“ užimtumo duomenys nepasiekiami, pasenę arba netinkami – laisvų vietų skaičius nežinomas.",
        });
      }
      drafts.push(selected.draft);
    } catch (err) {
      providerFailed("park_and_ride", err, warnings, unavailable);
    }
  })();

  await Promise.all([transitTask, carTask, parkRideTask]);

  // Feasibility: lateness and the walking limit.
  const feasible = drafts.map((d) => {
    const late = applyLateness(d, now);
    return { ...late, feasibility: { ...late.feasibility, overWalk: late.metrics.walkMin > profile.maxWalkMin } };
  });

  // Recommendation.
  const candidates: Candidate[] = feasible.map((d) => ({
    id: d.id,
    strategy: d.strategy,
    durationMin: d.metrics.durationMin,
    costEur: d.metrics.costEur,
    co2Kg: d.metrics.co2Kg,
    lateMin: d.feasibility.lateMin,
    overWalk: d.feasibility.overWalk,
  }));
  const ranking = rank(candidates, profile.preference);
  const explainable = (d: Draft): Explainable => ({ id: d.id, strategy: d.strategy, metrics: d.metrics, parking: d.parking, feasibility: d.feasibility });

  let options: RouteOption[] = [];
  let recommendation: PlanResponse["recommendation"] = null;
  if (ranking) {
    const rec = feasible.find((d) => d.id === ranking.optionId)!;
    const others = feasible.filter((d) => d !== rec);
    const { sentence, reasons } = explainRecommendation(explainable(rec), others.map(explainable), profile.preference, ranking.rule, ranking.state);
    recommendation = { optionId: rec.id, preference: profile.preference, state: ranking.state, sentence, reasons, rule: ranking.rule };
    options = feasible.map((d) => {
      const by = d === rec ? undefined : feasible.find((o) => o.id === ranking.dominatedBy[d.id]);
      const summary = d === rec ? sentence : by ? summarizeDominated(explainable(d), explainable(by)) : summarizeAlternative(explainable(d), explainable(rec));
      return { ...d, status: d === rec ? "recommended" : by ? "dominated" : "alternative", ...(by ? { dominatedBy: by.id } : {}), summary };
    });
    const order = { recommended: 0, alternative: 1, dominated: 2 } as const;
    options.sort((a, b) => order[a.status] - order[b.status] || a.metrics.durationMin - b.metrics.durationMin);
  }

  // Provenance.
  const used = new Set(options.flatMap((o) => o.sources));
  const sources: SourceRef[] = [];
  if (used.has(routing.source.id)) sources.push(routing.source);
  if (used.has(FARES_SOURCE.id)) sources.push(FARES_SOURCE);
  if (used.has("judu-park-ride")) sources.push(deps.parkRide.source);
  if (occupancySource && used.has(occupancySource.id)) sources.push(occupancySource);
  if (used.has(deps.parkingZones.source.id)) sources.push({ ...deps.parkingZones.source, fetchedAt: now.toISOString() });
  if (used.has(CO2_SOURCE.id)) sources.push(CO2_SOURCE);
  if (used.has(ENERGY_PRICE_SOURCE.id)) sources.push(ENERGY_PRICE_SOURCE);

  const legBases = options.flatMap((o) => o.legs.filter((l) => l.mode !== "park").map((l) => l.basis));
  const demoLegs = legBases.filter((b) => b === "demo").length;
  const dataMode: DataMode = demoLegs === 0 ? "live" : demoLegs === legBases.length ? "demo" : "mixed";

  const assumptions: Assumption[] = [];
  if (routing.source.basis === "demo") {
    assumptions.push({ id: "demo_routing", text: "Maršrutų laikai, persėdimai ir geometrija – demonstraciniai (sintetiniai), ne JUDU tvarkaraštis." });
  }
  if (req.profileAssumed) assumptions.push({ id: "profile_default", text: "Profilis nenurodytas: laikoma, kad automobilio neturite, prioritetas – subalansuota." });
  const carUsed = options.some((o) => o.strategy !== "transit");
  if (carUsed && car.fuelPriceEur === undefined) {
    const p = DEFAULT_ENERGY_PRICE[car.fuel];
    assumptions.push({ id: "energy_price", text: `Kuro kaina – ${eur(p.eur)} už ${p.unit === "€/kWh" ? "kWh" : "litrą"} (prielaida).` });
  }
  const zoneLookup = zoneState.lookup;
  if (options.some((o) => o.strategy === "car")) {
    if (stayAssumed) assumptions.push({ id: "stay_default", text: `Laikoma, kad automobilis stovės ${hoursMinutes(stayMinutes)} (galite nurodyti kitą trukmę).` });
    const z = zoneLookup?.zone;
    assumptions.push({
      id: "car_park_buffer",
      text: `Automobiliui įskaičiuota ~${minutes(z ? MODEL.carParkAndWalkMin.paidZone : MODEL.carParkAndWalkMin.other)} vietai rasti ir nueiti.`,
    });
  }
  if (options.some((o) => o.strategy === "park_and_ride")) {
    assumptions.push({ id: "park_and_ride_ticket", text: `„Statyk ir važiuok“ bilietas (${eur(PARK_AND_RIDE_TICKET.eur)}) galioja iki dienos pabaigos: stovėjimas ir viešasis transportas vienam asmeniui.` });
  }
  if (profile.transitPass && options.some((o) => o.strategy === "transit")) {
    assumptions.push({ id: "transit_pass", text: "Turite periodinį bilietą – viešojo transporto kelionė papildomai nekainuoja." });
  }
  if (options.length > 0) assumptions.push({ id: "co2_proxy", text: "CO₂ – apytiksliai, pagal JK Vyriausybės 2025 m. koeficientus (Lietuvos dar nepatikrinti)." });
  if (zoneLookup?.zone) {
    assumptions.push({ id: "zone_tariff", text: `Stovėjimo tarifai – JUDU rinkliavos zonų duomenys (${PARKING_ZONES_SOURCE.verifiedOn}).` });
  }

  return {
    version: 1,
    generatedAt: now.toISOString(),
    dataMode,
    trip: { origin, destination, arriveBy: req.arriveBy, stayMinutes, stayAssumed },
    options,
    recommendation,
    unavailable,
    assumptions,
    sources,
    warnings,
  };
}
