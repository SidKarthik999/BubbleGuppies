import { VisualRenderer } from "./VisualRenderer";
import type { Visual } from "../types";

type Props = {
  visual: Visual | null;
};

export function MainPanel({ visual }: Props) {
  if (!visual) {
    return (
      <div className="card">
        <p style={{ color: "var(--text-dim)", margin: 0 }}>
          No topic yet — the first study-guide card will appear here shortly after the lecture
          starts.
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>{visual.topic}</h2>
      <p className="recap">{visual.recap}</p>
      <VisualRenderer visual={visual} />
    </div>
  );
}
