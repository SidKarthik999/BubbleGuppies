import { useCallback, useEffect, useRef, useState } from "react";
import { useCues, type CuesApi } from "./hooks/useCues";
import { useLectureSession } from "./hooks/useLectureSession";
import { useNotebook, useStoreVersion } from "./hooks/useNotebook";
import { useHandwriting } from "./hooks/useHandwriting";
import { ErrorBanner } from "./components/ErrorBanner";
import { HomeScreen, type NotebookAction } from "./screens/HomeScreen";
import { ImportSheet, NewNotebookSheet, StartClassModal, type StartClassChoice } from "./screens/Sheets";
import { LectureScreen } from "./screens/lecture/LectureScreen";
import { ReviewScreen } from "./screens/ReviewScreen";
import { GlassFilters } from "./components/ui/GlassFilters";
import type { AttachmentKind } from "./ink/model";
import { saveBlob } from "./ink/storage";
import type { AnalysisBackend, SessionSource } from "./types";

type Route = { name: "home" } | { name: "notebook"; id: string } | { name: "review"; id: string };

export default function App() {
  // Cue answers arrive through the session; the cue hook (below) stores them.
  const cuesRef = useRef<CuesApi | null>(null);
  const session = useLectureSession({ onCueAnswers: (answers) => cuesRef.current?.applyAnswers(answers) });
  const nb = useNotebook();
  useStoreVersion(nb.store);
  const handwriting = useHandwriting(nb.store, session.submitNoteSegments);
  const cues = useCues({
    store: nb.store,
    submitCues: session.submitCues,
    clockNow: () => (session.phase === "running" || session.phase === "paused" ? session.clock.elapsedSec() : null),
    readingEnabled: handwriting.enabled && handwriting.status.state !== "error",
  });
  cuesRef.current = cues;

  const [route, setRoute] = useState<Route>({ name: "home" });
  const [newSheet, setNewSheet] = useState(false);
  const [importSheet, setImportSheet] = useState<{ kind: AttachmentKind; notebookId: string | null } | null>(null);
  const [startPrompt, setStartPrompt] = useState(false);
  const [expandOnIdle, setExpandOnIdle] = useState(true);
  /** Notebook the lecture session (running or just ended) belongs to. */
  const [sessionNotebookId, setSessionNotebookId] = useState<string | null>(null);
  const [startRequest, setStartRequest] = useState<{ source: SessionSource; backend: AnalysisBackend } | null>(null);
  const [reviewAudio, setReviewAudio] = useState<string | null>(null);

  const { phase, transcript, cards } = session;
  const lectureActive = phase === "running" || phase === "paused";

  // setSource/setBackend are state updates; start only once the session sees the new values.
  useEffect(() => {
    if (!startRequest) return;
    if (session.source !== startRequest.source) return session.setSource(startRequest.source);
    if (session.backend !== startRequest.backend) return session.setBackend(startRequest.backend);
    setStartRequest(null);
    void session.startSession();
  }, [startRequest, session]);

  // Save the lecture (transcript + visuals) with its notebook when it ends.
  useEffect(() => {
    if (phase === "ended" && sessionNotebookId && nb.store.notebook.id === sessionNotebookId) {
      nb.store.saveSession(transcript, cards, null);
    }
  }, [phase, transcript, cards, nb.store, sessionNotebookId]);

  // Keep the recording too, so Lecture review can play it after a reload.
  const recordingUrl = session.recordingUrl;
  useEffect(() => {
    if (phase !== "ended" || !recordingUrl || !sessionNotebookId) return;
    let cancelled = false;
    (async () => {
      const blob = await fetch(recordingUrl).then((r) => r.blob());
      const id = `audio-${sessionNotebookId}-${Date.now()}`;
      await saveBlob(id, blob);
      if (!cancelled && nb.store.notebook.id === sessionNotebookId) {
        nb.store.saveSession(nb.store.notebook.transcript, nb.store.notebook.cards, id);
      }
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [phase, recordingUrl, sessionNotebookId, nb.store]);

  const open = useCallback(
    async (id: string) => {
      if (lectureActive && sessionNotebookId !== id) {
        if (!window.confirm("A lecture is still recording in another notebook. Stop it and continue?")) return false;
        session.stopSession();
      }
      return nb.openNotebook(id);
    },
    [lectureActive, nb, session, sessionNotebookId]
  );

  const onAction = useCallback(
    async (id: string, action: NotebookAction) => {
      if (action === "import") {
        setImportSheet({ kind: "own-pdf", notebookId: id });
        return;
      }
      if (!(await open(id))) return;
      if (action === "problem-set") nb.noteActivity("problem-set");
      setStartPrompt(action === "lecture" && !(lectureActive && sessionNotebookId === id));
      setRoute({ name: "notebook", id });
    },
    [lectureActive, nb, open, sessionNotebookId]
  );

  const beginClass = useCallback(
    (c: StartClassChoice) => {
      setStartPrompt(false);
      setExpandOnIdle(c.expandOnIdle);
      if (!c.record) return;
      if (lectureActive) session.stopSession();
      nb.noteActivity("lecture");
      setSessionNotebookId(nb.store.notebook.id);
      setStartRequest({ source: c.source, backend: c.backend });
    },
    [lectureActive, nb, session]
  );

  const openReview = useCallback(
    async (id: string) => {
      if (!(await open(id))) return;
      const url = sessionNotebookId === id && session.recordingUrl ? session.recordingUrl : await nb.loadAudio();
      setReviewAudio(url);
      setRoute({ name: "review", id });
    },
    [nb, open, session.recordingUrl, sessionNotebookId]
  );

  const goHome = useCallback(() => {
    if (lectureActive && sessionNotebookId === nb.store.notebook.id) {
      if (!window.confirm("Stop recording and go back to your notebooks?")) return;
      session.stopSession();
    }
    void nb.store.saveNow().then(() => nb.refreshList());
    setRoute({ name: "home" });
  }, [lectureActive, nb, session, sessionNotebookId]);

  const banners = (
    <>
      {session.recorderError && <ErrorBanner kind="error">{session.recorderError}</ErrorBanner>}
      {session.source === "live" && lectureActive && session.transcriptionSupport === "unsupported" && (
        <ErrorBanner kind="warn">Live transcription isn't supported in this browser. Recording still works; try desktop Chrome for live text.</ErrorBanner>
      )}
      {session.transcriptionError && <ErrorBanner kind="warn">{session.transcriptionError}</ErrorBanner>}
      {session.analysisError && (
        <ErrorBanner kind="error" onDismiss={session.dismissAnalysisError}>
          Live feed unavailable ({session.analysisError.code}). Your recording, notes and transcript are safe. {session.analysisError.message}
        </ErrorBanner>
      )}
      {nb.storageError && <ErrorBanner kind="warn">Notes can't be saved on this device right now ({nb.storageError}). Keep this tab open.</ErrorBanner>}
    </>
  );

  const current = nb.store.notebook;
  const showNotebook = route.name === "notebook" && current.id === route.id;
  const showReview = route.name === "review" && current.id === route.id;

  return (
    <>
      <GlassFilters />
      {showNotebook ? (
        <LectureScreen
          nb={nb}
          session={session}
          sessionHere={sessionNotebookId === current.id}
          handwriting={handwriting}
          cues={cues}
          expandOnIdle={expandOnIdle}
          onHome={goHome}
          onReview={() => void openReview(current.id)}
          onRecord={() => setStartPrompt(true)}
          banners={banners}
          overlay={
            startPrompt && (
              <StartClassModal
                courseName={current.title}
                courseCode={current.courseCode ?? ""}
                initial={{ source: session.source, backend: session.backend }}
                onClose={() => setStartPrompt(false)}
                onBegin={beginClass}
              />
            )
          }
        />
      ) : showReview ? (
        <ReviewScreen
          title={current.title}
          courseCode={current.courseCode}
          cards={current.cards ?? []}
          transcript={current.transcript ?? []}
          audioUrl={reviewAudio}
          onBack={goHome}
          onMyNotes={() => setRoute({ name: "notebook", id: current.id })}
        />
      ) : (
        <HomeScreen
          notebooks={nb.notebooks}
          onAction={(id, a) => void onAction(id, a)}
          onReview={(id) => void openReview(id)}
          onNewNotebook={() => setNewSheet(true)}
          onImport={(kind) => setImportSheet({ kind, notebookId: null })}
          banner={nb.storageError ? <ErrorBanner kind="warn">Notes can't be saved on this device ({nb.storageError}).</ErrorBanner> : null}
        />
      )}

      {newSheet && (
        <NewNotebookSheet
          onClose={() => setNewSheet(false)}
          onCreate={async (input) => {
            if (lectureActive) session.stopSession();
            await nb.createNotebook(input);
            setNewSheet(false);
          }}
        />
      )}
      {importSheet && (
        <ImportSheet
          initialKind={importSheet.kind}
          initialNotebookId={importSheet.notebookId}
          notebooks={nb.notebooks}
          onClose={() => setImportSheet(null)}
          onImport={async (id, kind, files) => {
            if (!(await open(id))) return;
            for (const f of files) await nb.importPdf(f, kind);
            await nb.store.saveNow();
            await nb.refreshList();
            setImportSheet(null);
            setStartPrompt(false);
            setRoute({ name: "notebook", id });
          }}
        />
      )}
    </>
  );
}
