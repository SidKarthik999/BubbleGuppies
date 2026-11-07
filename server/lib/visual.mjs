// Visual validation.
// - Input (currentVisual from the browser) is lenient so v1 browsers keep working.
// - Output (from the model) is strict: contract limits, per-type structure
//   rules, and grounded chart values. A visual that is structurally sound but
//   breaks its type rule is downgraded to concept-map or recap, not rejected.

import { ShapeError } from "./errors.mjs";
import { LIMITS } from "./limits.mjs";
import { cleanText, clip, clipWords, isPlainObject, isTime, requireText } from "./text.mjs";

export const VISUAL_TYPES = [
  "concept-map", "flowchart", "cycle", "timeline", "hierarchy",
  "comparison", "venn", "chart", "schematic", "recap",
];
export const EMPHASIS = ["important", "question"];
export const CHART_KINDS = ["bar", "line"];
const VENN_GROUPS = ["A", "B", "both"];

// ---------------------------------------------------------------------------
// Input: currentVisual (lenient)
// ---------------------------------------------------------------------------

/**
 * Validates a currentVisual sent by the browser. Accepts v1 sizes (16 nodes,
 * 100-character labels) and the v2.1 optional fields. Citations are not
 * needed for analysis and are dropped. Throws ShapeError.
 */
export function normalizeInputVisual(raw, path = "currentVisual") {
  if (!isPlainObject(raw)) throw new ShapeError(`${path} must be an object`);
  const topic = requireText(raw.topic, `${path}.topic`, LIMITS.topicChars);
  const recap = requireText(raw.recap, `${path}.recap`, LIMITS.recapChars);
  if (!VISUAL_TYPES.includes(raw.visualType)) {
    throw new ShapeError(`${path}.visualType must be one of ${VISUAL_TYPES.join(", ")}`);
  }
  const visualType = raw.visualType;
  if (!isTime(raw.sourceStartSec)) {
    throw new ShapeError(`${path}.sourceStartSec must be a non-negative finite number`);
  }
  if (!Array.isArray(raw.nodes)) throw new ShapeError(`${path}.nodes must be an array`);
  if (!Array.isArray(raw.edges)) throw new ShapeError(`${path}.edges must be an array`);
  const base = { topic, recap, visualType, sourceStartSec: raw.sourceStartSec };

  if (visualType === "recap") {
    if (raw.nodes.length || raw.edges.length) {
      throw new ShapeError(`${path}: a recap visual must have empty nodes and edges`);
    }
    return { ...base, nodes: [], edges: [] };
  }
  if (raw.nodes.length === 0 && visualType !== "chart") {
    throw new ShapeError(`${path}.nodes must not be empty for ${visualType}`);
  }
  if (raw.nodes.length > LIMITS.inputNodes) throw new ShapeError(`${path}.nodes exceeds ${LIMITS.inputNodes} items`);
  if (raw.edges.length > LIMITS.edges) throw new ShapeError(`${path}.edges exceeds ${LIMITS.edges} items`);

  const ids = new Set();
  const nodes = raw.nodes.map((node, i) => {
    const p = `${path}.nodes[${i}]`;
    if (!isPlainObject(node)) throw new ShapeError(`${p} must be an object`);
    const id = requireText(node.id, `${p}.id`, LIMITS.idChars);
    if (ids.has(id)) throw new ShapeError(`${p}.id "${id}" is not unique`);
    ids.add(id);
    const out = { id, label: requireText(node.label, `${p}.label`, LIMITS.inputLabelChars) };
    if (typeof node.group === "string" && cleanText(node.group)) out.group = clip(cleanText(node.group), LIMITS.groupChars);
    if (EMPHASIS.includes(node.emphasis)) out.emphasis = node.emphasis;
    if (typeof node.detail === "string" && cleanText(node.detail)) out.detail = clip(cleanText(node.detail), LIMITS.detailChars);
    return out;
  });
  const edges = raw.edges.map((edge, i) => {
    const p = `${path}.edges[${i}]`;
    if (!isPlainObject(edge)) throw new ShapeError(`${p} must be an object`);
    const from = requireText(edge.from, `${p}.from`, LIMITS.idChars);
    const to = requireText(edge.to, `${p}.to`, LIMITS.idChars);
    if (!ids.has(from)) throw new ShapeError(`${p}.from "${from}" does not reference a node`);
    if (!ids.has(to)) throw new ShapeError(`${p}.to "${to}" does not reference a node`);
    const out = { from, to };
    if (typeof edge.label === "string" && cleanText(edge.label)) out.label = clip(cleanText(edge.label), LIMITS.edgeLabelChars);
    return out;
  });

  const visual = { ...base, nodes, edges };
  if (raw.chart !== undefined && raw.chart !== null) {
    visual.chart = normalizeInputChart(raw.chart, `${path}.chart`);
  } else if (visualType === "chart") {
    throw new ShapeError(`${path}.chart is required when visualType is "chart"`);
  }
  return visual;
}

