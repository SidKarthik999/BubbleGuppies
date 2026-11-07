// Offline verification for the analysis API. No network, no real key.
// Starts a stub OpenRouter upstream and the real API server code pointed at it.
//   node server/test/run.mjs

import http from "node:http";
import assert from "node:assert/strict";
import { createServer, DECISION_SCHEMA } from "../index.mjs";
import { SEGMENTS, CURRENT_VISUAL } from "./fixtures.mjs";

// ---- stub upstream ----------------------------------------------------------
// The next response is queued by each test. Records the last request body.
let nextUpstream = null;
let lastUpstreamRequest = null;

const upstream = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    lastUpstreamRequest = { headers: req.headers, body: JSON.parse(raw) };
    const step = nextUpstream;
    if (step.hang) return; // never respond -> provokes our timeout
    res.writeHead(step.status ?? 200, { "Content-Type": "application/json" });
    res.end(typeof step.body === "string" ? step.body : JSON.stringify(step.body));
  });
});

const completion = (decision, finish = "stop") => ({
  body: {
    choices: [{ finish_reason: finish, message: { role: "assistant", content: JSON.stringify(decision) } }],
  },
});

// ---- servers ----------------------------------------------------------------
const listen = (srv) => new Promise((r) => srv.listen(0, "127.0.0.1", () => r(srv.address().port)));
const upstreamPort = await listen(upstream);

const silent = { info() {} };
const baseConfig = {
  port: 0,
  apiKey: "test-key-not-real",
  model: "stub/model",
  timeoutMs: 500,
  baseUrl: `http://127.0.0.1:${upstreamPort}`,
};
const api = createServer({ config: baseConfig, log: silent });
const apiPort = await listen(api);
const noKeyApi = createServer({ config: { ...baseConfig, apiKey: "" }, log: silent });
const noKeyPort = await listen(noKeyApi);

async function call(port, path, { method = "GET", body, headers } = {}) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json", ...headers } : headers,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}
const analyze = (body, port = apiPort) => call(port, "/api/analyze", { method: "POST", body });

// ---- tests ------------------------------------------------------------------
const results = [];
async function test(name, fn) {
  nextUpstream = null;
  lastUpstreamRequest = null;
  try {
    await fn();
    results.push(["PASS", name]);
  } catch (err) {
    results.push(["FAIL", name, err.message]);
  }
}
const expectError = (r, status, code) => {
  assert.equal(r.status, status, JSON.stringify(r.json));
  assert.equal(r.json.error?.code, code);
  assert.equal(typeof r.json.error?.message, "string");
};

const flowDecision = {
  action: "append",
  sourceSegmentId: "s2",
  visual: {
    topic: "Photosynthesis light reactions",
    recap: "Light energy splits water and produces ATP and NADPH.",
    visualType: "flowchart",
    nodes: [
      { id: "n1", label: "Light hits chlorophyll" },
      { id: "n2", label: "Water is split" },
      { id: "n3", label: "ATP and NADPH made" },
    ],
    edges: [
      { from: "n1", to: "n2", label: "" },
      { from: "n2", to: "n3", label: "drives" },
    ],
  },
};

await test("GET /api/health -> 200 {ok:true}", async () => {
  const r = await call(apiPort, "/api/health");
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { ok: true });
});

await test("health works without a key and does not call upstream", async () => {
  const r = await call(noKeyPort, "/api/health");
  assert.deepEqual([r.status, r.json], [200, { ok: true }]);
  assert.equal(lastUpstreamRequest, null);
});

await test("unknown route -> 404 error shape", async () => {
  expectError(await call(apiPort, "/api/nope"), 404, "NOT_FOUND");
});

await test("GET /api/analyze -> 405", async () => {
  expectError(await call(apiPort, "/api/analyze"), 405, "METHOD_NOT_ALLOWED");
});

