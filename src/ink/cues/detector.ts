// On-device cue detection from ink (Tier 1). Runs after ~600 ms of pen idle:
//   ??          two adjacent question marks       -> question cue
//   ★ / ★★ / ★★★ a row of stars beside writing     -> important cue, weight = count
//   highlighter over existing ink                  -> vocab cue
// The cue's target is the line of writing the symbol follows or sits beside.

import {
  bboxOf,
  bh,
  bw,
  bcx,
  bcy,
  groupIntoLines,
  horizontalGap,
  pathLength,
  unionBBox,
  verticalOverlap,
  type InkLine,
} from "../geometry.ts";
import { defaultTemplates, recognizeCue, toCloud, type Template } from "./pdollar.ts";
import type { BBox, Stroke } from "../model.ts";
import type { CueKind } from "../../types";

export const CUE_IDLE_MS = 600;
const RECENT_WINDOW_MS = 8000;

// $P distance thresholds, calibrated on the synthetic eval set (see
// tests/cues.test.ts and README "Cue detection results").
export const QUESTION_MAX_DISTANCE = 2.2;
export const STAR_MAX_DISTANCE = 2.6;

export type GlyphClass = "question" | "star" | null;

export type Glyph = { strokes: Stroke[]; bbox: BBox };

export type Detection = {
  kind: CueKind;
  weight?: 1 | 2 | 3;
  symbolStrokeIds: string[];
  targetStrokeIds: string[];
  /** Union of symbol + target: where the answer card anchors. */
  anchor: BBox;
  targetBBox: BBox;
};

export type DetectorInput = {
  strokes: readonly Stroke[];
  freshIds: ReadonlySet<string>;
  consumedIds: ReadonlySet<string>;
};

// ---------------------------------------------------------------------------
// Glyph classification
// ---------------------------------------------------------------------------

function isDot(s: Stroke): boolean {
  return Math.max(bw(s.bbox), bh(s.bbox)) <= 6 + s.width && pathLength(s.points) <= 14 + s.width * 2;
}

function turningCorners(points: readonly (readonly number[])[]): number {
  // Resample to an even spacing, then count sharp direction changes.
  const cloud = toCloud([points as [number, number][]]);
  let corners = 0;
  let cooldown = 0;
  for (let i = 2; i < cloud.length - 2; i++) {
    if (cooldown > 0) {
      cooldown--;
      continue;
    }
    const a = Math.atan2(cloud[i].y - cloud[i - 2].y, cloud[i].x - cloud[i - 2].x);
    const b = Math.atan2(cloud[i + 2].y - cloud[i].y, cloud[i + 2].x - cloud[i].x);
    let d = Math.abs(b - a);
    if (d > Math.PI) d = 2 * Math.PI - d;
    if (d > (95 * Math.PI) / 180) {
      corners++;
      cooldown = 2;
    }
  }
  return corners;
}

function straightness(s: Stroke): number {
  const p = s.points;
  const chord = Math.hypot(p[p.length - 1][0] - p[0][0], p[p.length - 1][1] - p[0][1]);
  return chord === 0 ? Infinity : pathLength(p) / chord;
}

function looksLikeStar(g: Glyph): boolean {
  const ratio = bw(g.bbox) / Math.max(1, bh(g.bbox));
  if (ratio < 0.55 || ratio > 1.8) return false;
  const main = g.strokes.filter((s) => !isDot(s));
  if (main.length === 1) {
    const s = main[0];
    const p = s.points;
    const size = Math.max(bw(s.bbox), bh(s.bbox));
    const gap = Math.hypot(p[p.length - 1][0] - p[0][0], p[p.length - 1][1] - p[0][1]);
    return gap <= size * 0.4 && turningCorners(p) >= 3;
  }
  if (main.length === 3) {
    // Asterisk: three roughly straight strokes crossing near a common center.
    const cx = bcx(g.bbox);
    const cy = bcy(g.bbox);
    const size = Math.max(bw(g.bbox), bh(g.bbox));
    return main.every(
      (s) => straightness(s) < 1.2 && Math.hypot(bcx(s.bbox) - cx, bcy(s.bbox) - cy) < size * 0.25
    );
  }
  return false;
}

