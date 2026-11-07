import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PageView } from "./PageView";
import { InkToolbar, type HandwritingControl } from "./InkToolbar";
import { TextBoxLayer } from "./TextBoxLayer";
import { useSessionVersion, useStoreVersion, type NotebookApi } from "../../hooks/useNotebook";
import { HIGHLIGHTER_COLORS, PEN_COLORS, PEN_WIDTHS, newId, type Page, type Stroke, type TextBox } from "../../ink/model";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export type NotebookViewProps = {
  nb: NotebookApi;
  clockNow: () => number | null;
  onStrokeCommitted?: (pageId: string, stroke: Stroke) => void;
  onPenDown?: () => void;
  onAsk?: (pageId: string, strokeIds: string[]) => void;
  onTypedText?: (pageId: string, box: TextBox) => void;
  onSeek?: (t: number) => void;
  fadeAfterSec?: number | null;
  seekAvailable?: boolean;
  /** Per-page overlay content (cue answer cards), in page units × zoom. */
  renderPageOverlay?: (page: Page, zoom: number) => ReactNode;
  /** Shown above the pages (replay bar). */
  header?: ReactNode;
  /** Shown floating at the bottom (cue confirmation chips). */
  footer?: ReactNode;
  /** On-device handwriting reading toggle + status. */
  handwriting?: HandwritingControl;
  /** Scroll request: bring a page region into view. */
  scrollTarget?: { pageId: string; y: number; nonce: number } | null;
};

