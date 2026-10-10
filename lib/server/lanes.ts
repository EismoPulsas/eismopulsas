import "server-only";
import fs from "node:fs";
import path from "node:path";
import { Grid, haversine, segDistance, type LatLng } from "../geo";

// Bus lanes (Vilnius A / A+ from SĮSP, elsewhere OpenStreetMap), indexed by
// segment so a route can be checked against them quickly.

type Seg = [LatLng, LatLng];
let grid: Grid<Seg> | null = null;

function load(): Grid<Seg> {
  if (grid) return grid;
  const file = path.join(process.cwd(), "public", "data", "bus-lanes.json");
  const { lanes } = JSON.parse(fs.readFileSync(file, "utf8")) as { lanes: { c: LatLng[] }[] };
  grid = new Grid<Seg>(0.002);
  for (const lane of lanes)
    for (let i = 1; i < lane.c.length; i++) {
      const seg: Seg = [lane.c[i - 1], lane.c[i]];
      // Register long segments in every cell they cross.
      const steps = Math.max(1, Math.ceil(haversine(seg[0], seg[1]) / 25));
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        grid.add([seg[0][0] + (seg[1][0] - seg[0][0]) * t, seg[0][1] + (seg[1][1] - seg[0][1]) * t], seg);
      }
    }
  return grid;
}

const NEAR = 15; // metres from the lane's centreline

/** Metres of `line` that run along a street with a bus lane. */
export function laneMetersAlong(line: LatLng[]): number {
  const g = load();
  let total = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const len = haversine(a, b);
    if (!len) continue;
    // Sample every ~20 m; each sample stands for its share of the segment.
    const n = Math.max(1, Math.round(len / 20));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const p: LatLng = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      if (g.near(p, 40).some((s) => segDistance(p, s[0], s[1]) <= NEAR)) total += len / n;
    }
  }
  return total;
}