function looksLikeQuestion(g: Glyph): boolean {
  const hooks = g.strokes.filter((s) => !isDot(s));
  if (hooks.length !== 1 || g.strokes.length > 2) return false;
  const hook = hooks[0];
  const b = hook.bbox;
  // A "?" dot sits below the hook (a dot above is an i/j).
  const dotStroke = g.strokes.find(isDot);
  if (dotStroke && bcy(dotStroke.bbox) < bcy(b)) return false;
  const w = Math.max(1, bw(b));
  const h = Math.max(1, bh(b));
  if (h / w < 0.8 || h / w > 4) return false;
  const first = hook.points[0];
  const last = hook.points[hook.points.length - 1];
  // Starts in the upper part and ends low, not out at the right edge (a "2"
  // ends with a rightward tail): a hook with a stem. Slanted handwriting
  // pushes the stem's foot left, so the left side is unconstrained.
  const startHigh = first[1] <= b.minY + h * 0.55;
  const endLow = last[1] >= b.minY + h * 0.6;
  const endNotRight = last[0] <= b.minX + w * 0.85;
  return startHigh && endLow && endNotRight;
}

export function classifyGlyph(g: Glyph, templates: readonly Template[] = defaultTemplates()): {
  cls: GlyphClass;
  distance: number;
  name: string;
} {
  const h = bh(g.bbox);
  const w = bw(g.bbox);
  if (h < 8 || h > 180 || w > 200) return { cls: null, distance: Infinity, name: "size" };
  const main = g.strokes.filter((s) => !isDot(s));
  if (main.length === 0) return { cls: null, distance: Infinity, name: "dot" };
  const totalLen = main.reduce((sum, s) => sum + pathLength(s.points), 0);
  if (totalLen / Math.max(1, Math.hypot(w, h)) > 7) return { cls: null, distance: Infinity, name: "scribble" };

  // Recognize the main strokes (the `?` dot is checked geometrically).
  const cloud = toCloud(main.map((s) => s.points.map((p) => [p[0], p[1]] as [number, number])));
  const r = recognizeCue(cloud, templates, { question: QUESTION_MAX_DISTANCE, star: STAR_MAX_DISTANCE });
  // A dot under the hook is strong evidence for "?": accept a question-mark
  // match even when a digit/letter template is marginally closer.
  const hasDot = g.strokes.length === 2 && g.strokes.some(isDot);
  if (
    hasDot &&
    r.cue === null &&
    r.cueKind === "question" &&
    r.cueDistance <= QUESTION_MAX_DISTANCE &&
    r.distance >= r.cueDistance * 0.8 &&
    looksLikeQuestion(g)
  ) {
    return { cls: "question", distance: r.cueDistance, name: r.cueName };
  }
  if (r.cue === "question" && looksLikeQuestion(g)) {
    return { cls: "question", distance: r.distance, name: r.name };
  }
  if (r.cue === "star" && looksLikeStar(g)) {
    return { cls: "star", distance: r.distance, name: r.name };
  }
  return { cls: null, distance: r.distance, name: r.name };
}

/** True when two polylines cross or come within `tol` of each other. */
export function polylinesNear(a: readonly (readonly number[])[], b: readonly (readonly number[])[], tol: number): boolean {
  const t2 = tol * tol;
  for (let i = 1; i < a.length; i++) {
    for (let j = 1; j < b.length; j++) {
      if (segmentsIntersect(a[i - 1], a[i], b[j - 1], b[j])) return true;
    }
  }
  // Endpoints near the other polyline (touching without crossing).
  const ends = [a[0], a[a.length - 1]];
  const endsB = [b[0], b[b.length - 1]];
  const near = (p: readonly number[], poly: readonly (readonly number[])[]) =>
    poly.some((q, k) => k > 0 && segDistSq(p[0], p[1], poly[k - 1][0], poly[k - 1][1], q[0], q[1]) <= t2) ||
    (poly.length === 1 && (p[0] - poly[0][0]) ** 2 + (p[1] - poly[0][1]) ** 2 <= t2);
  return ends.some((p) => near(p, b)) || endsB.some((p) => near(p, a));
}

function segmentsIntersect(p1: readonly number[], p2: readonly number[], p3: readonly number[], p4: readonly number[]): boolean {
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function cross(a: readonly number[], b: readonly number[], c: readonly number[]): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function segDistSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  let t = len === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx - px;
  const cy = ay + t * dy - py;
  return cx * cx + cy * cy;
}

