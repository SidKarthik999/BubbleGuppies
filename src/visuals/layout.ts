// Pure layouts for every visual type (no DOM). Positions are node centers in
// an abstract coordinate space; the SVG renderer fits the result to the panel.

import type { Visual, VisualNode } from "../types";

export type Placed = { node: VisualNode; x: number; y: number; w: number; h: number; lines: string[] };
export type Layout = { nodes: Placed[]; width: number; height: number; circles?: { cx: number; cy: number; r: number; label: string }[] };

export const NODE_W = 150;
const LINE_H = 16;
const PAD_Y = 12;
const GAP_X = 40;
const GAP_Y = 46;

/** Wraps a label into ≤3 lines of ~18 chars (labels are plain text, ≤6 words). */
export function wrapLabel(label: string, maxChars = 18): string[] {
  const words = label.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur && (cur + " " + w).length > maxChars) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  if (lines.length > 3) {
    lines.length = 3;
    lines[2] = lines[2].slice(0, maxChars - 1) + "…";
  }
  return lines.length ? lines : [""];
}

function box(node: VisualNode, x: number, y: number): Placed {
  const lines = wrapLabel(node.label);
  return { node, x, y, w: NODE_W, h: lines.length * LINE_H + PAD_Y * 2, lines };
}

function bounds(nodes: Placed[], extra: Partial<Layout> = {}): Layout {
  if (nodes.length === 0) return { nodes, width: 1, height: 1, ...extra };
  const minX = Math.min(...nodes.map((n) => n.x - n.w / 2));
  const minY = Math.min(...nodes.map((n) => n.y - n.h / 2));
  const shifted = nodes.map((n) => ({ ...n, x: n.x - minX + 10, y: n.y - minY + 10 }));
  const circles = extra.circles?.map((c) => ({ ...c, cx: c.cx - minX + 10, cy: c.cy - minY + 10 }));
  const width = Math.max(...shifted.map((n) => n.x + n.w / 2), ...(circles ?? []).map((c) => c.cx + c.r)) + 10;
  const height = Math.max(...shifted.map((n) => n.y + n.h / 2), ...(circles ?? []).map((c) => c.cy + c.r)) + 10;
  return { nodes: shifted, width, height, circles };
}

/** Depth of each node = longest path from a source (cycles broken by visit order). */
function depths(v: Visual): Map<string, number> {
  const ids = v.nodes.map((n) => n.id);
  const incoming = new Map(ids.map((id) => [id, 0]));
  for (const e of v.edges) incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1);
  const depth = new Map<string, number>();
  const roots = ids.filter((id) => incoming.get(id) === 0);
  const queue = (roots.length ? roots : [ids[0]]).map((id) => ({ id, d: 0 }));
  const seenEdges = new Set<string>();
  while (queue.length) {
    const { id, d } = queue.shift()!;
    if ((depth.get(id) ?? -1) >= d) continue;
    depth.set(id, d);
    for (const e of v.edges) {
      const key = `${e.from}>${e.to}`;
      if (e.from === id && !seenEdges.has(key) && d + 1 < ids.length) {
        seenEdges.add(key);
        queue.push({ id: e.to, d: d + 1 });
      }
    }
  }
  for (const id of ids) if (!depth.has(id)) depth.set(id, 0);
  return depth;
}

function layered(v: Visual, horizontal: boolean): Layout {
  const d = depths(v);
  const levels = new Map<number, VisualNode[]>();
  for (const n of v.nodes) levels.set(d.get(n.id)!, [...(levels.get(d.get(n.id)!) ?? []), n]);
  const out: Placed[] = [];
  for (const [level, ns] of [...levels.entries()].sort((a, b) => a[0] - b[0])) {
    ns.forEach((n, i) => {
      const along = level * (horizontal ? NODE_W + GAP_X : 70 + GAP_Y);
      const across = (i - (ns.length - 1) / 2) * (horizontal ? 70 + GAP_Y / 2 : NODE_W + GAP_X / 2);
      out.push(box(n, horizontal ? along : across, horizontal ? across : along));
    });
  }
  return bounds(out);
}

