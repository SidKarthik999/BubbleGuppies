// Cue-detection evaluation on a SYNTHETIC stroke fixture set (generated with a
// different seed and stronger distortion than the bundled templates), plus an
// optional set of REAL recorded samples (tests/fixtures/real-ink-samples.json,
// exported from the app's "Record ink samples" tool).
//
//   node --experimental-strip-types --no-warnings tests/cueEval.ts

import { readFileSync, existsSync } from "node:fs";
import { CUE_GLYPHS, DISTRACTOR_GLYPHS, mulberry32 } from "../src/ink/cues/glyphs.ts";
import { classifyGlyph, detectCues, groupGlyphs } from "../src/ink/cues/detector.ts";
import { glyphToStrokes, questionMarks, starsRow, writeText, highlighterOver, type SynthOptions } from "../src/ink/cues/synth.ts";
import { bboxOf } from "../src/ink/geometry.ts";
import type { Stroke } from "../src/ink/model.ts";

export type EvalReport = {
  glyph: { questionTP: number; questionN: number; starTP: number; starN: number; fp: number; negN: number; fpByGlyph: Record<string, number> };
  cue: { questionHit: number; questionN: number; starHit: number; starN: number; starWeightOk: number; vocabHit: number; vocabN: number; fpPages: number; negPages: number; targetOk: number; targetN: number };
  real?: { n: number; tp: number; pos: number; fp: number; neg: number };
};

const WORDS = [
  "atp", "krebs", "cycle", "glucose", "pyruvate", "nadh", "electron", "chain", "oxygen", "membrane",
  "proton", "gradient", "enzyme", "yield", "x+2=7", "f(x)", "dy/dx", "3x^2", "1984", "2025", "sqrt",
  "why", "so", "net", "total", "mito", "matrix", "inner", "cell", "a-b", "v=ir", "kw", "56%",
];

function opts(rand: () => number, prefix: string, strength = 1.15): SynthOptions {
  return { rand, strength, idPrefix: prefix, clockMs: { value: 1_000_000 } };
}

export function runEval(seed = 4242): EvalReport {
  const rand = mulberry32(seed);
  const r = (a: number, b: number) => a + rand() * (b - a);

  // ---------------- glyph level ----------------
  let questionTP = 0;
  let starTP = 0;
  const questionN = 300;
  const starN = 300;
  for (let i = 0; i < questionN; i++) {
    const g = CUE_GLYPHS.question[i % CUE_GLYPHS.question.length];
    const o = opts(rand, `q${i}`, r(0.9, 1.4));
    const strokes = glyphToStrokes(g, 100, 100, r(18, 60), o);
    const glyphs = groupGlyphs(strokes);
    if (glyphs.length === 1 && classifyGlyph(glyphs[0]).cls === "question") questionTP++;
  }
  for (let i = 0; i < starN; i++) {
    const g = CUE_GLYPHS.star[i % CUE_GLYPHS.star.length];
    const o = opts(rand, `s${i}`, r(0.9, 1.4));
    const strokes = glyphToStrokes(g, 100, 100, r(16, 50), o);
    const glyphs = groupGlyphs(strokes);
    if (glyphs.length === 1 && classifyGlyph(glyphs[0]).cls === "star") starTP++;
  }
  let fp = 0;
  let negN = 0;
  const fpByGlyph: Record<string, number> = {};
  for (const [name, glyph] of Object.entries(DISTRACTOR_GLYPHS)) {
    for (let k = 0; k < 30; k++) {
      const o = opts(rand, `n-${name}-${k}`, r(0.9, 1.4));
      const strokes = glyphToStrokes(glyph, 100, 100, r(14, 50), o);
      for (const g of groupGlyphs(strokes)) {
        negN++;
        if (classifyGlyph(g).cls !== null) {
          fp++;
          fpByGlyph[name] = (fpByGlyph[name] ?? 0) + 1;
        }
      }
    }
  }

  // ---------------- cue level (whole pages) ----------------
  let questionHit = 0;
  let starHit = 0;
  let starWeightOk = 0;
  let vocabHit = 0;
  let fpPages = 0;
  let targetOk = 0;
  let targetN = 0;
  const pageN = 100;
  const sentence = () => Array.from({ length: 2 + Math.floor(rand() * 3) }, () => WORDS[Math.floor(rand() * WORDS.length)]).join(" ");

  const runPage = (strokes: Stroke[], fresh: Stroke[]) =>
    detectCues({ strokes: strokes.slice().sort((a, b) => a.createdAt - b.createdAt), freshIds: new Set(fresh.map((s) => s.id)), consumedIds: new Set() });

  for (let i = 0; i < pageN; i++) {
    const o = opts(rand, `pq${i}`);
    const size = r(26, 40);
    const base = 120;
    const line = writeText(sentence(), 40, base, size, o);
    const q = questionMarks(2, line.endX + r(6, 20), base, size * r(0.8, 1.1), o);
    const all = [...line.strokes, ...q.strokes];
    const ds = runPage(all, q.strokes);
    const hit = ds.find((d) => d.kind === "question");
    if (hit) {
      questionHit++;
      targetN++;
      const want = new Set(line.strokes.map((s) => s.id));
      if (hit.targetStrokeIds.length > 0 && hit.targetStrokeIds.every((id) => want.has(id))) targetOk++;
    }
  }
  for (let i = 0; i < pageN; i++) {
    const o = opts(rand, `ps${i}`);
    const size = r(26, 40);
    const count = 1 + (i % 3);
    const line = writeText(sentence(), 40, 140, size, o);
    const st = starsRow(count, line.endX + r(10, 30), 140, size * r(0.7, 1.0), o);
    const ds = runPage([...line.strokes, ...st.strokes], st.strokes);
    const hit = ds.find((d) => d.kind === "important");
    if (hit) {
      starHit++;
      if (hit.weight === count) starWeightOk++;
    }
  }
  const vocabN = 50;
  for (let i = 0; i < vocabN; i++) {
    const o = opts(rand, `pv${i}`);
    const line = writeText(sentence(), 40, 140, r(26, 40), o);
    const hl = highlighterOver(line.strokes, o);
    const ds = runPage([...line.strokes, hl], [hl]);
    if (ds.some((d) => d.kind === "vocab")) vocabHit++;
  }
  for (let i = 0; i < pageN; i++) {
    // Non-cue writing, including sentences that end in a single "?".
    const o = opts(rand, `pn${i}`);
    const strokes: Stroke[] = [];
    for (let l = 0; l < 3; l++) {
      const text = sentence() + (rand() < 0.3 ? "?" : "");
      strokes.push(...writeText(text, 40, 100 + l * 48, r(26, 40), o).strokes);
    }
    const ds = runPage(strokes, strokes);
    if (ds.length > 0) fpPages++;
  }

  const report: EvalReport = {
    glyph: { questionTP, questionN, starTP, starN, fp, negN, fpByGlyph },
    cue: { questionHit, questionN: pageN, starHit, starN: pageN, starWeightOk, vocabHit, vocabN, fpPages, negPages: pageN, targetOk, targetN },
  };

  // ---------------- optional real samples ----------------
  const realPath = new URL("./fixtures/real-ink-samples.json", import.meta.url);
  if (existsSync(realPath)) {
    const samples = JSON.parse(readFileSync(realPath, "utf8")) as { label: string; strokes: [number, number, number][][] }[];
    let tp = 0, pos = 0, fpReal = 0, neg = 0;
    samples.forEach((s, i) => {
      const strokes: Stroke[] = s.strokes.map((pts, k) => ({
        id: `real-${i}-${k}`, kind: "pen", color: "#000", width: 2.5, points: pts, bbox: bboxOf(pts), t: null, createdAt: k, simulatePressure: false,
      }));
      const glyphs = groupGlyphs(strokes);
      const cls = glyphs.length === 1 ? classifyGlyph(glyphs[0]).cls : null;
      if (s.label === "question" || s.label === "star") {
        pos++;
        if (cls === s.label) tp++;
      } else {
        neg++;
        if (glyphs.some((g) => classifyGlyph(g).cls !== null)) fpReal++;
      }
    });
    report.real = { n: samples.length, tp, pos, fp: fpReal, neg };
  }
  return report;
}