function normalizeInputChart(raw, path) {
  if (!isPlainObject(raw)) throw new ShapeError(`${path} must be an object`);
  if (!CHART_KINDS.includes(raw.kind)) throw new ShapeError(`${path}.kind must be bar or line`);
  if (!Array.isArray(raw.points) || raw.points.length > LIMITS.chartPointsMax) {
    throw new ShapeError(`${path}.points must be an array of at most ${LIMITS.chartPointsMax} items`);
  }
  const points = raw.points.map((pt, i) => {
    if (!isPlainObject(pt) || typeof pt.value !== "number" || !Number.isFinite(pt.value)) {
      throw new ShapeError(`${path}.points[${i}] must have a finite numeric value`);
    }
    return { label: requireText(pt.label, `${path}.points[${i}].label`, LIMITS.inputLabelChars), value: pt.value };
  });
  const out = { kind: raw.kind, points };
  if (typeof raw.unit === "string" && cleanText(raw.unit)) out.unit = clip(cleanText(raw.unit), LIMITS.chartUnitChars);
  return out;
}

// ---------------------------------------------------------------------------
// Output: model visual (strict, with downgrade)
// ---------------------------------------------------------------------------

/**
 * Validates and normalizes a visual from the model. The model's structured
 * output uses "" for absent optional fields and chart.kind "none".
 *
 * Returns { visual, downgradedFrom? }. Throws ShapeError when the visual is
 * unusable even as a downgrade (missing text, bad references, too many nodes).
 *
 * @param raw          model visual
 * @param sourceStartSec  already resolved by the caller
 * @param sourceNumbers   Set of numbers stated in the segments and materials
 */
export function finalizeVisual(raw, { sourceStartSec, sourceNumbers }) {
  if (!isPlainObject(raw)) throw new ShapeError("visual must be an object");
  const topic = clip(requireText(raw.topic, "visual.topic", 10_000), LIMITS.topicChars);
  const recap = clip(requireText(raw.recap, "visual.recap", 10_000), LIMITS.recapChars);
  if (!VISUAL_TYPES.includes(raw.visualType)) throw new ShapeError("visual.visualType is unknown");
  const type = raw.visualType;
  const rawNodes = Array.isArray(raw.nodes) ? raw.nodes : [];
  const rawEdges = Array.isArray(raw.edges) ? raw.edges : [];
  const base = { topic, recap, sourceStartSec };

  if (type === "recap") {
    if (rawNodes.length || rawEdges.length) throw new ShapeError("a recap visual must have empty nodes and edges");
    return { visual: { ...base, visualType: "recap", nodes: [], edges: [] } };
  }
  if (rawNodes.length > LIMITS.nodes) throw new ShapeError(`visual.nodes exceeds ${LIMITS.nodes}`);
  if (rawEdges.length > LIMITS.edges) throw new ShapeError(`visual.edges exceeds ${LIMITS.edges}`);

  const ids = new Set();
  const nodes = rawNodes.map((node, i) => {
    if (!isPlainObject(node)) throw new ShapeError(`visual.nodes[${i}] must be an object`);
    const id = requireText(node.id, `visual.nodes[${i}].id`, LIMITS.idChars);
    if (ids.has(id)) throw new ShapeError(`visual.nodes[${i}].id is not unique`);
    ids.add(id);
    const label = clip(clipWords(requireText(node.label, `visual.nodes[${i}].label`, 10_000), LIMITS.labelWords), LIMITS.labelChars);
    const out = { id, label };
    const group = typeof node.group === "string" ? cleanText(node.group) : "";
    if (group) out.group = clip(group, LIMITS.groupChars);
    if (EMPHASIS.includes(node.emphasis)) out.emphasis = node.emphasis;
    const detail = typeof node.detail === "string" ? cleanText(node.detail) : "";
    if (detail) out.detail = clip(detail, LIMITS.detailChars);
    return out;
  });
  const edges = rawEdges.map((edge, i) => {
    if (!isPlainObject(edge)) throw new ShapeError(`visual.edges[${i}] must be an object`);
    const from = requireText(edge.from, `visual.edges[${i}].from`, LIMITS.idChars);
    const to = requireText(edge.to, `visual.edges[${i}].to`, LIMITS.idChars);
    if (!ids.has(from) || !ids.has(to)) throw new ShapeError(`visual.edges[${i}] references a missing node`);
    const out = { from, to };
    const label = typeof edge.label === "string" ? cleanText(edge.label) : "";
    if (label) out.label = clip(label, LIMITS.edgeLabelChars);
    return out;
  });
  if (nodes.length === 0 && type !== "chart") throw new ShapeError(`visual.nodes must not be empty for ${type}`);

  let chart;
  if (type === "chart") chart = normalizeOutputChart(raw.chart, sourceNumbers);

  // Repair before judging: a comparison's edges link counterparts across
  // groups, so same-group edges (seen in live runs, e.g. "In-Order" → "visits
  // left first") are dropped rather than costing the whole comparison layout.
  const typeEdges = type === "comparison" ? crossGroupEdges(nodes, edges) : edges;

  const ok = type === "chart" ? chart !== null : TYPE_RULES[type](nodes, typeEdges);
  if (ok) {
    const visual = { ...base, visualType: type, nodes: limitGroups(type, nodes), edges: typeEdges };
    if (chart) visual.chart = chart;
    return { visual };
  }
  return { visual: downgrade(base, nodes, edges), downgradedFrom: type };
}

