// Stroke outlines: perfect-freehand turns centerline points + pressure into a
// filled outline polygon, which we turn into a Path2D (cached per stroke, in
// page units, so zoom changes never recompute geometry).

import { getStroke } from "perfect-freehand";
import type { InkPoint, Stroke, StrokeKind } from "./model.ts";

export type StrokeStyle = {
  kind: StrokeKind;
  width: number;
  simulatePressure: boolean;
};

export function outlineFor(points: readonly InkPoint[], style: StrokeStyle, complete: boolean): number[][] {
  if (style.kind === "highlighter") {
    return getStroke(points as InkPoint[], {
      size: style.width,
      thinning: 0,
      smoothing: 0.6,
      streamline: 0.5,
      simulatePressure: false,
      last: complete,
      start: { cap: true },
      end: { cap: true },
    });
  }
  return getStroke(points as InkPoint[], {
    size: style.width * 1.6,
    thinning: 0.55,
    smoothing: 0.5,
    streamline: 0.35,
    simulatePressure: style.simulatePressure,
    last: complete,
    start: { taper: 0, cap: true },
    end: { taper: 0, cap: true },
  });
}

/** Builds a smooth closed path through outline points (quadratic midpoints). */
export function outlineToPath(outline: number[][]): Path2D {
  const path = new Path2D();
  const n = outline.length;
  if (n === 0) return path;
  if (n < 3) {
    const [x, y] = outline[0];
    path.arc(x, y, 1, 0, Math.PI * 2);
    return path;
  }
  path.moveTo(outline[0][0], outline[0][1]);
  for (let i = 0; i < n; i++) {
    const [x0, y0] = outline[i];
    const [x1, y1] = outline[(i + 1) % n];
    path.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  path.closePath();
  return path;
}

const cache = new WeakMap<Stroke, Path2D>();

export function strokePath(stroke: Stroke): Path2D {
  let p = cache.get(stroke);
  if (!p) {
    p = outlineToPath(outlineFor(stroke.points, stroke, true));
    cache.set(stroke, p);
  }
  return p;
}
