export type LatLng = [number, number];

/** Lithuania with a small margin; the map and the API refuse anything outside. */
export const LT_BOUNDS: [LatLng, LatLng] = [
  [53.85, 20.9],
  [56.47, 26.9],
];
export const inLithuania = ([lat, lng]: LatLng) =>
  lat >= LT_BOUNDS[0][0] && lat <= LT_BOUNDS[1][0] && lng >= LT_BOUNDS[0][1] && lng <= LT_BOUNDS[1][1];

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversine(a: LatLng, b: LatLng): number {
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function lineLength(pts: LatLng[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += haversine(pts[i - 1], pts[i]);
  return s;
}

// Flat metric projection around Lithuania (error < 1 % over the country) for
// point-to-segment distances, where haversine would be overkill.
const KX = 111320 * Math.cos(rad(55.2));
const KY = 110540;
export const toXY = ([lat, lng]: LatLng): [number, number] => [lng * KX, lat * KY];

/** Distance in metres from p to segment a–b. */
export function segDistance(p: LatLng, a: LatLng, b: LatLng): number {
  const [px, py] = toXY(p);
  const [ax, ay] = toXY(a);
  const [bx, by] = toXY(b);
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(ax + t * dx - px, ay + t * dy - py);
}

/** Compass bearing in degrees, 0 = north. */
export function bearing(a: LatLng, b: LatLng): number {
  const [ax, ay] = toXY(a);
  const [bx, by] = toXY(b);
  return (Math.atan2(bx - ax, by - ay) * 180) / Math.PI;
}

export function decodePolyline(str: string): LatLng[] {
  const out: LatLng[] = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  while (i < str.length) {
    for (let k = 0; k < 2; k++) {
      let shift = 0;
      let result = 0;
      let b: number;
      do {
        b = str.charCodeAt(i++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (k === 0) lat += d;
      else lng += d;
    }
    out.push([lat / 1e5, lng / 1e5]);
  }
  return out;
}

/** Douglas–Peucker in metres; keeps payloads small for long car routes. */
export function simplify(pts: LatLng[], tol: number): LatLng[] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let best = -1;
    let bestD = tol;
    for (let i = a + 1; i < b; i++) {
      const d = segDistance(pts[i], pts[a], pts[b]);
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best > 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Ray casting; `ring` is [lat, lng][]. */
export function inRing(p: LatLng, ring: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i];
    const [yj, xj] = ring[j];
    if (yi > p[0] !== yj > p[0] && p[1] < ((xj - xi) * (p[0] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function inPolygon(p: LatLng, rings: LatLng[][]): boolean {
  if (!rings.length || !inRing(p, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) if (inRing(p, rings[i])) return false;
  return true;
}

// LKS-94 (EPSG:3346, Transverse Mercator on GRS80) -> WGS84 lat/lng.
export function lks94ToWgs84(x: number, y: number): LatLng {
  const a = 6378137;
  const f = 1 / 298.257222101;
  const k0 = 0.9998;
  const lon0 = (24 * Math.PI) / 180;
  const e2 = f * (2 - f);
  const ep2 = e2 / (1 - e2);
  const M = y / k0;
  const mu = M / (a * (1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const s = Math.sin(phi1);
  const c = Math.cos(phi1);
  const t = Math.tan(phi1);
  const N1 = a / Math.sqrt(1 - e2 * s * s);
  const R1 = (a * (1 - e2)) / (1 - e2 * s * s) ** 1.5;
  const C1 = ep2 * c * c;
  const T1 = t * t;
  const D = (x - 500000) / (N1 * k0);
  const lat =
    phi1 -
    ((N1 * t) / R1) *
      ((D * D) / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6) / 720);
  const lng =
    lon0 +
    (D - ((1 + 2 * T1 + C1) * D ** 3) / 6 + ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5) / 120) / c;
  return [(lat * 180) / Math.PI, (lng * 180) / Math.PI];
}

/** Uniform grid over lat/lng for "what is near this point" lookups. */
export class Grid<T> {
  private cells = new Map<number, T[]>();
  constructor(private size = 0.005) {}
  private key(lat: number, lng: number) {
    return Math.floor(lat / this.size) * 100000 + Math.floor(lng / (this.size * 1.75));
  }
  add(p: LatLng, item: T) {
    const k = this.key(p[0], p[1]);
    const cell = this.cells.get(k);
    if (cell) cell.push(item);
    else this.cells.set(k, [item]);
  }
  /** Items in cells overlapping a box of `radius` metres around p. */
  near(p: LatLng, radius: number): T[] {
    const dLat = radius / 110540;
    const dLng = radius / (111320 * Math.cos(rad(p[0])));
    const out: T[] = [];
    const lat0 = Math.floor((p[0] - dLat) / this.size);
    const lat1 = Math.floor((p[0] + dLat) / this.size);
    const lng0 = Math.floor((p[1] - dLng) / (this.size * 1.75));
    const lng1 = Math.floor((p[1] + dLng) / (this.size * 1.75));
    for (let a = lat0; a <= lat1; a++)
      for (let b = lng0; b <= lng1; b++) {
        const cell = this.cells.get(a * 100000 + b);
        if (cell) for (const it of cell) out.push(it);
      }
    return out;
  }
}
