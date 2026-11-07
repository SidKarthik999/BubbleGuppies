import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { createLectureClock } from "../lib/lectureClock";
import { AnalysisQueue, createApiAnalyzer, type Analyzer } from "../lib/analyzeClient";
import { createOfflineAnalyzer } from "../lib/offlineFixtures";
import { SAMPLE_TRANSCRIPT, SAMPLE_DURATION_SEC } from "../lib/sampleTranscript";
import { synthesizeLectureAudio } from "../lib/sampleAudio";
import { useRecorder } from "./useRecorder";
import { useSpeechRecognition } from "./useSpeechRecognition";
import type {
  AnalysisBackend,
  AnalyzeFailure,
  AnalyzeResponse,
  Card,
  CueAnswer,
  NoteCue,
  Segment,
  SessionSource,
  TranscriptSegment,
  Visual,
} from "../types";

// Send analysis after ~25 new finalized words or 8 s, whichever comes first.
const WORD_THRESHOLD = 25;
const MAX_WAIT_MS = 8000;
const SAMPLE_TICK_MS = 100;
const DISPLAY_TICK_MS = 250;

export type Phase = "idle" | "running" | "paused" | "ended";
export type SampleSpeed = 1 | 2 | 4;

function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

function makeAnalyzer(backend: AnalysisBackend): Analyzer {
  return backend === "offline" ? createOfflineAnalyzer() : createApiAnalyzer();
}

export type LectureSessionOptions = {
  /** Cue answers from /api/analyze (or offline fixtures). */
  onCueAnswers?: (answers: CueAnswer[]) => void;
  /** Cues included in a request (so the UI can mark them as sent). */
  onCuesSent?: (cueIds: string[]) => void;
  /** Called on every sample tick with the lecture time (drives the demo ink). */
  onSampleTick?: (lectureSec: number) => void;
};