function circle(v: Visual): Layout {
  const n = v.nodes.length;
  const r = Math.max(110, (n * (NODE_W + 20)) / (2 * Math.PI));
  return bounds(
    v.nodes.map((node, i) => {
      const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
      return box(node, r * Math.cos(a) * 1.15, r * Math.sin(a) * 0.8);
    })
  );
}

function radial(v: Visual): Layout {
  const degree = new Map(v.nodes.map((n) => [n.id, 0]));
  for (const e of v.edges) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
  }
  const center = [...v.nodes].sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0))[0];
  const rest = v.nodes.filter((n) => n !== center);
  // Ellipse sized so neighbors clear each other: wide boxes need horizontal
  // room at the top/bottom, tall stacks need vertical room at the sides.
  const k = rest.length;
  const rx = Math.max(200, 30 * k);
  const ry = Math.max(130, 14 * k);
  return bounds([
    box(center, 0, 0),
    ...rest.map((node, i) => {
      const a = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, k);
      return box(node, rx * Math.cos(a), ry * Math.sin(a));
    }),
  ]);
}

function row(v: Visual): Layout {
  return bounds(v.nodes.map((n, i) => box(n, i * (NODE_W + GAP_X / 2), i % 2 === 0 ? 0 : 0)));
}

function columns(v: Visual, order?: string[]): Layout {
  const groups = order ?? [...new Set(v.nodes.map((n) => n.group ?? ""))];
  const out: Placed[] = [];
  groups.forEach((g, col) => {
    let y = 40;
    for (const n of v.nodes.filter((x) => (x.group ?? "") === g)) {
      const b = box(n, col * (NODE_W + GAP_X), y);
      out.push(b);
      y += b.h + 18;
    }
  });
  return bounds(out);
}

function venn(v: Visual): Layout {
  const stack = (group: string, cx: number, w: number) => {
    const boxes = v.nodes.filter((n) => n.group === group).map((n) => ({ ...box(n, cx, 0), w }));
    const total = boxes.reduce((s, b) => s + b.h, 0) + Math.max(0, boxes.length - 1) * 10;
    let y = -total / 2;
    for (const b of boxes) {
      b.y = y + b.h / 2;
      y += b.h + 10;
    }
    return { boxes, total };
  };
  const a = stack("A", -125, 130);
  const both = stack("both", 0, 110);
  const b = stack("B", 125, 130);
  const r = Math.max(150, Math.max(a.total, both.total, b.total) / 2 + 40);
  return bounds([...a.boxes, ...both.boxes, ...b.boxes], {
    circles: [
      { cx: -72, cy: 0, r, label: "A" },
      { cx: 72, cy: 0, r, label: "B" },
    ],
  });
}

export function layoutVisual(v: Visual): Layout {
  switch (v.visualType) {
    case "flowchart":
      return layered(v, false);
    case "schematic":
      return layered(v, true);
    case "hierarchy":
      return layered(v, false);
    case "cycle":
      return circle(v);
    case "concept-map":
      return radial(v);
    case "timeline":
      return row(v);
    case "comparison":
      return columns(v);
    case "venn":
      return venn(v);
    default:
      return layered(v, false);
  }
}

/** Client-side validation before rendering. Unusable visuals fall back to the recap card. */
export function isRenderable(v: Visual): boolean {
  if (v.visualType === "recap") return true;
  if (v.visualType === "chart") {
    const pts = v.chart?.points ?? [];
    return pts.length >= 2 && pts.length <= 12 && pts.every((p) => Number.isFinite(p.value));
  }
  if (v.nodes.length === 0 || v.nodes.length > 12) return false;
  const ids = new Set(v.nodes.map((n) => n.id));
  if (ids.size !== v.nodes.length) return false;
  return v.edges.every((e) => ids.has(e.from) && ids.has(e.to));
}