/** Groups strokes (in writing order) into glyphs: dots attach to the glyph above, crossing strokes merge. */
export function groupGlyphs(strokes: readonly Stroke[]): Glyph[] {
  const glyphs: Glyph[] = [];
  for (const s of strokes) {
    const prev = glyphs[glyphs.length - 1];
    if (prev) {
      const gb = prev.bbox;
      const gh = Math.max(1, bh(gb));
      const gw = Math.max(1, bw(gb));
      if (isDot(s)) {
        const below =
          bcy(s.bbox) >= gb.maxY - gh * 0.15 &&
          bcy(s.bbox) <= gb.maxY + gh * 0.7 &&
          bcx(s.bbox) >= gb.minX - gw * 0.3 &&
          bcx(s.bbox) <= gb.maxX + gw * 0.3;
        const above = bcy(s.bbox) <= gb.minY + gh * 0.2 && bcy(s.bbox) >= gb.minY - gh * 0.8 && horizontalGap(s.bbox, gb) <= gw * 0.3;
        if (below || above) {
          prev.strokes.push(s);
          prev.bbox = unionBBox([gb, s.bbox]);
          continue;
        }
      } else {
        // Strokes of one glyph cross or touch (x, +, t, an asterisk, an arrow
        // and its head); separate letters usually don't.
        const size = Math.max(gh, gw, bw(s.bbox), bh(s.bbox));
        const xOverlap =
          Math.max(0, Math.min(gb.maxX, s.bbox.maxX) - Math.max(gb.minX, s.bbox.minX)) / Math.max(1, bw(s.bbox));
        const crosses = prev.strokes.some((p) => polylinesNear(p.points, s.points, 0));
        // Touching only counts when the new stroke sits mostly within the
        // glyph's span — so "??" written close together stays two glyphs.
        const touches = xOverlap >= 0.5 && prev.strokes.some((p) => polylinesNear(p.points, s.points, Math.max(1.5, size * 0.06)));
        if (crosses || touches) {
          prev.strokes.push(s);
          prev.bbox = unionBBox([gb, s.bbox]);
          continue;
        }
      }
    }
    glyphs.push({ strokes: [s], bbox: s.bbox });
  }
  return glyphs;
}

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

