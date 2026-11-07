// Deterministic offline responder for the sample transcript. It implements
// the same `Analyzer` function shape as the real API client
// (see analyzeClient.ts), so swapping offline <-> real API is a one-line
// change and the rest of the pipeline (queueing, coalescing, timeline)
// never knows the difference.
//
// Fixtures are keyed by the id of the newest segment in the batch, which is
// deterministic because the sample transcript always arrives in the same
// order at the same simulated times.

import type { Analyzer } from "./analyzeClient";
import type { AnalyzeResponse, CueAnswer, Visual } from "../types";

const bstConceptMap: Visual = {
  topic: "Binary Search Trees",
  recap: "A BST keeps left children smaller and right children larger than their parent, so search and insert can skip half the tree at each step.",
  visualType: "concept-map",
  nodes: [
    { id: "bst", label: "Binary Search Tree" },
    { id: "order", label: "Ordering property" },
    { id: "search", label: "Search" },
    { id: "insert", label: "Insert" },
  ],
  edges: [
    { from: "bst", to: "order", label: "defined by" },
    { from: "order", to: "search", label: "enables" },
    { from: "order", to: "insert", label: "enables" },
  ],
  sourceStartSec: 0,
};

const bstConceptMapUpdated: Visual = {
  ...bstConceptMap,
  recap: "Balanced BSTs give O(log n) search and insert; an unbalanced BST (e.g. from sorted input) degrades toward O(n).",
  nodes: [
    ...bstConceptMap.nodes,
    { id: "balanced", label: "Balanced: O(log n)" },
    { id: "unbalanced", label: "Unbalanced: O(n)" },
  ],
  edges: [
    ...bstConceptMap.edges,
    { from: "search", to: "balanced", label: "when balanced" },
    { from: "search", to: "unbalanced", label: "when skewed" },
  ],
};

const traversalFlowchart: Visual = {
  topic: "Tree Traversal Orders",
  recap: "In-order visits left-node-right (sorted on a BST); pre-order visits node-left-right; post-order visits left-right-node.",
  visualType: "flowchart",
  nodes: [
    { id: "start", label: "Visit a subtree" },
    { id: "inorder", label: "In-order: L, Node, R" },
    { id: "preorder", label: "Pre-order: Node, L, R" },
    { id: "postorder", label: "Post-order: L, R, Node" },
  ],
  edges: [
    { from: "start", to: "inorder", label: "sorted output" },
    { from: "start", to: "preorder", label: "copy structure" },
    { from: "start", to: "postorder", label: "safe deletion" },
  ],
  sourceStartSec: 54,
};

const graphSchematic: Visual = {
  topic: "Graph Representations",
  recap: "Adjacency lists store each node's neighbors (compact for sparse graphs); adjacency matrices store a full grid of edges (fast lookup, more memory).",
  visualType: "schematic",
  nodes: [
    { id: "graph", label: "Graph" },
    { id: "list", label: "Adjacency List" },
    { id: "matrix", label: "Adjacency Matrix" },
  ],
  edges: [
    { from: "graph", to: "list", label: "sparse-friendly" },
    { from: "graph", to: "matrix", label: "dense-friendly" },
  ],
  sourceStartSec: 86,
};

const lectureRecap: Visual = {
  topic: "Recap",
  recap: "BSTs give ordered, efficient search when balanced; traversal order determines visit sequence; graphs generalize trees via adjacency lists or matrices.",
  visualType: "recap",
  nodes: [],
  edges: [],
  sourceStartSec: 118,
};

const FIXTURES: Record<string, AnalyzeResponse> = {
  s2: { action: "append", visual: bstConceptMap },
  s6: { action: "replace", visual: bstConceptMapUpdated },
  s9: { action: "append", visual: traversalFlowchart },
  s13: { action: "append", visual: graphSchematic },
  s15: { action: "append", visual: lectureRecap },
};

const OFFLINE_LATENCY_MS = 450;

export const NOTES_TOPIC = "From your notes";

