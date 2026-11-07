// Layered canvas renderer for one page:
//   bg    template lines or the PDF page bitmap
//   hl    committed highlighter strokes (CSS opacity makes them translucent, beneath ink)
//   ink   committed pen strokes — a cached bitmap; new strokes are drawn incrementally
//   live  the stroke in progress, predicted points, lasso/selection/eraser overlays
// Full redraws only happen on erase/undo/move/zoom; adding a stroke costs one fill.

import { outlineFor, outlineToPath, strokePath } from "./strokePath.ts";
import type { InkPoint, Stroke, StrokeKind } from "./model.ts";

export type Layers = { bg: HTMLCanvasElement; hl: HTMLCanvasElement; ink: HTMLCanvasElement; live: HTMLCanvasElement };

export type RedrawOptions = {
  hiddenIds?: ReadonlySet<string> | null;
  /** Replay fade: strokes written after this lecture time draw faintly. */
  fadeAfterSec?: number | null;
};

// Keep each canvas under ~16M device pixels so deep zoom stays within memory.
const MAX_PIXELS = 16_000_000;
const FADED_ALPHA = 0.12;
export const HIGHLIGHTER_OPACITY = 0.42;

export class PageRenderer {
  private scale = 1;
  private zoom = 1;
  private readonly ctx: Record<keyof Layers, CanvasRenderingContext2D>;
  lastRedrawMs = 0;

  constructor(
    private readonly layers: Layers,
    readonly width: number,
    readonly height: number
  ) {
    const get = (c: HTMLCanvasElement, low = false) =>
      (c.getContext("2d", low ? { desynchronized: true } : undefined) ?? c.getContext("2d"))!;
    this.ctx = { bg: get(layers.bg), hl: get(layers.hl), ink: get(layers.ink), live: get(layers.live, true) };
    layers.hl.style.opacity = String(HIGHLIGHTER_OPACITY);
  }

  get devicePixelScale(): number {
    return this.scale;
  }

  /** Resizes every layer for a zoom level (crisp on HiDPI). Clears all layers. */
  setZoom(zoom: number): void {
    this.zoom = zoom;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const cap = Math.sqrt(MAX_PIXELS / (this.width * this.height));
    this.scale = Math.min(zoom * dpr, cap);
    for (const key of Object.keys(this.layers) as (keyof Layers)[]) {
      const c = this.layers[key];
      c.width = Math.round(this.width * this.scale);
      c.height = Math.round(this.height * this.scale);
      c.style.width = `${this.width * zoom}px`;
      c.style.height = `${this.height * zoom}px`;
      this.ctx[key].setTransform(this.scale, 0, 0, this.scale, 0, 0);
    }
  }

  get currentZoom(): number {
    return this.zoom;
  }

  drawBackground(paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): void {
    const ctx = this.ctx.bg;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.layers.bg.width, this.layers.bg.height);
    ctx.restore();
    paint(ctx, this.width, this.height);
  }

  private clear(key: keyof Layers): void {
    const ctx = this.ctx[key];
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.layers[key].width, this.layers[key].height);
    ctx.restore();
  }

  private paint(stroke: Stroke, alpha = 1): void {
    const ctx = stroke.kind === "highlighter" ? this.ctx.hl : this.ctx.ink;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = stroke.color;
    ctx.fill(strokePath(stroke));
    ctx.globalAlpha = 1;
  }

  /** Full redraw of committed ink. */
  redraw(strokes: readonly Stroke[], opts: RedrawOptions = {}): void {
    const t0 = performance.now();
    this.clear("hl");
    this.clear("ink");
    const fade = opts.fadeAfterSec;
    for (const s of strokes) {
      if (opts.hiddenIds?.has(s.id)) continue;
      const faded = fade != null && s.t != null && s.t > fade;
      this.paint(s, faded ? FADED_ALPHA : 1);
    }
    this.lastRedrawMs = performance.now() - t0;
  }

  /** Incremental: draw one newly committed stroke onto the cached layer. */
  append(stroke: Stroke): void {
    this.paint(stroke);
  }

  clearLive(): void {
    this.clear("live");
  }

  /** Draws the in-progress stroke (plus predicted points, which are never stored). */
  drawLive(
    points: readonly InkPoint[],
    style: { kind: StrokeKind; color: string; width: number; simulatePressure: boolean },
    predicted: readonly InkPoint[] = []
  ): void {
    this.clearLive();
    if (points.length === 0) return;
    const all = predicted.length ? [...points, ...predicted] : points;
    const path = outlineToPath(outlineFor(all, style, false));
    const ctx = this.ctx.live;
    ctx.globalAlpha = style.kind === "highlighter" ? HIGHLIGHTER_OPACITY : 1;
    ctx.fillStyle = style.color;
    ctx.fill(path);
    ctx.globalAlpha = 1;
  }

  /** Draws strokes translated on the live layer (lasso move preview). */
  drawMoving(strokes: readonly Stroke[], dx: number, dy: number): void {
    const ctx = this.ctx.live;
    ctx.save();
    ctx.translate(dx, dy);
    for (const s of strokes) {
      ctx.globalAlpha = s.kind === "highlighter" ? HIGHLIGHTER_OPACITY : 1;
      ctx.fillStyle = s.color;
      ctx.fill(strokePath(s));
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** Free-form overlay drawing on the live layer (page units). */
  overlay(draw: (ctx: CanvasRenderingContext2D, zoom: number) => void): void {
    draw(this.ctx.live, this.zoom);
  }

  /** Renders strokes to a standalone canvas (used for cropping ink to PNG). */
  static renderToCanvas(strokes: readonly Stroke[], box: { minX: number; minY: number; maxX: number; maxY: number }, scale: number, pad: number): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round((box.maxX - box.minX + pad * 2) * scale));
    c.height = Math.max(1, Math.round((box.maxY - box.minY + pad * 2) * scale));
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.setTransform(scale, 0, 0, scale, (pad - box.minX) * scale, (pad - box.minY) * scale);
    for (const s of strokes) {
      if (s.kind === "highlighter") continue; // transcribe the writing, not the highlight
      ctx.fillStyle = "#000000";
      ctx.fill(strokePath(s));
    }
    return c;
  }
}
