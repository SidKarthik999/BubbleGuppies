// Parametric glyph shapes used for two things:
//   1. bundled recognizer templates (`?`, ★, and many non-cue "distractor"
//      glyphs: letters, digits, math), and
//   2. the synthetic handwriting in the offline demo notebook.
// Coordinates are in a unit box (y grows downward), one array per pen stroke.

export type Pt2 = [number, number];
export type GlyphStrokes = Pt2[][];

const rad = (deg: number) => (deg * Math.PI) / 180;

function arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 14): Pt2[] {
  const out: Pt2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = rad(a0 + ((a1 - a0) * i) / n);
    out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return out;
}

function line(...pts: Pt2[]): Pt2[] {
  // Interpolate so straight segments carry several points, like real ink.
  const out: Pt2[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const n = Math.max(2, Math.round(Math.hypot(bx - ax, by - ay) * 10));
    for (let k = 0; k < n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

const cat = (...parts: Pt2[][]): Pt2[] => parts.flat();
const dot = (x: number, y: number): Pt2[] => [
  [x, y],
  [x + 0.01, y + 0.012],
];

function pentagram(startVertex: number, outline = false): Pt2[] {
  const outer = (k: number): Pt2 => {
    const a = rad(-90 + 72 * k);
    return [0.5 + 0.5 * Math.cos(a), 0.52 + 0.5 * Math.sin(a)];
  };
  if (!outline) {
    const order = [0, 2, 4, 1, 3, 0].map((k) => (k + startVertex) % 5);
    return line(...order.map(outer));
  }
  const inner = (k: number): Pt2 => {
    const a = rad(-90 + 36 + 72 * k);
    return [0.5 + 0.2 * Math.cos(a), 0.52 + 0.2 * Math.sin(a)];
  };
  const pts: Pt2[] = [];
  for (let k = 0; k <= 5; k++) {
    const v = (k + startVertex) % 5;
    pts.push(outer(v));
    if (k < 5) pts.push(inner(v));
  }
  return line(...pts);
}

/** Cue glyphs. Several shape variants each, since students draw them differently. */
export const CUE_GLYPHS: Record<"question" | "star", GlyphStrokes[]> = {
  question: [
    // round hook, dot
    [cat(arc(0.5, 0.28, 0.32, 0.26, 200, 400), line([0.62, 0.52], [0.5, 0.62], [0.5, 0.76])), dot(0.5, 0.95)],
    // narrow hook, no dot
    [cat(arc(0.5, 0.25, 0.26, 0.23, 190, 410), line([0.6, 0.47], [0.5, 0.58], [0.49, 0.78]))],
    // hook that curls back to the left before the stem
    [cat(arc(0.48, 0.3, 0.34, 0.28, 210, 380), arc(0.55, 0.62, 0.12, 0.1, -60, 160, 8), line([0.44, 0.66], [0.45, 0.8])), dot(0.46, 0.96)],
  ],
  star: [
    [pentagram(0)],
    [pentagram(2)],
    [pentagram(4)],
    [pentagram(0, true)],
    // asterisk-style star: three crossing strokes
    [line([0.5, 0], [0.5, 1]), line([0.07, 0.25], [0.93, 0.75]), line([0.93, 0.25], [0.07, 0.75])],
  ],
};

/** Non-cue glyphs: ordinary letters, digits, and math the recognizer must reject. */
export const DISTRACTOR_GLYPHS: Record<string, GlyphStrokes> = {
  a: [arc(0.45, 0.6, 0.35, 0.38, -20, -380), line([0.82, 0.22], [0.82, 1])],
  b: [line([0.2, -0.5], [0.2, 1]), arc(0.5, 0.65, 0.32, 0.35, 180, 540)],
  c: [arc(0.55, 0.55, 0.4, 0.42, -40, -320)],
  d: [arc(0.45, 0.65, 0.35, 0.35, 0, -360), line([0.8, -0.5], [0.8, 1])],
  e: [cat(line([0.12, 0.55], [0.88, 0.55]), arc(0.5, 0.55, 0.38, 0.42, 0, -310))],
  f: [cat(arc(0.7, 0.15, 0.22, 0.18, -10, -180, 8), line([0.48, 0.15], [0.48, 1.1])), line([0.2, 0.45], [0.8, 0.45])],
  g: [arc(0.45, 0.45, 0.33, 0.35, 0, -360), cat(line([0.78, 0.15], [0.78, 1.1]), arc(0.5, 1.1, 0.28, 0.25, 0, 160, 8))],
  h: [cat(line([0.2, -0.5], [0.2, 1], [0.2, 0.55]), arc(0.5, 0.55, 0.3, 0.25, 180, 360, 8), line([0.8, 0.55], [0.8, 1]))],
  i: [line([0.5, 0.3], [0.5, 1]), dot(0.5, 0.05)],
  j: [cat(line([0.6, 0.3], [0.6, 1.1]), arc(0.4, 1.1, 0.2, 0.2, 0, 150, 6)), dot(0.6, 0.05)],
  k: [line([0.2, -0.5], [0.2, 1]), line([0.8, 0.2], [0.22, 0.6], [0.85, 1])],
  l: [line([0.5, -0.4], [0.5, 1])],
  m: [cat(line([0.1, 1], [0.1, 0.3]), arc(0.3, 0.45, 0.2, 0.15, 180, 360, 6), line([0.5, 0.45], [0.5, 1], [0.5, 0.45]), arc(0.7, 0.45, 0.2, 0.15, 180, 360, 6), line([0.9, 0.45], [0.9, 1]))],
  n: [cat(line([0.2, 1], [0.2, 0.3]), arc(0.5, 0.5, 0.3, 0.22, 180, 360, 8), line([0.8, 0.5], [0.8, 1]))],
  o: [arc(0.5, 0.55, 0.4, 0.42, -90, 270)],
  p: [line([0.2, 0.3], [0.2, 1.4]), arc(0.5, 0.6, 0.3, 0.3, 180, 540)],
  q: [arc(0.45, 0.55, 0.33, 0.33, 0, -360), line([0.78, 0.25], [0.78, 1.4])],
  r: [cat(line([0.3, 1], [0.3, 0.3]), arc(0.55, 0.5, 0.25, 0.18, 180, 300, 6))],
  s: [cat(arc(0.5, 0.3, 0.3, 0.24, -20, -270), arc(0.5, 0.78, 0.3, 0.24, -90, 160))],
  t: [line([0.5, -0.2], [0.5, 1]), line([0.15, 0.3], [0.85, 0.3])],
  u: [cat(line([0.2, 0.2], [0.2, 0.7]), arc(0.5, 0.7, 0.3, 0.28, 180, 0), line([0.8, 0.7], [0.8, 0.2], [0.8, 1]))],
  v: [line([0.1, 0.2], [0.5, 1], [0.9, 0.2])],
  w: [line([0, 0.2], [0.25, 1], [0.5, 0.4], [0.75, 1], [1, 0.2])],
  x: [line([0.1, 0.2], [0.9, 1]), line([0.9, 0.2], [0.1, 1])],
  y: [line([0.1, 0.2], [0.5, 0.7]), line([0.9, 0.2], [0.3, 1.4])],
  z: [line([0.1, 0.2], [0.9, 0.2], [0.1, 1], [0.9, 1])],
  "0": [arc(0.5, 0.5, 0.33, 0.5, -90, 270)],
  "1": [line([0.3, 0.15], [0.55, 0], [0.55, 1])],
  "2": [cat(arc(0.5, 0.3, 0.35, 0.28, -170, 30), line([0.8, 0.45], [0.15, 1], [0.9, 1]))],
  "3": [cat(arc(0.45, 0.27, 0.35, 0.25, -160, 90), arc(0.45, 0.73, 0.38, 0.27, -90, 160))],
  "4": [line([0.7, 1], [0.7, 0], [0.1, 0.65], [0.95, 0.65])],
  "5": [cat(line([0.8, 0], [0.25, 0], [0.2, 0.45]), arc(0.45, 0.7, 0.38, 0.3, -120, 150))],
  "6": [cat(arc(0.55, 0.55, 0.4, 0.5, -60, -200), arc(0.5, 0.72, 0.32, 0.28, 180, 540))],
  "7": [line([0.1, 0], [0.9, 0], [0.4, 1])],
  "8": [cat(arc(0.5, 0.27, 0.28, 0.25, 90, -270), arc(0.5, 0.75, 0.33, 0.25, -90, 270))],
  "9": [cat(arc(0.5, 0.3, 0.32, 0.28, 0, -360), line([0.82, 0.3], [0.7, 1]))],
  "+": [line([0.5, 0.1], [0.5, 0.9]), line([0.1, 0.5], [0.9, 0.5])],
  "=": [line([0.1, 0.35], [0.9, 0.35]), line([0.1, 0.65], [0.9, 0.65])],
  "-": [line([0.05, 0.5], [0.95, 0.5])],
  "(": [arc(1.2, 0.5, 0.9, 0.6, 214, 146)],
  ")": [arc(-0.2, 0.5, 0.9, 0.6, -34, 34)],
  "/": [line([0.8, 0], [0.2, 1])],
  "->": [line([0, 0.5], [1, 0.5]), line([0.75, 0.3], [1, 0.5], [0.75, 0.7])],
  check: [line([0.1, 0.5], [0.4, 0.9], [0.95, 0.1])],
  integral: [cat(arc(0.7, 0.12, 0.15, 0.12, 0, -180, 6), line([0.55, 0.12], [0.45, 0.88]), arc(0.3, 0.88, 0.15, 0.12, 0, 180, 6))],
  sigma: [line([0.9, 0], [0.1, 0], [0.55, 0.5], [0.1, 1], [0.9, 1])],
  sqrt: [line([0, 0.6], [0.2, 0.5], [0.4, 1], [0.65, 0], [1, 0])],
  "^": [line([0.1, 0.9], [0.5, 0.1], [0.9, 0.9])],
  "<": [line([0.9, 0.1], [0.1, 0.5], [0.9, 0.9])],
  ">": [line([0.1, 0.1], [0.9, 0.5], [0.1, 0.9])],
  pi: [line([0, 0.2], [1, 0.2]), line([0.3, 0.2], [0.25, 1]), line([0.7, 0.2], [0.75, 1])],
  inf: [cat(arc(0.27, 0.5, 0.25, 0.3, 0, 360), arc(0.77, 0.5, 0.25, 0.3, 180, -180))],
  delta: [line([0.5, 0], [0.05, 0.95], [0.95, 0.95], [0.5, 0])],
  alpha: [cat(arc(0.4, 0.5, 0.32, 0.38, -30, -330), line([0.65, 0.68], [0.95, 1]))],
};

/** Deterministic PRNG so templates, fixtures, and evals are reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Distortion = {
  slantDeg: number;
  rotateDeg: number;
  aspect: number; // x scale relative to y
  noise: number; // per-point jitter, unit-box fraction
  wobble: number; // low-frequency waviness
};

export function randomDistortion(rand: () => number, strength: number): Distortion {
  const r = () => rand() * 2 - 1;
  return {
    slantDeg: r() * 14 * strength,
    rotateDeg: r() * 8 * strength,
    aspect: 1 + r() * 0.22 * strength,
    noise: 0.012 * strength,
    wobble: 0.02 * strength,
  };
}

/** Applies handwriting-like variation to a glyph. Returns strokes in unit space. */
export function distort(glyph: GlyphStrokes, d: Distortion, rand: () => number): GlyphStrokes {
  const slant = Math.tan(rad(d.slantDeg));
  const rot = rad(d.rotateDeg);
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const phase = rand() * Math.PI * 2;
  return glyph.map((stroke) =>
    stroke.map(([x, y], i): Pt2 => {
      let px = (x - 0.5) * d.aspect;
      let py = y - 0.5;
      px += -py * slant;
      const rx = px * cos - py * sin;
      const ry = px * sin + py * cos;
      const w = Math.sin(phase + i * 0.35) * d.wobble;
      return [
        0.5 + rx + w + (rand() * 2 - 1) * d.noise,
        0.5 + ry + w * 0.5 + (rand() * 2 - 1) * d.noise,
      ];
    })
  );
}
