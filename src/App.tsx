import { useCallback, useEffect, useRef, useState } from "react";
import { useLectureSession } from "./hooks/useLectureSession";
import { useNotebook, useStoreVersion } from "./hooks/useNotebook";
import { useHandwriting } from "./hooks/useHandwriting";
import { RecordControls } from "./components/RecordControls";
import { ModeToggle } from "./components/ModeToggle";
import { ErrorBanner } from "./components/ErrorBanner";
import { BackToLiveBanner } from "./components/BackToLiveBanner";
import { MainPanel } from "./components/MainPanel";
import { TranscriptPanel } from "./components/TranscriptPanel";
import { Timeline } from "./components/Timeline";
import { ReviewView } from "./components/ReviewView";
import { NotebookView } from "./components/notebook/NotebookView";

type View = "notes" | "guide";

export default function App() {
  const session = useLectureSession();
  const nb = useNotebook();
  const [view, setView] = useState<View>("notes");
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  // Handwriting -> text -> the same analysis pipeline as the lecture transcript.
  const handwriting = useHandwriting(nb.store, session.submitNoteSegments);
  useStoreVersion(nb.store);
  const noteLines = nb.store.noteLines();
  const {
    source,
    setSource,
    backend,
    setBackend,
    phase,
    canChangeMode,
    startSession,
    pauseSession,
    resumeSession,
    stopSession,
    resetSession,
    timerSec,
    recorderState,
    recorderError,
    recordingUrl,
    transcriptionSupport,
    transcriptionError,
    interimText,
    transcript,
    cards,
    latestCard,
    viewingCard,
    currentVisualForDisplay,
    isViewingHistory,
    viewCard,
    backToLive,
    analysisError,
    dismissAnalysisError,
    clock,
  } = session;

  // Ink is stamped with the lecture clock only while a lecture is running/paused.
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const clockNow = useCallback(
    () => (phaseRef.current === "running" || phaseRef.current === "paused" ? clock.elapsedSec() : null),
    [clock]
  );

  // Save the lecture (transcript + study-guide cards) with the notebook when it ends.
  useEffect(() => {
    if (phase === "ended") nb.store.saveSession(transcript, cards, null);
  }, [phase, transcript, cards, nb.store]);

  const banners = (
    <>
      {recorderError && <ErrorBanner kind="error">{recorderError}</ErrorBanner>}
      {source === "live" && transcriptionSupport === "unsupported" && (
        <ErrorBanner kind="warn">
          Live transcription isn't supported in this browser. Recording still works, but the transcript
          won't fill in automatically — try desktop Chrome for live text.
        </ErrorBanner>
      )}
      {transcriptionError && <ErrorBanner kind="warn">{transcriptionError}</ErrorBanner>}
      {analysisError && (
        <ErrorBanner kind="error" onDismiss={dismissAnalysisError}>
          Analysis unavailable ({analysisError.code}) — your recording, notes, and transcript are safe.{" "}
          {analysisError.message}
        </ErrorBanner>
      )}
      {nb.storageError && (
        <ErrorBanner kind="warn">
          Notes can't be saved locally right now ({nb.storageError}). Keep this tab open.
        </ErrorBanner>
      )}
    </>
  );

  return (
    <div className="app-shell">
      <header className="topbar">
        <strong>NOVA</strong>
        <RecordControls
          phase={phase}
          source={source}
          recorderState={recorderState}
          timerSec={timerSec}
          onStart={startSession}
          onPause={pauseSession}
          onResume={resumeSession}
          onStop={stopSession}
        />
        <div className="view-toggle" role="tablist" aria-label="View">
          <button role="tab" aria-selected={view === "notes"} className={view === "notes" ? "active" : ""} onClick={() => setView("notes")}>
            Notes
          </button>
          <button role="tab" aria-selected={view === "guide"} className={view === "guide" ? "active" : ""} onClick={() => setView("guide")}>
            Guide
          </button>
        </div>
        <div className="spacer" />
        <ModeToggle source={source} setSource={setSource} backend={backend} setBackend={setBackend} disabled={!canChangeMode} />
        {phase === "ended" && <button onClick={resetSession}>New recording</button>}
      </header>

      {view === "notes" ? (
        <div className="notes-layout">
          <div className="notes-main">
            {nb.ready ? (
              <NotebookView
                nb={nb}
                clockNow={clockNow}
                handwriting={handwriting}
                onPenDown={handwriting.penActivity}
                seekAvailable={phase === "ended" && !!recordingUrl}
                onSeek={(t) => {
                  // Tap ink -> jump the recording to when it was written.
                  const a = audioRef.current;
                  if (!a) return;
                  a.currentTime = t;
                  void a.play().catch(() => undefined);
                }}
              />
            ) : (
              <p className="muted" style={{ padding: "1rem" }}>
                Opening your notebook…
              </p>
            )}
          </div>
          <aside className="notes-side">
            {banners}
            {phase === "ended" && recordingUrl && (
              <div className="card replay-card">
                <div className="panel-title" style={{ padding: 0, marginBottom: "0.4rem" }}>
                  Recording — pick ▶︎ in the toolbar (S) and tap ink to jump to when you wrote it
                </div>
                <audio ref={audioRef} controls src={recordingUrl} />
              </div>
            )}
            <BackToLiveBanner visible={isViewingHistory} onClick={backToLive} />
            <MainPanel visual={currentVisualForDisplay} />
            <Timeline
              cards={cards}
              viewingId={viewingCard?.id ?? null}
              latestId={latestCard?.id ?? null}
              onSelect={(id) => {
                viewCard(id);
                // In review, a card also seeks the recording to its source.
                const card = cards.find((c) => c.id === id);
                const a = audioRef.current;
                if (phase === "ended" && card && a) a.currentTime = card.visual.sourceStartSec;
              }}
            />
            <section className={`side-transcript ${transcriptOpen ? "open" : ""}`}>
              <button className="side-transcript-toggle" onClick={() => setTranscriptOpen((v) => !v)} aria-expanded={transcriptOpen}>
                {transcriptOpen ? "▾" : "▸"} Transcript
                {!transcriptOpen && transcript.length > 0 && (
                  <span className="muted"> — {transcript[transcript.length - 1].text.slice(0, 60)}…</span>
                )}
                {!transcriptOpen && transcript.length === 0 && noteLines.length > 0 && (
                  <span className="muted"> — ✎ {noteLines.length} line{noteLines.length === 1 ? "" : "s"} read from your notes</span>
                )}
              </button>
              {transcriptOpen && (
                <TranscriptPanel transcript={transcript} interimText={interimText} notes={noteLines} onEditNote={handwriting.editLine} />
              )}
            </section>
          </aside>
        </div>
      ) : phase === "ended" ? (
        <ReviewView cards={cards} transcript={transcript} recordingUrl={recordingUrl} />
      ) : (
        <div className="main-layout">
          <div className="main-panel">
            {banners}
            <BackToLiveBanner visible={isViewingHistory} onClick={backToLive} />
            <MainPanel visual={currentVisualForDisplay} />
            <Timeline cards={cards} viewingId={viewingCard?.id ?? null} latestId={latestCard?.id ?? null} onSelect={viewCard} />
          </div>
          <TranscriptPanel transcript={transcript} interimText={interimText} notes={noteLines} onEditNote={handwriting.editLine} />
        </div>
      )}
    </div>
  );
}
