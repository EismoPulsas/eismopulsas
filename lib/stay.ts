import { haversine, type LatLng } from "./geo";

// How long the car will stand at B, guessed rather than asked: what the user told us
// before for this place and time, what they actually did, what kind of place B is
// (an office in the morning means a workday) and finally the time of day.
// Long stays are what make "leave the car on the way and continue" worth suggesting.

export type StaySource = "override" | "habit" | "place" | "time" | "profile";
export type StayEstimate = { hours: number; reason: string; source: StaySource };
/** One remembered stay: where (B), when (bucket) and how long. */
export type StayRecord = { pos: LatLng; bucket: string; hours: number; at: string };
export type StayHabits = { overrides: StayRecord[]; observed: StayRecord[] };

export const STAY_CHOICES: { hours: number; label: string }[] = [
  { hours: 1, label: "1 val." },
  { hours: 3, label: "3 val." },
  { hours: 9, label: "Visa diena" },
  { hours: 14, label: "Per naktį" },
];

const SAME_PLACE_M = 200;
const MAX_HOURS = 24;

const isWeekend = (weekday: number) => weekday === 0 || weekday === 6;

/** Weekday or weekend × 3-hour band of the arrival, e.g. "wd-6" for a weekday 06:00–08:59. */
export function stayBucket(weekday: number, arriveSec: number): string {
  const h = Math.floor((((arriveSec % 86400) + 86400) % 86400) / 3600);
  return `${isWeekend(weekday) ? "we" : "wd"}-${Math.floor(h / 3) * 3}`;
}

type Group = "work" | "study" | "school" | "mall" | "shop" | "errand" | "hospital" | "clinic" | "culture" | "food" | "fastfood" | "sport" | "station" | "airport";

// Photon returns the OSM key=value of the place found ("office=company", "shop=mall"…).
const GROUPS: [RegExp, Group][] = [
  [/^office=|^amenity=(townhall|courthouse|embassy)$|^building=(office|commercial|industrial)$|^landuse=(industrial|commercial)$|^man_made=works$/, "work"],
  [/^amenity=(university|college)$|^building=university$/, "study"],
  [/^amenity=(school|kindergarten|childcare)$/, "school"],
  [/^shop=(mall|department_store)$/, "mall"],
  [/^shop=/, "shop"],
  [/^amenity=(bank|post_office|pharmacy|car_wash|fuel)$/, "errand"],
  [/^amenity=hospital$|^healthcare=hospital$/, "hospital"],
  [/^amenity=(clinic|doctors|dentist)$|^healthcare=/, "clinic"],
  [/^amenity=(cinema|theatre|arts_centre|concert_hall)$|^leisure=stadium$|^tourism=museum$/, "culture"],
  [/^amenity=(restaurant|cafe|bar|pub|biergarten)$/, "food"],
  [/^amenity=fast_food$/, "fastfood"],
  [/^leisure=(fitness_centre|sports_centre|sports_hall|swimming_pool|ice_rink)$/, "sport"],
  [/^railway=(station|halt)$|^amenity=bus_station$|^public_transport=station$/, "station"],
  [/^aeroway=(aerodrome|terminal)$/, "airport"],
];

export function placeGroup(cat: string | null | undefined): Group | null {
  if (!cat) return null;
  return GROUPS.find(([re]) => re.test(cat))?.[1] ?? null;
}

/** Until 17:30, but at least 6 and at most 10 hours. */
const workday = (arriveH: number) => Math.min(10, Math.max(6, 17.5 - arriveH));

function byPlace(g: Group, weekday: number, arriveH: number): { hours: number; label: string } {
  const morning = !isWeekend(weekday) && arriveH >= 6 && arriveH < 11;
  switch (g) {
    case "work":
      return morning ? { hours: workday(arriveH), label: "darbovietė, rytas" } : { hours: 3, label: "darbovietė" };
    case "study":
      return morning ? { hours: 6, label: "universitetas, rytas" } : { hours: 2, label: "universitetas" };
    case "school":
      return { hours: 0.25, label: "palydėti į mokyklą ar darželį" };
    case "mall":
      return { hours: 2, label: "prekybos centras" };
    case "shop":
      return { hours: 0.75, label: "parduotuvė" };
    case "errand":
      return { hours: 0.5, label: "trumpas reikalas" };
    case "hospital":
      return { hours: 3, label: "ligoninė" };
    case "clinic":
      return { hours: 1.5, label: "gydymo įstaiga" };
    case "culture":
      return { hours: 3, label: "renginys" };
    case "food":
      return { hours: 1.5, label: "kavinė ar restoranas" };
    case "fastfood":
      return { hours: 0.5, label: "greitas maistas" };
    case "sport":
      return { hours: 1.5, label: "sporto klubas" };
    case "station":
      return { hours: 10, label: "stotis – išvykstate" };
    case "airport":
      return { hours: MAX_HOURS, label: "oro uostas" };
  }
}

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const near = (r: StayRecord, pos: LatLng, bucket: string) => r.bucket === bucket && haversine(r.pos, pos) <= SAME_PLACE_M;

export function estimateStay(q: {
  to: LatLng;
  cat?: string | null;
  weekday: number;
  /** Arrival at B, seconds after local midnight. */
  arriveSec: number;
  habits: StayHabits;
  profileHours: number;
}): StayEstimate {
  const bucket = stayBucket(q.weekday, q.arriveSec);
  const arriveH = (((q.arriveSec % 86400) + 86400) % 86400) / 3600;

  // 1. What the user picked last time for this place at this time of the week.
  const override = q.habits.overrides.filter((r) => near(r, q.to, bucket)).sort((a, b) => b.at.localeCompare(a.at))[0];
  if (override) return { hours: override.hours, reason: "kaip nurodėte anksčiau", source: "override" };

  // 2. What they actually did: the next trip from here came this many hours later.
  const seen = q.habits.observed.filter((r) => near(r, q.to, bucket));
  if (seen.length >= 2) return { hours: Math.round(median(seen.map((r) => r.hours)) * 2) / 2, reason: "kaip įprastai", source: "habit" };

  // 3. The kind of place.
  const g = placeGroup(q.cat);
  if (g) {
    const p = byPlace(g, q.weekday, arriveH);
    return { hours: Math.min(MAX_HOURS, p.hours), reason: p.label, source: "place" };
  }

  // 4. A weekday morning trip to somewhere unknown is most often the way to work.
  if (!isWeekend(q.weekday) && arriveH >= 6 && arriveH < 10) return { hours: workday(arriveH), reason: "darbo dienos rytas – gal į darbą?", source: "time" };

  return { hours: q.profileHours, reason: "pagal profilį", source: "profile" };
}

/** "45 min", "2 val.", "9,5 val." */
export function fmtStayHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} min`;
  return `${String(Math.round(h * 2) / 2).replace(".", ",")} val.`;
}
