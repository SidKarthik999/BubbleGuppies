// $P point-cloud recognizer (Vatavu, Anthony & Wobbrock, 2012), implemented
// from the published algorithm. Point clouds ignore stroke order, direction,
// and stroke count, which suits `?` (hook + optional dot) and stars (drawn
// from any vertex, in either direction, or as a 3-stroke asterisk).

import { CUE_GLYPHS, DISTRACTOR_GLYPHS, distort, mulberry32, randomDistortion, type GlyphStrokes } from "./glyphs.ts";

type CloudPoint = { x: number; y: number; id: number };
export type Cloud = CloudPoint[];

export const CLOUD_SIZE = 32;

export type Template = { name: string; cue: "question" | "star" | null; cloud: Cloud };

function pathLength(points: Cloud): number {
  let d = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].id === points[i - 1].id) d += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return d;
}

function resample(points: Cloud, n: number): Cloud {
  const total = pathLength(points);
  if (total === 0) {
    // Degenerate (a tap or dot): replicate the first point.
    return Array.from({ length: n }, () => ({ ...points[0] }));
  }
  const interval = total / (n - 1);
  let acc = 0;
  const src = points.map((p) => ({ ...p }));
  const out: Cloud = [{ ...src[0] }];
  for (let i = 1; i < src.length; i++) {
    if (src[i].id !== src[i - 1].id) continue;
    const d = Math.hypot(src[i].x - src[i - 1].x, src[i].y - src[i - 1].y);
    if (acc + d >= interval && d > 0) {
      const t = (interval - acc) / d;
      const q = {
        x: src[i - 1].x + t * (src[i].x - src[i - 1].x),
        y: src[i - 1].y + t * (src[i].y - src[i - 1].y),
        id: src[i].id,
      };
      out.push(q);
      src.splice(i, 0, q);
      acc = 0;
    } else {
      acc += d;
    }
  }
  while (out.length < n) out.push({ ...src[src.length - 1] });
  return out.slice(0, n);
}

function scaleAndCenter(points: Cloud): Cloud {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const size = Math.max(maxX - minX, maxY - minY) || 1;
  const scaled = points.map((p) => ({ x: (p.x - minX) / size, y: (p.y - minY) / size, id: p.id }));
  const cx = scaled.reduce((s, p) => s + p.x, 0) / scaled.length;
  const cy = scaled.reduce((s, p) => s + p.y, 0) / scaled.length;
  return scaled.map((p) => ({ x: p.x - cx, y: p.y - cy, id: p.id }));
}

export function toCloud(strokes: readonly (readonly (readonly [number, number] | readonly number[])[])[]): Cloud {
  const pts: Cloud = [];
  strokes.forEach((s, id) => {
    for (const p of s) pts.push({ x: p[0], y: p[1], id });
  });
  if (pts.length === 0) return [];
  return scaleAndCenter(resample(pts, CLOUD_SIZE));
}

function cloudDistance(a: Cloud, b: Cloud, start: number, abandonAt: number): number {
  const n = a.length;
  const matched = new Uint8Array(n);
  let sum = 0;
  let i = start;
  let k = 0;
  do {
    let min = Infinity;
    let index = -1;
    const ax = a[i].x;
    const ay = a[i].y;
    for (let j = 0; j < n; j++) {
      if (matched[j]) continue;
      const dx = ax - b[j].x;
      const dy = ay - b[j].y;
      const d = dx * dx + dy * dy;
      if (d < min) {
        min = d;
        index = j;
      }
    }
    matched[index] = 1;
    sum += (1 - k / n) * Math.sqrt(min);
    if (sum >= abandonAt) return sum; // early abandonment: can't beat the best so far
    k++;
    i = (i + 1) % n;
  } while (i !== start);
  return sum;
}

export function greedyCloudMatch(points: Cloud, template: Cloud, abandonAt = Infinity): number {
  const n = points.length;
  const step = Math.floor(Math.pow(n, 1 - 0.5));
  let min = abandonAt;
  for (let i = 0; i < n; i += step) {
    min = Math.min(min, cloudDistance(points, template, i, min), cloudDistance(template, points, i, min));
  }
  return min;
}

export type Recognition = { name: string; cue: "question" | "star" | null; distance: number };

export function recognize(cloud: Cloud, templates: readonly Template[]): Recognition {
  let best: Recognition = { name: "", cue: null, distance: Infinity };
  for (const t of templates) {
    const d = greedyCloudMatch(cloud, t.cloud, best.distance);
    if (d < best.distance) best = { name: t.name, cue: t.cue, distance: d };
  }
  return best;
}

/**
 * Cue-first recognition: find the nearest cue template; if it's beyond that
 * cue's threshold, stop (most writing is rejected here cheaply). Otherwise a
 * cue only wins if no distractor template is even closer.
 */
export type CueRecognition = Recognition & {
  /** Nearest cue template, even when a distractor beat it. */
  cueName: string;
  cueKind: "question" | "star" | null;
  cueDistance: number;
};

export function recognizeCue(
  cloud: Cloud,
  templates: readonly Template[],
  maxDistance: Record<"question" | "star", number>
): CueRecognition {
  let best: Recognition = { name: "", cue: null, distance: Infinity };
  for (const t of templates) {
    if (!t.cue) continue;
    const d = greedyCloudMatch(cloud, t.cloud, best.distance);
    if (d < best.distance) best = { name: t.name, cue: t.cue, distance: d };
  }
  const cueInfo = { cueName: best.name, cueKind: best.cue, cueDistance: best.distance };
  if (!best.cue || best.distance > maxDistance[best.cue]) return { ...best, cue: null, ...cueInfo };
  for (const t of templates) {
    if (t.cue) continue;
    const d = greedyCloudMatch(cloud, t.cloud, best.distance);
    if (d < best.distance) return { name: t.name, cue: null, distance: d, ...cueInfo };
  }
  return { ...best, ...cueInfo };
}

/**
 * The bundled template set: each cue glyph variant and each distractor glyph,
 * plus a few lightly-distorted copies (fixed seed) so ordinary slant and
 * aspect variation don't push a sample toward the wrong class.
 */
export function buildTemplates(copies = 3): Template[] {
  const rand = mulberry32(1337);
  const out: Template[] = [];
  const add = (name: string, cue: Template["cue"], glyph: GlyphStrokes) => {
    out.push({ name, cue, cloud: toCloud(glyph) });
    for (let k = 0; k < copies; k++) {
      out.push({ name, cue, cloud: toCloud(distort(glyph, randomDistortion(rand, 0.6), rand)) });
    }
  };
  CUE_GLYPHS.question.forEach((g, i) => add(`question#${i}`, "question", g));
  CUE_GLYPHS.star.forEach((g, i) => add(`star#${i}`, "star", g));
  for (const [name, g] of Object.entries(DISTRACTOR_GLYPHS)) add(name, null, g);
  return out;
}

let cached: Template[] | null = null;
export function defaultTemplates(): Template[] {
  if (!cached) cached = buildTemplates();
  return cached;
}
