// NOVA lecture analysis API (v2.1).
// Node 22+ built-ins only: node:http and global fetch. No dependencies.
// Start from the project root:
//   node --env-file-if-exists=server/.env server/index.mjs
//
// Routes:
//   GET  /api/health
//   POST /api/analyze          transcript -> visual decision + cue answers
//   POST /api/ink/transcribe   cropped ink PNG -> verbatim text
//   POST /api/assist           problem-set hint grounded in materials and notes

import http from "node:http";
import { pathToFileURL } from "node:url";
import { HOST, readConfig } from "./lib/config.mjs";
import { analysisFailed, ApiError } from "./lib/errors.mjs";
import { readJson, sendError, sendJson } from "./lib/http.mjs";
import { LIMITS } from "./lib/limits.mjs";
import { handleAnalyze } from "./routes/analyze.mjs";
import { handleAssist } from "./routes/assist.mjs";
import { handleTranscribe } from "./routes/transcribe.mjs";

export { DEFAULT_MODEL, readConfig } from "./lib/config.mjs";
export { LIMITS } from "./lib/limits.mjs";
export { DECISION_SCHEMA, validateAnalyzeRequest, decisionToResponse } from "./routes/analyze.mjs";

const ROUTES = {
  "/api/analyze": { handler: handleAnalyze, maxBytes: LIMITS.bodyBytes },
  "/api/ink/transcribe": { handler: handleTranscribe, maxBytes: LIMITS.transcribeBodyBytes },
  "/api/assist": { handler: handleAssist, maxBytes: LIMITS.bodyBytes },
};

/** Creates the HTTP server. `config` is injectable for tests (e.g. a stub OPENROUTER_BASE_URL). */
export function createServer({ config = readConfig(), log = console } = {}) {
  return http.createServer(async (req, res) => {
    const started = Date.now();
    const path = (req.url ?? "/").split("?")[0];
    const notes = [];
    try {
      if (path === "/api/health") {
        if (req.method !== "GET" && req.method !== "HEAD") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Use GET.");
        sendJson(res, 200, { ok: true });
      } else if (ROUTES[path]) {
        if (req.method !== "POST") {
          req.resume();
          throw new ApiError(405, "METHOD_NOT_ALLOWED", "Use POST.");
        }
        const { handler, maxBytes } = ROUTES[path];
        const body = await readJson(req, maxBytes);
        sendJson(res, 200, await handler(body, config, notes));
      } else {
        throw new ApiError(404, "NOT_FOUND", "Not found.");
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.detail) notes.push(err.detail);
        sendError(res, err);
      } else {
        notes.push("unexpected error");
        sendError(res, analysisFailed("Analysis failed."));
      }
    } finally {
      // Route, status, latency, and a short reason code only. Never request
      // bodies, transcript text, image data, or credentials.
      log.info?.(`${req.method} ${path} ${res.statusCode} ${Date.now() - started}ms${notes.length ? ` (${notes.join("; ")})` : ""}`);
    }
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const config = readConfig();
  const server = createServer({ config });
  server.listen(config.port, HOST, () => {
    console.info(`NOVA analysis API listening on http://${HOST}:${config.port}`);
    console.info(
      `Model: ${config.model}. Vision model: ${config.visionModel}. Reasoning effort: ${config.reasoningEffort ?? "not sent"}. ` +
        `API key ${config.apiKey ? "configured" : "missing (model routes return 503)"}.`,
    );
  });
  const shutdown = () => server.close(() => process.exit(0));
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
