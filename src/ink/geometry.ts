// Pure geometry helpers for ink: bounding boxes, hit testing, lasso, partial
// erase, and grouping strokes into lines. No DOM — unit-tested under node.

import type { BBox, InkPoint, Stroke } from "./model.ts";

export function bboxOf(points: readonly InkPoint[], pad = 0): BBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

export function unionBBox(boxes: readonly BBox[]): BBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.minX);
    minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX);
    maxY = Math.max(maxY, b.maxY);
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

export const bw = (b: BBox) => b.maxX - b.minX;
export const bh = (b: BBox) => b.maxY - b.minY;
export const bcx = (b: BBox) => (b.minX + b.maxX) / 2;
export const bcy = (b: BBox) => (b.minY + b.maxY) / 2;

export function bboxIntersects(a: BBox, b: BBox, pad = 0): boolean {
  return a.minX - pad <= b.maxX && b.minX - pad <= a.maxX && a.minY - pad <= b.maxY && b.minY - pad <= a.maxY;
}

export function verticalOverlap(a: BBox, b: BBox): number {
  return Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY));
}

export function horizontalGap(a: BBox, b: BBox): number {
  if (a.maxX < b.minX) return b.minX - a.maxX;
  if (b.maxX < a.minX) return a.minX - b.maxX;
  return 0;
}

function distToSegmentSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  let t = len === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx - px;
  const cy = ay + t * dy - py;
  return cx * cx + cy * cy;
}

/** True when (x, y) is within `radius` of the stroke's centerline (plus its own half width). */
export function strokeHit(stroke: Stroke, x: number, y: number, radius: number): boolean {
  const r = radius + stroke.width / 2;
  const b = stroke.bbox;
  if (x < b.minX - r || x > b.maxX + r || y < b.minY - r || y > b.maxY + r) return false;
  const r2 = r * r;
  const pts = stroke.points;
  if (pts.length === 1) {
    const dx = pts[0][0] - x;
    const dy = pts[0][1] - y;
    return dx * dx + dy * dy <= r2;
  }
  for (let i = 1; i < pts.length; i++) {
    if (distToSegmentSq(x, y, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]) <= r2) return true;
  }
  return false;
}

/** Finds the topmost stroke under a point (last drawn wins). */
export function topStrokeAt(strokes: readonly Stroke[], x: number, y: number, radius: number): Stroke | null {
  for (let i = strokes.length - 1; i >= 0; i--) {
    if (strokeHit(strokes[i], x, y, radius)) return strokes[i];
  }
  return null;
}

