// Timed fixture transcript for the offline demo. Every finalized segment
// here is replayed through the exact same code path as live microphone
// text (see useLectureSession), so the sample exercises the real
// transcript/timeline/analysis pipeline end to end.
//
// Covers 3 topics / 2 topic changes, and (via offlineFixtures.ts) all four
// visual types: concept-map, flowchart, schematic, and recap.

import type { Segment } from "../types";

export const SAMPLE_TRANSCRIPT: Segment[] = [
  { id: "s0", startSec: 0, endSec: 6, text: "Today we're starting with binary search trees, or BSTs." },
  { id: "s1", startSec: 6, endSec: 14, text: "A BST is a binary tree where every left child is smaller than its parent, and every right child is larger." },
  { id: "s2", startSec: 14, endSec: 22, text: "That ordering property is what makes search, insert, and delete efficient." },
  { id: "s3", startSec: 22, endSec: 30, text: "To search for a value, you compare it to the root, then recurse left or right depending on the comparison." },
  { id: "s4", startSec: 30, endSec: 38, text: "Insertion works the same way — you walk down until you find an empty spot that preserves the ordering." },
  { id: "s5", startSec: 38, endSec: 46, text: "On a balanced tree, search and insert both run in O(log n) time." },
  { id: "s6", startSec: 46, endSec: 54, text: "But an unbalanced tree — say, one built from already-sorted input — degrades toward O(n), basically a linked list." },
  { id: "s7", startSec: 54, endSec: 62, text: "Now let's talk about how we actually visit every node — tree traversal orders." },
  { id: "s8", startSec: 62, endSec: 70, text: "In-order traversal visits left, then the node itself, then right — on a BST that gives you values in sorted order." },
  { id: "s9", startSec: 70, endSec: 78, text: "Pre-order visits the node first, then left, then right — useful for copying a tree's structure." },
  { id: "s10", startSec: 78, endSec: 86, text: "Post-order visits left, then right, then the node — useful for safely deleting a tree bottom-up." },
  { id: "s11", startSec: 86, endSec: 94, text: "Let's shift gears to graphs. Unlike trees, graphs can have cycles and nodes with many connections." },
  { id: "s12", startSec: 94, endSec: 102, text: "There are two common ways to represent a graph: an adjacency list and an adjacency matrix." },
  { id: "s13", startSec: 102, endSec: 110, text: "An adjacency list stores, for each node, the list of neighbors it connects to — compact for sparse graphs." },
  { id: "s14", startSec: 110, endSec: 118, text: "An adjacency matrix stores a grid of edges between every pair of nodes — faster lookups, more memory for sparse graphs." },
  { id: "s15", startSec: 118, endSec: 126, text: "To recap: BSTs give ordered, efficient search when balanced; traversal order determines visit sequence; and graphs generalize trees with adjacency lists or matrices." },
];

export const SAMPLE_DURATION_SEC =
  SAMPLE_TRANSCRIPT[SAMPLE_TRANSCRIPT.length - 1]?.endSec ?? 0;
