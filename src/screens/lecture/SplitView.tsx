import { useRef, useState, type ReactNode } from "react";

// Adjustable split between the feed (left) and notes (right). Spec: CONTEXT §5.
export const SPLIT = {
  min: 0.28,
  max: 0.72,
  snaps: [1 / 3, 1 / 2, 2 / 3],
  snapWithin: 0.045,
  toFeed: 0.84,
  toNotes: 0.18,
  keyStep: 0.05,
} as const;

/** Where a released divider settles: "feed" / "notes" switch modes, a number is the new feed fraction. */
export function settleSplit(r: number): number | "feed" | "notes" {
  if (r > SPLIT.toFeed) return "feed";
  if (r < SPLIT.toNotes) return "notes";
  const clamped = Math.min(SPLIT.max, Math.max(SPLIT.min, r));
  for (const s of SPLIT.snaps) if (Math.abs(clamped - s) <= SPLIT.snapWithin) return s;
  return clamped;
}

type Props = {
  ratio: number;
  setRatio: (r: number) => void;
  onFullFeed: () => void;
  onNotes: () => void;
  /** Feed fraction of the width (0–1). In "feed"/"notes" modes the sides collapse. */
  mode: "notes" | "split" | "feed";
  feed: ReactNode;
  notes: ReactNode;
};

export function SplitView({ ratio, setRatio, onFullFeed, onNotes, mode, feed, notes }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState<number | null>(null);
  const dragId = useRef<number | null>(null);

  const fractionAt = (clientX: number) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  };

  const shown = live ?? ratio;
  const feedPct = mode === "feed" ? 100 : mode === "notes" ? 0 : shown * 100;
  const label =
    live == null ? null : live > SPLIT.toFeed ? "Release for full feed" : live < SPLIT.toNotes ? "Release for notes" : `${Math.round(live * 100)} / ${100 - Math.round(live * 100)}`;

  return (
    <div className={`split mode-${mode} ${live != null ? "dragging" : ""}`} ref={wrapRef}>
      <div className="split-feed" style={{ width: `${feedPct}%` }}>
        {mode !== "notes" && feed}
      </div>
      {mode === "split" && (
        <div
          className="split-divider"
          style={{ left: `${shown * 100}%` }}
          role="separator"
          aria-orientation="vertical"
          aria-valuemin={Math.round(SPLIT.min * 100)}
          aria-valuemax={Math.round(SPLIT.max * 100)}
          aria-valuenow={Math.round(ratio * 100)}
          aria-label="Resize feed and notes"
          tabIndex={0}
          onPointerDown={(e) => {
            dragId.current = e.pointerId;
            try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic or already-released pointer */ }
            setLive(fractionAt(e.clientX));
          }}
          onPointerMove={(e) => {
            if (dragId.current === e.pointerId) setLive(fractionAt(e.clientX));
          }}
          onPointerUp={(e) => {
            if (dragId.current !== e.pointerId) return;
            dragId.current = null;
            const settled = settleSplit(fractionAt(e.clientX));
            setLive(null);
            if (settled === "feed") onFullFeed();
            else if (settled === "notes") onNotes();
            else setRatio(settled);
          }}
          onPointerCancel={() => {
            dragId.current = null;
            setLive(null);
          }}
          onDoubleClick={() => setRatio(0.5)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
              e.preventDefault();
              const next = ratio + (e.key === "ArrowRight" ? SPLIT.keyStep : -SPLIT.keyStep);
              setRatio(Math.min(SPLIT.max, Math.max(SPLIT.min, next)));
            }
          }}
        >
          <span className="split-grip" />
          {label && <span className="split-badge">{label}</span>}
        </div>
      )}
      {live != null &&
        SPLIT.snaps.map((s) => <div key={s} className="split-guide" style={{ left: `${s * 100}%` }} aria-hidden="true" />)}
      <div className="split-notes" style={{ width: `${100 - feedPct}%` }}>
        {notes}
      </div>
    </div>
  );
}
