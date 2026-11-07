// Shared integration contract with the analysis API (Agent 2 / server/).
// Keep this file's shapes identical to the server's — it is the one source
// of truth duplicated on both sides per the integration contract.

export type Segment = {
  id: string;
  startSec: number;
  endSec: number;
  text: string;
};

export type VisualType = "concept-map" | "flowchart" | "schematic" | "recap";

export type Visual = {
  topic: string;
  recap: string;
  visualType: VisualType;
  nodes: { id: string; label: string }[];
  edges: { from: string; to: string; label?: string }[];
  sourceStartSec: number;
};

export type AnalyzeRequest = {
  segments: Segment[]; // 1-12 finalized segments, in time order, including the newest
  currentVisual: Visual | null;
};

export type AnalyzeResponse =
  | { action: "skip" }
  | { action: "append" | "replace"; visual: Visual };

export type ApiErrorBody = {
  error: { code: string; message: string };
};

// --- App-local types (not part of the server contract) ---

/** One card in the review timeline. `id` is stable across append/replace. */
export type Card = {
  id: string;
  visual: Visual;
  updatedAt: number;
};

export type RecorderState = "idle" | "requesting" | "listening" | "paused" | "stopped" | "error";

export type TranscriptionSupport = "unsupported" | "available" | "failed";

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
