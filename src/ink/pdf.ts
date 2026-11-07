// pdf.js wrapper: load a PDF once, render pages to bitmaps for the notebook
// background (cached per page and scale).

import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { PAGE_WIDTH } from "./model.ts";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

type Doc = Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>;
const docs = new Map<string, Promise<Doc>>();

export function loadPdf(fileId: string, data: () => Promise<ArrayBuffer>): Promise<Doc> {
  let p = docs.get(fileId);
  if (!p) {
    p = data().then((buf) => pdfjs.getDocument({ data: new Uint8Array(buf) }).promise);
    docs.set(fileId, p);
    p.catch(() => docs.delete(fileId));
  }
  return p;
}

/** Page sizes in notebook units (each page scaled to PAGE_WIDTH wide). */
export async function pdfPageSizes(doc: Doc): Promise<{ width: number; height: number }[]> {
  const sizes: { width: number; height: number }[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    sizes.push({ width: PAGE_WIDTH, height: Math.round((vp.height / vp.width) * PAGE_WIDTH) });
  }
  return sizes;
}

const bitmaps = new Map<string, Promise<HTMLCanvasElement>>();

/** Renders a PDF page at `pixelWidth` device pixels wide (cached). */
export function renderPdfPage(doc: Doc, fileId: string, pageIndex: number, pixelWidth: number): Promise<HTMLCanvasElement> {
  // Bucket widths so small zoom changes reuse a bitmap.
  const bucket = Math.min(4096, Math.ceil(pixelWidth / 256) * 256);
  const key = `${fileId}:${pageIndex}:${bucket}`;
  let p = bitmaps.get(key);
  if (!p) {
    p = (async () => {
      const page = await doc.getPage(pageIndex + 1);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: bucket / base.width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await page.render({ canvas, viewport }).promise;
      return canvas;
    })();
    bitmaps.set(key, p);
    p.catch(() => bitmaps.delete(key));
  }
  return p;
}
