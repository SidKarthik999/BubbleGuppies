// Tier 2: per-type validation, downgrade, and chart grounding.

import assert from "node:assert/strict";
import { test } from "node:test";
import { extractNumbers, isGroundedNumber } from "../lib/visual.mjs";
import { analyze, completion, decision, upstream } from "./helpers.mjs";

const SEGS = [
  { id: "s1", startSec: 0, endSec: 8, text: "Enrollment was 40 students in 2021, 55 in 2022, and 1,250 across the district." },
  { id: "s2", startSec: 8, endSec: 16, text: "Costs fell 5 percent while the pass rate reached 87.5 percent." },
];

const n = (id, label = id, extra = {}) => ({ id, label, ...extra });
const e = (from, to, label) => (label ? { from, to, label } : { from, to });

async function run(visual, { segments = SEGS, materials } = {}) {
  upstream.push(completion(decision({ sourceSegmentId: "s1", visual: { topic: "T", recap: "R.", ...visual } })));
  const r = await analyze({ segments, currentVisual: null, ...(materials ? { materials } : {}) });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  return r.json.visual;
}

// [type, valid visual, invalid-but-structurally-sound visual, expected downgrade]
const CASES = [
  ["flowchart",
    { nodes: [n("a"), n("b"), n("c")], edges: [e("a", "b"), e("b", "c")] },
    { nodes: [n("a"), n("b"), n("c")], edges: [e("a", "b"), e("b", "c"), e("c", "a")] }, // no start node
    "concept-map"],
  ["cycle",
    { nodes: [n("a"), n("b"), n("c")], edges: [e("a", "b"), e("b", "c"), e("c", "a")] },
    { nodes: [n("a"), n("b"), n("c")], edges: [e("a", "b"), e("b", "c")] }, // not closed
    "concept-map"],
  ["timeline",
    { nodes: [n("y1", "1789"), n("y2", "1799"), n("y3", "1815")], edges: [e("y2", "y3"), e("y1", "y2")] },
    { nodes: [n("y1"), n("y2"), n("y3")], edges: [e("y1", "y3"), e("y3", "y2")] }, // not in node order
    "concept-map"],
  ["hierarchy",
    { nodes: [n("r"), n("a"), n("b"), n("a1")], edges: [e("r", "a"), e("r", "b"), e("a", "a1")] },
    { nodes: [n("r"), n("a"), n("b")], edges: [e("r", "a"), e("b", "a")] }, // two roots
    "concept-map"],
  ["comparison",
    { nodes: [n("m1", "2 cells", { group: "Mitosis" }), n("x1", "4 cells", { group: "Meiosis" })], edges: [e("m1", "x1", "vs")] },
    { nodes: [n("m1", "2 cells", { group: "Mitosis" }), n("m2", "identical", { group: "Mitosis" })], edges: [e("m1", "m2")] }, // one group
    "concept-map"],
  ["venn",
    { nodes: [n("a", "thymine", { group: "A" }), n("b", "uracil", { group: "B" }), n("c", "phosphate", { group: "both" })], edges: [] },
    { nodes: [n("a", "thymine", { group: "A" }), n("b", "uracil", { group: "DNA" })], edges: [] }, // wrong groups, no edges
    "recap"],
  ["concept-map",
    { nodes: [n("a"), n("b")], edges: [e("a", "b", "raises")] },
    { nodes: [n("a"), n("b")], edges: [] },
    "recap"],
  ["schematic",
    { nodes: [n("cpu"), n("ram")], edges: [e("cpu", "ram", "memory bus")] },
    { nodes: [n("cpu")], edges: [] },
    "recap"],
];

for (const [type, valid, broken, fallback] of CASES) {
  test(`${type}: valid structure is kept`, async () => {
    const v = await run({ visualType: type, ...valid });
    assert.equal(v.visualType, type);
    assert.equal(v.nodes.length, valid.nodes.length);
  });
  test(`${type}: broken type rule downgrades to ${fallback} (not 502)`, async () => {
    const v = await run({ visualType: type, ...broken });
    assert.equal(v.visualType, fallback);
    if (fallback === "recap") assert.deepEqual([v.nodes, v.edges], [[], []]);
    assert.equal(v.topic, "T", "text is kept");
  });
}

test("cycle with a self loop or a 2-loop plus spur is downgraded", async () => {
  const v = await run({ visualType: "cycle", nodes: [n("a"), n("b"), n("c")], edges: [e("a", "b"), e("b", "a"), e("c", "c")] });
  assert.equal(v.visualType, "concept-map");
});

test("hierarchy containing a cycle is downgraded", async () => {
  const v = await run({ visualType: "hierarchy", nodes: [n("r"), n("a"), n("b")], edges: [e("r", "a"), e("a", "b"), e("b", "a")] });
  assert.notEqual(v.visualType, "hierarchy");
});

test("comparison with 4 groups is downgraded", async () => {
  const v = await run({ visualType: "comparison", nodes: ["A", "B", "C", "D"].map((g) => n(g, g, { group: g })), edges: [e("A", "B")] });
  assert.equal(v.visualType, "concept-map");
});

