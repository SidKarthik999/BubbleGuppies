import type { Visual } from "../types";

type Props = {
  nodes: Visual["nodes"];
  edges: Visual["edges"];
};

// Abstract component-relationship diagram: a simple left-to-right row of
// boxes in the order the model gave the nodes, with arrows for edges. No
// coordinate geometry is read from the model — layout is entirely derived
// from node order, per the contract.
export function SchematicSVG({ nodes, edges }: Props) {
  const boxWidth = 150;
  const boxHeight = 60;
  const gap = 56;
  const width = Math.max(boxWidth + gap * 2, nodes.length * boxWidth + (nodes.length + 1) * gap);
  const height = 170;
  const y = (height - boxHeight) / 2;

  const positions = new Map<string, { x: number; y: number }>();
  nodes.forEach((n, i) => {
    positions.set(n.id, { x: gap + i * (boxWidth + gap), y });
  });

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label="Schematic diagram">
      <defs>
        <marker
          id="schematic-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0,0L10,5L0,10z" fill="var(--text-dim)" />
        </marker>
      </defs>

      {edges.map((edge, i) => {
        const from = positions.get(edge.from);
        const to = positions.get(edge.to);
        if (!from || !to) return null;
        const x1 = from.x + boxWidth;
        const y1 = from.y + boxHeight / 2;
        const x2 = to.x;
        const y2 = to.y + boxHeight / 2;
        return (
          <g key={`${edge.from}-${edge.to}-${i}`}>
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="var(--text-dim)"
              strokeWidth={1.5}
              markerEnd="url(#schematic-arrow)"
            />
            {edge.label && (
              <text x={(x1 + x2) / 2} y={y1 - 8} fontSize={10} textAnchor="middle" fill="var(--text-dim)">
                {edge.label}
              </text>
            )}
          </g>
        );
      })}

      {nodes.map((node) => {
        const pos = positions.get(node.id)!;
        return (
          <g key={node.id}>
            <rect
              x={pos.x}
              y={pos.y}
              width={boxWidth}
              height={boxHeight}
              rx={8}
              fill="var(--panel)"
              stroke="var(--border)"
            />
            <foreignObject x={pos.x + 6} y={pos.y + 6} width={boxWidth - 12} height={boxHeight - 12}>
              <div
                style={{
                  fontSize: "11px",
                  textAlign: "center",
                  color: "var(--text)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  lineHeight: 1.25,
                }}
              >
                {node.label}
              </div>
            </foreignObject>
          </g>
        );
      })}
    </svg>
  );
}