for (const [name, body] of [
  ["invalid JSON", "{not json"],
  ["body is an array", []],
  ["segments missing", { currentVisual: null }],
  ["zero segments", { segments: [], currentVisual: null }],
  ["13 segments", { segments: Array.from({ length: 13 }, (_, i) => ({ id: `x${i}`, startSec: i, endSec: i + 1, text: "hi" })), currentVisual: null }],
  ["currentVisual missing", { segments: SEGMENTS.slice(0, 1) }],
  ["endSec < startSec", { segments: [{ id: "a", startSec: 5, endSec: 4, text: "hi" }], currentVisual: null }],
  ["negative time", { segments: [{ id: "a", startSec: -1, endSec: 4, text: "hi" }], currentVisual: null }],
  ["out of order", { segments: [SEGMENTS[1], SEGMENTS[0]], currentVisual: null }],
  ["duplicate ids", { segments: [SEGMENTS[0], { ...SEGMENTS[1], id: SEGMENTS[0].id }], currentVisual: null }],
  ["empty text", { segments: [{ id: "a", startSec: 0, endSec: 1, text: "   " }], currentVisual: null }],
  ["time as string", { segments: [{ id: "a", startSec: "0", endSec: 1, text: "hi" }], currentVisual: null }],
  ["bad currentVisual edge", { segments: SEGMENTS, currentVisual: { ...CURRENT_VISUAL, edges: [{ from: "n1", to: "zz" }] } }],
  ["recap currentVisual with nodes", { segments: SEGMENTS, currentVisual: { ...CURRENT_VISUAL, visualType: "recap" } }],
]) {
  await test(`malformed: ${name} -> 400 INVALID_INPUT`, async () => {
    expectError(await analyze(body), 400, "INVALID_INPUT");
    assert.equal(lastUpstreamRequest, null, "must not call upstream");
  });
}

await test("malformed: wrong content-type -> 400", async () => {
  const r = await call(apiPort, "/api/analyze", {
    method: "POST",
    body: JSON.stringify({ segments: SEGMENTS, currentVisual: null }),
    headers: { "Content-Type": "text/plain" },
  });
  expectError(r, 400, "INVALID_INPUT");
});

await test("malformed: body over 64 KB -> 400", async () => {
  const big = { segments: [{ id: "a", startSec: 0, endSec: 1, text: "x".repeat(70_000) }], currentVisual: null };
  expectError(await analyze(big), 400, "INVALID_INPUT");
});

await test("missing key -> 503 API_KEY_MISSING, no upstream call", async () => {
  expectError(await analyze({ segments: SEGMENTS, currentVisual: null }, noKeyPort), 503, "API_KEY_MISSING");
  assert.equal(lastUpstreamRequest, null);
});

await test("append -> visual with sourceStartSec from referenced segment", async () => {
  nextUpstream = completion(flowDecision);
  const r = await analyze({ segments: SEGMENTS, currentVisual: null });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.action, "append");
  assert.equal(r.json.visual.sourceStartSec, SEGMENTS[1].startSec);
  assert.deepEqual(r.json.visual.edges[0], { from: "n1", to: "n2" }, "empty edge label is dropped");
  assert.equal(r.json.visual.edges[1].label, "drives");
  assert.deepEqual(Object.keys(r.json.visual).sort(), ["edges", "nodes", "recap", "sourceStartSec", "topic", "visualType"]);
});

await test("upstream request is bounded, structured, and authorized", async () => {
  nextUpstream = completion(flowDecision);
  await analyze({ segments: SEGMENTS, currentVisual: CURRENT_VISUAL });
  const { headers, body } = lastUpstreamRequest;
  assert.equal(headers.authorization, "Bearer test-key-not-real");
  assert.equal(body.model, "stub/model");
  assert.equal(body.response_format.type, "json_schema");
  assert.equal(body.response_format.json_schema.strict, true);
  assert.deepEqual(body.response_format.json_schema.schema, DECISION_SCHEMA);
  assert.deepEqual(body.provider, { require_parameters: true });
  const user = body.messages.find((m) => m.role === "user").content;
  for (const s of SEGMENTS) assert.ok(user.includes(s.text), "segment text sent");
  assert.ok(user.includes(CURRENT_VISUAL.topic), "current visual sent");
});

await test("replace -> preserves currentVisual.sourceStartSec", async () => {
  nextUpstream = completion({
    action: "replace",
    sourceSegmentId: "",
    visual: { ...CURRENT_VISUAL, recap: "Revised recap with more detail.", sourceStartSec: undefined },
  });
  const r = await analyze({ segments: SEGMENTS, currentVisual: CURRENT_VISUAL });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.action, "replace");
  assert.equal(r.json.visual.sourceStartSec, CURRENT_VISUAL.sourceStartSec);
  assert.equal(r.json.visual.recap, "Revised recap with more detail.");
});

await test("skip -> {action:'skip'} only", async () => {
  nextUpstream = completion({
    action: "skip",
    sourceSegmentId: "",
    visual: { topic: "", recap: "", visualType: "recap", nodes: [], edges: [] },
  });
  const r = await analyze({ segments: SEGMENTS, currentVisual: CURRENT_VISUAL });
  assert.deepEqual([r.status, r.json], [200, { action: "skip" }]);
});