test("more than 5 color groups: groups are dropped, the visual kept", async () => {
  const nodes = ["a", "b", "c", "d", "e", "f"].map((g) => n(g, g, { group: g }));
  const v = await run({ visualType: "concept-map", nodes, edges: [e("a", "b", "x")] });
  assert.equal(v.visualType, "concept-map");
  assert.ok(v.nodes.every((x) => x.group === undefined));
});

test("chart: grounded values pass, including 1,250 and 87.5 and a sign change", async () => {
  const chart = { kind: "bar", unit: "students", points: [{ label: "2021", value: 40 }, { label: "2022", value: 55 }, { label: "District", value: 1250 }] };
  const v = await run({ visualType: "chart", nodes: [], edges: [], chart });
  assert.equal(v.visualType, "chart");
  assert.deepEqual(v.chart, chart);
  assert.deepEqual([v.nodes, v.edges], [[], []]);
  const v2 = await run({ visualType: "chart", chart: { kind: "line", unit: "%", points: [{ label: "cost", value: -5 }, { label: "pass", value: 87.5 }] } });
  assert.equal(v2.visualType, "chart");
});

test("chart: a value not stated in the sources is rejected (downgraded to recap)", async () => {
  const chart = { kind: "bar", unit: "", points: [{ label: "2021", value: 40 }, { label: "2023", value: 70 }] };
  const v = await run({ visualType: "chart", nodes: [], edges: [], chart });
  assert.equal(v.visualType, "recap");
  assert.equal(v.chart, undefined);
});

test("chart: values grounded in materials count", async () => {
  const materials = [{ id: "m1", materialId: "doc", title: "Syllabus", locator: "p. 2", kind: "syllabus", text: "Midterm 30, final 45." }];
  const chart = { kind: "bar", unit: "%", points: [{ label: "Midterm", value: 30 }, { label: "Final", value: 45 }] };
  const v = await run({ visualType: "chart", chart }, { materials });
  assert.equal(v.visualType, "chart");
});

test("chart: wrong point counts, non-finite values, or kind none are downgraded", async () => {
  for (const chart of [
    { kind: "bar", unit: "", points: [{ label: "a", value: 40 }] },
    { kind: "bar", unit: "", points: Array.from({ length: 13 }, () => ({ label: "a", value: 40 })) },
    { kind: "none", unit: "", points: [{ label: "a", value: 40 }, { label: "b", value: 55 }] },
  ]) {
    const v = await run({ visualType: "chart", chart });
    assert.equal(v.visualType, "recap");
  }
});

test("chart with nodes falls back to concept-map when it has links", async () => {
  const v = await run({
    visualType: "chart",
    nodes: [n("a"), n("b")], edges: [e("a", "b", "x")],
    chart: { kind: "bar", unit: "", points: [{ label: "a", value: 999 }, { label: "b", value: 40 }] },
  });
  assert.equal(v.visualType, "concept-map");
});

test("non-chart visuals never carry a chart field", async () => {
  const v = await run({ visualType: "concept-map", nodes: [n("a"), n("b")], edges: [e("a", "b", "x")], chart: { kind: "bar", unit: "", points: [{ label: "a", value: 40 }, { label: "b", value: 55 }] } });
  assert.equal(v.chart, undefined);
});

test("extractNumbers reads digits only, with thousands separators and decimals", () => {
  const nums = extractNumbers("From 1,250 to 3,4 and .25 then 87.5%; twenty is not a digit; 2021.");
  for (const x of [1250, 3, 4, 0.25, 87.5, 2021]) assert.ok(nums.has(x), `has ${x}`);
  assert.ok(!nums.has(20));
  assert.ok(isGroundedNumber(-87.5, nums));
  assert.ok(!isGroundedNumber(1.25, nums));
});

test("recentVisualTypes reaches the prompt and the prompt is not flowchart-biased", async () => {
  upstream.push(completion(decision({ action: "skip", sourceSegmentId: "" })));
  await analyze({ segments: SEGS, currentVisual: null, recentVisualTypes: ["cycle", "timeline"] });
  const [system, user] = upstream.requests[0].body.messages.map((m) => m.content);
  assert.ok(user.includes('"lastVisualType":"timeline"'));
  assert.match(system, /Flowchart is NOT the default/);
  for (const t of ["flowchart", "cycle", "timeline", "hierarchy", "comparison", "venn", "chart", "concept-map", "schematic", "recap"]) {
    assert.match(system, new RegExp(`- ${t}: .*Ex: |- ${t}: `), `${t} described`);
  }
});

test("without recentVisualTypes, lastVisualType falls back to currentVisual.visualType (v1 browsers)", async () => {
  upstream.push(completion(decision({ action: "skip", sourceSegmentId: "" })));
  const cv = { topic: "T", recap: "R.", visualType: "flowchart", nodes: [n("a")], edges: [], sourceStartSec: 0 };
  await analyze({ segments: SEGS, currentVisual: cv });
  assert.ok(upstream.requests[0].body.messages[1].content.includes('"lastVisualType":"flowchart"'));
});
