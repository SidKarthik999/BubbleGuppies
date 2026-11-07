import { useEffect, useRef, type ReactNode } from "react";
import { PageRenderer } from "../../ink/pageRenderer";
import { PageInteraction, type InteractionDeps } from "../../ink/interaction";
import { drawTemplate } from "../../ink/backgrounds";
import { loadBlob } from "../../ink/storage";
import type { InkSession } from "../../ink/inkSession";
import type { NotebookStore } from "../../ink/notebookStore";
import type { Page } from "../../ink/model";

type Props = {
  store: NotebookStore;
  session: InkSession;
  page: Page;
  zoom: number;
  /** Canvases exist only for pages near the viewport (memory). */
  active: boolean;
  fadeAfterSec: number | null;
  deps: Pick<InteractionDeps, "clockNow" | "onStrokeCommitted" | "onPenDown" | "onPlaceText" | "onSeek">;
  /** Overlays positioned in page units × zoom (text boxes, cue cards, menus). */
  children?: ReactNode;
};

export function PageView({ store, session, page, zoom, active, fadeAfterSec, deps, children }: Props) {
  const bgRef = useRef<HTMLCanvasElement>(null);
  const hlRef = useRef<HTMLCanvasElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<PageRenderer | null>(null);
  const interactionRef = useRef<PageInteraction | null>(null);
  const fadeRef = useRef(fadeAfterSec);
  fadeRef.current = fadeAfterSec;
  const depsRef = useRef(deps);
  depsRef.current = deps;

  // Mount renderer + input while active.
  useEffect(() => {
    if (!active || !bgRef.current || !hlRef.current || !inkRef.current || !liveRef.current) return;
    const renderer = new PageRenderer(
      { bg: bgRef.current, hl: hlRef.current, ink: inkRef.current, live: liveRef.current },
      page.width,
      page.height
    );
    rendererRef.current = renderer;
    const redraw = (hidden?: ReadonlySet<string> | null) => {
      const p = store.page(page.id);
      if (p) renderer.redraw(p.strokes, { hiddenIds: hidden, fadeAfterSec: fadeRef.current });
    };
    const interaction = new PageInteraction(liveRef.current, {
      store,
      session,
      pageId: page.id,
      renderer,
      redraw,
      clockNow: () => depsRef.current.clockNow(),
      onStrokeCommitted: (pid, s) => depsRef.current.onStrokeCommitted(pid, s),
      onPenDown: () => depsRef.current.onPenDown(),
      onPlaceText: (pid, x, y) => depsRef.current.onPlaceText(pid, x, y),
      onSeek: (t) => depsRef.current.onSeek(t),
    });
    interactionRef.current = interaction;

    const unsubStore = store.subscribe((e) => {
      if (e.type === "stroke-added" && e.pageId === page.id) {
        if (fadeRef.current != null) redraw();
        else renderer.append(e.stroke);
      } else if (e.type === "page-changed" && e.pageId === page.id) {
        redraw();
        interaction.drawSelection();
      }
    });
    const unsubSession = session.subscribe(() => interaction.drawSelection());
    return () => {
      unsubStore();
      unsubSession();
      interaction.destroy();
      interactionRef.current = null;
      rendererRef.current = null;
    };
  }, [active, page.id, page.width, page.height, session, store]);

  // Zoom / background / full redraw.
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!active || !renderer) return;
    renderer.setZoom(zoom);
    const bg = page.background;
    if (bg.kind === "template") {
      renderer.drawBackground((ctx, w, h) => drawTemplate(ctx, bg.template, w, h));
    } else {
      renderer.drawBackground((ctx, w, h) => drawTemplate(ctx, "blank", w, h));
      let cancelled = false;
      (async () => {
        const { loadPdf, renderPdfPage } = await import("../../ink/pdf");
        const doc = await loadPdf(bg.fileId, async () => {
          const blob = await loadBlob(bg.fileId);
          if (!blob) throw new Error("PDF missing from local storage");
          return blob.arrayBuffer();
        });
        const bitmap = await renderPdfPage(doc, bg.fileId, bg.pageIndex, page.width * renderer.devicePixelScale);
        if (!cancelled && rendererRef.current === renderer) {
          renderer.drawBackground((ctx, w, h) => {
            drawTemplate(ctx, "blank", w, h);
            ctx.drawImage(bitmap, 0, 0, w, h);
          });
        }
      })().catch(() => {
        if (!cancelled) {
          renderer.drawBackground((ctx, w, h) => {
            drawTemplate(ctx, "blank", w, h);
            ctx.fillStyle = "#94a3b8";
            ctx.font = "14px system-ui";
            ctx.fillText("PDF page couldn't be rendered — your ink is still here.", 24, 40);
          });
        }
      });
      const p = store.page(page.id);
      if (p) renderer.redraw(p.strokes, { fadeAfterSec: fadeRef.current });
      interactionRef.current?.drawSelection();
      return () => {
        cancelled = true;
      };
    }
    const p = store.page(page.id);
    if (p) renderer.redraw(p.strokes, { fadeAfterSec: fadeRef.current });
    interactionRef.current?.drawSelection();
  }, [active, zoom, page.background, page.id, page.width, store]);

  // Replay fade: redraw only when the set of faded strokes changes.
  const lastVisibleCount = useRef(-1);
  useEffect(() => {
    const renderer = rendererRef.current;
    const p = store.page(page.id);
    if (!active || !renderer || !p) return;
    const visible = fadeAfterSec == null ? -1 : p.strokes.filter((s) => s.t == null || s.t <= fadeAfterSec).length;
    if (visible === lastVisibleCount.current) return;
    lastVisibleCount.current = visible;
    renderer.redraw(p.strokes, { fadeAfterSec });
  }, [active, fadeAfterSec, page.id, store]);

  const w = page.width * zoom;
  const h = page.height * zoom;
  return (
    <div className="nb-page" style={{ width: w, height: h }} data-page-id={page.id}>
      {active ? (
        <>
          <canvas ref={bgRef} className="nb-layer" />
          <canvas ref={hlRef} className="nb-layer" />
          <canvas ref={inkRef} className="nb-layer" />
          <canvas ref={liveRef} className="nb-layer nb-live" />
        </>
      ) : (
        <div className="nb-placeholder" />
      )}
      <div className="nb-overlay">{children}</div>
    </div>
  );
}
