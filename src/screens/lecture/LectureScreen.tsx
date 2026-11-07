import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { NotebookView } from "../../components/notebook/NotebookView";
import type { HandwritingControl } from "../../components/notebook/InkToolbar";
import { Icon } from "../../components/ui/Icon";
import { useStoreVersion, type NotebookApi } from "../../hooks/useNotebook";
import type { useLectureSession } from "../../hooks/useLectureSession";
import { formatClock } from "../../lib/lectureClock";
import { Switch } from "../Sheets";
import { FeedMini, FeedPanel, type FeedData } from "./FeedPanel";
import { PipWindow } from "./PipWindow";
import { SplitView } from "./SplitView";
import type { Card } from "../../types";
import type { CuesApi } from "../../hooks/useCues";
import { useSketches } from "../../hooks/useSketches";
import { usePicturePref } from "./CardPicture";

export type LectureMode = "notes" | "split" | "feed";

/** Not decided yet (CONTEXT §9): how long without ink before the feed auto-expands. */
export const ZONE_OUT_IDLE_MS = 20_000;

/** The ink tool capsules float under the top bar, so the PiP's top corners sit below them. */
const PIP_TOP_BELOW_TOOLBAR = 134;

type Session = ReturnType<typeof useLectureSession>;

/** Always-visible proof that the mic is (or isn't) being heard, in every layout. */
function LiveCaption({ session }: { session: Session }) {
  if (session.source === "sample") {
    return (
      <span className="caption-chip sample" title="Pick Live microphone under Prototype options in Start class to use your voice">
        <i className="cap-dot" /> Sample lecture · your mic isn't used
      </span>
    );
  }
  if (session.phase === "paused") {
    return (
      <span className="caption-chip">
        <i className="cap-dot" /> Paused
      </span>
    );
  }
  const status = session.transcriptionSupport === "unsupported" ? "unsupported" : session.speechStatus;
  const label: Record<string, string> = {
    unsupported: "Live captions need desktop Chrome",
    off: "Transcription off",
    starting: "Starting mic…",
    listening: "Listening. Say something",
    hearing: "",
    error: "Not transcribing. See the message above",
  };
  const text = status === "hearing" || (status === "listening" && session.captionText) ? session.captionText : label[status];
  return (
    <span className={`caption-chip ${status}`} aria-live="polite" title={session.captionText || undefined}>
      <i className="cap-dot" />
      <span className="caption-text">{text}</span>
    </span>
  );
}

type Props = {
  nb: NotebookApi;
  session: Session;
  /** The running/finished lecture belongs to this notebook. */
  sessionHere: boolean;
  handwriting: HandwritingControl & { penActivity: () => void; editLine: (key: string, text: string) => void };
  cues: CuesApi;
  expandOnIdle: boolean;
  onHome: () => void;
  onReview: () => void;
  onRecord: () => void;
  banners: ReactNode;
  overlay?: ReactNode;
};

