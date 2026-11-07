// Mutable notebook store with fine-grained events, undo/redo, and debounced
// autosave. Ink is mutated outside React (thousands of strokes), and pages
// subscribe to their own events, so drawing never re-renders the React tree.

import { insertSorted } from "./geometry.ts";
import { saveNotebook } from "./storage.ts";
import type { CueRecord, NoteLine, Notebook, Page, Sketch, Stroke, TextBox } from "./model.ts";
import type { Card, Segment } from "../types";

export type StoreEvent =
  | { type: "stroke-added"; pageId: string; stroke: Stroke }
  | { type: "page-changed"; pageId: string }
  | { type: "text-changed"; pageId: string }
  | { type: "pages-changed" }
  | { type: "cues-changed" }
  | { type: "notes-changed" }
  | { type: "sketches-changed" }
  | { type: "notebook-replaced" }
  | { type: "history-changed" }
  | { type: "saved"; at: number }
  | { type: "save-failed"; message: string };

type HistoryEntry =
  | { kind: "strokes"; pageId: string; removed: Stroke[]; added: Stroke[] }
  | { kind: "text"; pageId: string; before: TextBox | null; after: TextBox | null };

const AUTOSAVE_MS = 700;
const MAX_HISTORY = 200;

export class NotebookStore {
  notebook: Notebook;
  private listeners = new Set<(e: StoreEvent) => void>();
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  /** Bumps on structural changes; React subscribes to this via useSyncExternalStore. */
  version = 0;
  lastSavedAt: number | null = null;
  saveError: string | null = null;

  constructor(nb: Notebook) {
    this.notebook = nb;
  }

  subscribe = (fn: (e: StoreEvent) => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = (): number => this.version;

  private emit(e: StoreEvent, structural = true): void {
    if (structural) this.version++;
    for (const fn of this.listeners) fn(e);
  }

  private dirty(): void {
    this.notebook.updatedAt = Date.now();
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.saveNow(), AUTOSAVE_MS);
  }

  async saveNow(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    try {
      await saveNotebook(this.notebook);
      this.lastSavedAt = Date.now();
      this.saveError = null;
      this.emit({ type: "saved", at: this.lastSavedAt });
    } catch (err) {
      this.saveError = err instanceof Error ? err.message : "Could not save";
      this.emit({ type: "save-failed", message: this.saveError });
    }
  }

  replaceNotebook(nb: Notebook): void {
    this.notebook = nb;
    this.undoStack = [];
    this.redoStack = [];
    this.emit({ type: "notebook-replaced" });
    this.emit({ type: "history-changed" });
  }

  page(pageId: string): Page | undefined {
    return this.notebook.pages.find((p) => p.id === pageId);
  }

  // ------------------------------------------------------------------ strokes

  addStroke(pageId: string, stroke: Stroke): void {
    const page = this.page(pageId);
    if (!page) return;
    const last = page.strokes[page.strokes.length - 1];
    if (!last || last.createdAt <= stroke.createdAt) page.strokes.push(stroke);
    else insertSorted(page.strokes, stroke);
    this.record({ kind: "strokes", pageId, removed: [], added: [stroke] });
    this.emit({ type: "stroke-added", pageId, stroke }, false);
    this.dirty();
  }

  /** Removes and adds strokes in one step. `history: false` for mid-gesture updates. */
  replaceStrokes(pageId: string, removed: readonly Stroke[], added: readonly Stroke[], history = true): void {
    const page = this.page(pageId);
    if (!page) return;
    const gone = new Set(removed.map((s) => s.id));
    page.strokes = page.strokes.filter((s) => !gone.has(s.id));
    for (const s of added) insertSorted(page.strokes, s);
    if (history) this.record({ kind: "strokes", pageId, removed: [...removed], added: [...added] });
    this.emit({ type: "page-changed", pageId }, false);
    this.dirty();
  }

  /** Records an entry for changes already applied (e.g. a whole eraser gesture). */
  pushHistory(pageId: string, removed: Stroke[], added: Stroke[]): void {
    if (removed.length === 0 && added.length === 0) return;
    this.record({ kind: "strokes", pageId, removed, added });
  }

  // --------------------------------------------------------------- text boxes

  upsertTextBox(pageId: string, box: TextBox, history = true): void {
    const page = this.page(pageId);
    if (!page) return;
    const i = page.textBoxes.findIndex((b) => b.id === box.id);
    const before = i >= 0 ? page.textBoxes[i] : null;
    if (i >= 0) page.textBoxes[i] = box;
    else page.textBoxes.push(box);
    if (history) this.record({ kind: "text", pageId, before, after: box });
    this.emit({ type: "text-changed", pageId });
    this.dirty();
  }

  removeTextBox(pageId: string, id: string): void {
    const page = this.page(pageId);
    if (!page) return;
    const before = page.textBoxes.find((b) => b.id === id) ?? null;
    if (!before) return;
    page.textBoxes = page.textBoxes.filter((b) => b.id !== id);
    this.record({ kind: "text", pageId, before, after: null });
    this.emit({ type: "text-changed", pageId });
    this.dirty();
  }

