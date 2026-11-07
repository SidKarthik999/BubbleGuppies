import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../components/ui/Icon";
import { CardPicture, usePicturePref } from "./lecture/CardPicture";
import { useSketches } from "../hooks/useSketches";
import { useStoreVersion } from "../hooks/useNotebook";
import type { NotebookStore } from "../ink/notebookStore";
import { formatClock } from "../lib/lectureClock";
import { VISUAL_LABELS } from "./lecture/FeedPanel";
import type { Card, Segment } from "../types";

type Props = {
  title: string;
  courseCode?: string;
  cards: Card[];
  transcript: Segment[];
  audioUrl: string | null;
  onBack: () => void;
  onMyNotes: () => void;
  /** Notebook store: holds saved Anatomy Live sketches and receives new ones. */
  store: NotebookStore;
};

/** Replay a lecture along the timeline of visuals it generated (CONTEXT §3.5). */
export function ReviewScreen({ title, courseCode, cards, transcript, audioUrl, onBack, onMyNotes, store }: Props) {
  useStoreVersion(store);
  const [picture, setPicture] = usePicturePref();
  const sorted = useMemo(() => [...cards].sort((a, b) => a.visual.sourceStartSec - b.visual.sourceStartSec), [cards]);
  const [selectedId, setSelectedId] = useState<string | null>(sorted[0]?.id ?? null);
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const lineRefs = useRef<Record<string, HTMLParagraphElement | null>>({});

  const duration = Math.max(
    1,
    transcript[transcript.length - 1]?.endSec ?? 0,
    sorted[sorted.length - 1]?.visual.sourceStartSec ?? 0
  );
  const selIndex = Math.max(0, sorted.findIndex((c) => c.id === selectedId));
  const selected = sorted[selIndex] ?? null;
  const rangeStart = selected?.visual.sourceStartSec ?? 0;
  const rangeEnd = sorted[selIndex + 1]?.visual.sourceStartSec ?? Infinity;
  useSketches({ store, wanted: [selected], enabled: picture === "sketch" });
  const inRange = (s: Segment) => s.startSec >= rangeStart && s.startSec < rangeEnd;

  // Keep the highlighted lines in view.
  useEffect(() => {
    const first = transcript.find(inRange);
    if (first) lineRefs.current[first.id]?.scrollIntoView({ behavior: "smooth", block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const selectAt = (sec: number) => {
    let pick = sorted[0];
    for (const c of sorted) if (c.visual.sourceStartSec <= sec) pick = c;
    if (pick && pick.id !== selectedId) setSelectedId(pick.id);
  };

  const seek = (sec: number, play = false) => {
    setPosition(sec);
    selectAt(sec);
    const a = audioRef.current;
    if (a) {
      a.currentTime = sec;
      if (play) void a.play().catch(() => undefined);
    }
  };

  return (
    <div className="screen review backdrop">
      <header className="glass topbar-glass">
        <button className="btn glass-btn" onClick={onBack}>
          <Icon name="back" size={18} /> Notebooks
        </button>
        <div className="lecture-title">
          {courseCode && <span className="smallcaps">{courseCode}</span>}
          <strong>Lecture review · {title}</strong>
        </div>
        <button className="btn glass-btn" onClick={onMyNotes}>
          <Icon name="notes" size={16} /> My notes
        </button>
      </header>

      {sorted.length === 0 ? (
        <div className="review-empty">
          <p>No visuals were generated for this lecture.</p>
        </div>
      ) : (
        <div className="review-grid">
          <nav className="glass menu-tier review-col timeline-col" aria-label="Visual timeline">
            <div className="col-title">Timeline</div>
            {sorted.map((c) => (
              <button key={c.id} className={`tl-item ${c.id === selected?.id ? "on" : ""}`} onClick={() => seek(c.visual.sourceStartSec)}>
                <span className="tl-time">{formatClock(c.visual.sourceStartSec)}</span>
                <span className="tl-text">
                  <small>{VISUAL_LABELS[c.visual.visualType]}</small>
                  {c.visual.topic}
                </span>
              </button>
            ))}
          </nav>

          <section className="review-col center-col feed">
            {selected && (
              <>
                <div className="feed-top">
                  <span className="feed-label">
                    {formatClock(selected.visual.sourceStartSec)} · {VISUAL_LABELS[selected.visual.visualType]}
                  </span>
                  <button className="btn gold small" disabled={!audioUrl} onClick={() => seek(selected.visual.sourceStartSec, true)} title={audioUrl ? undefined : "No audio was saved for this lecture"}>
                    <Icon name="play" size={14} /> Play from {formatClock(selected.visual.sourceStartSec)}
                  </button>
                </div>
                <h2 className="feed-title">{selected.visual.topic}</h2>
                <p className="feed-summary">{selected.visual.recap}</p>
                <div className="feed-visual">
                  <CardPicture visual={selected.visual} sketch={store.notebook.sketches?.[selected.id]} pref={picture} setPref={setPicture} />
                </div>
              </>
            )}
          </section>

          <aside className="glass menu-tier review-col transcript-col" aria-label="Transcript">
            <div className="col-title">Transcript</div>
            {transcript.length === 0 && <p className="muted">No transcript was saved.</p>}
            {transcript.map((s) => (
              <p
                key={s.id}
                ref={(el) => {
                  lineRefs.current[s.id] = el;
                }}
                className={`r-line ${inRange(s) ? "hl" : ""}`}
                onClick={() => seek(s.startSec)}
              >
                <span className="ts">{formatClock(s.startSec)}</span>
                {s.text}
              </p>
            ))}
          </aside>
        </div>
      )}

      <footer className="glass bottombar scrubber">
        <button
          className="round-btn"
          disabled={!audioUrl}
          aria-label={playing ? "Pause" : "Play"}
          onClick={() => {
            const a = audioRef.current;
            if (!a) return;
            if (a.paused) void a.play().catch(() => undefined);
            else a.pause();
          }}
        >
          <Icon name={playing ? "pause" : "play"} size={16} />
        </button>
        <span className="timer">{formatClock(position)}</span>
        <div className="scrub-track">
          {sorted.map((c) => (
            <button
              key={c.id}
              className={`scrub-tick ${c.id === selected?.id ? "on" : ""}`}
              style={{ left: `${(c.visual.sourceStartSec / duration) * 100}%` }}
              onClick={() => seek(c.visual.sourceStartSec)}
              aria-label={`${formatClock(c.visual.sourceStartSec)} ${c.visual.topic}`}
              title={c.visual.topic}
            />
          ))}
          <input
            type="range"
            min={0}
            max={duration}
            step={0.5}
            value={position}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label="Lecture position"
          />
        </div>
        <span className="timer dim">{formatClock(duration)}</span>
        {audioUrl ? (
          <audio
            ref={audioRef}
            src={audioUrl}
            onTimeUpdate={(e) => {
              const t = e.currentTarget.currentTime;
              setPosition(t);
              selectAt(t);
            }}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            hidden
          />
        ) : (
          <span className="bb-note">No audio saved</span>
        )}
      </footer>
    </div>
  );
}