export function NotebookView(props: NotebookViewProps) {
  const { nb } = props;
  const { store, session } = nb;
  useStoreVersion(store);
  useSessionVersion(session);
  const [zoom, setZoomState] = useState(1);
  const [activePages, setActivePages] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<{ pageId: string; box: TextBox } | null>(null);
  const [showKeys, setShowKeys] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const pages = store.notebook.pages;

  // Zoom keeping a viewport point (clientX/Y) fixed.
  const setZoom = useCallback((next: number, anchor?: { x: number; y: number }) => {
    const el = scrollRef.current;
    const z0 = zoomRef.current;
    const z1 = clampZoom(next);
    if (!el || z1 === z0) return;
    const r = el.getBoundingClientRect();
    const ax = anchor ? anchor.x - r.left : el.clientWidth / 2;
    const ay = anchor ? anchor.y - r.top : el.clientHeight / 2;
    const contentX = (el.scrollLeft + ax) / z0;
    const contentY = (el.scrollTop + ay) / z0;
    zoomRef.current = z1;
    setZoomState(z1);
    requestAnimationFrame(() => {
      el.scrollLeft = contentX * z1 - ax;
      el.scrollTop = contentY * z1 - ay;
    });
  }, []);

  // Virtualization: only pages near the viewport get canvases.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        setActivePages((prev) => {
          const next = new Set(prev);
          for (const en of entries) {
            const id = (en.target as HTMLElement).dataset.pageId!;
            if (en.isIntersecting) next.add(id);
            else next.delete(id);
          }
          return next;
        });
      },
      { root, rootMargin: "800px 0px" }
    );
    root.querySelectorAll<HTMLElement>(".nb-page").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [pages.length, store.notebook.id]);

  // Ctrl/⌘ + wheel (and trackpad pinch, which arrives as ctrl+wheel) zooms.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom(zoomRef.current * Math.exp(-e.deltaY * 0.01), { x: e.clientX, y: e.clientY });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setZoom]);

  // Touch: with a pen in use, one finger pans and two fingers pinch-zoom.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const touches = new Map<number, { x: number; y: number }>();
    let pinch: { dist: number; zoom: number } | null = null;
    const down = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      session.touchCount = touches.size;
      if (touches.size === 2) {
        session.cancelActive?.(); // a second finger turns a finger-stroke into a pinch
        const [a, b] = [...touches.values()];
        pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: zoomRef.current };
      }
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "touch" || !touches.has(e.pointerId)) return;
      const prev = touches.get(e.pointerId)!;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2 && pinch) {
        const [a, b] = [...touches.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        setZoom(pinch.zoom * (dist / Math.max(1, pinch.dist)), { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        el.scrollLeft -= (e.clientX - prev.x) / 2;
        el.scrollTop -= (e.clientY - prev.y) / 2;
      } else if (touches.size === 1 && session.penDetected) {
        el.scrollLeft -= e.clientX - prev.x;
        el.scrollTop -= e.clientY - prev.y;
      }
    };
    const up = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      touches.delete(e.pointerId);
      session.touchCount = touches.size;
      if (touches.size < 2) pinch = null;
    };
    el.addEventListener("pointerdown", down, true);
    el.addEventListener("pointermove", move, true);
    el.addEventListener("pointerup", up, true);
    el.addEventListener("pointercancel", up, true);
    return () => {
      el.removeEventListener("pointerdown", down, true);
      el.removeEventListener("pointermove", move, true);
      el.removeEventListener("pointerup", up, true);
      el.removeEventListener("pointercancel", up, true);
    };
  }, [session, setZoom]);

  const deleteSelection = useCallback(() => {
    const sel = session.selection;
    const page = sel && store.page(sel.pageId);
    if (!sel || !page) return;
    const ids = new Set(sel.ids);
    store.replaceStrokes(sel.pageId, page.strokes.filter((s) => ids.has(s.id)), []);
    session.setSelection(null);
  }, [session, store]);

  const recolorSelection = useCallback(
    (color: string) => {
      const sel = session.selection;
      const page = sel && store.page(sel.pageId);
      if (!sel || !page) return;
      const ids = new Set(sel.ids);
      const old = page.strokes.filter((s) => ids.has(s.id));
      const next = old.map((s) => ({ ...s, id: newId("s"), color: s.kind === "highlighter" ? s.color : color }));
      store.replaceStrokes(sel.pageId, old, next);
      session.setSelection({ ...sel, ids: next.map((s) => s.id) });
    },
    [session, store]
  );

  // Keyboard shortcuts for every tool.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (mod && k === "z") {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
        session.setSelection(null);
        return;
      }
      if (mod && k === "y") {
        e.preventDefault();
        store.redo();
        return;
      }
      if (mod) return;
      const tools = session.tools;
      if (k === "p") session.setTools({ tool: "pen" });
      else if (k === "h") session.setTools({ tool: "highlighter" });
      else if (k === "e" && e.shiftKey) session.setTools({ tool: "eraser", eraserMode: tools.eraserMode === "stroke" ? "partial" : "stroke" });
      else if (k === "e") session.setTools({ tool: "eraser" });
      else if (k === "l") session.setTools({ tool: "lasso" });
      else if (k === "t") session.setTools({ tool: "text" });
      else if (k === "s" && props.seekAvailable) session.setTools({ tool: "seek" });
      else if (/^[1-6]$/.test(e.key)) {
        const i = Number(e.key) - 1;
        if (tools.tool === "highlighter") session.setTools({ highlighterColor: HIGHLIGHTER_COLORS[i] });
        else if (session.selection) recolorSelection(PEN_COLORS[i]);
        else session.setTools({ penColor: PEN_COLORS[i] });
      } else if (e.key === "[" || e.key === "]") {
        const i = PEN_WIDTHS.indexOf(tools.penWidth as (typeof PEN_WIDTHS)[number]);
        const j = Math.max(0, Math.min(PEN_WIDTHS.length - 1, i + (e.key === "]" ? 1 : -1)));
        session.setTools({ penWidth: PEN_WIDTHS[j] });
      } else if ((e.key === "Delete" || e.key === "Backspace") && session.selection) {
        e.preventDefault();
        deleteSelection();
      } else if (e.key === "Escape") session.setSelection(null);
      else if (e.key === "=" || e.key === "+") setZoom(zoomRef.current * 1.15);
      else if (e.key === "-") setZoom(zoomRef.current / 1.15);
      else if (e.key === "0") setZoom(1);
      else if (k === "n") nb.addPage("lined");
      else if (e.key === "?") setShowKeys((v) => !v);
      else if (k === "a" && session.selection && props.onAsk) props.onAsk(session.selection.pageId, session.selection.ids);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteSelection, nb, props, recolorSelection, session, setZoom, store]);

  // External scroll requests (clicking a cue in the lists).
  useEffect(() => {
    const t = props.scrollTarget;
    const el = scrollRef.current;
    if (!t || !el) return;
    const pageEl = el.querySelector<HTMLElement>(`[data-page-id="${t.pageId}"]`);
    if (pageEl) el.scrollTo({ top: pageEl.offsetTop + t.y * zoomRef.current - 120, behavior: "smooth" });
  }, [props.scrollTarget]);

  const deps = useMemo(
    () => ({
      clockNow: props.clockNow,
      onStrokeCommitted: (pageId: string, s: Stroke) => props.onStrokeCommitted?.(pageId, s),
      onPenDown: () => props.onPenDown?.(),
      onPlaceText: (pageId: string, x: number, y: number) =>
        setDraft({ pageId, box: { id: newId("tb"), x, y: y - 12, width: 320, text: "", t: props.clockNow(), createdAt: Date.now() } }),
      onSeek: (t: number) => props.onSeek?.(t),
    }),
    [props]
  );

  const sel = session.selection;
  const saveLabel = nb.storageError
    ? "⚠ Not saved"
    : store.lastSavedAt
      ? `Saved ${new Date(store.lastSavedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
      : "";

  return (
    <div className="notebook">
      <InkToolbar
        session={session}
        canUndo={store.canUndo}
        canRedo={store.canRedo}
        onUndo={() => store.undo()}
        onRedo={() => store.redo()}
        zoom={zoom}
        setZoom={(z) => setZoom(z)}
        onAddPage={nb.addPage}
        onImportPdf={(f) => void nb.importPdf(f).catch(() => alertLater("That PDF couldn't be opened."))}
        seekAvailable={!!props.seekAvailable}
        onShowShortcuts={() => setShowKeys((v) => !v)}
        saveLabel={saveLabel}
        handwriting={props.handwriting}
      />
      {props.header}
      <div className="nb-scroll" ref={scrollRef}>
        <div className="nb-pages">
          {pages.map((page) => (
            <PageView
              key={`${store.notebook.id}:${page.id}`}
              store={store}
              session={session}
              page={page}
              zoom={zoom}
              active={activePages.has(page.id)}
              fadeAfterSec={props.fadeAfterSec ?? null}
              deps={deps}
            >
              <TextBoxLayer
                store={store}
                page={page}
                zoom={zoom}
                draft={draft?.pageId === page.id ? draft.box : null}
                onDraftDone={() => setDraft(null)}
                onCommit={(pid, box) => props.onTypedText?.(pid, box)}
              />
              {props.renderPageOverlay?.(page, zoom)}
              {sel && sel.pageId === page.id && session.tools.tool === "lasso" && (
                <div className="sel-menu" style={{ left: sel.bbox.minX * zoom, top: Math.max(0, sel.bbox.minY * zoom - 44) }}>
                  {PEN_COLORS.map((c) => (
                    <button key={c} className="swatch" style={{ background: c }} aria-label="Recolor" onClick={() => recolorSelection(c)} />
                  ))}
                  <button className="tb-btn wide" onClick={deleteSelection} title="Delete (⌫)">
                    Delete
                  </button>
                  {props.onAsk && (
                    <button className="tb-btn wide primary-ish" onClick={() => props.onAsk!(sel.pageId, sel.ids)} title="Ask about this (A)">
                      Ask about this
                    </button>
                  )}
                </div>
              )}
            </PageView>
          ))}
        </div>
      </div>
      {props.footer}
      {showKeys && <ShortcutHelp onClose={() => setShowKeys(false)} />}
    </div>
  );
}

function alertLater(msg: string) {
  setTimeout(() => window.alert(msg), 0);
}

function ShortcutHelp({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ["P / H / E / L / T", "Pen · Highlighter · Eraser · Lasso · Text"],
    ["Shift+E", "Eraser: whole stroke ↔ partial"],
    ["S", "Tap ink to replay (after a recording)"],
    ["1–6", "Color (recolors a lasso selection)"],
    ["[ / ]", "Thinner / thicker pen"],
    ["⌘Z / ⇧⌘Z (Ctrl+Z / Ctrl+Y)", "Undo / redo"],
    ["Delete", "Delete selection"],
    ["A", "Ask about the lasso selection"],
    ["= / - / 0", "Zoom in / out / reset (or Ctrl+scroll, pinch)"],
    ["N", "New lined page"],
    ["?", "Toggle this help"],
  ];
  return (
    <div className="shortcut-help" role="dialog" aria-label="Keyboard shortcuts">
      <div className="sh-head">
        <strong>Keyboard shortcuts</strong>
        <button onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <table>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td>
                <kbd>{k}</kbd>
              </td>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
