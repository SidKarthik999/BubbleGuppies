// A single lecture clock drives the transcript timer, segment timestamps,
// and recording seeks. It tracks elapsed seconds since the recording
// started, excluding any paused time, so every part of the app agrees on
// "now" in the lecture.

export type LectureClock = {
  start(): void;
  pause(): void;
  resume(): void;
  /** Stops the clock permanently (recording stopped). Elapsed time freezes. */
  stop(): void;
  reset(): void;
  elapsedSec(): number;
  isRunning(): boolean;
  isPaused(): boolean;
  /** Lecture seconds per wall-clock second (sample demo speed). Set before start(). */
  setRate(rate: number): void;
};

export function createLectureClock(): LectureClock {
  let startedAt: number | null = null;
  let pausedAt: number | null = null;
  let pausedMs = 0;
  let stopped = false;
  let stoppedAt: number | null = null;
  let rate = 1;

  const now = () => performance.now();

  return {
    start() {
      startedAt = now();
      pausedAt = null;
      pausedMs = 0;
      stopped = false;
      stoppedAt = null;
    },
    pause() {
      if (startedAt === null || pausedAt !== null || stopped) return;
      pausedAt = now();
    },
    resume() {
      if (startedAt === null || pausedAt === null || stopped) return;
      pausedMs += now() - pausedAt;
      pausedAt = null;
    },
    stop() {
      if (!stopped) stoppedAt = pausedAt ?? now();
      stopped = true;
    },
    reset() {
      startedAt = null;
      pausedAt = null;
      pausedMs = 0;
      stopped = false;
      stoppedAt = null;
    },
    elapsedSec() {
      if (startedAt === null) return 0;
      const end = stoppedAt ?? pausedAt ?? now();
      return Math.max(0, ((end - startedAt - pausedMs) / 1000) * rate);
    },
    setRate(r: number) {
      rate = r > 0 ? r : 1;
    },
    isRunning() {
      return startedAt !== null && pausedAt === null && !stopped;
    },
    isPaused() {
      return pausedAt !== null;
    },
  };
}

export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