await test("recap append -> empty nodes and edges", async () => {
  nextUpstream = completion({
    action: "append",
    sourceSegmentId: "s1",
    visual: { topic: "Course logistics", recap: "Exams are in week 8.", visualType: "recap", nodes: [], edges: [] },
  });
  const r = await analyze({ segments: SEGMENTS, currentVisual: null });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.deepEqual([r.json.visual.nodes, r.json.visual.edges, r.json.visual.sourceStartSec], [[], [], 0]);
});

await test("labels are normalized to single-line plain text", async () => {
  const d = structuredClone(flowDecision);
  d.visual.nodes[0].label = "  Light\nhits\tchlorophyll  ";
  nextUpstream = completion(d);
  const r = await analyze({ segments: SEGMENTS, currentVisual: null });
  assert.equal(r.json.visual.nodes[0].label, "Light hits chlorophyll");
});

const badOutputs = [
  ["replace with no currentVisual", { ...flowDecision, action: "replace" }, null],
  ["append with unknown sourceSegmentId", { ...flowDecision, sourceSegmentId: "nope" }, null],
  ["edge to missing node", { ...flowDecision, visual: { ...flowDecision.visual, edges: [{ from: "n1", to: "n9", label: "" }] } }, null],
  ["duplicate node ids", { ...flowDecision, visual: { ...flowDecision.visual, nodes: [{ id: "n1", label: "a" }, { id: "n1", label: "b" }], edges: [] } }, null],
  ["unknown visualType", { ...flowDecision, visual: { ...flowDecision.visual, visualType: "pie" } }, null],
  ["unknown action", { ...flowDecision, action: "delete" }, null],
  ["recap with nodes", { ...flowDecision, visual: { ...flowDecision.visual, visualType: "recap" } }, null],
  ["diagram with no nodes", { ...flowDecision, visual: { ...flowDecision.visual, nodes: [], edges: [] } }, null],
  ["empty topic", { ...flowDecision, visual: { ...flowDecision.visual, topic: " " } }, null],
  ["too many nodes", { ...flowDecision, visual: { ...flowDecision.visual, nodes: Array.from({ length: 17 }, (_, i) => ({ id: `n${i}`, label: "x" })), edges: [] } }, null],
];
for (const [name, decision, cv] of badOutputs) {
  await test(`invalid model output: ${name} -> 502 ANALYSIS_FAILED`, async () => {
    nextUpstream = completion(decision);
    expectError(await analyze({ segments: SEGMENTS, currentVisual: cv }), 502, "ANALYSIS_FAILED");
  });
}

for (const [name, step] of [
  ["non-JSON content", { body: { choices: [{ finish_reason: "stop", message: { content: "Sure! Here is a diagram" } }] } }],
  ["empty content", { body: { choices: [{ finish_reason: "stop", message: { content: null } }] } }],
  ["finish_reason length", completion(flowDecision, "length")],
  ["upstream 401", { status: 401, body: { error: { code: 401, message: "No auth credentials found" } } }],
  ["upstream 429", { status: 429, body: { error: { code: 429, message: "Rate limited" } } }],
  ["upstream 500 HTML", { status: 500, body: "<html>oops</html>" }],
  ["200 with top-level error", { body: { error: { code: 502, message: "provider down" } } }],
  ["200 with choice error", { body: { choices: [{ finish_reason: "error", error: { code: 502, message: "x" }, message: { content: "partial" } }] } }],
  ["provider timeout", { hang: true }],
]) {
  await test(`upstream failure: ${name} -> 502 ANALYSIS_FAILED`, async () => {
    nextUpstream = step;
    const r = await analyze({ segments: SEGMENTS, currentVisual: null });
    expectError(r, 502, "ANALYSIS_FAILED");
    assert.ok(!JSON.stringify(r.json).includes("test-key-not-real"), "key not leaked");
    assert.ok(!r.json.error.message.includes("No auth credentials"), "upstream message not leaked");
  });
}

await test("fenced JSON content is accepted", async () => {
  nextUpstream = { body: { choices: [{ finish_reason: "stop", message: { content: "```json\n" + JSON.stringify(flowDecision) + "\n```" } }] } };
  const r = await analyze({ segments: SEGMENTS, currentVisual: null });
  assert.equal(r.status, 200, JSON.stringify(r.json));
});

// ---- report -----------------------------------------------------------------
for (const s of [api, noKeyApi, upstream]) s.closeAllConnections?.(), s.close();
let failed = 0;
for (const [status, name, msg] of results) {
  console.log(`${status}  ${name}${msg ? `\n      ${msg}` : ""}`);
  if (status === "FAIL") failed++;
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
