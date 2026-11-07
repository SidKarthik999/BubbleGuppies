import { useEffect, useRef, useState } from "react";
import { HIGHLIGHTER_COLORS, PEN_COLORS, PEN_WIDTHS, type PageTemplate } from "../../ink/model";
import type { InkSession, Tool } from "../../ink/inkSession";
import type { OcrStatus } from "../../ink/handwriting/ocrClient";
import { Icon, type IconName } from "../ui/Icon";

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
  /** Split view: pen, highlighter, eraser and the current color only. */
  compact?: boolean;
};

const TOOLS: { tool: Tool; label: string; key: string; icon: IconName; compact: boolean }[] = [
  { tool: "pen", label: "Pen", key: "P", icon: "pen", compact: true },
  { tool: "highlighter", label: "Highlighter", key: "H", icon: "highlighter", compact: true },
  { tool: "eraser", label: "Eraser", key: "E", icon: "eraser", compact: true },
  { tool: "lasso", label: "Lasso", key: "L", icon: "lasso", compact: false },
  { tool: "text", label: "Text", key: "T", icon: "text", compact: false },
  { tool: "seek", label: "Tap ink to replay", key: "S", icon: "play", compact: false },
];

/** Floating Liquid Glass capsules: tools + ink colors (left), undo/redo + more (right). */
export function InkToolbar(p: Props) {
  const t = p.session.tools;
  const palette = t.tool === "highlighter" ? HIGHLIGHTER_COLORS : PEN_COLORS;
  const activeColor = t.tool === "highlighter" ? t.highlighterColor : t.penColor;
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    const close = (e: PointerEvent) => {
      if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false);
    };
    window.addEventListener("pointerdown", close, true);
    return () => window.removeEventListener("pointerdown", close, true);
  }, [moreOpen]);

  const setColor = (c: string) =>
    t.tool === "highlighter" ? p.session.setTools({ highlighterColor: c }) : p.session.setTools({ penColor: c, tool: t.tool === "eraser" ? "pen" : t.tool });

  const tools = TOOLS.filter((x) => (x.tool !== "seek" || p.seekAvailable) && (!p.compact || x.compact));

  return (
    <div className={`ink-float ${p.compact ? "compact" : ""}`}>
      <div className="glass capsule tool-capsule" role="toolbar" aria-label="Ink tools">
        {tools.map((x) => (
          <button
            key={x.tool}
            className={`cap-btn ${t.tool === x.tool ? "active" : ""}`}
            title={`${x.label} (${x.key})`}
            aria-label={x.label}
            aria-pressed={t.tool === x.tool}
            onClick={() => p.session.setTools({ tool: x.tool })}
          >
            <Icon name={x.icon} />
          </button>
        ))}
        <span className="cap-sep" aria-hidden="true" />
        {p.compact ? (
          <button
            className="ink-dot active"
            style={{ background: activeColor }}
            aria-label="Next color"
            title="Next color"
            onClick={() => setColor(palette[(palette.indexOf(activeColor as never) + 1) % palette.length])}
          />
        ) : t.tool === "eraser" ? (
          <>
            <button className={`cap-text ${t.eraserMode === "stroke" ? "active" : ""}`} onClick={() => p.session.setTools({ eraserMode: "stroke" })} title="Erase whole strokes (Shift+E toggles)">
              Whole
            </button>
            <button className={`cap-text ${t.eraserMode === "partial" ? "active" : ""}`} onClick={() => p.session.setTools({ eraserMode: "partial" })} title="Erase part of a stroke (Shift+E toggles)">
              Partial
            </button>
          </>
        ) : (
          <>
            {palette.map((c, i) => (
              <button
                key={c}
                className={`ink-dot ${activeColor === c ? "active" : ""}`}
                style={{ background: c }}
                title={`Color ${i + 1} (${i + 1})`}
                aria-label={`Color ${i + 1}`}
                onClick={() => setColor(c)}
              />
            ))}
            {t.tool === "pen" && (
              <>
                <span className="cap-sep" aria-hidden="true" />
                {PEN_WIDTHS.map((w, i) => (
                  <button key={w} className={`cap-btn ${t.penWidth === w ? "active" : ""}`} title={`Width ${i + 1} ([ and ])`} aria-label={`Width ${i + 1}`} onClick={() => p.session.setTools({ penWidth: w })}>
                    <span className="width-dot" style={{ width: w * 2.2, height: w * 2.2 }} />
                  </button>
                ))}
              </>
            )}
          </>
        )}
      </div>

      <div className="glass capsule history-capsule" ref={moreRef}>
        <button className="cap-btn" onClick={p.onUndo} disabled={!p.canUndo} title="Undo (⌘Z / Ctrl+Z)" aria-label="Undo">
          <Icon name="undo" />
        </button>
        <button className="cap-btn" onClick={p.onRedo} disabled={!p.canRedo} title="Redo (⇧⌘Z / Ctrl+Y)" aria-label="Redo">
          <Icon name="redo" />
        </button>
        {!p.compact && (
          <button className={`cap-btn ${moreOpen ? "active" : ""}`} onClick={() => setMoreOpen((v) => !v)} aria-label="More" aria-expanded={moreOpen} title="Pages, zoom, handwriting">
            <Icon name="more" />
          </button>
        )}
        {moreOpen && (
          <div className="glass menu more-menu" role="menu">
            <div className="menu-row">
              <span>Zoom</span>
              <span className="menu-inline">
                <button className="chip-btn" onClick={() => p.setZoom(p.zoom / 1.15)} aria-label="Zoom out">−</button>
                <button className="chip-btn" onClick={() => p.setZoom(1)} title="Reset zoom (0)">{Math.round(p.zoom * 100)}%</button>
                <button className="chip-btn" onClick={() => p.setZoom(p.zoom * 1.15)} aria-label="Zoom in">+</button>
              </span>
            </div>
            <div className="menu-row">
              <span>Add page</span>
              <span className="menu-inline">
                {(["dotted", "lined", "grid", "blank"] as PageTemplate[]).map((tp) => (
                  <button key={tp} className="chip-btn" onClick={() => p.onAddPage(tp)}>
                    {tp[0].toUpperCase() + tp.slice(1)}
                  </button>
                ))}
              </span>
            </div>
            <label className="menu-item">
              <Icon name="doc" /> Import PDF…
              <input
                type="file"
                accept="application/pdf"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) p.onImportPdf(f);
                  e.target.value = "";
                  setMoreOpen(false);
                }}
              />
            </label>
            {p.handwriting && (
              <button
                className={`menu-item ${p.handwriting.status.state === "error" ? "warn" : ""}`}
                aria-pressed={p.handwriting.enabled}
                title={
                  p.handwriting.status.state === "error"
                    ? `${p.handwriting.status.message}. Your ink is safe.`
                    : "Read your handwriting on this device and add it to the live feed"
                }
                onClick={() => p.handwriting!.setEnabled(!p.handwriting!.enabled)}
              >
                <Icon name="pen" /> {ocrLabel(p.handwriting)}
              </button>
            )}
            <button className="menu-item" onClick={() => { p.onShowShortcuts(); setMoreOpen(false); }}>
              <Icon name="keyboard" /> Keyboard shortcuts
            </button>
            {p.saveLabel && <div className="menu-foot">{p.saveLabel}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