export function findTargetLine(symbol: BBox, lines: readonly InkLine[]): InkLine | null {
  const sh = Math.max(8, bh(symbol));
  let best: InkLine | null = null;
  let bestGap = Infinity;
  for (const line of lines) {
    const ov = verticalOverlap(line.bbox, symbol);
    if (ov < 0.3 * Math.min(bh(line.bbox), sh)) continue;
    const gap = horizontalGap(line.bbox, symbol);
    if (gap > Math.max(8 * sh, 240)) continue;
    // Prefer the line the symbol follows (to its left) on ties.
    const score = gap + (line.bbox.maxX <= symbol.minX + 4 ? 0 : 0.5);
    if (score < bestGap) {
      bestGap = score;
      best = line;
    }
  }
  if (best) return best;
  // Otherwise: the line directly above the symbol.
  for (const line of lines) {
    const lh = Math.max(8, bh(line.bbox));
    const dy = symbol.minY - line.bbox.maxY;
    if (dy < -0.3 * sh || dy > 2 * Math.max(sh, lh)) continue;
    const hOverlap = Math.min(line.bbox.maxX + 60, symbol.maxX) - Math.max(line.bbox.minX - 60, symbol.minX);
    if (hOverlap <= 0) continue;
    if (dy < bestGap) {
      bestGap = dy;
      best = line;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

type ClassifiedGlyph = { g: Glyph; cls: GlyphClass; distance: number; name: string };

/**
 * "??" written tightly can touch or cross and get merged into one glyph. If a
 * small multi-stroke glyph isn't recognized, try splitting it (in writing
 * order) into two parts that are each a "?".
 */
function splitTouchingQuestions(glyphs: ClassifiedGlyph[], templates: readonly Template[]): ClassifiedGlyph[] {
  const out: ClassifiedGlyph[] = [];
  for (const cg of glyphs) {
    const n = cg.g.strokes.length;
    if (cg.cls !== null || n < 2 || n > 4) {
      out.push(cg);
      continue;
    }
    let split: ClassifiedGlyph[] | null = null;
    for (let k = 1; k < n && !split; k++) {
      const parts = [cg.g.strokes.slice(0, k), cg.g.strokes.slice(k)].map((ss) => ({
        strokes: ss,
        bbox: unionBBox(ss.map((x) => x.bbox)),
      }));
      const cls = parts.map((g) => ({ g, ...classifyGlyph(g, templates) }));
      if (cls.every((c) => c.cls === "question")) split = cls;
    }
    if (split) out.push(...split);
    else out.push(cg);
  }
  return out;
}

export function detectCues(input: DetectorInput, templates: readonly Template[] = defaultTemplates()): Detection[] {
  const { strokes, freshIds, consumedIds } = input;
  const detections: Detection[] = [];
  const fresh = strokes.filter((s) => freshIds.has(s.id) && !consumedIds.has(s.id));
  if (fresh.length === 0) return detections;

  const newestFresh = Math.max(...fresh.map((s) => s.createdAt));
  const recentPens = strokes.filter(
    (s) => s.kind === "pen" && !consumedIds.has(s.id) && s.createdAt >= newestFresh - RECENT_WINDOW_MS
  );

  // 1. Symbol glyphs among recent pen strokes.
  const glyphs = splitTouchingQuestions(
    groupGlyphs(recentPens).map((g) => ({ g, ...classifyGlyph(g, templates) })),
    templates
  );
  const symbolIds = new Set<string>();
  const questions = glyphs.filter((x) => x.cls === "question").map((x) => x.g);
  const stars = glyphs.filter((x) => x.cls === "star").map((x) => x.g);

  const pairs: Glyph[][] = [];
  const qs = questions.slice().sort((a, b) => a.bbox.minX - b.bbox.minX);
  const usedQ = new Set<Glyph>();
  for (let i = 0; i < qs.length; i++) {
    if (usedQ.has(qs[i])) continue;
    for (let j = i + 1; j < qs.length; j++) {
      if (usedQ.has(qs[j])) continue;
      const a = qs[i].bbox;
      const b = qs[j].bbox;
      const ratio = bh(a) / Math.max(1, bh(b));
      if (
        horizontalGap(a, b) <= 1.5 * Math.max(bw(a), bw(b)) &&
        verticalOverlap(a, b) >= 0.5 * Math.min(bh(a), bh(b)) &&
        ratio >= 0.5 &&
        ratio <= 2
      ) {
        pairs.push([qs[i], qs[j]]);
        usedQ.add(qs[i]);
        usedQ.add(qs[j]);
        break;
      }
    }
  }

  const rows: Glyph[][] = [];
  for (const s of stars.slice().sort((a, b) => a.bbox.minX - b.bbox.minX)) {
    const row = rows.find((r) => {
      const last = r[r.length - 1].bbox;
      return (
        horizontalGap(last, s.bbox) <= 1.5 * Math.max(bw(last), bw(s.bbox)) &&
        verticalOverlap(last, s.bbox) >= 0.4 * Math.min(bh(last), bh(s.bbox))
      );
    });
    if (row) row.push(s);
    else rows.push([s]);
  }

  const groupHasFresh = (gs: Glyph[]) => gs.some((g) => g.strokes.some((s) => freshIds.has(s.id)));
  const symbolGroups: { kind: CueKind; glyphs: Glyph[] }[] = [
    ...pairs.filter(groupHasFresh).map((g) => ({ kind: "question" as const, glyphs: g })),
    ...rows.filter(groupHasFresh).map((g) => ({ kind: "important" as const, glyphs: g })),
  ];
  for (const grp of symbolGroups) for (const g of grp.glyphs) for (const s of g.strokes) symbolIds.add(s.id);

  // 2. Lines of ordinary writing (everything that isn't a symbol).
  const writing = strokes.filter((s) => s.kind === "pen" && !consumedIds.has(s.id) && !symbolIds.has(s.id));
  const lines = groupIntoLines(writing);

  for (const grp of symbolGroups) {
    const symBox = unionBBox(grp.glyphs.map((g) => g.bbox));
    const target = findTargetLine(symBox, lines);
    if (!target) continue; // a lone doodle with no writing beside it isn't a cue
    const ids = grp.glyphs.flatMap((g) => g.strokes.map((s) => s.id));
    detections.push({
      kind: grp.kind,
      weight: grp.kind === "important" ? (Math.min(3, grp.glyphs.length) as 1 | 2 | 3) : undefined,
      symbolStrokeIds: ids,
      targetStrokeIds: target.strokeIds,
      anchor: unionBBox([symBox, target.bbox]),
      targetBBox: target.bbox,
    });
  }

  // 3. Highlighter over existing ink -> vocab.
  for (const hl of fresh.filter((s) => s.kind === "highlighter")) {
    // A highlighter's bbox only spans its centerline; its ink covers ±width/2.
    const half = hl.width / 2;
    const band: BBox = { minX: hl.bbox.minX - half, minY: hl.bbox.minY - half, maxX: hl.bbox.maxX + half, maxY: hl.bbox.maxY + half };
    const covered = writing.filter((s) => {
      const ov = verticalOverlap(s.bbox, band);
      const hx = Math.max(0, Math.min(s.bbox.maxX, band.maxX) - Math.max(s.bbox.minX, band.minX));
      return ov >= 0.4 * Math.max(1, bh(s.bbox)) && hx >= 0.5 * Math.max(1, bw(s.bbox));
    });
    const box = covered.length ? unionBBox(covered.map((s) => s.bbox)) : null;
    if (!box || bw(box) < 16) continue;
    detections.push({
      kind: "vocab",
      symbolStrokeIds: [hl.id],
      targetStrokeIds: covered.map((s) => s.id),
      anchor: unionBBox([box, band]),
      targetBBox: box,
    });
  }

  return detections;
}

export { bboxOf };
