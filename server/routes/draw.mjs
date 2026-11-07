// POST /api/draw — live sketches from Anatomy Live (../anatomy-live), mounted on
// this server so the web app needs no third process. Anatomy Live's own code is
// used unchanged: its build step bundles server.mjs + scene modules into one
// worker-style module (fetch(Request, env) -> Response), and this route passes
// requests to it. The response is newline-delimited JSON drawing commands.
//
// Uses the same OPENROUTER_API_KEY as /api/analyze. Built-in scenes (anatomy,
// gears, triangles, circuits) work without a key.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ApiError } from "../lib/errors.mjs";

const ANATOMY_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "anatomy-live");
const MAX_BODY = 4096;

// Model for Anatomy Live's sketch and review calls. Upstream uses Claude Haiku
// 5.5; Bubble Notes uses Claude Opus 5.5 in fast mode, which OpenRouter serves
// as the "anthropic/fast" endpoint of anthropic/claude-opus-5.5 (2× Opus price).
// Override in server/.env: ANATOMY_LIVE_MODEL, and ANATOMY_LIVE_PROVIDER
// ("" keeps upstream's latency-sorted routing).
export const DEFAULT_SKETCH_MODEL = "anthropic/claude-opus-5.5";
export const DEFAULT_SKETCH_PROVIDER = "anthropic/fast";

const UPSTREAM_MODEL_LINE = "const model = 'anthropic/claude-haiku-5.5';";
const UPSTREAM_PROVIDER = "provider: { sort: 'latency' }";
const UPSTREAM_REASONING = "reasoning: { enabled: false }";

export function sketchModelConfig(env = process.env) {
  const model = (env.ANATOMY_LIVE_MODEL ?? "").trim() || DEFAULT_SKETCH_MODEL;
  const provider = env.ANATOMY_LIVE_PROVIDER === undefined ? DEFAULT_SKETCH_PROVIDER : env.ANATOMY_LIVE_PROVIDER.trim();
  return { model, provider };
}

/**
 * Points the built bundle at the configured model and endpoint. Throws if
 * upstream changed the lines it rewrites, so a silent fallback to Haiku can't happen.
 */
export function patchBundle(source, { model, provider }) {
  if (!source.includes(UPSTREAM_MODEL_LINE)) throw new Error("anatomy-live model line changed upstream");
  let out = source.replace(UPSTREAM_MODEL_LINE, `const model = ${JSON.stringify(model)};`);
  if (provider) {
    if (!out.includes(UPSTREAM_PROVIDER)) throw new Error("anatomy-live provider routing changed upstream");
    // Pin the endpoint (no fallback), so "fast" really is fast mode.
    out = out.split(UPSTREAM_PROVIDER).join(`provider: { only: [${JSON.stringify(provider)}], allow_fallbacks: false }`);
  }
  if (!/haiku/i.test(model)) {
    // Opus 5.5 rejects `reasoning: { enabled: false }` ("Reasoning is mandatory").
    // Use the lowest effort instead, and give the token budget headroom, since
    // reasoning tokens count against max_tokens (sketch 840 → 2400, review 300 → 1200).
    if (!out.includes(UPSTREAM_REASONING)) throw new Error("anatomy-live reasoning setting changed upstream");
    out = out
      .split(UPSTREAM_REASONING)
      .join(`reasoning: { effort: "minimal", exclude: true }`)
      .replace("max_tokens: 840", "max_tokens: 2400")
      .replace("max_tokens: 300", "max_tokens: 1200");
  }
  return out;
}

let workerPromise = null;

/** Builds Anatomy Live's bundle once (its own build.mjs), applies the model choice, and imports it. */
function loadWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      if (!existsSync(join(ANATOMY_DIR, "build.mjs"))) throw new Error("anatomy-live folder not found");
      execFileSync(process.execPath, ["build.mjs"], { cwd: ANATOMY_DIR, stdio: "ignore", timeout: 20_000 });
      const built = join(ANATOMY_DIR, "dist", "server", "index.js");
      const patched = join(ANATOMY_DIR, "dist", "server", "bubble-notes.js");
      writeFileSync(patched, patchBundle(readFileSync(built, "utf8"), sketchModelConfig()));
      const mod = await import(pathToFileURL(patched).href + `?t=${Date.now()}`);
      return mod.default;
    })();
    workerPromise.catch(() => {
      workerPromise = null;
    });
  }
  return workerPromise;
}

function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new ApiError(413, "INVALID_INPUT", "Use a shorter sketch prompt."));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/**
 * Streams Anatomy Live's response to `res`. Errors before streaming starts are
 * thrown as ApiError so the caller answers in this API's error format.
 */
export async function handleDraw(req, res, config, notes) {
  if (req.method !== "POST") {
    req.resume();
    throw new ApiError(405, "METHOD_NOT_ALLOWED", "Use POST.");
  }
  let worker;
  try {
    worker = await loadWorker();
  } catch {
    req.resume();
    notes.push("anatomy-live unavailable");
    throw new ApiError(503, "SKETCH_UNAVAILABLE", "The sketch engine (anatomy-live) could not be loaded.");
  }
  const body = await readRaw(req);
  const controller = new AbortController();
  res.on("close", () => controller.abort());
  // Same-origin request as far as Anatomy Live's origin check is concerned:
  // the browser reaches this API only through the app's own dev proxy.
  const request = new Request("http://127.0.0.1/api/draw", {
    method: "POST",
    headers: { "Content-Type": String(req.headers["content-type"] ?? ""), "Content-Length": String(body.length) },
    body,
    signal: controller.signal,
  });
  const response = await worker.fetch(request, { OPENROUTER_API_KEY: config.apiKey ?? "" });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    notes.push(`anatomy-live ${response.status}`);
    throw new ApiError(response.status, response.status === 503 ? "API_KEY_MISSING" : "SKETCH_FAILED", data.error ?? "The sketch could not be drawn.");
  }
  res.writeHead(200, {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-store, no-transform",
    "X-Content-Type-Options": "nosniff",
  });
  if (!response.body) {
    res.end();
    return;
  }
  await new Promise((resolve) => {
    const stream = Readable.fromWeb(response.body);
    stream.on("error", () => resolve());
    stream.on("end", resolve);
    res.on("close", resolve);
    stream.pipe(res);
  });
}
