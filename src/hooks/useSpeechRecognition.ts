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
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const shouldRunRef = useRef(false);
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
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        shouldRunRef.current = false;
        setActive(false);
        setError("Live transcription was blocked. Check your browser's microphone/speech permissions.");
        return;
      }
      if (event.error === "no-speech" || event.error === "aborted") {
        return; // transient; onend below decides whether to restart
      }
      setError("Live transcription hit a glitch and is trying to resume.");
    };

    recognition.onend = () => {
      if (shouldRunRef.current) {
        // Unexpected stop while we're still supposed to be listening —
        // restart to keep the transcript continuous.
        try {
          recognition.start();
        } catch {
          // A start() race (already starting) — safe to ignore.
        }
      } else {
        setActive(false);
      }
    };

    return recognition;
  }, [clock]);

  const start = useCallback(() => {
    if (support === "unsupported") return;
    setError(null);
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
    recognitionRef.current?.stop();
    setInterimText("");
  }, []);

  useEffect(
    () => () => {
      shouldRunRef.current = false;
      recognitionRef.current?.stop();
    },
    []
  );

  return { support, active, interimText, error, start, stop };
}
