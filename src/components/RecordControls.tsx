import { formatClock } from "../lib/lectureClock";
import type { RecorderState, SessionSource } from "../types";

type Phase = "idle" | "running" | "paused" | "ended";

type Props = {
  phase: Phase;
  source: SessionSource;
  recorderState: RecorderState;
  timerSec: number;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
};

export function RecordControls({
  phase,
  source,
  recorderState,
  timerSec,
  onStart,
  onPause,
  onResume,
  onStop,
}: Props) {
  const starting = source === "live" && recorderState === "requesting";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
      <span className={`mic-dot ${phase === "running" ? "live" : ""}`} aria-hidden="true" />
      <span className="timer">{formatClock(timerSec)}</span>

      {phase === "idle" && (
        <button className="primary" onClick={onStart} disabled={starting}>
          {starting ? "Starting…" : source === "live" ? "● Record" : "▶ Start sample"}
        </button>
      )}
      {phase === "running" && (
        <>
          <button onClick={onPause}>Pause</button>
          <button className="danger" onClick={onStop}>
            Stop
          </button>
        </>
      )}
      {phase === "paused" && (
        <>
          <button className="primary" onClick={onResume}>
            Resume
          </button>
          <button className="danger" onClick={onStop}>
            Stop
          </button>
        </>
      )}
      {phase === "ended" && <span className="tag">Lecture ended</span>}
    </div>
  );
}