export function LectureScreen({ nb, session, sessionHere, handwriting, cues, expandOnIdle, onHome, onReview, onRecord, banners, overlay }: Props) {
  useStoreVersion(nb.store);
  const notebook = nb.store.notebook;
  const stageRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [mode, setModeState] = useState<LectureMode>("notes");
  const [ratio, setRatio] = useState(0.5);
  const [pipVisible, setPipVisible] = useState(true);
  const [autoExpanded, setAutoExpanded] = useState(false);
  const [zoneOut, setZoneOut] = useState(expandOnIdle);
  const [splitHintSeen, setSplitHintSeen] = useState(false);
  const lastInk = useRef(Date.now());

  useEffect(() => setZoneOut(expandOnIdle), [expandOnIdle]);

  const phase = sessionHere ? session.phase : "idle";
  const recording = phase === "running" || phase === "paused";

  const [picture, setPicture] = usePicturePref();

  // Feed data: the live session when it belongs here, otherwise the lecture saved with this notebook.
  const [savedViewing, setSavedViewing] = useState<string | null>(null);
  const savedCards: Card[] = notebook.cards ?? [];
  const feed: FeedData = useMemo(() => {
    if (sessionHere && (session.phase !== "idle" || session.cards.length > 0)) {
      return {
        cards: session.cards,
        latestCard: session.latestCard,
        viewingCard: session.viewingCard,
        isViewingHistory: session.isViewingHistory,
        viewCard: session.viewCard,
        backToLive: session.backToLive,
        transcript: session.transcript,
        interimText: session.interimText,
        notes: nb.store.noteLines(),
        onEditNote: handwriting.editLine,
        live: session.phase === "running" || session.phase === "paused",
        error: session.analysisError?.message ?? null,
        cues: notebook.cues ?? [],
        cueActions: cues,
        sketches: notebook.sketches ?? {},
        picture,
        setPicture,
      };
    }
    const latest = savedCards[savedCards.length - 1] ?? null;
    const viewing = savedCards.find((c) => c.id === savedViewing) ?? latest;
    return {
      cards: savedCards,
      latestCard: latest,
      viewingCard: viewing,
      isViewingHistory: !!viewing && viewing !== latest,
      viewCard: setSavedViewing,
      backToLive: () => setSavedViewing(null),
      transcript: (notebook.transcript ?? []).map((s) => ({ ...s, interim: false })),
      interimText: "",
      notes: nb.store.noteLines(),
      onEditNote: handwriting.editLine,
      live: false,
      cues: notebook.cues ?? [],
      cueActions: cues,
      sketches: notebook.sketches ?? {},
      picture,
      setPicture,
    };
  }, [sessionHere, session, savedCards, savedViewing, notebook.transcript, notebook.cues, notebook.sketches, nb.store, handwriting.editLine, cues, picture, setPicture]);

  // Option B: Anatomy Live sketches the live card and the card being viewed.
  useSketches({ store: nb.store, wanted: [feed.latestCard, feed.viewingCard], enabled: picture === "sketch" });

  const hasFeed = recording || feed.cards.length > 0 || feed.cues.length > 0;

  const setMode = useCallback((m: LectureMode, auto = false) => {
    setModeState(m);
    setAutoExpanded(auto);
    if (m === "notes") {
      lastInk.current = Date.now();
      setPipVisible(true);
    }
  }, []);

  // Zone-out detection: if you stop writing during a lecture, the feed expands.
  useEffect(() => {
    if (!zoneOut || phase !== "running") return;
    lastInk.current = Date.now();
    const id = setInterval(() => {
      if (Date.now() - lastInk.current > ZONE_OUT_IDLE_MS) {
        setModeState((m) => {
          if (m === "feed") return m;
          setAutoExpanded(true);
          return "feed";
        });
      }
    }, 1000);
    return () => clearInterval(id);
  }, [zoneOut, phase]);

  const modeRef = useRef(mode);
  modeRef.current = mode;
  const onPenDown = useCallback(() => {
    lastInk.current = Date.now();
    handwriting.penActivity();
    // Writing on the notes side shrinks the feed back to PiP.
    if (modeRef.current === "split") {
      setMode("notes");
    }
  }, [handwriting, setMode]);

  const clockNow = useCallback(() => (recording ? session.clock.elapsedSec() : null), [recording, session.clock]);
  const seekAvailable = sessionHere && phase === "ended" && !!session.recordingUrl;

  const notes = (
    <div className="notes-pane">
      {nb.ready && (
        <NotebookView
          nb={nb}
          clockNow={clockNow}
          handwriting={handwriting}
          onPenDown={onPenDown}
          onStrokeCommitted={cues.onStrokeCommitted}
          onTypedText={cues.onTypedText}
          seekAvailable={seekAvailable}
          compactToolbar={mode === "split"}
          onSeek={(t) => {
            const a = audioRef.current;
            if (!a) return;
            a.currentTime = t;
            void a.play().catch(() => undefined);
          }}
        />
      )}
      {mode === "split" && !splitHintSeen && (
        <div className="glass menu-tier hint-card">
          <Icon name="pen" size={18} />
          <span>Writing here shrinks the feed back to picture-in-picture.</span>
          <button className="btn small primary" onClick={() => setMode("notes")}>
            Back to notes
          </button>
          <button className="icon-btn" aria-label="Dismiss" onClick={() => setSplitHintSeen(true)}>
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className={`screen lecture ${hasFeed && mode !== "notes" ? "dark-chrome" : ""}`} ref={stageRef}>
      <header className="glass topbar-glass lecture-top">
        <button className="btn glass-btn" onClick={onHome}>
          <Icon name="back" size={18} /> Notebooks
        </button>
        <div className="lecture-title">
          {notebook.courseCode && <span className="smallcaps">{notebook.courseCode}</span>}
          <strong>{notebook.title}</strong>
        </div>
        <div className="top-actions">
          {feed.cards.length > 0 && !recording && (
            <button className="btn glass-btn" onClick={onReview}>
              <Icon name="play" size={14} /> Lecture review
            </button>
          )}
        </div>
      </header>

      <div className="toast-stack">{banners}</div>

      <SplitView
        mode={hasFeed ? mode : "notes"}
        ratio={ratio}
        setRatio={setRatio}
        onFullFeed={() => setMode("feed")}
        onNotes={() => setMode("notes")}
        feed={<FeedPanel data={feed} autoExpanded={autoExpanded} onTakeNotes={mode === "feed" ? () => setMode("notes") : undefined} />}
        notes={notes}
      />

      {hasFeed && mode === "notes" && pipVisible && (
        <PipWindow
          stageRef={stageRef}
          topInset={PIP_TOP_BELOW_TOOLBAR}
          onExpand={() => {
            setRatio(0.5);
            setMode("split");
          }}
          onClose={() => setPipVisible(false)}
        >
          <FeedMini data={feed} />
        </PipWindow>
      )}

      <footer className="glass bottombar">
        <div className="bb-left">
          {recording ? (
            <>
              <span className={`rec-dot ${phase === "running" ? "on" : ""}`} aria-hidden="true" />
              <span className="timer">{formatClock(session.timerSec)}</span>
              {phase === "running" ? (
                <button className="round-btn" onClick={session.pauseSession} aria-label="Pause">
                  <Icon name="pause" size={16} />
                </button>
              ) : (
                <button className="round-btn" onClick={session.resumeSession} aria-label="Resume">
                  <Icon name="play" size={16} />
                </button>
              )}
              <button className="round-btn stop" onClick={session.stopSession} aria-label="Stop">
                <Icon name="stop" size={14} />
              </button>
              <LiveCaption session={session} />
            </>
          ) : phase === "ended" ? (
            <>
              <button className="btn rec-btn" onClick={onRecord}>
                <span className="rec-dot on" aria-hidden="true" /> Record
              </button>
              <span className="bb-note">Lecture ended · {formatClock(session.timerSec)}</span>
              {session.recordingUrl && <audio ref={audioRef} className="bb-audio" controls src={session.recordingUrl} />}
            </>
          ) : (
            <button className="btn rec-btn" onClick={onRecord}>
              <span className="rec-dot on" aria-hidden="true" /> Record lecture
            </button>
          )}
        </div>

        <div className="bb-center">
          {hasFeed && (
            <div className="glass segmented mode-switch" role="tablist" aria-label="Layout">
              {(
                [
                  ["notes", "Notes", "notes"],
                  ["split", "Split", "split"],
                  ["feed", "Feed", "feed"],
                ] as const
              ).map(([m, label, icon]) => (
                <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? "on" : ""} onClick={() => setMode(m)}>
                  <Icon name={icon} size={16} /> {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="bb-right">
          {hasFeed && mode === "notes" && !pipVisible && (
            <button className="btn pill-btn" onClick={() => setPipVisible(true)}>
              <span className="live-dot" aria-hidden="true" /> Show live feed
            </button>
          )}
          {recording && (
            <label className="zone-toggle">
              <span>Zone-out detection</span>
              <Switch on={zoneOut} onChange={setZoneOut} label="Zone-out detection" />
            </label>
          )}
        </div>
      </footer>

      {overlay}
    </div>
  );
}
