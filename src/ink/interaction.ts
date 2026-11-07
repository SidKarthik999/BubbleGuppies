// Pointer input for one page: inking with pressure, coalesced and predicted
// events, eraser (whole-stroke or partial), lasso select + move, text-box
// placement, and replay seek. One instance per mounted page.

import { bboxOf, eraseFromStroke, strokeHit, strokeInLasso, topStrokeAt, translatePoints, unionBBox } from "./geometry.ts";
import { newId, type InkPoint, type Stroke } from "./model.ts";
import { HIGHLIGHTER_WIDTH } from "./model.ts";
import type { InkSession } from "./inkSession.ts";
import type { NotebookStore } from "./notebookStore.ts";
import type { PageRenderer } from "./pageRenderer.ts";

export type InteractionDeps = {
  store: NotebookStore;
  session: InkSession;
  pageId: string;
  renderer: PageRenderer;
  /** Lecture clock in seconds, or null when no recording is running. */
  clockNow: () => number | null;
  onStrokeCommitted: (pageId: string, stroke: Stroke) => void;
  onPenDown: () => void;
  onPlaceText: (pageId: string, x: number, y: number) => void;
  onSeek: (t: number) => void;
  /** Replay fade-in state, so redraws keep it. */
  redraw: (hiddenIds?: ReadonlySet<string> | null) => void;
};

type Mode =
  | { kind: "idle" }
  | { kind: "ink"; pointerId: number; points: InkPoint[]; predicted: InkPoint[]; t: number | null; createdAt: number; mouse: boolean }
  | { kind: "erase"; pointerId: number; removed: Map<string, Stroke>; added: Map<string, Stroke>; last: [number, number] }
  | { kind: "lasso"; pointerId: number; poly: [number, number][] }
  | { kind: "move"; pointerId: number; start: [number, number]; dx: number; dy: number; strokes: Stroke[] }
  | { kind: "tap"; pointerId: number; start: [number, number] };

const ERASER_RADIUS = 9;

export class PageInteraction {
  private mode: Mode = { kind: "idle" };
  private rect: DOMRect | null = null;
  private frame = 0;
  private readonly el: HTMLElement;

  constructor(el: HTMLElement, private readonly d: InteractionDeps) {
    this.el = el;
    el.style.touchAction = "none";
    el.addEventListener("pointerdown", this.onDown);
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerup", this.onUp);
    el.addEventListener("pointercancel", this.onCancel);
  }

  destroy(): void {
    this.el.removeEventListener("pointerdown", this.onDown);
    this.el.removeEventListener("pointermove", this.onMove);
    this.el.removeEventListener("pointerup", this.onUp);
    this.el.removeEventListener("pointercancel", this.onCancel);
    cancelAnimationFrame(this.frame);
  }

  private toPage(e: { clientX: number; clientY: number }): [number, number] {
    const r = this.rect ?? this.el.getBoundingClientRect();
    const zoom = this.d.renderer.currentZoom;
    return [(e.clientX - r.left) / zoom, (e.clientY - r.top) / zoom];
  }

  private pressure(e: PointerEvent): number {
    if (e.pointerType === "pen") return e.pressure > 0 ? e.pressure : 0.5;
    return 0.5;
  }

  private onDown = (e: PointerEvent) => {
    const { session } = this.d;
    if (e.pointerType === "pen") session.notePen();
    // Palm rejection: once a pen is in use, touch never draws (the notebook
    // container turns it into pan/zoom instead).
    if (e.pointerType === "touch" && (session.penDetected || session.touchCount > 1)) return;
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if (this.mode.kind !== "idle") return; // one drawing pointer at a time
    e.preventDefault();
    this.rect = this.el.getBoundingClientRect();
    this.el.setPointerCapture(e.pointerId);
    this.d.onPenDown();
    const [x, y] = this.toPage(e);
    const tool = session.tools.tool;

    if (tool === "pen" || tool === "highlighter") {
      this.mode = {
        kind: "ink",
        pointerId: e.pointerId,
        points: [[x, y, this.pressure(e)]],
        predicted: [],
        t: this.d.clockNow(),
        createdAt: Date.now(),
        mouse: e.pointerType !== "pen",
      };
      if (e.pointerType === "touch") session.cancelActive = () => this.cancel();
      this.scheduleLive();
    } else if (tool === "eraser") {
      this.mode = { kind: "erase", pointerId: e.pointerId, removed: new Map(), added: new Map(), last: [x, y] };
      this.eraseAt(x, y);
    } else if (tool === "lasso") {
      const sel = session.selection;
      if (sel && sel.pageId === this.d.pageId && inside(sel.bbox, x, y, 6)) {
        const page = this.d.store.page(this.d.pageId);
        const ids = new Set(sel.ids);
        const strokes = page ? page.strokes.filter((s) => ids.has(s.id)) : [];
        this.mode = { kind: "move", pointerId: e.pointerId, start: [x, y], dx: 0, dy: 0, strokes };
        this.d.redraw(ids);
        this.scheduleLive();
      } else {
        session.setSelection(null);
        this.mode = { kind: "lasso", pointerId: e.pointerId, poly: [[x, y]] };
      }
    } else {
      this.mode = { kind: "tap", pointerId: e.pointerId, start: [x, y] };
    }
  };

