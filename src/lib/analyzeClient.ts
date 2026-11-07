// Transport-agnostic analysis pipeline: queues finalized segments and cues,
// sends at most one /api/analyze request at a time (single-flight), and
// coalesces whatever arrives meanwhile into the next request. The offline
// fixture responder and the real API client share the `Analyzer` shape, so
// everything above this file is identical in both modes.

import {
  LIMITS,
  type AnalyzeFailure,
  type AnalyzeRequest,
  type AnalyzeResponse,
  type ApiErrorBody,
  type NoteCue,
  type Segment,
  type Visual,
  type VisualType,
} from "../types";

export type Analyzer = (req: AnalyzeRequest) => Promise<AnalyzeResponse>;

export async function postJson<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw { code: "NETWORK_ERROR", message: "Could not reach the analysis server. Check that `npm run dev` is still running." };
  }
  if (!res.ok) {
    let parsed: ApiErrorBody | null = null;
    try {
      parsed = await res.json();
    } catch {
      // fall through to a generic error
    }
    if (parsed?.error) throw parsed.error;
    // A bodyless 5xx comes from the Vite dev proxy when nothing listens on :8787.
    if (res.status >= 500) {
      throw {
        code: "SERVER_UNREACHABLE",
        message: "The analysis server isn't running. Start it with `npm run api` in a second terminal (it needs server/.env with OPENROUTER_API_KEY), or pick Offline demo in Start class.",
      };
    }
    throw { code: "UNKNOWN_ERROR", message: `Request failed (${res.status}).` };
  }
  return (await res.json()) as T;
}

export function createApiAnalyzer(): Analyzer {
  return (req) => postJson<AnalyzeResponse>("/api/analyze", req);
}

type QueueCallbacks = {
  onResult: (res: AnalyzeResponse, req: AnalyzeRequest) => void;
  onError: (err: AnalyzeFailure, req: AnalyzeRequest) => void;
  onBusyChange: (busy: boolean) => void;
  /** Last ≤5 card types, oldest first, read at send time (Tier 2). */
  recentVisualTypes: () => VisualType[];
};

/**
 * Single-flight queue. Each lecture session gets a fresh queue state via
 * resetSession(), which also invalidates any in-flight response from a
 * previous session so it can never be applied after the fact.
 */
export class AnalysisQueue {
  private analyzer: Analyzer;
  private readonly cb: QueueCallbacks;
  private pending: Segment[] = [];
  /** Text read from the student's handwriting, analyzed like transcript. */
  private pendingNotes: Segment[] = [];
  private pendingCues: NoteCue[] = [];
  private inFlight = false;
  private currentVisual: Visual | null = null;
  private sessionToken = 0;
  /** Most recent finalized segments: context for cues sent without new speech. */
  private lastSegments: Segment[] = [];

  constructor(analyzer: Analyzer, callbacks: QueueCallbacks) {
    this.analyzer = analyzer;
    this.cb = callbacks;
  }

  setAnalyzer(analyzer: Analyzer) {
    this.analyzer = analyzer;
  }

  setCurrentVisual(visual: Visual | null) {
    this.currentVisual = visual;
  }

  get busy(): boolean {
    return this.inFlight;
  }

  resetSession() {
    this.pending = [];
    this.pendingNotes = [];
    this.pendingCues = [];
    this.lastSegments = [];
    this.inFlight = false;
    this.currentVisual = null;
    this.sessionToken += 1;
    this.cb.onBusyChange(false);
  }

  /** Enqueues newly finalized segments and sends if idle. */
  enqueue(segments: Segment[]) {
    if (segments.length === 0) return;
    this.pending = [...this.pending, ...segments].slice(-LIMITS.maxSegments);
    this.lastSegments = [...this.lastSegments, ...segments].slice(-2);
    if (!this.inFlight) this.flush();
  }