/** Offline stand-in for analyzing handwriting: a deterministic recap card of the notes read so far. */
function offlineNotesResponse(req: Parameters<Analyzer>[0], seen: string[]): AnalyzeResponse {
  for (const s of req.segments) {
    const text = s.text.replace(/^Student's handwritten note:\s*/, "");
    if (!seen.includes(text)) seen.push(text);
  }
  const recap = seen.slice(-6).join(" · ").slice(0, 500);
  const visual: Visual = {
    topic: NOTES_TOPIC,
    recap: recap || "Your handwritten notes will be summarized here.",
    visualType: "recap",
    nodes: [],
    edges: [],
    sourceStartSec: req.segments[0]?.startSec ?? 0,
  };
  return req.currentVisual?.topic === NOTES_TOPIC ? { action: "replace", visual } : { action: "append", visual };
}

// ---------------------------------------------------------------- cue answers

const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);

/** The node whose label shares the most words with the cue text. */
function matchNode(visual: Visual, text: string): string | null {
  const w = words(text);
  let best: string | null = null;
  let bestScore = 0;
  for (const n of visual.nodes) {
    const score = [...words(n.label)].filter((x) => w.has(x)).length;
    if (score > bestScore) {
      bestScore = score;
      best = n.id;
    }
  }
  return best;
}

/**
 * Offline stand-in for cue answers: a deterministic answer per cue, and the
 * matching node of the current visual gets the cue's emphasis (a "replace").
 * Answers are marked unverified because nothing real was looked up.
 */
function withCueAnswers(res: AnalyzeResponse, req: Parameters<Analyzer>[0]): AnalyzeResponse {
  const cues = req.cues ?? [];
  if (cues.length === 0) return res;
  const cueAnswers: CueAnswer[] = cues.map((c) => ({
    cueId: c.id,
    kind: c.kind,
    title: c.kind === "question" ? `Q: ${c.text}` : c.kind === "vocab" ? c.text : `Key idea: ${c.text}`,
    body:
      c.kind === "question"
        ? `Offline demo answer. With the real API, this explains "${c.text}" using what the lecturer said, and the related diagram node is marked with a "?".`
        : c.kind === "vocab"
          ? `Offline demo definition. With the real API, this is a one-line definition of "${c.text}" grounded in the lecture.`
          : `Starred${c.weight && c.weight > 1 ? ` ×${c.weight}` : ""}. The matching idea is emphasized in the diagram. With the real API, this says why it matters.`,
    citations: [],
    unverified: true,
  }));
  let out: AnalyzeResponse = { ...res, cueAnswers };
  const base = res.action !== "skip" ? res.visual : req.currentVisual;
  if (base) {
    const emph = new Map<string, "important" | "question">();
    for (const c of cues) {
      if (c.kind === "vocab") continue;
      const id = matchNode(base, c.text);
      if (id) emph.set(id, c.kind === "question" ? "question" : "important");
    }
    if (emph.size) {
      const visual = { ...base, nodes: base.nodes.map((n) => (emph.has(n.id) ? { ...n, emphasis: emph.get(n.id) } : n)) };
      out = res.action === "append" ? { action: "append", visual, cueAnswers } : { action: "replace", visual, cueAnswers };
    }
  }
  return out;
}

export function createOfflineAnalyzer(): Analyzer {
  const notesSeen: string[] = [];
  // A trigger fires when its segment appears anywhere in a batch (batches
  // coalesce, so the trigger isn't always the newest segment), once per session.
  const fired = new Set<string>();
  return (req) => {
    if (req.segments.length > 0 && req.segments.every((s) => s.id.startsWith("note-"))) {
      const res = withCueAnswers(offlineNotesResponse(req, notesSeen), req);
      return new Promise((resolve) => setTimeout(() => resolve(res), OFFLINE_LATENCY_MS));
    }
    let response: AnalyzeResponse = { action: "skip" };
    for (const seg of req.segments) {
      const fixture = FIXTURES[seg.id];
      if (fixture && !fired.has(seg.id)) {
        fired.add(seg.id);
        response = fixture;
      }
    }
    // A replace only makes sense when there is a current visual.
    if (response.action === "replace" && !req.currentVisual) response = { ...response, action: "append" };
    response = withCueAnswers(response, req);
    return new Promise((resolve) => {
      setTimeout(() => resolve(response), OFFLINE_LATENCY_MS);
    });
  };
}