  // -------------------------------------------------------------------- pages

  addPages(pages: Page[], afterIndex = this.notebook.pages.length - 1): void {
    this.notebook.pages.splice(afterIndex + 1, 0, ...pages);
    this.emit({ type: "pages-changed" });
    this.dirty();
  }

  setTitle(title: string): void {
    this.notebook.title = title;
    this.emit({ type: "pages-changed" });
    this.dirty();
  }

  // --------------------------------------------------------------------- cues

  addCue(rec: CueRecord): void {
    this.notebook.cues.push(rec);
    this.emit({ type: "cues-changed" });
    this.dirty();
  }

  updateCue(id: string, patch: Partial<CueRecord> | ((c: CueRecord) => CueRecord)): void {
    const i = this.notebook.cues.findIndex((c) => c.cue.id === id);
    if (i < 0) return;
    const cur = this.notebook.cues[i];
    this.notebook.cues[i] = typeof patch === "function" ? patch(cur) : { ...cur, ...patch };
    this.emit({ type: "cues-changed" });
    this.dirty();
  }

  /** Undo for a detected cue: drop it and remember its symbol strokes so they aren't re-detected. */
  dismissCue(id: string): void {
    const rec = this.notebook.cues.find((c) => c.cue.id === id);
    if (!rec) return;
    this.notebook.dismissedSymbolIds = [...(this.notebook.dismissedSymbolIds ?? []), ...rec.symbolStrokeIds];
    this.notebook.cues = this.notebook.cues.filter((c) => c.cue.id !== id);
    this.emit({ type: "cues-changed" });
    this.dirty();
  }

  /** Symbol strokes already used by a cue (or dismissed) never trigger another. */
  consumedSymbolIds(): Set<string> {
    const ids = new Set<string>(this.notebook.dismissedSymbolIds ?? []);
    for (const c of this.notebook.cues) for (const id of c.symbolStrokeIds) ids.add(id);
    return ids;
  }

  // ------------------------------------------------------ handwriting text

  noteLines(): NoteLine[] {
    return this.notebook.noteLines ?? [];
  }

  upsertNoteLine(line: NoteLine): void {
    const lines = this.noteLines().filter((l) => l.key !== line.key);
    this.notebook.noteLines = [...lines, line];
    this.emit({ type: "notes-changed" });
    this.dirty();
  }

  /** Keeps only lines whose key is in `keep` for a page (ink was erased). */
  pruneNoteLines(pageId: string, keep: ReadonlySet<string>): void {
    const before = this.noteLines();
    const after = before.filter((l) => l.pageId !== pageId || keep.has(l.key));
    if (after.length === before.length) return;
    this.notebook.noteLines = after;
    this.emit({ type: "notes-changed" });
    this.dirty();
  }

  // ------------------------------------------------------------ sketches

  /** Stores (or clears, with null) the Anatomy Live sketch for a feed card. */
  setSketch(cardId: string, sketch: Sketch | null): void {
    const next = { ...(this.notebook.sketches ?? {}) };
    if (sketch) next[cardId] = sketch;
    else delete next[cardId];
    this.notebook.sketches = next;
    this.emit({ type: "sketches-changed" });
    this.dirty();
  }

  // ------------------------------------------------------- session snapshot

  saveSession(transcript: Segment[], cards: Card[], audioBlobId: string | null): void {
    this.notebook.transcript = transcript;
    this.notebook.cards = cards;
    if (audioBlobId) this.notebook.audioBlobId = audioBlobId;
    this.dirty();
  }

  // ------------------------------------------------------------------ history

  private record(e: HistoryEntry): void {
    this.undoStack.push(e);
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
    this.redoStack = [];
    this.emit({ type: "history-changed" });
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): void {
    const e = this.undoStack.pop();
    if (!e) return;
    this.apply(e, true);
    this.redoStack.push(e);
    this.emit({ type: "history-changed" });
  }

  redo(): void {
    const e = this.redoStack.pop();
    if (!e) return;
    this.apply(e, false);
    this.undoStack.push(e);
    this.emit({ type: "history-changed" });
  }

  private apply(e: HistoryEntry, reverse: boolean): void {
    const page = this.page(e.pageId);
    if (!page) return;
    if (e.kind === "strokes") {
      const remove = reverse ? e.added : e.removed;
      const add = reverse ? e.removed : e.added;
      const gone = new Set(remove.map((s) => s.id));
      page.strokes = page.strokes.filter((s) => !gone.has(s.id));
      for (const s of add) insertSorted(page.strokes, s);
      this.emit({ type: "page-changed", pageId: e.pageId }, false);
    } else {
      const target = reverse ? e.before : e.after;
      const id = (e.after ?? e.before)!.id;
      page.textBoxes = page.textBoxes.filter((b) => b.id !== id);
      if (target) page.textBoxes.push(target);
      this.emit({ type: "text-changed", pageId: e.pageId });
    }
    this.dirty();
  }
}