function crossGroupEdges(nodes, edges) {
  const groupOf = new Map(nodes.map((n) => [n.id, n.group]));
  return edges.filter((e) => groupOf.get(e.from) !== groupOf.get(e.to));
}

function downgrade(base, nodes, edges) {
  if (TYPE_RULES["concept-map"](nodes, edges)) {
    return { ...base, visualType: "concept-map", nodes: limitGroups("concept-map", nodes), edges };
  }
  return { ...base, visualType: "recap", nodes: [], edges: [] };
}

/** More than 5 color groups is noise: drop groups rather than the visual. */
function limitGroups(type, nodes) {
  if (type === "venn" || type === "comparison") return nodes;
  const groups = new Set(nodes.filter((n) => n.group).map((n) => n.group));
  if (groups.size <= LIMITS.groups) return nodes;
  return nodes.map(({ group, ...rest }) => rest);
}

/** Returns a normalized chart, or null when it breaks the chart rules. */
function normalizeOutputChart(raw, sourceNumbers) {
  if (!isPlainObject(raw) || !CHART_KINDS.includes(raw.kind) || !Array.isArray(raw.points)) return null;
  if (raw.points.length < LIMITS.chartPointsMin || raw.points.length > LIMITS.chartPointsMax) return null;
  const points = [];
  for (const pt of raw.points) {
    if (!isPlainObject(pt) || typeof pt.value !== "number" || !Number.isFinite(pt.value)) return null;
    const label = typeof pt.label === "string" ? cleanText(pt.label) : "";
    if (!label) return null;
    if (!isGroundedNumber(pt.value, sourceNumbers)) return null;
    points.push({ label: clip(clipWords(label, LIMITS.labelWords), LIMITS.labelChars), value: pt.value });
  }
  const chart = { kind: raw.kind, points };
  const unit = typeof raw.unit === "string" ? cleanText(raw.unit) : "";
  if (unit) chart.unit = clip(unit, LIMITS.chartUnitChars);
  return chart;
}

// ---------------------------------------------------------------------------
// Chart grounding: every value must be stated as digits in the sources.
// ---------------------------------------------------------------------------

/** Extracts the numbers written as digits in `text` ("1,500", "3.5", ".25", "45%"). */
export function extractNumbers(text, into = new Set()) {
  for (const match of text.matchAll(/\d[\d,]*(?:\.\d+)?|\.\d+/g)) {
    const token = match[0];
    const parts = /^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(token) ? [token.replace(/,/g, "")] : token.split(",");
    for (const part of parts) {
      if (part === "") continue;
      const n = Number(part);
      if (Number.isFinite(n)) into.add(n);
    }
  }
  return into;
}

