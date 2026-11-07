import { useEffect, useState } from "react";
import type { Visual } from "../types";

type Props = {
  nodes: Visual["nodes"];
  edges: Visual["edges"];
  direction: "TD" | "LR";
};

// Model strings are rendered as plain text: labels are stripped of
// characters that would otherwise be interpreted as Mermaid syntax rather
// than displayed literally.
function sanitizeLabel(label: string): string {
  return label
    .replace(/["{}[\]|<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90);
}

function buildMermaidSource(nodes: Visual["nodes"], edges: Visual["edges"], direction: "TD" | "LR"): string {
  const idMap = new Map<string, string>();
  nodes.forEach((n, i) => idMap.set(n.id, `n${i}`));

  const lines = [`graph ${direction}`];
  for (const node of nodes) {
    lines.push(`  ${idMap.get(node.id)}["${sanitizeLabel(node.label)}"]`);
  }
  for (const edge of edges) {
    const from = idMap.get(edge.from);
    const to = idMap.get(edge.to);
    if (!from || !to) continue;
    const label = edge.label ? `|${sanitizeLabel(edge.label)}|` : "";
    lines.push(`  ${from} -->${label} ${to}`);
  }
  return lines.join("\n");
}

let renderCounter = 0;

export function MermaidDiagram({ nodes, edges, direction }: Props) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSvg(null);
    setFailed(false);

    (async () => {
      try {
        const { default: mermaid } = await import("mermaid");
        mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "strict" });
        const source = buildMermaidSource(nodes, edges, direction);
        renderCounter += 1;
        const { svg: rendered } = await mermaid.render(`nova-diagram-${renderCounter}`, source);
        if (!cancelled) setSvg(rendered);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [nodes, edges, direction]);

  if (failed) {
    return <p style={{ color: "var(--text-dim)", margin: 0 }}>This diagram couldn't be rendered.</p>;
  }
  if (!svg) {
    return <p style={{ color: "var(--text-dim)", margin: 0 }}>Rendering diagram…</p>;
  }
  // eslint-disable-next-line react/no-danger -- SVG markup from our own Mermaid render call.
  return <div dangerouslySetInnerHTML={{ __html: svg }} />;
}