export function useLectureSession(options: LectureSessionOptions = {}) {
  const clockRef = useRef(createLectureClock());
  const clock = clockRef.current;
  const optsRef = useRef(options);
  optsRef.current = options;

  const [source, setSource] = useState<SessionSource>("sample");
  const [backend, setBackend] = useState<AnalysisBackend>("offline");
  const [sampleSpeed, setSampleSpeed] = useState<SampleSpeed>(2);
  const [phase, setPhase] = useState<Phase>("idle");
  const phaseRef = useRef<Phase>("idle");
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const transcriptRef = useRef<TranscriptSegment[]>([]);
  transcriptRef.current = transcript;
  const [cards, setCards] = useState<Card[]>([]);
  const cardsRef = useRef<Card[]>([]);
  cardsRef.current = cards;
  const [viewingCardId, setViewingCardId] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<AnalyzeFailure | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [sampleAudioUrl, setSampleAudioUrl] = useState<string | null>(null);
  const [restoredAudioUrl, setRestoredAudioUrl] = useState<string | null>(null);

  const [, forceTick] = useReducer((n: number) => n + 1, 0);

  const pendingBufferRef = useRef<Segment[]>([]);
  const pendingWordsRef = useRef(0);
  const waitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardCounterRef = useRef(0);
  const emittedSampleIdsRef = useRef<Set<string>>(new Set());
  const sampleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleAnalyzeResult = useCallback((res: AnalyzeResponse, req: { cues?: NoteCue[] }) => {
    setAnalysisError(null);
    if (res.cueAnswers?.length) {
      // Only accept answers for cues we actually sent.
      const sent = new Set((req.cues ?? []).map((c) => c.id));
      const answers = res.cueAnswers.filter((a) => sent.has(a.cueId));
      if (answers.length) optsRef.current.onCueAnswers?.(answers);
    }
    if (res.action === "skip") return;
    if (res.action === "append") {
      cardCounterRef.current += 1;
      const card: Card = { id: `card-${cardCounterRef.current}-${Date.now()}`, visual: res.visual, updatedAt: Date.now() };
      setCards((prev) => [...prev, card]);
      queueRef.current.setCurrentVisual(res.visual);
    } else if (res.action === "replace") {
      setCards((prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        // Replace keeps the original sourceStartSec (contract), and remembers
        // the previous visual so the renderer can keep unchanged nodes still.
        const visual = { ...res.visual, sourceStartSec: last.visual.sourceStartSec };
        return [...prev.slice(0, -1), { ...last, visual, previous: last.visual, updatedAt: Date.now() }];
      });
      queueRef.current.setCurrentVisual(res.visual);
    }
  }, []);

  const queueRef = useRef(
    new AnalysisQueue(createOfflineAnalyzer(), {
      onResult: (res, req) => handleAnalyzeResult(res, req),
      onError: (err) => setAnalysisError(err),
      onBusyChange: (b) => setAnalyzing(b),
      recentVisualTypes: () => cardsRef.current.slice(-5).map((c) => c.visual.visualType),
    })
  );

  useEffect(() => {
    queueRef.current.setAnalyzer(makeAnalyzer(backend));
    queueRef.current.allowsEmptySegments = backend === "offline";
  }, [backend]);

  const flushPending = useCallback(() => {
    if (waitTimerRef.current) {
      clearTimeout(waitTimerRef.current);
      waitTimerRef.current = null;
    }
    if (pendingBufferRef.current.length > 0) {
      queueRef.current.enqueue(pendingBufferRef.current);
      pendingBufferRef.current = [];
      pendingWordsRef.current = 0;
    }
  }, []);

  const handleFinalSegment = useCallback(
    (segment: Segment) => {
      if (segment.text.trim().length === 0) return;
      setTranscript((prev) => [...prev, { ...segment, interim: false }]);
      pendingBufferRef.current = [...pendingBufferRef.current, segment];
      pendingWordsRef.current += wordCount(segment.text);
      if (pendingWordsRef.current >= WORD_THRESHOLD) {
        flushPending();
      } else if (!waitTimerRef.current) {
        waitTimerRef.current = setTimeout(flushPending, MAX_WAIT_MS);
      }
    },
    [flushPending]
  );

  const speech = useSpeechRecognition(clock, { onFinalSegment: handleFinalSegment });
  const recorder = useRecorder(clock);

  const stopSampleTimer = useCallback(() => {
    if (sampleTimerRef.current !== null) {
      clearInterval(sampleTimerRef.current);
      sampleTimerRef.current = null;
    }
  }, []);

  const stopSession = useCallback(() => {
    if (phaseRef.current !== "running" && phaseRef.current !== "paused") return;
    if (source === "live") {
      speech.stop();
      recorder.stop();
    } else {
      stopSampleTimer();
      clock.stop();
      const blob = synthesizeLectureAudio(Math.max(1, clock.elapsedSec()));
      setSampleAudioUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
    }
    flushPending();
    phaseRef.current = "ended";
    setPhase("ended");
  }, [clock, flushPending, recorder, source, speech, stopSampleTimer]);

  const tickSample = useCallback(() => {
    const elapsed = clock.elapsedSec();
    for (const segment of SAMPLE_TRANSCRIPT) {
      if (segment.endSec <= elapsed && !emittedSampleIdsRef.current.has(segment.id)) {
        emittedSampleIdsRef.current.add(segment.id);
        handleFinalSegment(segment);
      }
    }
    optsRef.current.onSampleTick?.(elapsed);
    if (elapsed >= SAMPLE_DURATION_SEC + 0.5) stopSession();
  }, [clock, handleFinalSegment, stopSession]);

  const startSession = useCallback(async () => {
    setCards([]);
    setTranscript([]);
    setViewingCardId(null);
    setAnalysisError(null);
    setRestoredAudioUrl(null);
    pendingBufferRef.current = [];
    pendingWordsRef.current = 0;
    if (waitTimerRef.current) clearTimeout(waitTimerRef.current);
    waitTimerRef.current = null;
    cardCounterRef.current = 0;
    emittedSampleIdsRef.current = new Set();
    queueRef.current.resetSession();
    queueRef.current.setAnalyzer(makeAnalyzer(backend));

    if (source === "live") {
      clock.setRate(1);
      const ok = await recorder.start();
      if (!ok) return;
      speech.start();
    } else {
      recorder.reset();
      clock.reset();
      clock.setRate(sampleSpeed);
      clock.start();
      stopSampleTimer();
      sampleTimerRef.current = setInterval(tickSample, SAMPLE_TICK_MS);
    }
    phaseRef.current = "running";
    setPhase("running");
  }, [backend, clock, recorder, sampleSpeed, source, speech, stopSampleTimer, tickSample]);

  const pauseSession = useCallback(() => {
    if (phaseRef.current !== "running") return;
    if (source === "live") {
      recorder.pause();
      speech.stop();
    } else {
      clock.pause();
    }
    phaseRef.current = "paused";
    setPhase("paused");
  }, [clock, recorder, source, speech]);

  const resumeSession = useCallback(() => {
    if (phaseRef.current !== "paused") return;
    if (source === "live") {
      recorder.resume();
      speech.start();
    } else {
      clock.resume();
    }
    phaseRef.current = "running";
    setPhase("running");
  }, [clock, recorder, source, speech]);

  const resetSession = useCallback(() => {
    stopSampleTimer();
    recorder.reset();
    clock.reset();
    queueRef.current.resetSession();
    setCards([]);
    setTranscript([]);
    setViewingCardId(null);
    setAnalysisError(null);
    setRestoredAudioUrl(null);
    phaseRef.current = "idle";
    setPhase("idle");
  }, [clock, recorder, stopSampleTimer]);

  /** Re-opens a saved lecture (from a notebook) for review and replay. */
  const restoreSession = useCallback(
    (saved: { transcript: Segment[]; cards: Card[]; audioUrl: string | null }) => {
      if (phaseRef.current === "running" || phaseRef.current === "paused") return;
      if (saved.transcript.length === 0 && saved.cards.length === 0) return;
      setTranscript(saved.transcript.map((s) => ({ ...s, interim: false })));
      setCards(saved.cards);
      setViewingCardId(null);
      setRestoredAudioUrl(saved.audioUrl);
      phaseRef.current = "ended";
      setPhase("ended");
    },
    []
  );

  /** Sends note cues for answers; they ride along with the next request. */
  const submitCues = useCallback((cues: NoteCue[]) => {
    if (cues.length === 0) return;
    flushPending();
    const context = transcriptRef.current.filter((s) => !s.interim).slice(-2).map(({ interim: _i, ...s }) => s);
    queueRef.current.addCues(cues, context);
    optsRef.current.onCuesSent?.(cues.map((c) => c.id));
  }, [flushPending]);

  /**
   * Handwriting read from the notebook, analyzed exactly like transcript
   * segments: same queue, same single-flight requests, same cards.
   */
  const submitNoteSegments = useCallback((segments: Segment[]) => {
    queueRef.current.enqueueNotes(segments);
  }, []);

  useEffect(() => {
    if (phase !== "running") return;
    const id = setInterval(forceTick, DISPLAY_TICK_MS);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => stopSampleTimer, [stopSampleTimer]);

  const latestCard = cards.length > 0 ? cards[cards.length - 1] : null;
  const viewingCard = viewingCardId ? cards.find((c) => c.id === viewingCardId) ?? latestCard : latestCard;
  const isViewingHistory = viewingCardId !== null && latestCard !== null && viewingCardId !== latestCard.id;

  const viewCard = useCallback((id: string) => setViewingCardId(id), []);
  const backToLive = useCallback(() => setViewingCardId(null), []);
  const dismissAnalysisError = useCallback(() => setAnalysisError(null), []);

  const currentVisualForDisplay: Visual | null = viewingCard?.visual ?? null;
  const replayUrl = source === "live" ? recorder.recordingUrl ?? restoredAudioUrl : sampleAudioUrl ?? restoredAudioUrl;

  return {
    source,
    setSource,
    backend,
    setBackend,
    sampleSpeed,
    setSampleSpeed,
    phase,
    canChangeMode: phase === "idle" || phase === "ended",

    startSession,
    pauseSession,
    resumeSession,
    stopSession,
    resetSession,
    restoreSession,
    submitCues,
    submitNoteSegments,

    timerSec: clock.elapsedSec(),
    analyzing,

    recorderState: recorder.state,
    recorderError: recorder.error,
    recordingUrl: replayUrl,

    transcriptionSupport: speech.support,
    transcriptionError: speech.error,
    interimText: source === "live" ? speech.interimText : "",
    /** Live caption for the bottom bar: what the recognizer is hearing right now. */
    captionText: source === "live" ? speech.interimText || speech.lastFinalText : "",
    speechStatus: speech.status,

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
  };
}
