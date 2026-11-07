// Notebook data model. Everything here is stored locally (IndexedDB) and never
// sent to the server — only cropped PNGs of ink and NoteCue objects leave the
// browser (see the "Ink stays in the browser" rule in the contract).

import type { Card, CueAnswer, NoteCue, Segment } from "../types";

/** [x, y, pressure] in page units (CSS px at zoom 1). */
export type InkPoint = [number, number, number];

export type BBox = { minX: number; minY: number; maxX: number; maxY: number };

export type StrokeKind = "pen" | "highlighter";

export type Stroke = {
  id: string;
  kind: StrokeKind;
  color: string;
  /** Base diameter in page units. */
  width: number;
  points: InkPoint[];
  bbox: BBox;
  /** Lecture clock (seconds) when the stroke began; null outside a recording. */
  t: number | null;
  /** Epoch ms — also the z-order key (strokes are kept sorted by it). */
  createdAt: number;
  /** Mouse/trackpad input has no real pressure; perfect-freehand simulates it. */
  simulatePressure: boolean;
};

export type TextBox = {
  id: string;
  x: number;
  y: number;
  width: number;
  text: string;
  t: number | null;
  createdAt: number;
};

export type PageTemplate = "blank" | "lined" | "grid";

export type PageBackground =
  | { kind: "template"; template: PageTemplate }
  | { kind: "pdf"; fileId: string; fileName: string; pageIndex: number };

export type Page = {
  id: string;
  width: number;
  height: number;
  background: PageBackground;
  strokes: Stroke[];
  textBoxes: TextBox[];
};

export type CueStatus = "transcribing" | "needs-text" | "ready" | "failed";

/** A detected or typed cue plus where it lives on the page. */
export type CueRecord = {
  cue: NoteCue;
  pageId: string | null; // null for transcript-line cues
  /** Region the answer card anchors beside (page units). */
  anchor: BBox | null;
  symbolStrokeIds: string[];
  targetStrokeIds: string[];
  status: CueStatus;
  confidence?: "high" | "low";
  answer?: CueAnswer;
  /** Answer card collapsed so it doesn't cover writing. */
  collapsed: boolean;
  /** Sent to /api/analyze at least once. */
  sent: boolean;
  createdAt: number;
};

export type Notebook = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  pages: Page[];
  cues: CueRecord[];
  /** Saved with the session so replay works after a reload. */
  transcript: Segment[];
  cards: Card[];
  audioBlobId: string | null;
  /** Handwriting read by the on-device model, one record per line of ink. */
  noteLines?: NoteLine[];
  /** Symbol strokes from cues the student undid — never re-detected. */
  dismissedSymbolIds?: string[];
  /** True for the bundled offline demo notebook. */
  sample?: boolean;
};

/** A line of handwriting and what the recognizer read from it. */
export type NoteLine = {
  /** pageId + earliest stroke id: stable while the line grows. */
  key: string;
  pageId: string;
  /** Sorted stroke ids — when this changes the line is read again. */
  signature: string;
  bbox: BBox;
  text: string;
  /** The student corrected the text by hand; keep it until the ink changes. */
  edited: boolean;
  /** Lecture clock when written, or seconds into the notebook outside a lecture. */
  atSec: number;
  version: number;
  updatedAt: number;
};

export const PAGE_WIDTH = 816; // 8.5in at 96 dpi
export const PAGE_HEIGHT = 1056; // 11in at 96 dpi
export const LINE_SPACING = 32;

export const PEN_COLORS = ["#1f2937", "#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c"] as const;
export const PEN_WIDTHS = [2, 3.5, 6] as const;
export const HIGHLIGHTER_COLORS = ["#fde047", "#86efac", "#f9a8d4", "#93c5fd", "#fdba74", "#c4b5fd"] as const;
export const HIGHLIGHTER_WIDTH = 18;

let idCounter = 0;
export function newId(prefix: string): string {
  idCounter = (idCounter + 1) % 1_000_000;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function newPage(background: PageBackground, width = PAGE_WIDTH, height = PAGE_HEIGHT): Page {
  return { id: newId("page"), width, height, background, strokes: [], textBoxes: [] };
}

export function newNotebook(title: string): Notebook {
  const now = Date.now();
  return {
    id: newId("nb"),
    title,
    createdAt: now,
    updatedAt: now,
    pages: [newPage({ kind: "template", template: "lined" })],
    cues: [],
    transcript: [],
    cards: [],
    audioBlobId: null,
  };
}
