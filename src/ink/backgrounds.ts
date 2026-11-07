import { LINE_SPACING, type PageTemplate } from "./model.ts";

/** Draws a page template (in page units — the caller sets the transform). */
export function drawTemplate(ctx: CanvasRenderingContext2D, template: PageTemplate, w: number, h: number): void {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  if (template === "lined") {
    ctx.strokeStyle = "#c7d7ee";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = LINE_SPACING * 3; y < h - LINE_SPACING / 2; y += LINE_SPACING) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(w, y + 0.5);
    }
    ctx.stroke();
    ctx.strokeStyle = "#f2b8b8";
    ctx.beginPath();
    ctx.moveTo(72.5, 0);
    ctx.lineTo(72.5, h);
    ctx.stroke();
  } else if (template === "dotted") {
    // Bubble Notes paper: warm off-white with a 22 pt dot grid.
    const step = 22;
    ctx.fillStyle = "#fbfaf6";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#cfd3e6";
    for (let y = step; y < h; y += step) {
      for (let x = step; x < w; x += step) {
        ctx.beginPath();
        ctx.arc(x, y, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (template === "grid") {
    const step = 24;
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = step; x < w; x += step) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, h);
    }
    for (let y = step; y < h; y += step) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(w, y + 0.5);
    }
    ctx.stroke();
  }
}
