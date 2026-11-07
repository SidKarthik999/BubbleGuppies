import type { SketchCommand } from "../ink/model";

// Renders Anatomy Live drawing commands (800 × 480 canvas) as SVG, the same
// shapes as anatomy-live/ui/app.js. Labels are plain text nodes, never HTML.

const COLORS = new Set(["ink", "mint", "violet", "amber", "muted"]);
type Pt = [number, number];

function Mark({ c }: { c: SketchCommand }) {
  const type = c[0] as string;
  const tone = String(c[c.length - 1]);
  const color = `var(--sk-${COLORS.has(tone) ? tone : "ink"})`;
  const stroke = { stroke: color, strokeWidth: 2.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const surface = { ...stroke, fill: color, fillOpacity: 0.12 };
  const n = (i: number) => Number(c[i]);
  switch (type) {
    case "line":
      return <line {...stroke} x1={n(1)} y1={n(2)} x2={n(3)} y2={n(4)} />;
    case "arrow": {
      const [x, y, a, b] = [n(1), n(2), n(3), n(4)];
      const t = Math.atan2(b - y, a - x);
      const back = (ang: number) => `${a - 12 * Math.cos(t + ang)},${b - 12 * Math.sin(t + ang)}`;
      return (
        <g>
          <line {...stroke} x1={x} y1={y} x2={a} y2={b} />
          <polyline {...stroke} fill="none" points={`${back(-0.48)} ${a},${b} ${back(0.48)}`} />
        </g>
      );
    }
    case "box":
      return <rect {...surface} x={n(1)} y={n(2)} width={n(3)} height={n(4)} />;
    case "circle":
      return <circle {...surface} cx={n(1)} cy={n(2)} r={n(3)} />;
    case "ellipse":
      return <ellipse {...stroke} fill="none" cx={n(1)} cy={n(2)} rx={n(3)} ry={n(4)} />;
    case "poly":
      return <polygon {...surface} points={(c[1] as Pt[]).map((p) => p.join(",")).join(" ")} />;
    case "path":
    case "trace": {
      const d = (c[1] as (string | number)[][]).map((s) => s.join(" ")).join(" ");
      return type === "path" ? <path {...surface} d={d} /> : <path {...stroke} strokeWidth={1.7} fill="none" d={d} />;
    }
    case "curve":
      return <path {...stroke} fill="none" d={`M ${n(1)} ${n(2)} Q ${n(3)} ${n(4)} ${n(5)} ${n(6)}`} />;
    case "text":
      return (
        <text x={n(1)} y={n(2)} fill={color} textAnchor="middle" dominantBaseline="central">
          {String(c[3])}
        </text>
      );
    default:
      return null;
  }
}

export function SketchSVG({ commands, label }: { commands: SketchCommand[]; label: string }) {
  return (
    <svg className="sketch-svg" viewBox="0 0 800 480" role="img" aria-label={`Sketch: ${label}`}>
      {commands.map((c, i) => (
        <g key={i} className="sk-mark">
          <Mark c={c} />
        </g>
      ))}
    </svg>
  );
}
