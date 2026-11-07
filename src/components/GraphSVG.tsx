import { useMemo, useState } from "react";
import { layoutVisual, type Placed } from "../visuals/layout";
import type { Visual } from "../types";

// Categorical palette keyed by node group (≤5 groups), readable on dark panels.
const PALETTE = ["#6ea8fe", "#f59e0b", "#34d399", "#f472b6", "#a78bfa"];
const UNGROUPED = "#94a3b8";

export function GraphSVG({ visual }: { visual: Visual }) {
  const layout = useMemo(() => layoutVisual(visual), [visual]);
  const [openDetail, setOpenDetail] = useState<string | null>(null);
  const groups = useMemo(() => [...new Set(visual.nodes.map((n) => n.group).filter((g): g is string => !!g))], [visual.nodes]);
  const colorOf = (n: Placed["node"]) => (n.group ? PALETTE[groups.indexOf(n.group) % PALETTE.length] : UNGROUPED);
  const byId = new Map(layout.nodes.map((p) => [p.node.id, p]));
  const markerId = useMemo(() => `arrow-${Math.random().toString(36).slice(2, 8)}`, []);
  const showLegend = groups.length > 0 && visual.visualType !== "venn";

  return (
    <div className="graph">
      <svg viewBox={`0 0 ${layout.width} ${layout.height}`} width="100%" role="img" aria-label={`${visual.visualType} diagram: ${visual.topic}`}>
        <defs>
          <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0L10,5L0,10z" fill="#94a3b8" />
          </marker>
        </defs>

        {layout.circles?.map((c, i) => (
          <g key={i}>
            <circle cx={c.cx} cy={c.cy} r={c.r} fill={PALETTE[i]} fillOpacity={0.14} stroke={PALETTE[i]} strokeOpacity={0.6} />
            <text x={c.cx + (i === 0 ? -c.r * 0.55 : c.r * 0.55)} y={c.cy - c.r + 22} textAnchor="middle" fill={PALETTE[i]} fontSize={13} fontWeight={600}>
              {c.label}
            </text>
          </g>
        ))}

        {visual.edges.map((e, i) => {
          const a = byId.get(e.from);
          const b = byId.get(e.to);
          if (!a || !b) return null;
          const [x1, y1] = edgePoint(a, b);
          const [x2, y2] = edgePoint(b, a);
          return (
            <g key={i}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={colorOf(a.node)} strokeOpacity={0.7} strokeWidth={1.6} markerEnd={`url(#${markerId})`} />
              {e.label && (
                <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 5} textAnchor="middle" fontSize={10} fill="#9aa0ab">
                  {e.label}
                </text>
              )}
            </g>
          );
        })}

        {layout.nodes.map((p) => {
          const c = colorOf(p.node);
          const important = p.node.emphasis === "important";
          const question = p.node.emphasis === "question";
          return (
            <g
              key={p.node.id}
              transform={`translate(${p.x - p.w / 2}, ${p.y - p.h / 2})`}
              onClick={() => p.node.detail && setOpenDetail((d) => (d === p.node.id ? null : p.node.id))}
              style={{ cursor: p.node.detail ? "pointer" : "default" }}
            >
              {p.node.detail && <title>{p.node.detail}</title>}
              <rect
                width={p.w}
                height={p.h}
                rx={12}
                fill="#1f232c"
                stroke={important ? "#facc15" : c}
                strokeWidth={important ? 2.5 : 1.5}
                strokeDasharray={question ? "5 4" : undefined}
              />
              <rect width={6} height={p.h} rx={3} fill={c} />
              {p.lines.map((line, i) => (
                <text key={i} x={p.w / 2 + 3} y={12 + 16 * (i + 1) - 4} textAnchor="middle" fontSize={12.5} fill="#e8eaed">
                  {line}
                </text>
              ))}
              {important && (
                <text x={p.w - 4} y={2} textAnchor="end" fontSize={14} fill="#facc15">
                  ★
                </text>
              )}
              {question && (
                <g transform={`translate(${p.w - 10}, -2)`}>
                  <circle r={8} fill="#6ea8fe" />
                  <text y={4} textAnchor="middle" fontSize={11} fontWeight={700} fill="#0a0a0a">
                    ?
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
      {openDetail && (
        <p className="graph-detail">{visual.nodes.find((n) => n.id === openDetail)?.detail}</p>
      )}
      {showLegend && (
        <div className="graph-legend">
          {groups.map((g, i) => (
            <span key={g}>
              <i style={{ background: PALETTE[i % PALETTE.length] }} />
              {g}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Where the line from a's center toward b's center leaves a's box. */
function edgePoint(a: Placed, b: Placed): [number, number] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return [a.x, a.y];
  const sx = dx === 0 ? Infinity : a.w / 2 / Math.abs(dx);
  const sy = dy === 0 ? Infinity : a.h / 2 / Math.abs(dy);
  const s = Math.min(sx, sy);
  return [a.x + dx * s, a.y + dy * s];
}
