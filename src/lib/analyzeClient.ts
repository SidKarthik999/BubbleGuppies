// Transport-agnostic analysis pipeline: queues finalized segments, sends at
// most one /api/analyze request at a time, and coalesces whatever arrives
// while a request is in flight into the next one. Both the offline fixture
// responder and the real API client implement the same `Analyzer` shape, so
// the queueing logic (and everything above it) is identical either way.

import type { AnalyzeRequest, AnalyzeResponse, AnalyzeFailure, Segment, Visual, ApiErrorBody } from "../types";

export type Analyzer = (req: AnalyzeRequest) => Promise<AnalyzeResponse>;

const MAX_SEGMENTS_PER_REQUEST = 12;

export function createApiAnalyzer(): Analyzer {
  return async (req) => {
    let res: Response;
    try {
      res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
    } catch {
      throw { code: "NETWORK_ERROR", message: "Could not reach the analysis server." };
    }

    if (!res.ok) {
      let body: ApiErrorBody | null = null;
      try {
        body = await res.json();
      } catch {
        // ignore — fall through to generic error below
      }
      throw body?.error ?? { code: "UNKNOWN_ERROR", message: `Analysis request failed (${res.status}).` };
    }

    return (await res.json()) as AnalyzeResponse;
  };
}

type QueueCallbacks = {
  onResult: (res: AnalyzeResponse, req: AnalyzeRequest) => void;
  onError: (err: AnalyzeFailure) => void;
};

/**
 * Holds finalized segments not yet sent, runs exactly one analyze() call at
 * a time, and folds newly-finalized segments into the next batch while one
 * is in flight. Each lecture "session" (recording) gets a fresh queue via
 * resetSession(), which also invalidates any in-flight response from a
 * previous session so it can never be applied after the fact.
 */
export class AnalysisQueue {
  private analyzer: Analyzer;
  private callbacks: QueueCallbacks;
  private pending: Segment[] = [];
  private inFlight = false;
  private currentVisual: Visual | null = null;
  private sessionToken = 0;

  constructor(analyzer: Analyzer, callbacks: QueueCallbacks) {
    this.analyzer = analyzer;
    this.callbacks = callbacks;
  }

  setAnalyzer(analyzer: Analyzer) {
    this.analyzer = analyzer;
  }

  setCurrentVisual(visual: Visual | null) {
    this.currentVisual = visual;
  }

  /** Starts a new session: clears any queued/in-flight work from before. */
  resetSession() {
    this.pending = [];
    this.inFlight = false;
    this.currentVisual = null;
    this.sessionToken += 1;
  }

  /** Enqueues newly finalized segments and kicks off a request if idle. */
  enqueue(segments: Segment[]) {
    if (segments.length === 0) return;
    this.pending = [...this.pending, ...segments].slice(-MAX_SEGMENTS_PER_REQUEST);
    if (!this.inFlight) this.flush();
  }

  private flush() {
    if (this.pending.length === 0) return;
    const batch = this.pending;
    this.pending = [];
    this.inFlight = true;
    const token = this.sessionToken;

    const req: AnalyzeRequest = { segments: batch, currentVisual: this.currentVisual };

    this.analyzer(req)
      .then((res) => {
        if (token !== this.sessionToken) return; // stale session — drop it
        this.inFlight = false;
        this.callbacks.onResult(res, req);
        if (this.pending.length > 0) this.flush();
      })
      .catch((err: unknown) => {
        if (token !== this.sessionToken) return;
        this.inFlight = false;
        const failure = asFailure(err, batch[batch.length - 1]?.id ?? "");
        this.callbacks.onError(failure);
        // Segments stay lost for this batch (preserved in the transcript,
        // per spec) — don't retry automatically, but keep draining anything
        // that coalesced in while this request was in flight.
        if (this.pending.length > 0) this.flush();
      });
  }
}

function asFailure(err: unknown, atSegmentId: string): AnalyzeFailure {
  if (err && typeof err === "object" && "code" in err && "message" in err) {
    const e = err as { code: unknown; message: unknown };
    return { code: String(e.code), message: String(e.message), atSegmentId };
  }
  return { code: "UNKNOWN_ERROR", message: "Analysis failed unexpectedly.", atSegmentId };
}