  private onMove = (e: PointerEvent) => {
    const m = this.mode;
    if (m.kind === "idle" || e.pointerId !== m.pointerId) return;
    e.preventDefault();
    if (m.kind === "ink") {
      const events = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
      for (const ev of events.length ? events : [e]) {
        const [x, y] = this.toPage(ev);
        m.points.push([x, y, this.pressure(ev)]);
      }
      const predicted = typeof e.getPredictedEvents === "function" ? e.getPredictedEvents() : [];
      m.predicted = predicted.map((ev) => {
        const [x, y] = this.toPage(ev);
        return [x, y, this.pressure(ev)] as InkPoint;
      });
      this.scheduleLive();
    } else if (m.kind === "erase") {
      const [x, y] = this.toPage(e);
      // Sweep along the segment so fast erasing doesn't skip strokes.
      const [lx, ly] = m.last;
      const dist = Math.hypot(x - lx, y - ly);
      const steps = Math.max(1, Math.ceil(dist / (ERASER_RADIUS * 0.8)));
      for (let i = 1; i <= steps; i++) this.eraseAt(lx + ((x - lx) * i) / steps, ly + ((y - ly) * i) / steps);
      m.last = [x, y];
      this.d.renderer.clearLive();
      this.d.renderer.overlay((ctx) => drawEraserCursor(ctx, x, y));
    } else if (m.kind === "lasso") {
      m.poly.push(this.toPage(e));
      this.scheduleLive();
    } else if (m.kind === "move") {
      const [x, y] = this.toPage(e);
      m.dx = x - m.start[0];
      m.dy = y - m.start[1];
      this.scheduleLive();
    }
  };

  private onUp = (e: PointerEvent) => {
    const m = this.mode;
    if (m.kind === "idle" || e.pointerId !== m.pointerId) return;
    this.mode = { kind: "idle" };
    this.d.session.cancelActive = null;
    cancelAnimationFrame(this.frame);
    const { store, pageId, renderer, session } = this.d;

    if (m.kind === "ink") {
      const tool = session.tools.tool;
      const kind = tool === "highlighter" ? "highlighter" : "pen";
      const stroke: Stroke = {
        id: newId("s"),
        kind,
        color: kind === "highlighter" ? session.tools.highlighterColor : session.tools.penColor,
        width: kind === "highlighter" ? HIGHLIGHTER_WIDTH : session.tools.penWidth,
        points: m.points,
        bbox: bboxOf(m.points),
        t: m.t,
        createdAt: m.createdAt,
        simulatePressure: m.mouse,
      };
      renderer.clearLive();
      store.addStroke(pageId, stroke);
      this.d.onStrokeCommitted(pageId, stroke);
    } else if (m.kind === "erase") {
      renderer.clearLive();
      store.pushHistory(pageId, [...m.removed.values()], [...m.added.values()]);
    } else if (m.kind === "lasso") {
      renderer.clearLive();
      const page = store.page(pageId);
      if (!page || m.poly.length < 3) return;
      const picked = page.strokes.filter((s) => strokeInLasso(s, m.poly));
      if (picked.length) session.setSelection({ pageId, ids: picked.map((s) => s.id), bbox: unionBBox(picked.map((s) => s.bbox)) });
    } else if (m.kind === "move") {
      renderer.clearLive();
      if (Math.hypot(m.dx, m.dy) < 1) {
        this.d.redraw(null);
        this.drawSelection();
        return;
      }
      const moved = m.strokes.map((s) => {
        const points = translatePoints(s.points, m.dx, m.dy);
        return { ...s, id: newId("s"), points, bbox: bboxOf(points) };
      });
      store.replaceStrokes(pageId, m.strokes, moved);
      session.setSelection({ pageId, ids: moved.map((s) => s.id), bbox: unionBBox(moved.map((s) => s.bbox)) });
    } else if (m.kind === "tap") {
      const [x, y] = this.toPage(e);
      if (Math.hypot(x - m.start[0], y - m.start[1]) > 6) return;
      const tool = session.tools.tool;
      if (tool === "text") this.d.onPlaceText(pageId, x, y);
      else if (tool === "seek") {
        const page = store.page(pageId);
        const hit = page ? topStrokeAt(page.strokes.filter((s) => s.t != null), x, y, 10) : null;
        if (hit?.t != null) this.d.onSeek(hit.t);
      }
    }
  };

