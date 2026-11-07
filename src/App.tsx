import { useLectureSession } from "./hooks/useLectureSession";
import { RecordControls } from "./components/RecordControls";
import { ModeToggle } from "./components/ModeToggle";
import { ErrorBanner } from "./components/ErrorBanner";
import { BackToLiveBanner } from "./components/BackToLiveBanner";
import { MainPanel } from "./components/MainPanel";
import { TranscriptPanel } from "./components/TranscriptPanel";
import { Timeline } from "./components/Timeline";
import { ReviewView } from "./components/ReviewView";

export default function App() {
  const session = useLectureSession();
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
  } = session;

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
        <div className="spacer" />
        <ModeToggle
          source={source}
          setSource={setSource}
          backend={backend}
          setBackend={setBackend}
          disabled={!canChangeMode}
        />
        {phase === "ended" && <button onClick={resetSession}>New recording</button>}
      </header>

      {phase === "ended" ? (
        <ReviewView cards={cards} transcript={transcript} recordingUrl={recordingUrl} />
      ) : (
        <div className="main-layout">
          <div className="main-panel">
            {recorderError && <ErrorBanner kind="error">{recorderError}</ErrorBanner>}
            {source === "live" && transcriptionSupport === "unsupported" && (
              <ErrorBanner kind="warn">
                Live transcription isn't supported in this browser. Recording still works, but the
                transcript won't fill in automatically — try desktop Chrome for live text.
              </ErrorBanner>
            )}
            {transcriptionError && <ErrorBanner kind="warn">{transcriptionError}</ErrorBanner>}
            {analysisError && (
              <ErrorBanner kind="error" onDismiss={dismissAnalysisError}>
                Analysis unavailable ({analysisError.code}) — your recording and transcript are
                safe. {analysisError.message}
              </ErrorBanner>
            )}

            <BackToLiveBanner visible={isViewingHistory} onClick={backToLive} />
            <MainPanel visual={currentVisualForDisplay} />
            <Timeline
              cards={cards}
              viewingId={viewingCard?.id ?? null}
              latestId={latestCard?.id ?? null}
              onSelect={viewCard}
            />
          </div>
          <TranscriptPanel transcript={transcript} interimText={interimText} />
        </div>
      )}
    </div>
  );
}
