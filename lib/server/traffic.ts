import "server-only";
import { Grid, bearing, haversine, lks94ToWgs84, segDistance, type LatLng } from "../geo";
import type { TrafficInfo } from "../plan-types";

// Live traffic from Via Lietuva's eismoinfo.lt intensity service: every 15 min,
// per road sensor and direction, the number of vehicles and their average speed.
// It covers national roads and city entrances, not city streets, so inside the
// big cities we add a peak-hour estimate on top.

const SOURCE = "https://eismoinfo.lt/traffic-intensity-service";

export type Sensor = {
  id: number;
  name: string;
  road: string;
  pos: LatLng;
  segments: {
    dir: "FORWARD" | "BACKWARD";
    a: LatLng;
    b: LatLng;
    speed: number;
    limit: number;
    vehicles: number;
    type: string;
  }[];
  time: string;
};

type RawSensor = {
  id: number;
  name: string;
  roadNr: string;
  roadName: string;
  x: number;
  y: number;
  date: string;
  roadSegments: {
    direction: "FORWARD" | "BACKWARD";
    winterSpeed: number;
    summerSpeed: number;
    numberOfVehicles: number;
    averageSpeed: number;
    trafficType: string;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  }[];
};

type Cache = { at: number; sensors: Sensor[]; grid: Grid<Sensor> };
let cache: Cache | null = null;
let inflight: Promise<Cache> | null = null;

export async function liveSensors(): Promise<Cache> {
  if (cache && Date.now() - cache.at < 5 * 60 * 1000) return cache;
  inflight ??= (async () => {
    try {
      const res = await fetch(SOURCE, { headers: { "User-Agent": "EismoPulsas/0.2" }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`eismoinfo ${res.status}`);
      const raw = (await res.json()) as RawSensor[];
      const winter = [11, 12, 1, 2, 3].includes(new Date().getUTCMonth() + 1);
      const sensors: Sensor[] = raw.map((s) => ({
        id: s.id,
        name: s.name,
        road: `${s.roadNr} ${s.roadName}`.trim(),
        pos: [s.x, s.y],
        time: s.date,
        segments: s.roadSegments.map((g) => ({
          dir: g.direction,
          a: lks94ToWgs84(g.startX, g.startY),
          b: lks94ToWgs84(g.endX, g.endY),
          speed: g.averageSpeed,
          limit: winter ? g.winterSpeed : g.summerSpeed,
          vehicles: g.numberOfVehicles,
          type: g.trafficType,
        })),
      }));
      const grid = new Grid<Sensor>(0.02);
      for (const s of sensors) for (const g of s.segments) for (const p of [g.a, g.b, s.pos]) grid.add(p, s);
      cache = { at: Date.now(), sensors, grid };
    } catch (err) {
      console.error("eismoinfo.lt unavailable:", err);
      // Keep serving stale data rather than nothing.
      if (!cache) cache = { at: Date.now() - 4 * 60 * 1000, sensors: [], grid: new Grid<Sensor>(0.02) };
    } finally {
      inflight = null;
    }
    return cache!;
  })();
  return inflight;
}

// ---------------------------------------------------------------- city peak estimate

// Extra driving time in city streets compared with free flow, by time of day.
// Rough figures in line with TomTom Traffic Index congestion levels for
// Lithuanian cities; the UI labels them as an estimate.
const CITIES = [
  { name: "Vilnius", c: [54.6872, 25.2797] as LatLng, r: 11000, peak: 0.55, day: 0.2 },
  { name: "Kaunas", c: [54.8985, 23.9036] as LatLng, r: 9000, peak: 0.4, day: 0.15 },
  { name: "Klaipėda", c: [55.7033, 21.1443] as LatLng, r: 7000, peak: 0.3, day: 0.1 },
  { name: "Šiauliai", c: [55.9349, 23.3137] as LatLng, r: 5500, peak: 0.2, day: 0.07 },
  { name: "Panevėžys", c: [55.7348, 24.3575] as LatLng, r: 5500, peak: 0.2, day: 0.07 },
  { name: "Alytus", c: [54.3963, 24.0459] as LatLng, r: 4500, peak: 0.15, day: 0.05 },
];

export function peakOf(weekday: number, sec: number): TrafficInfo["peak"] {
  const h = sec / 3600;
  if (h < 6 || h >= 22) return "night";
  const workday = weekday >= 1 && weekday <= 5;
  if (workday && ((h >= 7 && h < 9.5) || (h >= 16 && h < 18.5))) return "peak";
  return "day";
}

export const cityAt = (p: LatLng) => CITIES.find((c) => haversine(p, c.c) <= c.r) ?? null;

/**
 * Adjust OSRM's free-flow segment durations for traffic. `coords` and
 * `durations` come from OSRM annotations (durations[i] is coords[i]→coords[i+1]).
 */
export async function applyTraffic(
  coords: LatLng[],
  durations: number[],
  weekday: number,
  sec: number,
  isNow: boolean,
): Promise<{ extra: number; info: TrafficInfo }> {
  const peak = peakOf(weekday, sec);
  const live = isNow ? await liveSensors() : null;
  const used = new Map<string, TrafficInfo["sensors"][number]>();
  let urbanDelay = 0;
  let liveDelay = 0;
  let cityName: string | null = null;

  for (let i = 0; i < durations.length; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    const d = durations[i];
    if (!b || !d) continue;
    const mid: LatLng = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

    let handled = false;
    if (live) {
      const dir = bearing(a, b);
      for (const s of live.grid.near(mid, 60)) {
        for (const g of s.segments) {
          if (g.vehicles < 3 || g.speed <= 0 || !g.limit) continue;
          if (segDistance(mid, g.a, g.b) > 35) continue;
          // FORWARD runs from the segment's start to its end.
          const segDir = g.dir === "FORWARD" ? bearing(g.a, g.b) : bearing(g.b, g.a);
          const diff = Math.abs(((dir - segDir + 540) % 360) - 180);
          if (diff > 60) continue;
          // OSRM assumes roughly the posted speed; scale by how far below it traffic runs.
          const factor = Math.min(4, Math.max(0.85, (g.limit * 0.95) / g.speed));
          liveDelay += d * (factor - 1);
          used.set(`${s.id}-${g.dir}`, { name: s.name, road: s.road, speed: Math.round(g.speed), limit: g.limit, vehicles: g.vehicles });
          handled = true;
          break;
        }
        if (handled) break;
      }
    }
    if (handled) continue;

    const city = cityAt(mid);
    if (city && peak !== "night") {
      urbanDelay += d * (peak === "peak" ? city.peak : city.day);
      cityName ??= city.name;
    }
  }

  return {
    extra: Math.round(urbanDelay + liveDelay),
    info: {
      source: used.size ? "live" : "typical",
      sensors: [...used.values()],
      urbanDelay: Math.round(urbanDelay),
      liveDelay: Math.round(liveDelay),
      city: cityName,
      peak,
    },
  };
}
