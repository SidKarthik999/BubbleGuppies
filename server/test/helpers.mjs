// Test harness: a stub OpenRouter upstream plus the real API server pointed at it.
// Each test file gets its own pair (node:test runs files in separate processes).

import http from "node:http";
import assert from "node:assert/strict";
import { after, beforeEach } from "node:test";
import { createServer } from "../index.mjs";

export const TEST_KEY = "test-key-not-real";

/** Queue of upstream steps, consumed one per upstream request. */
export const upstream = {
  queue: [],
  requests: [],
  push(...steps) {
    this.queue.push(...steps);
  },
};

const stub = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    upstream.requests.push({ headers: req.headers, body: JSON.parse(raw) });
    const step = upstream.queue.shift() ?? { status: 500, body: { error: { code: 500, message: "no stub step queued" } } };
    if (step.hang) return; // never respond -> provokes our timeout
    const send = () => {
      res.writeHead(step.status ?? 200, { "Content-Type": "application/json" });
      res.end(typeof step.body === "string" ? step.body : JSON.stringify(step.body));
    };
    if (step.delayMs) setTimeout(send, step.delayMs);
    else send();
  });
});

/** A 200 completion whose content is `data` as JSON. */
export const completion = (data, { finish = "stop", annotations } = {}) => ({
  body: {
    choices: [{
      finish_reason: finish,
      message: { role: "assistant", content: typeof data === "string" ? data : JSON.stringify(data), ...(annotations ? { annotations } : {}) },
    }],
  },
});

export const urlCitation = (url, title) => ({ type: "url_citation", url_citation: { url, title, content: "…" } });

const listen = (srv) => new Promise((r) => srv.listen(0, "127.0.0.1", () => r(srv.address().port)));
const upstreamPort = await listen(stub);

export const baseConfig = {
  port: 0,
  apiKey: TEST_KEY,
  model: "stub/model",
  visionModel: "stub/vision",
  timeoutMs: 400,
  visionTimeoutMs: 300,
  webBudgetMs: 1500,
  reasoningEffort: "low",
  baseUrl: `http://127.0.0.1:${upstreamPort}`,
};

const silent = { info() {} };
const servers = [stub];

export async function startApi(overrides = {}) {
  const srv = createServer({ config: { ...baseConfig, ...overrides }, log: silent });
  servers.push(srv);
  return listen(srv);
}

export const apiPort = await startApi();
export const noKeyPort = await startApi({ apiKey: "" });

after(() => {
  for (const s of servers) {
    s.closeAllConnections?.();
    s.close();
  }
});

beforeEach(() => {
  upstream.queue = [];
  upstream.requests = [];
});

export async function call(path, { method = "POST", body, headers, port = apiPort } = {}) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json", ...headers } : headers,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

export const analyze = (body, opts) => call("/api/analyze", { body, ...opts });
export const transcribe = (body, opts) => call("/api/ink/transcribe", { body, ...opts });
export const assist = (body, opts) => call("/api/assist", { body, ...opts });

export function expectError(r, status, code) {
  assert.equal(r.status, status, JSON.stringify(r.json));
  assert.equal(r.json.error?.code, code);
  assert.equal(typeof r.json.error?.message, "string");
  assert.deepEqual(Object.keys(r.json), ["error"]);
}

/** Wraps a contract-shaped visual into the strict model output shape. */
export function modelVisual(v) {
  return {
    topic: v.topic,
    recap: v.recap,
    visualType: v.visualType,
    nodes: (v.nodes ?? []).map((n) => ({ group: "", emphasis: "", detail: "", ...n })),
    edges: (v.edges ?? []).map((e) => ({ label: "", ...e })),
    chart: v.chart ?? { kind: "none", unit: "", points: [] },
    citations: v.citations ?? [],
  };
}

export function decision({ action = "append", sourceSegmentId = "s2", visual, cueAnswers = [], needsWeb = [] } = {}) {
  return {
    action,
    sourceSegmentId,
    visual: visual ? modelVisual(visual) : modelVisual({ topic: "", recap: "", visualType: "recap" }),
    cueAnswers,
    needsWeb,
  };
}
