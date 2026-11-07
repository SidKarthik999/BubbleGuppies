import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { OcrClient } from "../ink/handwriting/ocrClient";
import { NoteReader } from "../ink/handwriting/noteReader";
import type { NotebookStore } from "../ink/notebookStore";
import type { NoteLine } from "../ink/model";
import type { Segment } from "../types";

const PREF_KEY = "nova:readHandwriting";
export const NOTE_PREFIX = "Student's handwritten note: ";

/** Short, stable id per line so versions of a line share a prefix. */
function lineId(key: string): string {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

export function noteLineToSegment(line: NoteLine): Segment {
  return {
    id: `note-${lineId(line.key)}-v${line.version}`,
    startSec: line.atSec,
    endSec: line.atSec,
    text: NOTE_PREFIX + line.text.trim(),
  };
}

function readPref(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== "off";
  } catch {
    return true;
  }
}

/**
 * Wires the on-device handwriting recognizer to the notebook: lines are read
 * after the student pauses, and their text is handed to `onSegments` — the
 * same analysis path the lecture transcript uses.
 */
export function useHandwriting(store: NotebookStore, onSegments: (segments: Segment[]) => void) {
  const [ocr] = useState(() => new OcrClient());
  const onSegmentsRef = useRef(onSegments);
  onSegmentsRef.current = onSegments;
  const [reader] = useState(
    () => new NoteReader(store, ocr, (lines) => onSegmentsRef.current(lines.map(noteLineToSegment)))
  );
  const [enabled, setEnabledState] = useState(readPref);
  const status = useSyncExternalStore(ocr.subscribe, ocr.getStatus);

  useEffect(() => {
    reader.setEnabled(enabled);
    if (enabled && store.notebook.pages.some((p) => p.strokes.length > 0)) ocr.warmUp();
    if (!enabled) ocr.turnOff();
  }, [enabled, ocr, reader, store]);

  // Attach on every mount: StrictMode's dev-only unmount/remount would
  // otherwise leave the reader unsubscribed after destroy().
  useEffect(() => {
    reader.attach();
    return () => reader.destroy();
  }, [reader]);

  const setEnabled = useCallback((on: boolean) => {
    setEnabledState(on);
    try {
      localStorage.setItem(PREF_KEY, on ? "on" : "off");
    } catch {
      /* fine */
    }
  }, []);

  /** Student fixes a misread line: store it and analyze the corrected text. */
  const editLine = useCallback(
    (key: string, text: string) => {
      const line = store.noteLines().find((l) => l.key === key);
      if (!line || text.trim() === line.text.trim()) return;
      const next: NoteLine = { ...line, text: text.trim(), edited: true, version: line.version + 1, updatedAt: Date.now() };
      store.upsertNoteLine(next);
      if (next.text.length >= 2) onSegmentsRef.current([noteLineToSegment(next)]);
    },
    [store]
  );

  const penActivity = useCallback(() => {
    reader.penActivity();
    if (enabled && ocr.status.state === "off") ocr.warmUp();
  }, [enabled, ocr, reader]);

  return { enabled, setEnabled, status, editLine, penActivity };
}
