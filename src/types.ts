// Shared integration contract with the analysis API (Agent 2 / server/), v2.1.
// Keep the contract section identical to the server's. Every request field
// added after v1 is optional so older clients keep working.

// ============================ Contract (v2.1) ============================

export type Segment = { id: string; startSec: number; endSec: number; text: string };

// ---------- Tier 1: handwriting ----------
// POST /api/ink/transcribe
export type InkTranscribeRequest = {
  image: string; // required: base64 PNG of the cropped ink region, no data: prefix
  purpose: "note" | "question" | "vocab" | "math";
  context?: string; // ≤ 500 chars of nearby text (problem text, topic) to disambiguate
};
export type InkTranscribeResponse = {
  text: string; // verbatim transcription, never an answer; "" if illegible
  tex?: string; // only when purpose is "math" or the ink is clearly an equation
  confidence: "high" | "low";
};

export type CueKind = "question" | "important" | "vocab";

export type NoteCue = {
  id: string;
  kind: CueKind;
  text: string;
  weight?: 1 | 2 | 3; // important only
  atSec: number | null; // lecture clock when written; null outside a recording
  source?: "ink" | "typed" | "transcript";
};

// ---------- Tier 2: diverse graphics ----------
export type VisualType =
  | "concept-map"
  | "flowchart"
  | "cycle"
  | "timeline"
  | "hierarchy"
  | "comparison"
  | "venn"
  | "chart"
  | "schematic"
  | "recap";

export type VisualNode = {
  id: string;
  label: string; // ≤ 6 words
  group?: string; // same group = same color; ≤ 5 groups
  emphasis?: "important" | "question";
  detail?: string; // ≤ 160 chars
};

export type VisualEdge = { from: string; to: string; label?: string };

export type ChartSpec = {
  kind: "bar" | "line";
  unit?: string;
  points: { label: string; value: number }[]; // 2–12, every value stated in the sources
};

export type Visual = {
  topic: string;
  recap: string;
  visualType: VisualType;
  nodes: VisualNode[]; // ≤ 12
  edges: VisualEdge[];
  chart?: ChartSpec; // required when visualType is "chart", else absent
  sourceStartSec: number;
  citations?: Citation[];
};

// ---------- Tier 3: grounding and problem sets ----------
export type Citation =
  | { kind: "material"; excerptId: string }
  | { kind: "lecture"; segmentId: string }
  | { kind: "note"; excerptId: string }
  | { kind: "web"; url: string; title: string };
export type SourceMode = "materials" | "lecture" | "web";

export type MaterialExcerpt = {
  id: string;
  materialId: string;
  title: string;
  locator: string; // "p. 12"
  kind: "slides" | "notes" | "reading" | "equation-sheet" | "syllabus" | "other";
  text: string;
};
export type NoteExcerpt = {
  id: string;
  sessionId: string;
  sessionTitle: string;
  startSec: number | null;
  text: string;
};

export type CueAnswer = {
  cueId: string;
  kind: CueKind;
  title: string;
  body: string; // ≤ 600 chars
  citations: Citation[]; // ≥ 1 unless unverified
  unverified?: true;
};

export type AnalyzeRequest = {
  segments: Segment[]; // 1–12 finalized segments, time order, newest included
  currentVisual: Visual | null;
  recentVisualTypes?: VisualType[]; // last ≤ 5 cards, oldest first (Tier 2)
  cues?: NoteCue[]; // Tier 1
  materials?: MaterialExcerpt[]; // Tier 3
  allowWeb?: boolean; // Tier 3, default false
};
export type AnalyzeResponse =
  | { action: "skip"; cueAnswers?: CueAnswer[]; sourceMode?: SourceMode }
  | {
      action: "append" | "replace";
      visual: Visual;
      cueAnswers?: CueAnswer[];
      sourceMode?: SourceMode;
    };

// POST /api/assist (problem-set help, Tier 3)
export type AssistRequest = {
  problem: { id: string; label: string; text: string }; // text ≤ 4,000 chars
  question: string; // typed, or transcribed from ink before the ??
  studentWork: string; // ≤ 2,000 chars, typed or transcribed
  notes: NoteExcerpt[];
  materials: MaterialExcerpt[];
  helpLevel: "hint" | "explain";
  allowWeb?: boolean;
};
export type AssistResponse = {
  hint: string; // ≤ 800 chars, never the final answer
  relevantNotes: { excerptId: string; why: string }[]; // ≤ 4
  equations: { text: string; tex?: string; citation: Citation }[]; // ≤ 4
  citations: Citation[];
  sourceMode: SourceMode;
};

export type ApiErrorBody = {
  error: { code: string; message: string };
};

// Contract limits the browser enforces before sending.
export const LIMITS = {
  maxSegments: 12,
  maxCues: 10,
  maxRecentVisualTypes: 5,
  maxNodes: 12,
  maxGroups: 5,
  maxInkSide: 2048,
  maxInkBytes: 1.5 * 1024 * 1024,
  maxContextChars: 500,
} as const;

// ======================= App-local (not in the contract) =======================

/** One card in the review timeline. `id` is stable across append/replace. */
export type Card = {
  id: string;
  visual: Visual;
  updatedAt: number;
  /** Visual shown before the latest replace, so the renderer can keep layout stable. */
  previous?: Visual;
};

export type RecorderState = "idle" | "requesting" | "listening" | "paused" | "stopped" | "error";

export type TranscriptionSupport = "unsupported" | "available";

export type TranscriptSegment = Segment & {
  /** true while this segment's text can still change (interim result) */
  interim: boolean;
};

export type SessionSource = "live" | "sample";
export type AnalysisBackend = "offline" | "api";

export type AnalyzeFailure = {
  code: string;
  message: string;
  atSegmentId: string;
};
