// Reads the student's handwriting into text after they pause writing:
// group a page's pen strokes into lines, crop each new or changed line to a
// clean black-on-white image, and run it through the on-device recognizer.
// Changed lines are reported so the app can analyze them exactly like
// lecture transcript segments.

import { groupIntoLines, bw, bh } from "../geometry";
import { PageRenderer } from "../pageRenderer";
import type { NotebookStore } from "../notebookStore";
import type { NoteLine, Stroke } from "../model";
import type { OcrClient } from "./ocrClient";

export const READ_IDLE_MS = 1500;
const LINE_PX = 64; // TrOCR reads best when a line is roughly this tall
const MAX_SIDE = 2048;

export class NoteReader {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private reading = new Set<string>();
  private unsub: () => void;
  enabled = false;

  constructor(
    private readonly store: NotebookStore,
    private readonly ocr: OcrClient,
    private readonly onLines: (changed: NoteLine[]) => void
  ) {
    this.unsub = store.subscribe((e) => {
      if (!this.enabled) return;
      if (e.type === "stroke-added" || e.type === "page-changed") this.schedule(e.pageId);
      if (e.type === "notebook-replaced") this.cancelAll();
    });
  }

  destroy(): void {
    this.cancelAll();
    this.unsub();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) {
      this.cancelAll();
      return;
    }
    // Catch up on anything written while reading was off.
    for (const p of this.store.notebook.pages) if (p.strokes.length) this.schedule(p.id);
  }

  /** The pen touched down: wait for the student to pause again. */
  penActivity(): void {
    for (const pageId of [...this.timers.keys()]) this.schedule(pageId);
  }

  private cancelAll(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }

  private schedule(pageId: string): void {
    const t = this.timers.get(pageId);
    if (t) clearTimeout(t);
    this.timers.set(
      pageId,
      setTimeout(() => {
        this.timers.delete(pageId);
        void this.readPage(pageId);
      }, READ_IDLE_MS)
    );
  }

  private async readPage(pageId: string): Promise<void> {
    if (!this.enabled || this.reading.has(pageId)) return;
    const page = this.store.page(pageId);
    if (!page) return;
    this.reading.add(pageId);
    try {
      const byId = new Map(page.strokes.map((s) => [s.id, s]));
      const lines = groupIntoLines(page.strokes);
      const known = new Map(this.store.noteLines().filter((l) => l.pageId === pageId).map((l) => [l.key, l]));
      const keep = new Set<string>();
      const changed: NoteLine[] = [];

      for (const line of lines) {
        const strokes = line.strokeIds.map((id) => byId.get(id)).filter((s): s is Stroke => !!s);
        if (strokes.length === 0) continue;
        // Too small to be words (a dot, a lone mark): skip.
        if (strokes.length < 2 && bw(line.bbox) < 40) continue;
        const first = strokes.reduce((a, b) => (a.createdAt <= b.createdAt ? a : b));
        const key = `${pageId}:${first.id}`;
        keep.add(key);
        const signature = strokes.map((s) => s.id).sort().join(",");
        const prev = known.get(key);
        if (prev && prev.signature === signature) continue;

        const png = await cropLine(strokes, line.bbox);
        let text: string;
        try {
          text = await this.ocr.read(png);
        } catch (err) {
          if (err instanceof Error && err.message === "superseded") return;
          throw err;
        }
        // The student kept writing on this page while we read: try again later.
        const now = this.store.page(pageId);
        if (!now || !line.strokeIds.every((id) => now.strokes.some((s) => s.id === id))) {
          this.schedule(pageId);
          return;
        }
        const times = strokes.map((s) => s.t).filter((t): t is number => t != null);
        const atSec = times.length
          ? Math.min(...times)
          : Math.max(0, (first.createdAt - this.store.notebook.createdAt) / 1000);
        const record: NoteLine = {
          key,
          pageId,
          signature,
          bbox: line.bbox,
          text,
          edited: false,
          atSec: Math.round(atSec * 10) / 10,
          version: (prev?.version ?? 0) + 1,
          updatedAt: Date.now(),
        };
        this.store.upsertNoteLine(record);
        if (text.trim().length >= 2) changed.push(record);
      }
      this.store.pruneNoteLines(pageId, keep);
      if (changed.length) this.onLines(changed);
    } catch {
      // Recognizer failures surface through OcrClient status; ink is untouched.
    } finally {
      this.reading.delete(pageId);
    }
  }
}

/** Renders one line of ink, black on white, padded, ~64 px tall, ≤ 2048 px wide. */
export async function cropLine(strokes: readonly Stroke[], box: { minX: number; minY: number; maxX: number; maxY: number }): Promise<Blob> {
  const pad = 10;
  let scale = LINE_PX / Math.max(16, bh(box) + pad * 2);
  scale = Math.min(scale * 1.6, 3); // a bit larger than target for clean strokes
  scale = Math.min(scale, MAX_SIDE / (bw(box) + pad * 2), MAX_SIDE / (bh(box) + pad * 2));
  const canvas = PageRenderer.renderToCanvas(strokes, box, scale, pad);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode the ink image"))), "image/png")
  );
}
