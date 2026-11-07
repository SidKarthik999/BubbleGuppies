// Synthetic handwriting: turns unit-box glyphs into page strokes with
// handwriting-like variation. Used by the offline demo notebook and by the
// cue-detection eval (tests/). It is NOT a substitute for real pen samples —
// see README for how to record and evaluate those.

import { CUE_GLYPHS, DISTRACTOR_GLYPHS, distort, randomDistortion, type GlyphStrokes } from "./glyphs.ts";
import { bboxOf } from "../geometry.ts";
import type { InkPoint, Stroke } from "../model.ts";

export type SynthOptions = {
  rand: () => number;
  strength: number; // distortion strength (templates use 0.6)
  color?: string;
  width?: number;
  idPrefix: string;
  /** Start time for createdAt (ms) — each stroke advances it. */
  clockMs: { value: number };
  /** Lecture time to stamp on strokes. */
  t?: number | null;
};

let seq = 0;

export function glyphToStrokes(glyph: GlyphStrokes, x: number, y: number, size: number, o: SynthOptions): Stroke[] {
  const g = distort(glyph, randomDistortion(o.rand, o.strength), o.rand);
  return g.map((unit) => {
    const pts: InkPoint[] = unit.map(([ux, uy], i) => {
      const prog = unit.length > 1 ? i / (unit.length - 1) : 0.5;
      const pressure = Math.min(1, Math.max(0.15, 0.4 + 0.25 * Math.sin(prog * Math.PI) + (o.rand() - 0.5) * 0.1));
      return [x + ux * size, y + uy * size, pressure];
    });
    o.clockMs.value += 120 + Math.floor(o.rand() * 160);
    seq++;
    return {
      id: `${o.idPrefix}-${seq}`,
      kind: "pen",
      color: o.color ?? "#1f2937",
      width: o.width ?? 2.5,
      points: pts,
      bbox: bboxOf(pts),
      t: o.t ?? null,
      createdAt: o.clockMs.value,
      simulatePressure: false,
    } satisfies Stroke;
  });
}

const LETTER_KEYS = new Set(Object.keys(DISTRACTOR_GLYPHS));

/** Writes a word/phrase in synthetic print handwriting. Returns strokes and the end x. */
export function writeText(text: string, x: number, baseline: number, size: number, o: SynthOptions): { strokes: Stroke[]; endX: number } {
  const strokes: Stroke[] = [];
  let cx = x;
  for (const ch of text.toLowerCase()) {
    if (ch === " ") {
      cx += size * 0.55;
      continue;
    }
    const key = ch === "?" ? null : LETTER_KEYS.has(ch) ? ch : null;
    if (ch === "?") {
      strokes.push(...glyphToStrokes(CUE_GLYPHS.question[0], cx, baseline - size, size, o));
      cx += size * 0.75;
      continue;
    }
    if (!key) {
      cx += size * 0.4;
      continue;
    }
    // Lowercase letters sit in the lower part of the line; tall ones reach up.
    const glyph = DISTRACTOR_GLYPHS[key];
    const glyphSize = size * 0.62;
    strokes.push(...glyphToStrokes(glyph, cx, baseline - glyphSize, glyphSize, o));
    cx += glyphSize * (key === "m" || key === "w" ? 1.15 : 0.82) + size * 0.06;
  }
  return { strokes, endX: cx };
}

export function questionMarks(count: number, x: number, baseline: number, size: number, o: SynthOptions): { strokes: Stroke[]; endX: number } {
  const strokes: Stroke[] = [];
  let cx = x;
  for (let i = 0; i < count; i++) {
    const variant = CUE_GLYPHS.question[Math.floor(o.rand() * CUE_GLYPHS.question.length)];
    strokes.push(...glyphToStrokes(variant, cx, baseline - size, size, o));
    cx += size * (0.62 + o.rand() * 0.15);
  }
  return { strokes, endX: cx };
}

export function starsRow(count: number, x: number, baseline: number, size: number, o: SynthOptions): { strokes: Stroke[]; endX: number } {
  const strokes: Stroke[] = [];
  let cx = x;
  for (let i = 0; i < count; i++) {
    const variant = CUE_GLYPHS.star[Math.floor(o.rand() * CUE_GLYPHS.star.length)];
    strokes.push(...glyphToStrokes(variant, cx, baseline - size, size, o));
    cx += size * (1.1 + o.rand() * 0.2);
  }
  return { strokes, endX: cx };
}

export function highlighterOver(strokes: readonly Stroke[], o: SynthOptions, color = "#fde047"): Stroke {
  const b = bboxOf(strokes.flatMap((s) => s.points));
  const y = (b.minY + b.maxY) / 2;
  const pts: InkPoint[] = [];
  const n = 24;
  for (let i = 0; i <= n; i++) {
    pts.push([b.minX - 4 + ((b.maxX - b.minX + 8) * i) / n, y + (o.rand() - 0.5) * 2, 0.5]);
  }
  o.clockMs.value += 400;
  seq++;
  return {
    id: `${o.idPrefix}-hl-${seq}`,
    kind: "highlighter",
    color,
    width: Math.max(14, b.maxY - b.minY + 4),
    points: pts,
    bbox: bboxOf(pts),
    t: o.t ?? null,
    createdAt: o.clockMs.value,
    simulatePressure: false,
  };
}
