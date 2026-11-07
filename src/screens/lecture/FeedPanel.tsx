import { useEffect, useRef, useState } from "react";
import { VisualRenderer } from "../../components/VisualRenderer";
import { TranscriptPanel } from "../../components/TranscriptPanel";
import { formatClock } from "../../lib/lectureClock";
import type { Card, TranscriptSegment, VisualType } from "../../types";
import type { CueRecord, NoteLine } from "../../ink/model";
import type { CuesApi } from "../../hooks/useCues";
import { CueBadge, CueList } from "./CueList";

export const VISUAL_LABELS: Record<VisualType, string> = {
  "concept-map": "Concept map",
  flowchart: "Flowchart",
  cycle: "Cycle",
  timeline: "Timeline",
  hierarchy: "Hierarchy",
  comparison: "Comparison",
  venn: "Venn",
  chart: "Chart",
  schematic: "Schematic",
  recap: "Recap",
};

export type FeedData = {
  cards: Card[];
  latestCard: Card | null;
  viewingCard: Card | null;
  isViewingHistory: boolean;
  viewCard: (id: string) => void;
  backToLive: () => void;
  transcript: TranscriptSegment[];
  interimText: string;
  notes: NoteLine[];
  onEditNote?: (key: string, text: string) => void;
  live: boolean;
  /** Why no visual is coming (analysis request failing). */
  error?: string | null;
  /** Symbol cues from the notes (??, ★, highlight / ==term==) and their answers. */
  cues: CueRecord[];
  cueActions: Pick<CuesApi, "provideText" | "dismiss" | "toggle">;
};

/** Transcript column appears once the panel is at least this wide (pt). */
const TRANSCRIPT_MIN_WIDTH = 820;
/** Width of the "Your marks" column, and the panel width that gets one. */
const CUES_COLUMN_WIDTH = 300;
const CUES_SIDE_MIN_WIDTH = 760;

/** The dark live feed: label, topic, one-line summary, visual, timeline chips, transcript. */
export function FeedPanel({ data, autoExpanded, onTakeNotes, compact }: { data: FeedData; autoExpanded?: boolean; onTakeNotes?: () => void; compact?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const card = data.viewingCard;
  const hasCues = data.cues.length > 0;
  // Marks get their own column when there's room, otherwise they stack under the visual.
  const cuesSide = hasCues && width >= CUES_SIDE_MIN_WIDTH;
  const showTranscript = !compact && width >= TRANSCRIPT_MIN_WIDTH + (cuesSide ? CUES_COLUMN_WIDTH : 0);

  return (
    <div className={`feed ${showTranscript ? "with-transcript" : ""}`} ref={ref}>
      <div className="feed-main">
        <div className="feed-top">
          <span className={`feed-label ${data.isViewingHistory ? "past" : ""}`}>
            {data.isViewingHistory ? (
              <>EARLIER · {card ? formatClock(card.visual.sourceStartSec) : ""}</>
            ) : (
              <>
                {data.live && <i className="live-dot" aria-hidden="true" />}
                {data.live ? "LIVE" : "LAST"} · {card ? VISUAL_LABELS[card.visual.visualType] : "Waiting"}
              </>
            )}
          </span>
          {autoExpanded && <span className="auto-badge">Auto-expanded · you paused writing</span>}
          {data.isViewingHistory && (
            <button className="btn gold small" onClick={data.backToLive}>
              Back to live
            </button>
          )}
          {onTakeNotes && (
            <button className="btn glass-dark small" onClick={onTakeNotes}>
              Take notes
            </button>
          )}
        </div>

        {card ? (
          <div className="feed-card">
            <h2 className="feed-title">{card.visual.topic}</h2>
            <p className="feed-summary">{card.visual.recap}</p>
            <div className="feed-visual">
              <VisualRenderer visual={card.visual} />
            </div>
          </div>
        ) : (
          <div className={`feed-empty ${data.error ? "has-error" : ""}`}>
            <span className="feed-empty-orb" aria-hidden="true" />
            {data.error ? (
              <p>
                <strong>No visuals: the live feed can't reach analysis.</strong>
                <br />
                {data.error}
              </p>
            ) : (
              <p>{data.live ? "Listening. The first visual appears shortly after the lecture starts." : "No visuals yet. Start a lecture to build the feed."}</p>
            )}
          </div>
        )}

        {data.cards.length > 0 && (
          <div className="chip-row" role="list" aria-label="Earlier visuals">
            {data.cards.map((c) => {
              const isLive = c.id === data.latestCard?.id;
              const viewing = c.id === card?.id;
              return (
                <button
                  key={c.id}
                  role="listitem"
                  className={`t-chip ${isLive ? "live" : ""} ${viewing ? "viewing" : ""}`}
                  onClick={() => (isLive ? data.backToLive() : data.viewCard(c.id))}
                  title={c.visual.topic}
                >
                  <span className="t-time">{formatClock(c.visual.sourceStartSec)}</span>
                  <span className="t-name">{c.visual.topic}</span>
                </button>
              );
            })}
          </div>
        )}
        {hasCues && !cuesSide && <CueList cues={data.cues} actions={data.cueActions} />}
      </div>
      {cuesSide && (
        <div className="feed-cues">
          <CueList cues={data.cues} actions={data.cueActions} />
        </div>
      )}
      {showTranscript && (
        <div className="feed-transcript">
          <TranscriptPanel transcript={data.transcript} interimText={data.interimText} notes={data.notes} onEditNote={data.onEditNote} />
        </div>
      )}
    </div>
  );
}

/** The small version inside the PiP window: label, title and visual only. */
export function FeedMini({ data }: { data: FeedData }) {
  const card = data.viewingCard;
  return (
    <div className="feed mini">
      <span className="feed-label">
        {data.live && <i className="live-dot" aria-hidden="true" />}
        {data.live ? "LIVE" : "LAST"} · {card ? VISUAL_LABELS[card.visual.visualType] : "Waiting"}
      </span>
      {card ? (
        <>
          <div className="feed-title mini">{card.visual.topic}</div>
          <div className="feed-visual mini">
            <VisualRenderer visual={card.visual} />
          </div>
        </>
      ) : (
        <p className="feed-empty mini">{data.error ? "Live feed unavailable. See the message above." : "Listening…"}</p>
      )}
      <CueBadge cues={data.cues} />
    </div>
  );
}
