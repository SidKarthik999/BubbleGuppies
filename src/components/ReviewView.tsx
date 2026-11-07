import { useRef, useState } from "react";
import { formatClock } from "../lib/lectureClock";
import type { Card, TranscriptSegment } from "../types";

type Props = {
  cards: Card[];
  transcript: TranscriptSegment[];
  recordingUrl: string | null;
};

/** End-of-lecture ordered review. Clicking a card jumps the transcript to
 * its source segment and seeks the recorded audio there (when a recording
 * exists — the sample demo has no real audio to seek). */
export function ReviewView({ cards, transcript, recordingUrl }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const transcriptRefs = useRef<Record<string, HTMLParagraphElement | null>>({});
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  function jumpToSource(sourceStartSec: number) {
    const target =
      transcript.find((s) => s.startSec >= sourceStartSec) ?? transcript[transcript.length - 1];
    if (target) {
      setHighlightedId(target.id);
      transcriptRefs.current[target.id]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    if (audioRef.current) {
      audioRef.current.currentTime = sourceStartSec;
    }
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 360px",
        gap: "1.5rem",
        padding: "1.5rem",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <div style={{ overflowY: "auto" }}>
        <h2 style={{ marginTop: 0 }}>Lecture review</h2>

        {recordingUrl ? (
          <audio ref={audioRef} controls src={recordingUrl} style={{ marginBottom: "1.25rem" }} />
        ) : (
          <p style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>
            No recorded audio for this session — the sample demo has no real recording to replay.
          </p>
        )}

        <div className="review-list">
          {cards.length === 0 && (
            <p style={{ color: "var(--text-dim)" }}>No study-guide cards were generated this lecture.</p>
          )}
          {cards.map((card) => (
            <div key={card.id} className="card review-item">
              <div>
                <span className="tag">{card.visual.visualType}</span>
                <h3 style={{ margin: "0.4rem 0" }}>{card.visual.topic}</h3>
                <p className="recap" style={{ margin: 0 }}>
                  {card.visual.recap}
                </p>
              </div>
              <button onClick={() => jumpToSource(card.visual.sourceStartSec)}>
                Jump to {formatClock(card.visual.sourceStartSec)}
              </button>
            </div>
          ))}
        </div>
      </div>

      <aside style={{ overflowY: "auto", borderLeft: "1px solid var(--border)", paddingLeft: "1.5rem" }}>
        <div className="panel-title" style={{ padding: 0, marginBottom: "0.5rem" }}>
          Full transcript
        </div>
        {transcript.map((segment) => (
          <p
            key={segment.id}
            ref={(el) => {
              transcriptRefs.current[segment.id] = el;
            }}
            className="transcript-line"
            style={
              segment.id === highlightedId
                ? { background: "rgba(110, 168, 254, 0.15)", borderRadius: 6, padding: "0.15rem 0.3rem" }
                : undefined
            }
          >
            <span className="ts">{formatClock(segment.startSec)}</span>
            {segment.text}
          </p>
        ))}
      </aside>
    </div>
  );
}
