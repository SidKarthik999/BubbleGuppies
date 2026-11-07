// Visual variety eval. Runs every snippet in server/fixtures/visual-eval/
// through the real /api/analyze code path and reports the type distribution
// and accuracy against the expected labels.
//
//   node --env-file-if-exists=server/.env server/scripts/visual-eval.mjs [--stub-only] [--out results.json]
//
// - Stub: a local fake OpenRouter returns each snippet's reference visual.
//   This checks the fixtures and the validation pipeline (no downgrades
//   expected), not the model.
// - Real: runs only when OPENROUTER_API_KEY is set. Targets: >= 7 distinct
//   types, no type above 35%, >= 70% matching the expected type.

import http from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "../index.mjs";
import { readConfig } from "../lib/config.mjs";

const args = process.argv.slice(2);
const stubOnly = args.includes("--stub-only");
const outPath = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;

const { snippets } = JSON.parse(readFileSync(new URL("../fixtures/visual-eval/snippets.json", import.meta.url), "utf8"));

const listen = (srv) => new Promise((r) => srv.listen(0, "127.0.0.1", () => r(srv.address().port)));

function toModelVisual(v) {
  return {
    topic: v.topic, recap: v.recap, visualType: v.visualType,
    nodes: (v.nodes ?? []).map((n) => ({ group: "", emphasis: "", detail: "", ...n })),
    edges: (v.edges ?? []).map((e) => ({ label: "", ...e })),
    chart: v.chart ?? { kind: "none", unit: "", points: [] },
    citations: [],
  };
}

async function runAll(label, config) {
  const logs = [];
  const api = createServer({ config, log: { info: (line) => logs.push(line) } });
  const port = await listen(api);
  const rows = [];
  for (const s of snippets) {
    const before = logs.length;
    const started = performance.now();
    const res = await fetch(`http://127.0.0.1:${port}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ segments: s.segments, currentVisual: null, recentVisualTypes: [] }),
    });
    const ms = Math.round(performance.now() - started);
    const json = await res.json();
    const logLine = logs.slice(before).join(" ");
    const downgraded = /downgraded (\S+)\)/.exec(logLine)?.[1];
    const got = res.status !== 200 ? `error ${json.error?.code}` : json.action === "skip" ? "skip" : json.visual.visualType;
    rows.push({ id: s.id, expected: s.expected, got, ms, downgradedFrom: downgraded ?? null, nodes: json.visual?.nodes?.length ?? 0 });
    process.stdout.write(`  ${s.id.padEnd(28)} expected ${s.expected.padEnd(12)} got ${got.padEnd(12)} ${String(ms).padStart(6)} ms${downgraded ? `  (downgraded from ${downgraded})` : ""}\n`);
  }
  api.close();
  return summarize(label, rows);
}

function summarize(label, rows) {
  const counts = {};
  for (const r of rows) counts[r.got] = (counts[r.got] ?? 0) + 1;
  const visualRows = rows.filter((r) => !r.got.startsWith("error"));
  const distinct = Object.keys(counts).filter((t) => t !== "skip" && !t.startsWith("error")).length;
  const maxShare = Math.max(...Object.entries(counts).filter(([t]) => t !== "skip").map(([, c]) => c)) / rows.length;
  const accuracy = rows.filter((r) => r.got === r.expected).length / rows.length;
  const sorted = rows.map((r) => r.ms).sort((a, b) => a - b);
  const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const summary = {
    label, n: rows.length, distribution: counts, distinctTypes: distinct,
    maxTypeShare: Number(maxShare.toFixed(3)), accuracy: Number(accuracy.toFixed(3)),
    latencyMs: { p50: pct(0.5), p90: pct(0.9), max: sorted.at(-1) },
    downgrades: rows.filter((r) => r.downgradedFrom).length,
    errors: rows.length - visualRows.length,
    targets: { distinctTypesAtLeast7: distinct >= 7, noTypeAbove35pct: maxShare <= 0.35, accuracyAtLeast70pct: accuracy >= 0.7 },
    rows,
  };
  console.log(`\n${label}: distribution ${JSON.stringify(counts)}`);
  console.log(`  distinct types ${distinct}, max share ${(maxShare * 100).toFixed(0)}%, accuracy ${(accuracy * 100).toFixed(0)}%, ` +
    `latency p50 ${summary.latencyMs.p50} ms / p90 ${summary.latencyMs.p90} ms, downgrades ${summary.downgrades}, errors ${summary.errors}`);
  return summary;
}

// ---- stub run ---------------------------------------------------------------
const queue = [];
const stub = http.createServer((req, res) => {
  req.resume();
  req.on("end", () => {
    const s = queue.shift();
    const decision = { action: "append", sourceSegmentId: s.segments[0].id, visual: toModelVisual(s.stubVisual), cueAnswers: [], needsWeb: [] };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(decision) } }] }));
  });
});
const stubPort = await listen(stub);
queue.push(...snippets);
console.log(`Stub run (${snippets.length} snippets, reference answers):`);
const stubResult = await runAll("stub", { ...readConfig({}), apiKey: "stub", baseUrl: `http://127.0.0.1:${stubPort}` });
stub.close();
const results = { date: new Date().toISOString(), stub: stubResult, real: "not run" };

// ---- real run ---------------------------------------------------------------
const config = readConfig();
if (!stubOnly && config.apiKey) {
  console.log(`\nReal run against ${config.baseUrl} with ${config.model} (reasoning ${config.reasoningEffort ?? "not sent"}):`);
  results.real = await runAll("real", config);
  results.real.model = config.model;
  results.real.reasoningEffort = config.reasoningEffort;
} else {
  console.log(`\nReal run: not run (${stubOnly ? "--stub-only" : "OPENROUTER_API_KEY not set"}).`);
}

if (outPath) writeFileSync(outPath, `${JSON.stringify(results, null, 2)}\n`);
const stubOk = stubResult.accuracy === 1 && stubResult.downgrades === 0 && stubResult.errors === 0;
if (!stubOk) {
  console.error("\nStub run failed: every reference visual must validate without a downgrade.");
  process.exit(1);
}
