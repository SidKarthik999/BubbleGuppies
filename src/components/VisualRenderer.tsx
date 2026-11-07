import { useMemo } from "react";
import { GraphSVG } from "./GraphSVG";
import { ChartSVG } from "./ChartSVG";
import { isRenderable } from "../visuals/layout";
import type { Visual } from "../types";

/** One SVG renderer for every visual type, with a layout per type. Anything
 * unusable (bad ids, missing chart data) falls back to the recap text. */
export function VisualRenderer({ visual }: { visual: Visual }) {
  const ok = useMemo(() => isRenderable(visual), [visual]);

  if (visual.visualType === "recap" || !ok) {
    return (
      <div className="visual-graphic recap-card">
        <span className="recap-glyph" aria-hidden="true">
          {ok ? "✎" : "⚠︎"}
        </span>
        <p>{ok ? visual.recap : "This diagram couldn't be drawn — the recap above covers it."}</p>
      </div>
    );
  }
  return (
    <div className="visual-graphic">
      {visual.visualType === "chart" && visual.chart ? <ChartSVG chart={visual.chart} /> : <GraphSVG visual={visual} />}
    </div>
  );
}
