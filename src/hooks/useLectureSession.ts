import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { createLectureClock } from "../lib/lectureClock";
import { AnalysisQueue, createApiAnalyzer, type Analyzer } from "../lib/analyzeClient";
import { createOfflineAnalyzer } from "../lib/offlineFixtures";
import { SAMPLE_TRANSCRIPT, SAMPLE_DURATION_SEC } from "../lib/sampleTranscript";
import { useRecorder } from "./useRecorder";
import { useSpeechRecognition } from "./useSpeechRecognition";
import type {
  AnalysisBackend,
  AnalyzeFailure,
  AnalyzeResponse,
  Card,
  Segment,
  SessionSource,
  TranscriptSegment,
  Visual,
} from "../types";

const WORD_THRESHOLD = 30;
const SEGMENT_COUNT_THRESHOLD = 4;
const SAMPLE_TICK_MS = 200;
const DISPLAY_TICK_MS = 250;

type Phase = "idle" | "running" | "paused" | "ended";

function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

function makeAnalyzer(backend: AnalysisBackend): Analyzer {
  return backend === "offline" ? createOfflineAnalyzer() : createApiAnalyzer();
}

export function useLectureSession() {
  const clockRef = useRef(createLectureClock());
  const clock = clockRef.current;

  const [source, setSource] = useState<SessionSource>("sample");
  const [backend, setBackend] = useState<AnalysisBackend>("offline");
  const [phase, setPhase] = useState<Phase>("idle");

  // setInterval callbacks (the sample-transcript ticker) close over whatever
  // was current when the interval was scheduled, so `phase` state itself
  // goes stale inside them. phaseRef is always current and is what any
  // interval/timeout-driven code should check instead of the `phase` state
  // variable.
  const phaseRef = useRef<Phase>("idle");
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [viewingCardId, setViewingCardId] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<AnalyzeFailure | null>(null);

  // Forces a re-render on a short tick so components reading clock.elapsedSec()
  // (the timer display) stay live while the session is running.
  const [, forceTick] = useReducer((n: number) => n + 1, 0);

  const pendingBufferRef = useRef<Segment[]>([]);
  const pendingWordsRef = useRef(0);
  const cardCounterRef = useRef(0);
  const emittedSampleIdsRef = useRef<Set<string>>(new Set());
  const sampleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleAnalyzeResult = useCallback((res: AnalyzeResponse) => {
    if (res.action === "skip") return;
    setAnalysisError(null);
    if (res.action === "append") {
      cardCounterRef.current += 1;
      const card: Card = {
        id: `card-${cardCounterRef.current}`,
        visual: res.visual,
        updatedAt: Date.now(),
      };
      setCards((prev) => [...prev, card]);
      queueRef.current.setCurrentVisual(res.visual);
    } else if (res.action === "replace") {
      setCards((prev) => {
        if (prev.length === 0) return prev; // defensive: server shouldn't replace with no current visual
        const next = prev.slice(0, -1);
        const last = prev[prev.length - 1];
        next.push({ ...last, visual: res.visual, updatedAt: Date.now() });
        return next;
      });
      queueRef.current.setCurrentVisual(res.visual);
    }
  }, []);

  const handleAnalyzeError = useCallback((err: AnalyzeFailure) => {
    setAnalysisError(err);
  }, []);

  const queueRef = useRef(
    new AnalysisQueue(createOfflineAnalyzer(), {
      onResult: handleAnalyzeResult,
      onError: handleAnalyzeError,
    })
  );

  // Keep the queue's analyzer in sync with the backend toggle.
  useEffect(() => {
    queueRef.current.setAnalyzer(makeAnalyzer(backend));
  }, [backend]);

  const handleFinalSegment = useCallback((segment: Segment) => {
    if (segment.text.trim().length === 0) return;
    setTranscript((prev) => [...prev, { ...segment, interim: false }]);
    pendingBufferRef.current = [...pendingBufferRef.current, segment];
    pendingWordsRef.current += wordCount(segment.text);

    const ready =
      pendingWordsRef.current >= WORD_THRESHOLD ||
      pendingBufferRef.current.length >= SEGMENT_COUNT_THRESHOLD;
    if (ready) {
      queueRef.current.enqueue(pendingBufferRef.current);
      pendingBufferRef.current = [];
      pendingWordsRef.current = 0;
    }
  }, []);

  const speech = useSpeechRecognition(clock, { onFinalSegment: handleFinalSegment });
  const recorder = useRecorder(clock);

  const flushPending = useCallback(() => {
    if (pendingBufferRef.current.length > 0) {
      queueRef.current.enqueue(pendingBufferRef.current);
      pendingBufferRef.current = [];
      pendingWordsRef.current = 0;
    }
  }, []);

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
    }
    flushPending();
    phaseRef.current = "ended";
    setPhase("ended");
  }, [clock, flushPending, recorder, source, speech, stopSampleTimer]);

  const tickSample = useCallback(() => {
    const elapsed = clock.elapsedSec();
    for (const segment of SAMPLE_TRANSCRIPT) {
      if (segment.startSec <= elapsed && !emittedSampleIdsRef.current.has(segment.id)) {
        emittedSampleIdsRef.current.add(segment.id);
        handleFinalSegment(segment);
      }
    }
    if (elapsed >= SAMPLE_DURATION_SEC) {
      stopSession();
    }
  }, [clock, handleFinalSegment, stopSession]);

  const startSession = useCallback(async () => {
    setCards([]);
    setTranscript([]);
    setViewingCardId(null);
    setAnalysisError(null);
    pendingBufferRef.current = [];
    pendingWordsRef.current = 0;
    cardCounterRef.current = 0;
    emittedSampleIdsRef.current = new Set();
    queueRef.current.resetSession();
    queueRef.current.setAnalyzer(makeAnalyzer(backend));

    if (source === "live") {
      const ok = await recorder.start();
      if (!ok) return; // recorder surfaces its own error state; stay idle
      speech.start();
    } else {
      recorder.reset();
      clock.reset();
      clock.start();
      stopSampleTimer();
      sampleTimerRef.current = setInterval(tickSample, SAMPLE_TICK_MS);
    }
    phaseRef.current = "running";
    setPhase("running");
  }, [backend, clock, recorder, source, speech, stopSampleTimer, tickSample]);

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
    setCards([]);
    setTranscript([]);
    setViewingCardId(null);
    setAnalysisError(null);
    phaseRef.current = "idle";
    setPhase("idle");
  }, [clock, recorder, stopSampleTimer]);

  // Tick a counter while running so the on-screen timer updates live.
  useEffect(() => {
    if (phase !== "running") return;
    const id = setInterval(forceTick, DISPLAY_TICK_MS);
    return () => clearInterval(id);
  }, [phase]);

  // Always stop the sample timer on unmount.
  useEffect(() => stopSampleTimer, [stopSampleTimer]);

  const latestCard = cards.length > 0 ? cards[cards.length - 1] : null;
  const viewingCard = viewingCardId
    ? cards.find((c) => c.id === viewingCardId) ?? latestCard
    : latestCard;
  const isViewingHistory =
    viewingCardId !== null && latestCard !== null && viewingCardId !== latestCard.id;

  const viewCard = useCallback((id: string) => setViewingCardId(id), []);
  const backToLive = useCallback(() => setViewingCardId(null), []);
  const dismissAnalysisError = useCallback(() => setAnalysisError(null), []);

  const currentVisualForDisplay: Visual | null = viewingCard?.visual ?? null;

  return {
    source,
    setSource,
    backend,
    setBackend,
    phase,
    canChangeMode: phase === "idle",

    startSession,
    pauseSession,
    resumeSession,
    stopSession,
    resetSession,

    timerSec: clock.elapsedSec(),

    recorderState: recorder.state,
    recorderError: recorder.error,
    recordingUrl: recorder.recordingUrl,

    transcriptionSupport: speech.support,
    transcriptionError: speech.error,
    interimText: source === "live" ? speech.interimText : "",

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
