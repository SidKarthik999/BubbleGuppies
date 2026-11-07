import { useCallback, useEffect, useRef, useState } from "react";
import type { LectureClock } from "../lib/lectureClock";
import type { RecorderState } from "../types";

const CANDIDATE_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

function pickSupportedMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return CANDIDATE_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported?.(type));
}

function microphoneErrorMessage(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
      return "Microphone access was denied. Allow microphone access in your browser and try again.";
    }
    if (err.name === "NotFoundError") return "No microphone was found on this device.";
    if (err.name === "NotReadableError") return "The microphone is already in use by another application.";
  }
  return "Could not start the microphone.";
}

/**
 * Owns the MediaRecorder lifecycle: one-click start, pause/resume/stop, a
 * recoverable error state, and guaranteed release of the microphone stream
 * on stop or unmount. Pauses/resumes the shared lecture clock alongside the
 * recorder so the timer, transcript timestamps, and audio stay in sync.
 *
 * start() resolves to true/false (rather than callers reading `state` right
 * after awaiting it) because a state update scheduled inside start() isn't
 * visible yet in this render's closure the instant the await resolves.
 */
export function useRecorder(clock: LectureClock) {
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async (): Promise<boolean> => {
    setError(null);
    setRecordingUrl(null);
    setState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = pickSupportedMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        setRecordingUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
      };
      recorder.onerror = () => {
        setState("error");
        setError("Recording stopped unexpectedly.");
        releaseStream();
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      clock.start();
      setState("listening");
      return true;
    } catch (err) {
      setState("error");
      setError(microphoneErrorMessage(err));
      releaseStream();
      return false;
    }
  }, [clock, releaseStream]);

  const pause = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    recorder.pause();
    clock.pause();
    setState("paused");
  }, [clock]);

  const resume = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "paused") return;
    recorder.resume();
    clock.resume();
    setState("listening");
  }, [clock]);

  const stop = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    releaseStream();
    clock.stop();
    setState("stopped");
  }, [clock, releaseStream]);

  const reset = useCallback(() => {
    releaseStream();
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    setRecordingUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    clock.reset();
    setError(null);
    setState("idle");
  }, [clock, releaseStream]);

  // Always release the microphone if the component unmounts mid-recording.
  useEffect(() => releaseStream, [releaseStream]);

  return { state, error, recordingUrl, start, pause, resume, stop, reset };
}
