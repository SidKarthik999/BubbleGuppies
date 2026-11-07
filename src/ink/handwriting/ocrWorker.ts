/// <reference lib="webworker" />
// Runs an open-source handwriting recognizer entirely in the browser:
// TrOCR (Microsoft, MIT license), small handwritten variant, converted to ONNX
// for Transformers.js. Weights download once from the Hugging Face Hub and
// are cached by the browser; ink images never leave the device.

import { env, pipeline, RawImage } from "@huggingface/transformers";

export const OCR_MODEL_ID = "Xenova/trocr-small-handwritten";

export type OcrRequest = { type: "load" } | { type: "read"; id: string; png: Blob };
export type OcrResponse =
  | { type: "progress"; loaded: number; total: number; file: string }
  | { type: "ready" }
  | { type: "result"; id: string; text: string }
  | { type: "error"; id?: string; message: string };

env.allowLocalModels = false;

type ImageToText = (image: RawImage, options?: Record<string, unknown>) => Promise<unknown>;
let reader: Promise<ImageToText> | null = null;
const fileProgress = new Map<string, { loaded: number; total: number }>();

const post = (msg: OcrResponse) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg);

function load(): Promise<ImageToText> {
  if (!reader) {
    reader = pipeline("image-to-text", OCR_MODEL_ID, {
      dtype: "q8",
      progress_callback: (p: { status?: string; file?: string; loaded?: number; total?: number }) => {
        if (p.status === "progress_total" && p.total) {
          post({ type: "progress", loaded: p.loaded ?? 0, total: p.total, file: "" });
        } else if (p.status === "progress" && p.file && p.total) {
          fileProgress.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
          let loaded = 0;
          let total = 0;
          for (const f of fileProgress.values()) {
            loaded += f.loaded;
            total += f.total;
          }
          post({ type: "progress", loaded, total, file: p.file });
        }
      },
    }).then((pipe) => {
      post({ type: "ready" });
      return pipe as unknown as ImageToText;
    });
    reader.catch((err: unknown) => {
      reader = null;
      post({ type: "error", message: err instanceof Error ? err.message : String(err) });
    });
  }
  return reader;
}

self.onmessage = async (e: MessageEvent<OcrRequest>) => {
  const msg = e.data;
  if (msg.type === "load") {
    void load().catch(() => undefined);
    return;
  }
  try {
    const pipe = await load();
    const image = await RawImage.fromBlob(msg.png);
    const out = (await pipe(image, { max_new_tokens: 64 })) as { generated_text?: string }[] | { generated_text?: string };
    const first = Array.isArray(out) ? out[0] : out;
    post({ type: "result", id: msg.id, text: (first?.generated_text ?? "").trim() });
  } catch (err) {
    post({ type: "error", id: msg.id, message: err instanceof Error ? err.message : String(err) });
  }
};
