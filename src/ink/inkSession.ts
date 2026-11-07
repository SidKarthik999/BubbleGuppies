// Shared, observable editor state for the notebook: active tool, colors,
// widths, pen detection (palm rejection), and the lasso selection.

import { HIGHLIGHTER_COLORS, PEN_COLORS, PEN_WIDTHS, type BBox } from "./model.ts";

export type Tool = "pen" | "highlighter" | "eraser" | "lasso" | "text" | "seek";
export type EraserMode = "stroke" | "partial";

export type ToolState = {
  tool: Tool;
  penColor: string;
  penWidth: number;
  highlighterColor: string;
  eraserMode: EraserMode;
};

export type Selection = { pageId: string; ids: string[]; bbox: BBox } | null;

type Listener = () => void;

export class InkSession {
  tools: ToolState = {
    tool: "pen",
    penColor: PEN_COLORS[0],
    penWidth: PEN_WIDTHS[1],
    highlighterColor: HIGHLIGHTER_COLORS[0],
    eraserMode: "stroke",
  };
  selection: Selection = null;
  /** Set once any pen pointer is seen: touch then pans/zooms instead of drawing. */
  penDetected = false;
  /** Active touch pointers on the notebook (for pinch / cancelling finger strokes). */
  touchCount = 0;
  /** Lets the container cancel an in-progress finger stroke when a pinch starts. */
  cancelActive: (() => void) | null = null;
  version = 0;
  private listeners = new Set<Listener>();

  subscribe = (fn: Listener) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = () => this.version;

  private changed(): void {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  setTools(patch: Partial<ToolState>): void {
    this.tools = { ...this.tools, ...patch };
    if (patch.tool && patch.tool !== "lasso") this.selection = null;
    this.changed();
  }

  setSelection(sel: Selection): void {
    this.selection = sel && sel.ids.length > 0 ? sel : null;
    this.changed();
  }

  notePen(): void {
    if (!this.penDetected) {
      this.penDetected = true;
      this.changed();
    }
  }
}
