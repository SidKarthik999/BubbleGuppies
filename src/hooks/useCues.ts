import { useCallback, useEffect, useRef } from "react";
import { CUE_IDLE_MS, detectCues } from "../ink/cues/detector";
import { verticalOverlap } from "../ink/geometry";
import { newId, type BBox, type CueRecord, type Stroke, type TextBox } from "../ink/model";
import type { NotebookStore } from "../ink/notebookStore";
import type { CueAnswer, CueKind, NoteCue } from "../types";

// Symbol cues (Tier 1): marks in your notes become requests to the live feed.
//   ??  → question: the line is explained, and its diagram node gets a "?"
//   ★   → important: the idea is emphasized in the diagram (weight = star count)
//   highlight / ==term== → vocab: a short definition
// Ink cues come from the on-device detector; their text comes from the
// on-device handwriting reader (or the student types it in the feed card).

/** How long an ink cue waits for the handwriting reader before asking the student to type it. */
const READ_WAIT_MS = 12_000;

/** Strip cue marks the handwriting reader may have read along with the words. */
function cleanLineText(text: string): string {
  return text.replace(/[?？]{2,}/g, " ").replace(/[*★☆]+/g, " ").replace(/\s+/g, " ").trim();
}

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/** Cues typed in a text box: `line ??`, `* line` / `line ***`, `==term==`. */
export function parseTypedCues(text: string): { kind: CueKind; text: string; weight?: 1 | 2 | 3 }[] {
  const out: { kind: CueKind; text: string; weight?: 1 | 2 | 3 }[] = [];
  for (const raw of text.split(/\n+/)) {
    let line = raw.trim();
    if (!line) continue;
    for (const m of line.matchAll(/==([^=\n]{1,80}?)==/g)) {
      const term = m[1].trim();
      if (term) out.push({ kind: "vocab", text: term });
    }
    line = line.replace(/==([^=\n]{1,80}?)==/g, "$1");
    const q = line.match(/^(.*?)\s*\?{2,}\s*$/);
    if (q && q[1].trim()) {
      out.push({ kind: "question", text: q[1].trim() });
      continue;
    }
    const lead = line.match(/^(\*{1,3})\s*(.+)$/);
    const trail = line.match(/^(.+?)\s*(\*{1,3})$/);
    const star = lead ? { n: lead[1].length, t: lead[2] } : trail ? { n: trail[2].length, t: trail[1] } : null;
    if (star && star.t.trim()) out.push({ kind: "important", text: star.t.trim(), weight: star.n as 1 | 2 | 3 });
  }
  return out;
}

type Options = {
  store: NotebookStore;
  submitCues: (cues: NoteCue[]) => void;
  /** Lecture clock, or null outside a recording. */
  clockNow: () => number | null;
  readingEnabled: boolean;
};