export function pointInPolygon(x: number, y: number, poly: readonly [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** A stroke is lassoed when at least half of its (sampled) points fall inside. */
export function strokeInLasso(stroke: Stroke, poly: readonly [number, number][]): boolean {
  if (poly.length < 3) return false;
  const step = Math.max(1, Math.floor(stroke.points.length / 24));
  let inside = 0;
  let total = 0;
  for (let i = 0; i < stroke.points.length; i += step) {
    total++;
    if (pointInPolygon(stroke.points[i][0], stroke.points[i][1], poly)) inside++;
  }
  return total > 0 && inside / total >= 0.5;
}

/**
 * Partial erase: removes the parts of a stroke within `radius` of (x, y) and
 * returns the surviving pieces (each needs at least 2 points), or null when
 * the eraser doesn't touch the stroke.
 */
export function eraseFromStroke(
  stroke: Stroke,
  x: number,
  y: number,
  radius: number
): InkPoint[][] | null {
  if (!strokeHit(stroke, x, y, radius)) return null;
  const r = radius + stroke.width / 2;
  const r2 = r * r;
  const pieces: InkPoint[][] = [];
  let current: InkPoint[] = [];
  for (const p of densify(stroke.points, Math.max(1, r / 2))) {
    const dx = p[0] - x;
    const dy = p[1] - y;
    if (dx * dx + dy * dy <= r2) {
      if (current.length >= 2) pieces.push(current);
      current = [];
    } else {
      current.push(p);
    }
  }
  if (current.length >= 2) pieces.push(current);
  return pieces;
}

/** Inserts points so no gap is longer than `maxGap` (keeps partial erase precise). */
export function densify(points: readonly InkPoint[], maxGap: number): InkPoint[] {
  if (points.length < 2) return points.slice();
  const out: InkPoint[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const [ax, ay, ap] = points[i - 1];
    const [bx, by, bp] = points[i];
    const d = Math.hypot(bx - ax, by - ay);
    const n = Math.floor(d / maxGap);
    for (let k = 1; k <= n; k++) {
      const t = k / (n + 1);
      out.push([ax + (bx - ax) * t, ay + (by - ay) * t, ap + (bp - ap) * t]);
    }
    out.push(points[i]);
  }
  return out;
}

export function translatePoints(points: readonly InkPoint[], dx: number, dy: number): InkPoint[] {
  return points.map(([x, y, p]) => [x + dx, y + dy, p]);
}

export function pathLength(points: readonly InkPoint[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  return len;
}

/** Inserts a stroke keeping the array sorted by createdAt (z-order). */
export function insertSorted(strokes: Stroke[], stroke: Stroke): void {
  let lo = 0;
  let hi = strokes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (strokes[mid].createdAt <= stroke.createdAt) lo = mid + 1;
    else hi = mid;
  }
  strokes.splice(lo, 0, stroke);
}

export type InkLine = { strokeIds: string[]; bbox: BBox };

/**
 * Groups strokes into text lines by bounding-box proximity: strokes whose
 * vertical extents overlap enough join the same band, and a band splits into
 * separate lines where the horizontal gap is large relative to its height.
 */
export function groupIntoLines(strokes: readonly Stroke[]): InkLine[] {
  const items = strokes
    .filter((s) => s.kind === "pen")
    .map((s) => ({ id: s.id, b: s.bbox }))
    .sort((a, b) => bcy(a.b) - bcy(b.b));

  type Band = { ids: string[]; box: BBox; boxes: BBox[] };
  const bands: Band[] = [];
  for (const item of items) {
    let best: Band | null = null;
    let bestScore = 0;
    for (const band of bands) {
      const ov = verticalOverlap(band.box, item.b);
      const ref = Math.max(1, Math.min(bh(item.b), medianHeight(band.boxes)));
      const score = ov / ref;
      if (score > 0.4 && score > bestScore) {
        best = band;
        bestScore = score;
      }
    }
    if (best) {
      best.ids.push(item.id);
      best.boxes.push(item.b);
      best.box = unionBBox([best.box, item.b]);
    } else {
      bands.push({ ids: [item.id], box: item.b, boxes: [item.b] });
    }
  }

  const lines: InkLine[] = [];
  const byId = new Map(items.map((i) => [i.id, i.b]));
  for (const band of bands) {
    const sorted = band.ids.slice().sort((a, b) => byId.get(a)!.minX - byId.get(b)!.minX);
    const h = Math.max(8, medianHeight(band.boxes));
    let chunk: string[] = [];
    let chunkBox: BBox | null = null;
    for (const id of sorted) {
      const b = byId.get(id)!;
      if (chunkBox && b.minX - chunkBox.maxX > h * 3) {
        lines.push({ strokeIds: chunk, bbox: chunkBox });
        chunk = [];
        chunkBox = null;
      }
      chunk.push(id);
      chunkBox = chunkBox ? unionBBox([chunkBox, b]) : b;
    }
    if (chunkBox) lines.push({ strokeIds: chunk, bbox: chunkBox });
  }
  return lines;
}

function medianHeight(boxes: readonly BBox[]): number {
  const hs = boxes.map(bh).sort((a, b) => a - b);
  return hs.length === 0 ? 0 : hs[Math.floor(hs.length / 2)];
}
