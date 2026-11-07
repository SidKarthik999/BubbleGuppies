import type { AnalysisBackend, SessionSource } from "../types";

type Props = {
  source: SessionSource;
  setSource: (s: SessionSource) => void;
  backend: AnalysisBackend;
  setBackend: (b: AnalysisBackend) => void;
  disabled: boolean;
};

export function ModeToggle({ source, setSource, backend, setBackend, disabled }: Props) {
  return (
    <div style={{ display: "flex", gap: "1.25rem", alignItems: "center", fontSize: "0.85rem" }}>
      <label style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
        Source:
        <select
          value={source}
          disabled={disabled}
          onChange={(e) => setSource(e.target.value as SessionSource)}
        >
          <option value="sample">Sample transcript</option>
          <option value="live">Live microphone</option>
        </select>
      </label>
      <label style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
        Analysis:
        <select
          value={backend}
          disabled={disabled}
          onChange={(e) => setBackend(e.target.value as AnalysisBackend)}
        >
          <option value="offline">Offline demo (fixtures)</option>
          <option value="api">Real API</option>
        </select>
      </label>
      {backend === "offline" && <span className="tag">Deterministic — no network calls</span>}
    </div>
  );
}