export function useCues({ store, submitCues, clockNow, readingEnabled }: Options) {
  const optsRef = useRef({ submitCues, clockNow, readingEnabled });
  optsRef.current = { submitCues, clockNow, readingEnabled };
  const fresh = useRef(new Map<string, Set<string>>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const waitTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const send = useCallback(
    (rec: CueRecord, text: string) => {
      const cue: NoteCue = { ...rec.cue, text: text.slice(0, 300) };
      store.updateCue(rec.cue.id, { cue, status: "ready", sent: true });
      optsRef.current.submitCues([cue]);
    },
    [store]
  );

  /** Text the handwriting reader found on the cue's target line, if any. */
  const lineTextFor = useCallback(
    (pageId: string, target: BBox): string => {
      const lines = store
        .noteLines()
        .filter((l) => l.pageId === pageId && verticalOverlap(l.bbox, target) >= 0.4 * Math.min(l.bbox.maxY - l.bbox.minY, target.maxY - target.minY))
        .sort((a, b) => a.bbox.minX - b.bbox.minX);
      return cleanLineText(lines.map((l) => l.text).join(" "));
    },
    [store]
  );

  /** Ink cues waiting on the reader: send them as soon as their line is read. */
  const resolvePending = useCallback(() => {
    for (const rec of store.notebook.cues) {
      if (rec.status !== "transcribing" || !rec.pageId || !rec.anchor) continue;
      const text = lineTextFor(rec.pageId, rec.anchor);
      if (text.length >= 2) {
        clearTimeout(waitTimers.current.get(rec.cue.id));
        waitTimers.current.delete(rec.cue.id);
        send(rec, text);
      }
    }
  }, [lineTextFor, send, store]);

  useEffect(() => store.subscribe((e) => e.type === "notes-changed" && resolvePending()), [resolvePending, store]);

  const runDetector = useCallback(
    (pageId: string) => {
      const page = store.page(pageId);
      const ids = fresh.current.get(pageId);
      fresh.current.delete(pageId);
      if (!page || !ids?.size) return;
      const detections = detectCues({ strokes: page.strokes, freshIds: ids, consumedIds: store.consumedSymbolIds() });
      const reading = optsRef.current.readingEnabled;
      for (const d of detections) {
        const target = page.strokes.filter((s) => d.targetStrokeIds.includes(s.id));
        const rec: CueRecord = {
          cue: {
            id: newId("cue"),
            kind: d.kind,
            text: "",
            ...(d.weight ? { weight: d.weight } : {}),
            atSec: target.reduce<number | null>((t, s) => (s.t != null && (t == null || s.t < t) ? s.t : t), null),
            source: "ink",
          },
          pageId,
          anchor: d.targetBBox,
          symbolStrokeIds: d.symbolStrokeIds,
          targetStrokeIds: d.targetStrokeIds,
          status: reading ? "transcribing" : "needs-text",
          collapsed: false,
          sent: false,
          createdAt: Date.now(),
        };
        store.addCue(rec);
        if (!reading) continue;
        const now = lineTextFor(pageId, d.targetBBox);
        if (now.length >= 2) {
          send(rec, now);
          continue;
        }
        waitTimers.current.set(
          rec.cue.id,
          setTimeout(() => {
            const cur = store.notebook.cues.find((c) => c.cue.id === rec.cue.id);
            if (cur?.status === "transcribing") store.updateCue(rec.cue.id, { status: "needs-text" });
          }, READ_WAIT_MS)
        );
      }
    },
    [lineTextFor, send, store]
  );

  /** NotebookView → every committed stroke; detection runs after the pen rests. */
  const onStrokeCommitted = useCallback(
    (pageId: string, stroke: Stroke) => {
      const set = fresh.current.get(pageId) ?? new Set<string>();
      set.add(stroke.id);
      fresh.current.set(pageId, set);
      clearTimeout(timers.current.get(pageId));
      timers.current.set(
        pageId,
        setTimeout(() => runDetector(pageId), CUE_IDLE_MS)
      );
    },
    [runDetector]
  );

  /** NotebookView → a committed text box; typed marks are exact, so they go out at once. */
  const onTypedText = useCallback(
    (pageId: string, box: TextBox) => {
      for (const c of parseTypedCues(box.text)) {
        const id = `cue-typed-${hash(`${box.id}|${c.kind}|${c.text}`)}`;
        if (store.notebook.cues.some((r) => r.cue.id === id)) continue;
        const rec: CueRecord = {
          cue: { id, kind: c.kind, text: c.text, ...(c.weight ? { weight: c.weight } : {}), atSec: box.t ?? optsRef.current.clockNow(), source: "typed" },
          pageId,
          anchor: { minX: box.x, minY: box.y, maxX: box.x + box.width, maxY: box.y + 24 },
          symbolStrokeIds: [],
          targetStrokeIds: [],
          status: "ready",
          collapsed: false,
          sent: false,
          createdAt: Date.now(),
        };
        store.addCue(rec);
        send(rec, c.text);
      }
    },
    [send, store]
  );

  /** The student typed what a line says (reader off, or it couldn't read it). */
  const provideText = useCallback(
    (cueId: string, text: string) => {
      const rec = store.notebook.cues.find((c) => c.cue.id === cueId);
      if (rec && text.trim().length >= 2) send(rec, text.trim());
    },
    [send, store]
  );

  /** Answers from /api/analyze (or the offline demo). */
  const applyAnswers = useCallback(
    (answers: CueAnswer[]) => {
      for (const a of answers) store.updateCue(a.cueId, { answer: a });
    },
    [store]
  );

  const dismiss = useCallback((cueId: string) => store.dismissCue(cueId), [store]);
  const toggle = useCallback((cueId: string) => store.updateCue(cueId, (c) => ({ ...c, collapsed: !c.collapsed })), [store]);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      waitTimers.current.forEach(clearTimeout);
    },
    []
  );

  return { onStrokeCommitted, onTypedText, provideText, applyAnswers, dismiss, toggle };
}

export type CuesApi = ReturnType<typeof useCues>;
