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
import type { AnalyzeResponse, Visual } from "../types";

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

export function createOfflineAnalyzer(): Analyzer {
  return (req) => {
    const newest = req.segments[req.segments.length - 1];
    const fixture = newest ? FIXTURES[newest.id] : undefined;
    const response: AnalyzeResponse = fixture ?? { action: "skip" };
    return new Promise((resolve) => {
      setTimeout(() => resolve(response), OFFLINE_LATENCY_MS);
    });
  };
}
