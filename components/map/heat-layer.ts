import L from "leaflet";

// Minimal canvas heatmap: stamps a blurred circle per point into an alpha
// buffer, then colours the buffer through a gradient. Redrawn on pan/zoom.

export type HeatPoint = [lat: number, lng: number, weight: number];

const GRADIENT: [number, string][] = [
  [0.0, "rgba(40, 10, 90, 0)"],
  [0.25, "#4c1d95"],
  [0.5, "#be123c"],
  [0.75, "#fb923c"],
  [1.0, "#fef3c7"],
];

function makePalette(): Uint8ClampedArray {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 1;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 256, 0);
  for (const [stop, color] of GRADIENT) g.addColorStop(stop, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 1);
  return ctx.getImageData(0, 0, 256, 1).data;
}

function makeStamp(radius: number, blur: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  const r = radius + blur;
  c.width = c.height = r * 2;
  const ctx = c.getContext("2d")!;
  // Draw the circle off-canvas and keep only its blurred shadow.
  ctx.shadowOffsetX = ctx.shadowOffsetY = r * 2;
  ctx.shadowBlur = blur;
  ctx.shadowColor = "black";
  ctx.beginPath();
  ctx.arc(-r, -r, radius, 0, Math.PI * 2);
  ctx.fill();
  return c;
}

export class HeatLayer extends L.Layer {
  private points: HeatPoint[] = [];
  private canvas: HTMLCanvasElement | null = null;
  private palette: Uint8ClampedArray | null = null;
  private frame = 0;

  setPoints(points: HeatPoint[]) {
    this.points = points;
    this.schedule();
    return this;
  }

  onAdd(map: L.Map) {
    this.canvas = L.DomUtil.create("canvas", "ep-heat leaflet-zoom-hide") as HTMLCanvasElement;
    this.canvas.style.pointerEvents = "none";
    map.getPanes().overlayPane.appendChild(this.canvas);
    map.on("moveend zoomend resize", this.schedule, this);
    this.schedule();
    return this;
  }

  onRemove(map: L.Map) {
    cancelAnimationFrame(this.frame);
    map.off("moveend zoomend resize", this.schedule, this);
    this.canvas?.remove();
    this.canvas = null;
    return this;
  }

  private schedule() {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.draw());
  }

  private draw() {
    const map = this._map;
    const canvas = this.canvas;
    if (!map || !canvas) return;
    const size = map.getSize();
    canvas.width = size.x;
    canvas.height = size.y;
    L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]));

    const zoom = map.getZoom();
    // Radius grows with zoom so city streets stay readable.
    const radius = Math.max(7, Math.min(24, 7 + (zoom - 7) * 2.2));
    const blur = radius * 1.1;
    const stamp = makeStamp(radius, blur);
    const r = radius + blur;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.clearRect(0, 0, size.x, size.y);

    // Bin into a coarse pixel grid first, so 100k points stay fast and the
    // brightest cell sets the scale.
    const cell = Math.max(2, Math.round(radius / 2));
    const grid = new Map<number, [number, number, number]>();
    const bounds = map.getBounds().pad(0.15);
    for (const [lat, lng, w] of this.points) {
      if (!bounds.contains([lat, lng])) continue;
      const p = map.latLngToContainerPoint([lat, lng]);
      const gx = Math.floor(p.x / cell);
      const gy = Math.floor(p.y / cell);
      const key = gx * 100000 + gy;
      const g = grid.get(key);
      if (g) {
        g[0] += p.x * w;
        g[1] += p.y * w;
        g[2] += w;
      } else grid.set(key, [p.x * w, p.y * w, w]);
    }
    let max = 1;
    for (const g of grid.values()) max = Math.max(max, g[2]);
    // Soften the scale: a few extreme cells shouldn't wash out the rest.
    const scale = Math.max(1, max * 0.4);
    for (const [sx, sy, w] of grid.values()) {
      ctx.globalAlpha = Math.min(1, Math.max(0.12, Math.sqrt(w / scale)));
      ctx.drawImage(stamp, sx / w - r, sy / w - r);
    }

    const img = ctx.getImageData(0, 0, size.x, size.y);
    const px = img.data;
    const pal = (this.palette ??= makePalette());
    for (let i = 3; i < px.length; i += 4) {
      const a = px[i];
      if (!a) continue;
      const j = a * 4;
      px[i - 3] = pal[j];
      px[i - 2] = pal[j + 1];
      px[i - 1] = pal[j + 2];
      px[i] = Math.min(255, a * 1.4);
    }
    ctx.putImageData(img, 0, 0);
  }
}
