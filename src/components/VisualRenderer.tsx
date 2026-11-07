import { useMemo } from "react";
import { SchematicSVG } from "./SchematicSVG";
import type { Visual } from "../types";

type Props = {
  visual: Visual;
};

/** Dispatches to the right graphic by visualType, falling back to the recap
 * text whenever a visual can't actually be rendered (e.g. an edge points at
 * a node id that isn't in this diagram). */
export function VisualRenderer({ visual }: Props) {
  const { visualType, nodes, edges } = visual;

  const isUsable = useMemo(() => {
    const ids = new Set(nodes.map((n) => n.id));
    return edges.every((e) => ids.has(e.from) && ids.has(e.to));
  }, [nodes, edges]);

  if (visualType === "recap") {
    return (
      <div className="visual-graphic">
        <p style={{ color: "var(--text-dim)", textAlign: "center", margin: 0 }}>
          Recap — no diagram for this card.
        </p>
      </div>
    );
  }

  if (!isUsable) {
    return (
      <div className="visual-graphic">
        <p style={{ color: "var(--text-dim)", textAlign: "center", margin: 0 }}>
          This diagram couldn't be rendered; showing the recap above instead.
        </p>
      </div>
    );
  }

  if (visualType === "schematic") {
    return (
      <div className="visual-graphic">
        <SchematicSVG nodes={nodes} edges={edges} />
      </div>
    );
  }

  return (
    <div className="visual-graphic">
      <SchematicSVG nodes={nodes} edges={edges} />
    </div>
  );
}