  private onCancel = (e: PointerEvent) => {
    if (this.mode.kind !== "idle" && e.pointerId === this.mode.pointerId) this.cancel();
  };

  /** Abandons the current gesture (e.g. a pinch started mid-stroke). */
  cancel(): void {
    const m = this.mode;
    this.mode = { kind: "idle" };
    this.d.session.cancelActive = null;
    cancelAnimationFrame(this.frame);
    this.d.renderer.clearLive();
    if (m.kind === "erase") this.d.store.pushHistory(this.d.pageId, [...m.removed.values()], [...m.added.values()]);
    if (m.kind === "move") this.d.redraw(null);
  }

  private eraseAt(x: number, y: number): void {
    const m = this.mode;
    if (m.kind !== "erase") return;
    const page = this.d.store.page(this.d.pageId);
    if (!page) return;
    const radius = ERASER_RADIUS / this.d.renderer.currentZoom;
    const partial = this.d.session.tools.eraserMode === "partial";
    const removed: Stroke[] = [];
    const added: Stroke[] = [];
    for (const s of page.strokes) {
      if (!partial) {
        if (strokeHit(s, x, y, radius)) removed.push(s);
        continue;
      }
      const pieces = eraseFromStroke(s, x, y, radius);
      if (!pieces) continue;
      removed.push(s);
      for (const pts of pieces) added.push({ ...s, id: newId("s"), points: pts, bbox: bboxOf(pts) });
    }
    if (removed.length === 0) return;
    for (const r of removed) {
      if (m.added.has(r.id)) m.added.delete(r.id);
      else m.removed.set(r.id, r);
    }
    for (const a of added) m.added.set(a.id, a);
    this.d.store.replaceStrokes(this.d.pageId, removed, added, false);
  }

  private scheduleLive(): void {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.drawLiveFrame());
  }

  private drawLiveFrame(): void {
    const m = this.mode;
    const { renderer, session } = this.d;
    if (m.kind === "ink") {
      const hl = session.tools.tool === "highlighter";
      renderer.drawLive(
        m.points,
        {
          kind: hl ? "highlighter" : "pen",
          color: hl ? session.tools.highlighterColor : session.tools.penColor,
          width: hl ? HIGHLIGHTER_WIDTH : session.tools.penWidth,
          simulatePressure: m.mouse,
        },
        m.predicted
      );
    } else if (m.kind === "lasso") {
      renderer.clearLive();
      renderer.overlay((ctx, zoom) => drawLasso(ctx, m.poly, zoom));
    } else if (m.kind === "move") {
      renderer.clearLive();
      renderer.drawMoving(m.strokes, m.dx, m.dy);
      const sel = session.selection;
      if (sel) renderer.overlay((ctx, zoom) => drawSelectionBox(ctx, offset(sel.bbox, m.dx, m.dy), zoom));
    }
  }

  /** Paints the current selection box (called when selection changes). */
  drawSelection(): void {
    const sel = this.d.session.selection;
    this.d.renderer.clearLive();
    if (sel && sel.pageId === this.d.pageId) this.d.renderer.overlay((ctx, zoom) => drawSelectionBox(ctx, sel.bbox, zoom));
  }
}

function inside(b: { minX: number; minY: number; maxX: number; maxY: number }, x: number, y: number, pad: number): boolean {
  return x >= b.minX - pad && x <= b.maxX + pad && y >= b.minY - pad && y <= b.maxY + pad;
}

function offset(b: { minX: number; minY: number; maxX: number; maxY: number }, dx: number, dy: number) {
  return { minX: b.minX + dx, minY: b.minY + dy, maxX: b.maxX + dx, maxY: b.maxY + dy };
}

function drawLasso(ctx: CanvasRenderingContext2D, poly: [number, number][], zoom: number): void {
  if (poly.length < 2) return;
  ctx.save();
  ctx.setLineDash([6 / zoom, 4 / zoom]);
  ctx.lineWidth = 1.5 / zoom;
  ctx.strokeStyle = "#2563eb";
  ctx.fillStyle = "rgba(37, 99, 235, 0.06)";
  ctx.beginPath();
  ctx.moveTo(poly[0][0], poly[0][1]);
  for (const [x, y] of poly) ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawSelectionBox(ctx: CanvasRenderingContext2D, b: { minX: number; minY: number; maxX: number; maxY: number }, zoom: number): void {
  const pad = 6;
  ctx.save();
  ctx.setLineDash([5 / zoom, 4 / zoom]);
  ctx.lineWidth = 1.5 / zoom;
  ctx.strokeStyle = "#2563eb";
  ctx.strokeRect(b.minX - pad, b.minY - pad, b.maxX - b.minX + pad * 2, b.maxY - b.minY + pad * 2);
  ctx.restore();
}

function drawEraserCursor(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(100,116,139,0.8)";
  ctx.beginPath();
  ctx.arc(x, y, ERASER_RADIUS, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