/** Sign is not checked: "fell 5 degrees" can be charted as -5. */
export function isGroundedNumber(value, sourceNumbers) {
  const v = Math.abs(value);
  for (const n of sourceNumbers) {
    if (Math.abs(n - v) <= 1e-9 * Math.max(1, v)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Structure rules per type (the contract's "Content shape" table)
// ---------------------------------------------------------------------------

function degrees(nodes, edges) {
  const inDeg = new Map(nodes.map((n) => [n.id, 0]));
  const outDeg = new Map(nodes.map((n) => [n.id, 0]));
  for (const e of edges) {
    inDeg.set(e.to, inDeg.get(e.to) + 1);
    outDeg.set(e.from, outDeg.get(e.from) + 1);
  }
  return { inDeg, outDeg };
}

const hasSelfLoop = (edges) => edges.some((e) => e.from === e.to);

export const TYPE_RULES = {
  // Related ideas with no order. The prompt asks for labeled edges; the
  // server only requires a connected idea set (it is also the downgrade target).
  "concept-map": (nodes, edges) => nodes.length >= 2 && edges.length >= 1,

  // Physical or system components: abstract links between >= 2 components.
  schematic: (nodes, edges) => nodes.length >= 2 && edges.length >= 1,

  // Ordered steps or a decision: at least one path from a start node
  // (in-degree 0, with an outgoing edge).
  flowchart: (nodes, edges) => {
    if (nodes.length < 2 || edges.length < 1) return false;
    const { inDeg, outDeg } = degrees(nodes, edges);
    return nodes.some((n) => inDeg.get(n.id) === 0 && outDeg.get(n.id) > 0);
  },

  // A process that repeats: the edges form exactly one directed loop through every node.
  cycle: (nodes, edges) => {
    if (nodes.length < 3 || edges.length !== nodes.length || hasSelfLoop(edges)) return false;
    const { inDeg, outDeg } = degrees(nodes, edges);
    if (nodes.some((n) => inDeg.get(n.id) !== 1 || outDeg.get(n.id) !== 1)) return false;
    const next = new Map(edges.map((e) => [e.from, e.to]));
    const seen = new Set();
    let at = nodes[0].id;
    while (!seen.has(at)) {
      seen.add(at);
      at = next.get(at);
    }
    return seen.size === nodes.length && at === nodes[0].id;
  },

  // Dated or ordered events: nodes in order, edges chain node[i] -> node[i+1].
  timeline: (nodes, edges) => {
    if (nodes.length < 2 || edges.length !== nodes.length - 1) return false;
    const want = new Set(nodes.slice(1).map((n, i) => `${nodes[i].id}\u0000${n.id}`));
    return edges.every((e) => want.delete(`${e.from}\u0000${e.to}`)) && want.size === 0;
  },

  // A tree with one root and edges from parent to child.
  hierarchy: (nodes, edges) => {
    if (nodes.length < 2 || edges.length !== nodes.length - 1 || hasSelfLoop(edges)) return false;
    const { inDeg } = degrees(nodes, edges);
    const roots = nodes.filter((n) => inDeg.get(n.id) === 0);
    if (roots.length !== 1 || nodes.some((n) => inDeg.get(n.id) > 1)) return false;
    const children = new Map();
    for (const e of edges) children.set(e.from, [...(children.get(e.from) ?? []), e.to]);
    const seen = new Set();
    const stack = [roots[0].id];
    while (stack.length) {
      const id = stack.pop();
      if (seen.has(id)) return false;
      seen.add(id);
      stack.push(...(children.get(id) ?? []));
    }
    return seen.size === nodes.length;
  },

  // Two or three things contrasted: every node in one of 2–3 groups, and
  // edges (if any) link counterparts in different groups.
  comparison: (nodes, edges) => {
    if (nodes.length < 2 || nodes.some((n) => !n.group)) return false;
    const groups = new Set(nodes.map((n) => n.group));
    if (groups.size < 2 || groups.size > 3) return false;
    const groupOf = new Map(nodes.map((n) => [n.id, n.group]));
    return edges.every((e) => groupOf.get(e.from) !== groupOf.get(e.to));
  },

  // Overlap between two sets: groups are exactly "A", "B", and "both".
  venn: (nodes) => {
    if (nodes.some((n) => !VENN_GROUPS.includes(n.group))) return false;
    const groups = new Set(nodes.map((n) => n.group));
    return VENN_GROUPS.every((g) => groups.has(g));
  },
};
