// Server configuration from environment variables. Placeholders live in
// server/.env.example; real values live only in server/.env (git-ignored).

export const DEFAULT_MODEL = "google/gemini-3.8-flash";
export const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
export const HOST = "127.0.0.1";
export const DEFAULT_PORT = 8787;

// Upstream budgets from the v2.1 contract.
export const DEFAULT_ANALYZE_TIMEOUT_MS = 12_000;
export const DEFAULT_VISION_TIMEOUT_MS = 8_000;
export const DEFAULT_WEB_BUDGET_MS = 20_000;
// gemini-3.8-flash reasons on every request (OpenRouter lists reasoning as
// mandatory; efforts high/medium/low, default medium). "low" keeps latency down.
export const DEFAULT_REASONING_EFFORT = "low";

const REASONING_EFFORTS = ["minimal", "low", "medium", "high"];

function int(value, fallback) {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function readConfig(env = process.env) {
  const port = int(env.PORT, DEFAULT_PORT);
  const model = (env.OPENROUTER_MODEL ?? "").trim() || DEFAULT_MODEL;
  const effortRaw = (env.OPENROUTER_REASONING_EFFORT ?? DEFAULT_REASONING_EFFORT).trim().toLowerCase();
  return {
    port: port < 65536 ? port : DEFAULT_PORT,
    apiKey: (env.OPENROUTER_API_KEY ?? "").trim(),
    model,
    visionModel: (env.OPENROUTER_VISION_MODEL ?? "").trim() || model,
    timeoutMs: int(env.OPENROUTER_TIMEOUT_MS, DEFAULT_ANALYZE_TIMEOUT_MS),
    visionTimeoutMs: int(env.OPENROUTER_VISION_TIMEOUT_MS, DEFAULT_VISION_TIMEOUT_MS),
    webBudgetMs: int(env.OPENROUTER_WEB_BUDGET_MS, DEFAULT_WEB_BUDGET_MS),
    // "off" (or any unknown value) omits the reasoning parameter entirely.
    reasoningEffort: REASONING_EFFORTS.includes(effortRaw) ? effortRaw : null,
    // Override only for local testing against a stub upstream.
    baseUrl: ((env.OPENROUTER_BASE_URL ?? "").trim() || DEFAULT_BASE_URL).replace(/\/+$/, ""),
  };
}
