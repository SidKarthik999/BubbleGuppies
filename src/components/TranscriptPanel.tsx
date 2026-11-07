import { useEffect, useMemo, useRef, useState } from "react";
import { formatClock } from "../lib/lectureClock";
import type { TranscriptSegment } from "../types";
import type { NoteLine } from "../ink/model";

type Props = {
  transcript: TranscriptSegment[];
  interimText: string;
  /** Lines read from the student's handwriting (shown with ✎, editable). */
  notes?: NoteLine[];
  onEditNote?: (key: string, text: string) => void;
};

type Row =
  | { kind: "lecture"; at: number; seg: TranscriptSegment }
  | { kind: "note"; at: number; note: NoteLine };

export function TranscriptPanel({ transcript, interimText, notes = [], onEditNote }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const rows = useMemo<Row[]>(() => {
    const r: Row[] = [
      ...transcript.map((seg) => ({ kind: "lecture" as const, at: seg.startSec, seg })),
      ...notes.filter((n) => n.text.trim()).map((note) => ({ kind: "note" as const, at: note.atSec, note })),
    ];
    return r.sort((a, b) => a.at - b.at);
  }, [transcript, notes]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || editing) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [rows.length, interimText, editing]);

  return (
    <aside className="transcript-panel">
      <div className="panel-title">Live Transcript{notes.length ? " + your notes" : ""}</div>
      <div className="transcript-scroll" ref={scrollRef}>
        {rows.length === 0 && interimText === "" && (
          <p style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>
            The lecture transcript and the handwriting read from your notes appear here.
          </p>
        )}
        {rows.map((row) =>
          row.kind === "lecture" ? (
            <p className="transcript-line" key={row.seg.id}>
              <span className="ts">{formatClock(row.seg.startSec)}</span>
              {row.seg.text}
            </p>
          ) : (
            <div className="transcript-line note-line" key={row.note.key}>
              <span className="ts">{formatClock(row.note.atSec)}</span>
              <span className="note-badge" title="Read from your handwriting">✎</span>
              {editing === row.note.key ? (
                <input
                  className="note-edit"
                  defaultValue={row.note.text}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") setEditing(null);
                  }}
                  onBlur={(e) => {
                    onEditNote?.(row.note.key, e.target.value);
                    setEditing(null);
                  }}
                />
              ) : (
                <button className="note-text" title="Misread? Click to fix it" onClick={() => onEditNote && setEditing(row.note.key)}>
                  {row.note.text}
                  {row.note.edited && <span className="muted"> (edited)</span>}
                </button>
              )}
            </div>
          )
        )}
        {interimText && (
          <p className="transcript-line interim">
            <span className="ts">…</span>
            {interimText}
          </p>
        )}
      </div>
    </aside>
  );
}
