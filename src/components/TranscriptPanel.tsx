import { useEffect, useRef } from "react";
import { formatClock } from "../lib/lectureClock";
import type { TranscriptSegment } from "../types";

type Props = {
  transcript: TranscriptSegment[];
  interimText: string;
};

export function TranscriptPanel({ transcript, interimText }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [transcript.length, interimText]);

  return (
    <aside className="transcript-panel">
      <div className="panel-title">Live Transcript</div>
      <div className="transcript-scroll" ref={scrollRef}>
        {transcript.length === 0 && interimText === "" && (
          <p style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>
            Transcript will appear here once the lecture starts.
          </p>
        )}
        {transcript.map((segment) => (
          <p className="transcript-line" key={segment.id}>
            <span className="ts">{formatClock(segment.startSec)}</span>
            {segment.text}
          </p>
        ))}
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
