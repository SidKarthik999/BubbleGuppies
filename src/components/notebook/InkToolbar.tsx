import { HIGHLIGHTER_COLORS, PEN_COLORS, PEN_WIDTHS, type PageTemplate } from "../../ink/model";
import type { InkSession, Tool } from "../../ink/inkSession";
import type { OcrStatus } from "../../ink/handwriting/ocrClient";

export type HandwritingControl = { enabled: boolean; setEnabled: (on: boolean) => void; status: OcrStatus };

function ocrLabel(h: HandwritingControl): string {
  if (!h.enabled) return "Read handwriting: off";
  const s = h.status;
  if (s.state === "loading") return `Loading handwriting model ${Math.round(s.progress * 100)}%`;
  if (s.state === "reading") return "Reading your notes…";
  if (s.state === "error") return "Handwriting reader unavailable";
  if (s.state === "ready") return "Reading handwriting ✓";
  return "Read handwriting: on";
}

type Props = {
  session: InkSession;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  zoom: number;
  setZoom: (z: number) => void;
  onAddPage: (t: PageTemplate) => void;
  onImportPdf: (f: File) => void;
  seekAvailable: boolean;
  onShowShortcuts: () => void;
  saveLabel: string;
  handwriting?: HandwritingControl;
};

const TOOLS: { tool: Tool; label: string; key: string; icon: string }[] = [
  { tool: "pen", label: "Pen", key: "P", icon: "✒︎" },
  { tool: "highlighter", label: "Highlighter", key: "H", icon: "▌" },
  { tool: "eraser", label: "Eraser", key: "E", icon: "⌫" },
  { tool: "lasso", label: "Lasso", key: "L", icon: "◌" },
  { tool: "text", label: "Text", key: "T", icon: "T" },
  { tool: "seek", label: "Tap ink to replay", key: "S", icon: "▶︎" },
];

export function InkToolbar(p: Props) {
  const t = p.session.tools;
  const palette = t.tool === "highlighter" ? HIGHLIGHTER_COLORS : PEN_COLORS;
  const activeColor = t.tool === "highlighter" ? t.highlighterColor : t.penColor;
  return (
    <div className="ink-toolbar" role="toolbar" aria-label="Ink tools">
      <div className="tb-group">
        {TOOLS.filter((x) => x.tool !== "seek" || p.seekAvailable).map((x) => (
          <button
            key={x.tool}
            className={`tb-btn ${t.tool === x.tool ? "active" : ""}`}
            title={`${x.label} (${x.key})`}
            aria-pressed={t.tool === x.tool}
            onClick={() => p.session.setTools({ tool: x.tool })}
          >
            <span aria-hidden="true">{x.icon}</span>
            <span className="sr-only">{x.label}</span>
          </button>
        ))}
      </div>
      {t.tool === "eraser" ? (
        <div className="tb-group">
          <button
            className={`tb-btn wide ${t.eraserMode === "stroke" ? "active" : ""}`}
            title="Erase whole strokes (Shift+E toggles)"
            onClick={() => p.session.setTools({ eraserMode: "stroke" })}
          >
            Whole
          </button>
          <button
            className={`tb-btn wide ${t.eraserMode === "partial" ? "active" : ""}`}
            title="Erase part of a stroke (Shift+E toggles)"
            onClick={() => p.session.setTools({ eraserMode: "partial" })}
          >
            Partial
          </button>
        </div>
      ) : (
        <div className="tb-group">
          {palette.map((c, i) => (
            <button
              key={c}
              className={`swatch ${activeColor === c ? "active" : ""}`}
              style={{ background: c }}
              title={`Color ${i + 1} (${i + 1})`}
              aria-label={`Color ${i + 1}`}
              onClick={() =>
                t.tool === "highlighter"
                  ? p.session.setTools({ highlighterColor: c })
                  : p.session.setTools({ penColor: c, tool: t.tool === "pen" ? "pen" : t.tool })
              }
            />
          ))}
          {t.tool !== "highlighter" &&
            PEN_WIDTHS.map((w, i) => (
              <button
                key={w}
                className={`tb-btn ${t.penWidth === w ? "active" : ""}`}
                title={`Width ${i + 1} ([ and ])`}
                onClick={() => p.session.setTools({ penWidth: w })}
              >
                <span className="width-dot" style={{ width: w * 2.2, height: w * 2.2 }} />
              </button>
            ))}
        </div>
      )}
      <div className="tb-group">
        <button className="tb-btn" onClick={p.onUndo} disabled={!p.canUndo} title="Undo (⌘Z / Ctrl+Z)">
          ↶
        </button>
        <button className="tb-btn" onClick={p.onRedo} disabled={!p.canRedo} title="Redo (⇧⌘Z / Ctrl+Y)">
          ↷
        </button>
      </div>
      <div className="tb-group">
        <button className="tb-btn" onClick={() => p.setZoom(p.zoom / 1.15)} title="Zoom out (-)">
          −
        </button>
        <button className="tb-btn wide" onClick={() => p.setZoom(1)} title="Reset zoom (0)">
          {Math.round(p.zoom * 100)}%
        </button>
        <button className="tb-btn" onClick={() => p.setZoom(p.zoom * 1.15)} title="Zoom in (=)">
          +
        </button>
      </div>
      <div className="tb-group">
        <select
          className="tb-select"
          value=""
          aria-label="Add page"
          onChange={(e) => {
            if (e.target.value) p.onAddPage(e.target.value as PageTemplate);
          }}
        >
          <option value="">+ Page</option>
          <option value="lined">Lined</option>
          <option value="grid">Grid</option>
          <option value="blank">Blank</option>
        </select>
        <label className="tb-btn wide" title="Write on a PDF (class materials, problem sets)">
          PDF…
          <input
            type="file"
            accept="application/pdf"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) p.onImportPdf(f);
              e.target.value = "";
            }}
          />
        </label>
        <button className="tb-btn" onClick={p.onShowShortcuts} title="Keyboard shortcuts (?)">
          ⌨︎
        </button>
      </div>
      {p.handwriting && (
        <button
          className={`tb-btn wide ocr-toggle ${p.handwriting.enabled ? "active" : ""} ${p.handwriting.status.state === "error" ? "err" : ""}`}
          aria-pressed={p.handwriting.enabled}
          title={
            p.handwriting.status.state === "error"
              ? `${p.handwriting.status.message} — your ink is safe. Click to turn reading off.`
              : "Read your handwriting on this device (open-source TrOCR model) and turn it into study-guide visuals, like the lecture transcript"
          }
          onClick={() => p.handwriting!.setEnabled(!p.handwriting!.enabled)}
        >
          ✎ {ocrLabel(p.handwriting)}
        </button>
      )}
      <span className="tb-status">{p.saveLabel}</span>
    </div>
  );
}
