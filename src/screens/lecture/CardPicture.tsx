import { useState } from "react";
import { VisualRenderer } from "../../components/VisualRenderer";
import { SketchSVG } from "../../components/SketchSVG";
import type { Sketch } from "../../ink/model";
import type { Visual } from "../../types";

export type PicturePref = "sketch" | "diagram";
const PREF_KEY = "bubble:picture";

export function readPicturePref(): PicturePref {
  try {
    return localStorage.getItem(PREF_KEY) === "diagram" ? "diagram" : "sketch";
  } catch {
    return "sketch";
  }
}

export function usePicturePref(): [PicturePref, (p: PicturePref) => void] {
  const [pref, setPref] = useState<PicturePref>(readPicturePref);
  return [
    pref,
    (p) => {
      setPref(p);
      try {
        localStorage.setItem(PREF_KEY, p);
      } catch {
        /* per-viewer convenience only */
      }
    },
  ];
}

/**
 * A card's picture: the Anatomy Live sketch by default (option B), the
 * analysis diagram as the fallback while the first stroke is on its way, when
 * the sketch fails, or when the student picks "Diagram".
 */
export function CardPicture({ visual, sketch, pref, setPref, mini }: { visual: Visual; sketch?: Sketch; pref: PicturePref; setPref?: (p: PicturePref) => void; mini?: boolean }) {
  const hasStrokes = !!sketch && sketch.commands.length > 0;
  const showSketch = pref === "sketch" && hasStrokes;
  const waiting = pref === "sketch" && sketch?.status === "drawing" && !hasStrokes;
  const failed = pref === "sketch" && !!sketch?.error;

  return (
    <div className={`card-picture ${mini ? "mini" : ""}`}>
      {setPref && (
        <div className="pic-switch" role="tablist" aria-label="Picture">
          {(["sketch", "diagram"] as const).map((p) => (
            <button key={p} role="tab" aria-selected={pref === p} className={pref === p ? "on" : ""} onClick={() => setPref(p)}>
              {p === "sketch" ? "Sketch" : "Diagram"}
            </button>
          ))}
        </div>
      )}
      {showSketch ? (
        <div className={`sketch-paper ${sketch!.status === "drawing" ? "drawing" : ""}`}>
          <SketchSVG commands={sketch!.commands} label={visual.topic} />
          {!mini && sketch!.note && <p className="sketch-note">{sketch!.note}</p>}
        </div>
      ) : (
        <div className={waiting ? "pic-waiting" : undefined}>
          <VisualRenderer visual={visual} />
        </div>
      )}
      {!mini && pref === "sketch" && (
        <div className="pic-status">
          {waiting && (
            <>
              <span className="cue-spinner" aria-hidden="true" /> Sketching with Anatomy Live…
            </>
          )}
          {sketch?.status === "drawing" && hasStrokes && "Drawing…"}
          {failed && <span className="pic-error">{hasStrokes ? `Sketch incomplete: ${sketch!.error}` : `Sketch unavailable, showing the diagram. ${sketch!.error}`}</span>}
          {sketch?.status === "done" && !failed && <span>Anatomy Live{sketch.source === "simplified" ? " · simplified after a check" : sketch.source === "calculated" ? " · calculated" : sketch.source === "illustrated" ? " · illustrated" : ""}</span>}
        </div>
      )}
    </div>
  );
}
