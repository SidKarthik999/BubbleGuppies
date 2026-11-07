import { useCallback, useEffect, useRef, useState } from "react";
import {
  getSpeechRecognitionCtor,
  isSpeechRecognitionSupported,
  type SpeechRecognitionLike,
} from "../lib/speechRecognitionTypes";
import type { LectureClock } from "../lib/lectureClock";
import type { Segment, TranscriptionSupport } from "../types";

let liveSegmentCounter = 0;

type Options = {
  onFinalSegment: (segment: Segment) => void;
};

/**
 * off: not running · starting: start() called, engine not up yet ·
 * listening: engine is up, nothing recognized recently · hearing: words came in
 * within the last few seconds · error: stopped for a reason the user must fix.
 */
export type SpeechStatus = "off" | "starting" | "listening" | "hearing" | "error";

const HEARING_WINDOW_MS = 3000;
const RESTART_DELAY_MS = 250;

function errorMessage(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Live transcription was blocked. Allow microphone access for this site, then start the lecture again.";
    case "audio-capture":
      return "No microphone audio reached the speech recognizer. Check that the right mic is selected in your system and browser settings.";
    case "network":
      return "Chrome's speech service couldn't be reached (it needs an internet connection). The recording continues; the transcript will resume when it reconnects.";
    case "language-not-supported":
      return "Speech recognition doesn't support English (en-US) in this browser.";
    default:
      return `Live transcription hit a problem (${code}) and is trying to resume.`;
  }
}

/**
 * Wraps the browser's live speech recognition (Chrome desktop) and turns
 * its results into timestamped Segments using the shared lecture clock.
 * Recognition engines stop on their own periodically even mid-sentence —
 * this restarts it automatically while the recorder is still listening, so
 * transcription stays continuous for the whole lecture.
 */
export function useSpeechRecognition(clock: LectureClock, { onFinalSegment }: Options) {
  const [support] = useState<TranscriptionSupport>(
    isSpeechRecognitionSupported() ? "available" : "unsupported"
  );
  const [active, setActive] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [lastFinalText, setLastFinalText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [engineUp, setEngineUp] = useState(false);
  const [heardAt, setHeardAt] = useState(0);
  const [, setTick] = useState(0);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const shouldRunRef = useRef(false);
  const fatalRef = useRef(false);
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const segmentStartRef = useRef(0);
  const onFinalSegmentRef = useRef(onFinalSegment);
  onFinalSegmentRef.current = onFinalSegment;

  const buildRecognition = useCallback((): SpeechRecognitionLike | null => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return null;
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setEngineUp(true);
      if (!fatalRef.current) setError(null);
    };

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) {
          const endSec = clock.elapsedSec();
          const startSec = Math.min(segmentStartRef.current, endSec);
          segmentStartRef.current = endSec;
          const trimmed = text.trim();
          if (trimmed.length > 0) {
            liveSegmentCounter += 1;
            setLastFinalText(trimmed);
            onFinalSegmentRef.current({
              id: `live-${liveSegmentCounter}`,
              startSec,
              endSec,
              text: trimmed,
            });
          }
        } else {
          interim += text;
        }
      }
      setInterimText(interim);
      setHeardAt(Date.now());
      setError(null);
    };

    recognition.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") {
        return; // transient; onend below decides whether to restart
      }
      const fatal = event.error === "not-allowed" || event.error === "service-not-allowed" || event.error === "language-not-supported";
      if (fatal) {
        fatalRef.current = true;
        shouldRunRef.current = false;
        setActive(false);
      }
      setError(errorMessage(event.error));
    };

    recognition.onend = () => {
      setEngineUp(false);
      if (!shouldRunRef.current) {
        setActive(false);
        return;
      }
      // Unexpected stop while we're still supposed to be listening — restart
      // after a beat (an immediate start() right after onend can throw).
      if (restartTimer.current) clearTimeout(restartTimer.current);
      restartTimer.current = setTimeout(() => {
        if (!shouldRunRef.current) return;
        try {
          recognition.start();
        } catch {
          // Already starting; the next onend retries.
        }
      }, RESTART_DELAY_MS);
    };

    return recognition;
  }, [clock]);

  const start = useCallback(() => {
    if (support === "unsupported") return;
    setError(null);
    fatalRef.current = false;
    const recognition = buildRecognition();
    if (!recognition) return;
    recognitionRef.current = recognition;
    shouldRunRef.current = true;
    segmentStartRef.current = clock.elapsedSec();
    try {
      recognition.start();
      setActive(true);
    } catch {
      setActive(false);
      setError("Could not start live transcription.");
    }
  }, [buildRecognition, clock, support]);

  const stop = useCallback(() => {
    shouldRunRef.current = false;
    if (restartTimer.current) clearTimeout(restartTimer.current);
    recognitionRef.current?.stop();
    setInterimText("");
    setEngineUp(false);
  }, []);

  // Re-render once a second while active so "hearing" decays to "listening".
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [active]);

  useEffect(
    () => () => {
      shouldRunRef.current = false;
      if (restartTimer.current) clearTimeout(restartTimer.current);
      recognitionRef.current?.stop();
    },
    []
  );

  const status: SpeechStatus =
    fatalRef.current || (error && !active)
      ? "error"
      : !active
        ? "off"
        : !engineUp
          ? "starting"
          : Date.now() - heardAt < HEARING_WINDOW_MS
            ? "hearing"
            : "listening";

  return { support, active, status, interimText, lastFinalText, error, start, stop };
}
