import type { ChartSpec } from "../types";

export function ChartSVG({ chart }: { chart: ChartSpec }) {
  const W = 420;
  const H = 230;
  const L = 44;
  const B = 40;
  const T = 18;
  const pts = chart.points;
  const max = Math.max(...pts.map((p) => p.value), 0);
  const min = Math.min(...pts.map((p) => p.value), 0);
  const span = max - min || 1;
  const plotW = W - L - 12;
  const plotH = H - B - T;
  const y = (v: number) => T + plotH - ((v - min) / span) * plotH;
  const step = plotW / pts.length;
  const fmt = (v: number) => (Math.abs(v) >= 100 ? Math.round(v).toString() : Number(v.toFixed(2)).toString());
  const unit = chart.unit ? ` ${chart.unit}` : "";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${chart.kind} chart`}>
      <line x1={L} y1={T} x2={L} y2={T + plotH} stroke="#9aa0ab" />
      <line x1={L} y1={y(0)} x2={W - 8} y2={y(0)} stroke="#9aa0ab" />
      {[max, (max + min) / 2, min].map((v, i) => (
        <text key={i} x={L - 6} y={y(v) + 4} textAnchor="end" fontSize={10} fill="#9aa0ab">
          {fmt(v)}
        </text>
      ))}
      {chart.unit && (
        <text x={8} y={T - 6} fontSize={10} fill="#9aa0ab">
          {chart.unit}
        </text>
      )}
      {chart.kind === "bar"
        ? pts.map((p, i) => {
            const x = L + i * step + step * 0.18;
            const top = Math.min(y(p.value), y(0));
            const h = Math.abs(y(p.value) - y(0));
            return (
              <g key={i}>
                <rect x={x} y={top} width={step * 0.64} height={Math.max(1, h)} rx={4} fill="#6ea8fe" />
                <text x={x + step * 0.32} y={top - 4} textAnchor="middle" fontSize={10} fill="#e8eaed">
                  {fmt(p.value)}
                  {unit}
                </text>
              </g>
            );
          })
        : (
          <>
            <polyline
              fill="none"
              stroke="#6ea8fe"
              strokeWidth={2}
              points={pts.map((p, i) => `${L + i * step + step / 2},${y(p.value)}`).join(" ")}
            />
            {pts.map((p, i) => (
              <g key={i}>
                <circle cx={L + i * step + step / 2} cy={y(p.value)} r={3.5} fill="#6ea8fe" />
                <text x={L + i * step + step / 2} y={y(p.value) - 8} textAnchor="middle" fontSize={10} fill="#e8eaed">
                  {fmt(p.value)}
                  {unit}
                </text>
              </g>
            ))}
          </>
        )}
      {pts.map((p, i) => (
        <text key={i} x={L + i * step + step / 2} y={H - B + 16} textAnchor="middle" fontSize={10} fill="#9aa0ab">
          {p.label.length > 12 ? p.label.slice(0, 11) + "…" : p.label}
        </text>
      ))}
    </svg>
  );
}