  /**
   * Enqueues handwriting-derived segments ("note-<line>-v<n>"). A newer
   * version of the same line replaces an unsent older one. Notes go out in
   * their own requests so each request's segments stay in time order.
   */
  enqueueNotes(segments: Segment[]) {
    if (segments.length === 0) return;
    const lineOf = (id: string) => id.replace(/-v\d+$/, "");
    const incoming = new Set(segments.map((s) => lineOf(s.id)));
    this.pendingNotes = [...this.pendingNotes.filter((s) => !incoming.has(lineOf(s.id))), ...segments]
      .sort((a, b) => a.startSec - b.startSec)
      .slice(-LIMITS.maxSegments);
    if (!this.inFlight) this.flush();
  }

  /**
   * Adds cues. If nothing is in flight they go out right away, riding along
   * with pending segments — or, when there are none, with the most recent
   * finalized segments as context (`context`, newest last).
   */
  addCues(cues: NoteCue[], context: Segment[]) {
    const ids = new Set(this.pendingCues.map((c) => c.id));
    this.pendingCues.push(...cues.filter((c) => !ids.has(c.id)));
    if (context.length) this.lastSegments = context.slice(-2);
    if (!this.inFlight) this.flush();
  }

  private flush() {
    let batch = this.pending;
    let fromNotes = false;
    if (batch.length === 0 && this.pendingNotes.length > 0) {
      batch = this.pendingNotes;
      fromNotes = true;
    }
    if (batch.length === 0) {
      if (this.pendingCues.length === 0) return;
      batch = this.lastSegments;
    }
    const cues = this.pendingCues.slice(0, LIMITS.maxCues);
    // The contract needs ≥1 segment. With no lecture speech yet (plain notes, a
    // problem set), the marked lines themselves are the context.
    if (batch.length === 0 && !this.allowsEmptySegments) {
      batch = cues.map((c) => ({
        id: `cue-ctx-${c.id}`,
        startSec: c.atSec ?? 0,
        endSec: c.atSec ?? 0,
        text: `Student's handwritten note: ${c.text}`,
      })).sort((a, b) => a.startSec - b.startSec);
    }
    if (batch.length === 0 && !this.allowsEmptySegments) return;
    if (fromNotes) this.pendingNotes = [];
    else this.pending = [];
    this.pendingCues = this.pendingCues.slice(cues.length);
    this.inFlight = true;
    this.cb.onBusyChange(true);
    const token = this.sessionToken;

    const recent = this.cb.recentVisualTypes().slice(-LIMITS.maxRecentVisualTypes);
    const req: AnalyzeRequest = {
      segments: batch,
      currentVisual: this.currentVisual,
      ...(recent.length ? { recentVisualTypes: recent } : {}),
      ...(cues.length ? { cues } : {}),
    };

    this.analyzer(req)
      .then((res) => {
        if (token !== this.sessionToken) return;
        this.inFlight = false;
        this.cb.onBusyChange(false);
        this.cb.onResult(res, req);
        this.flush();
      })
      .catch((err: unknown) => {
        if (token !== this.sessionToken) return;
        this.inFlight = false;
        this.cb.onBusyChange(false);
        // Keep the cues for the next attempt; segments stay in the transcript.
        this.pendingCues = [...cues, ...this.pendingCues];
        this.cb.onError(asFailure(err, batch[batch.length - 1]?.id ?? ""), req);
        if (this.pending.length > 0 || this.pendingNotes.length > 0) this.flush();
      });
  }

  /** Offline fixtures don't need lecture segments to answer a cue. */
  allowsEmptySegments = false;
}

export function asFailure(err: unknown, atSegmentId: string): AnalyzeFailure {
  if (err && typeof err === "object" && "code" in err && "message" in err) {
    const e = err as { code: unknown; message: unknown };
    return { code: String(e.code), message: String(e.message), atSegmentId };
  }
  return { code: "UNKNOWN_ERROR", message: "Analysis failed unexpectedly.", atSegmentId };
}