const pct = (a: number, b: number) => (b === 0 ? "n/a" : `${((100 * a) / b).toFixed(1)}%`);

export function formatReport(rep: EvalReport): string {
  const g = rep.glyph;
  const c = rep.cue;
  const lines = [
    "Cue detection eval (SYNTHETIC strokes, seed 4242)",
    `  glyph  ?      detected ${g.questionTP}/${g.questionN} = ${pct(g.questionTP, g.questionN)}`,
    `  glyph  star   detected ${g.starTP}/${g.starN} = ${pct(g.starTP, g.starN)}`,
    `  glyph  false positives on letters/digits/math ${g.fp}/${g.negN} = ${pct(g.fp, g.negN)}  ${JSON.stringify(g.fpByGlyph)}`,
    `  cue    ??     detected ${c.questionHit}/${c.questionN} = ${pct(c.questionHit, c.questionN)} (target line correct ${pct(c.targetOk, c.targetN)})`,
    `  cue    stars  detected ${c.starHit}/${c.starN} = ${pct(c.starHit, c.starN)} (weight correct ${pct(c.starWeightOk, c.starN)})`,
    `  cue    vocab  detected ${c.vocabHit}/${c.vocabN} = ${pct(c.vocabHit, c.vocabN)}`,
    `  cue    false-positive pages (3 lines of ordinary writing, some ending in "?") ${c.fpPages}/${c.negPages} = ${pct(c.fpPages, c.negPages)}`,
  ];
  if (rep.real) {
    lines.push(`Real recorded samples: ${rep.real.n}; detection ${pct(rep.real.tp, rep.real.pos)}, false positives ${pct(rep.real.fp, rep.real.neg)}`);
  } else {
    lines.push("Real recorded samples: none yet (tests/fixtures/real-ink-samples.json not found)");
  }
  return lines.join("\n");
}

if (process.argv[1]?.endsWith("cueEval.ts")) {
  const t0 = performance.now();
  console.log(formatReport(runEval()));
  console.log(`(${(performance.now() - t0).toFixed(0)} ms)`);
}
