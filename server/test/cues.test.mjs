// Tier 1: cue handling in /api/analyze.

import assert from "node:assert/strict";
import { test } from "node:test";
import { CURRENT_VISUAL, SEGMENTS } from "./fixtures.mjs";
import { analyze, completion, decision, expectError, upstream } from "./helpers.mjs";

const CUES = [
  { id: "c1", kind: "question", text: "why does water split?", atSec: 12.5, source: "ink" },
  { id: "c2", kind: "important", text: "ATP and NADPH", weight: 3, atSec: 20, source: "typed" },
  { id: "c3", kind: "vocab", text: "thylakoid", atSec: null, source: "transcript" },
];

const answer = (cueId, extra = {}) => ({
  cueId,
  title: `About ${cueId}`,
  body: `Answer for ${cueId}.`,
  citations: [{ kind: "lecture", id: "s2" }],
  ...extra,
});

test("cues are validated and sent to the model as data", async () => {
  upstream.push(completion(decision({ action: "skip", sourceSegmentId: "" })));
  await analyze({ segments: SEGMENTS, currentVisual: null, cues: CUES });
  const user = upstream.requests[0].body.messages[1].content;
  assert.ok(user.includes('"kind":"question"') && user.includes("why does water split?"));
  assert.ok(user.includes('"weight":3'));
});

for (const [name, cues] of [
  ["11 cues", Array.from({ length: 11 }, (_, i) => ({ id: `c${i}`, kind: "vocab", text: "x", atSec: null }))],
  ["unknown kind", [{ id: "c1", kind: "summary", text: "x", atSec: null }]],
  ["duplicate ids", [CUES[0], { ...CUES[1], id: "c1" }]],
  ["empty text", [{ ...CUES[0], text: " " }]],
  ["weight 4", [{ ...CUES[1], weight: 4 }]],
  ["negative atSec", [{ ...CUES[0], atSec: -1 }]],
  ["unknown source", [{ ...CUES[0], source: "voice" }]],
  ["cues not an array", { id: "c1" }],
]) {
  test(`cue malformed: ${name} -> 400`, async () => {
    expectError(await analyze({ segments: SEGMENTS, currentVisual: null, cues }), 400, "INVALID_INPUT");
    assert.equal(upstream.requests.length, 0);
  });
}

test("missing atSec is read as null (lenient)", async () => {
  upstream.push(completion(decision({ action: "skip", sourceSegmentId: "", cueAnswers: [answer("c3")] })));
  const r = await analyze({ segments: SEGMENTS, currentVisual: null, cues: [{ id: "c3", kind: "vocab", text: "thylakoid" }] });
  assert.equal(r.status, 200, JSON.stringify(r.json));
});

test("skip with cue answers: answers in cue order, kind from the cue, lecture citations", async () => {
  upstream.push(completion(decision({ action: "skip", sourceSegmentId: "", cueAnswers: [answer("c3"), answer("c1")] })));
  const r = await analyze({ segments: SEGMENTS, currentVisual: null, cues: CUES });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.action, "skip");
  assert.equal(r.json.visual, undefined);
  assert.deepEqual(r.json.cueAnswers, [
    { cueId: "c1", kind: "question", title: "About c1", body: "Answer for c1.", citations: [{ kind: "lecture", segmentId: "s2" }] },
    { cueId: "c3", kind: "vocab", title: "About c3", body: "Answer for c3.", citations: [{ kind: "lecture", segmentId: "s2" }] },
  ]);
  assert.equal(r.json.sourceMode, "lecture");
});

test("append with an important cue: node emphasis kept, answer returned", async () => {
  const visual = {
    topic: "Light reactions",
    recap: "Light energy makes ATP and NADPH.",
    visualType: "flowchart",
    nodes: [
      { id: "n1", label: "Light hits chlorophyll" },
      { id: "n2", label: "ATP and NADPH", emphasis: "important" },
    ],
    edges: [{ from: "n1", to: "n2" }],
  };
  upstream.push(completion(decision({ visual, cueAnswers: [answer("c2", { body: "They power the Calvin cycle." })] })));
  const r = await analyze({ segments: SEGMENTS, currentVisual: null, cues: [CUES[1]] });
  assert.equal(r.json.action, "append");
  assert.equal(r.json.visual.nodes[1].emphasis, "important");
  assert.equal(r.json.cueAnswers[0].kind, "important");
  assert.equal(r.json.cueAnswers[0].body, "They power the Calvin cycle.");
});

test("replace with a question cue: node gets emphasis question + detail, start time kept", async () => {
  const visual = {
    ...CURRENT_VISUAL,
    nodes: CURRENT_VISUAL.nodes.map((n) => (n.id === "n2" ? { ...n, emphasis: "question", detail: "Light energy strips electrons from water, which splits it and releases oxygen." } : n)),
  };
  upstream.push(completion(decision({ action: "replace", sourceSegmentId: "", visual, cueAnswers: [answer("c1")] })));
  const r = await analyze({ segments: SEGMENTS, currentVisual: CURRENT_VISUAL, cues: [CUES[0]] });
  assert.equal(r.json.action, "replace");
  assert.equal(r.json.visual.sourceStartSec, CURRENT_VISUAL.sourceStartSec);
  assert.deepEqual(r.json.visual.nodes[1], {
    id: "n2", label: "Water is split", emphasis: "question",
    detail: "Light energy strips electrons from water, which splits it and releases oxygen.",
  });
  assert.equal(r.json.cueAnswers[0].cueId, "c1");
});

test("one answer per cue; unknown cue ids ignored; empty bodies dropped", async () => {
  upstream.push(completion(decision({
    action: "skip",
    sourceSegmentId: "",
    cueAnswers: [answer("c1"), answer("c1", { body: "second" }), answer("ghost"), answer("c3", { body: "  " })],
  })));
  const r = await analyze({ segments: SEGMENTS, currentVisual: null, cues: CUES });
  assert.deepEqual(r.json.cueAnswers.map((a) => [a.cueId, a.body]), [["c1", "Answer for c1."]]);
});

test("invented citation ids are dropped and the answer is marked unverified", async () => {
  upstream.push(completion(decision({
    action: "skip",
    sourceSegmentId: "",
    cueAnswers: [answer("c1", { citations: [{ kind: "lecture", id: "s99" }, { kind: "material", id: "m-invented" }] })],
  })));
  const r = await analyze({ segments: SEGMENTS, currentVisual: null, cues: CUES });
  assert.deepEqual(r.json.cueAnswers[0].citations, []);
  assert.equal(r.json.cueAnswers[0].unverified, true);
});

test("answer text is clipped to contract limits (body 600)", async () => {
  upstream.push(completion(decision({ action: "skip", sourceSegmentId: "", cueAnswers: [answer("c1", { body: "word ".repeat(200) })] })));
  const r = await analyze({ segments: SEGMENTS, currentVisual: null, cues: CUES });
  assert.ok(r.json.cueAnswers[0].body.length <= 600);
});

test("unusable visual with valid cue answers -> skip that keeps the answers", async () => {
  const bad = decision({ sourceSegmentId: "nope", visual: CURRENT_VISUAL, cueAnswers: [answer("c1")] });
  upstream.push(completion(bad));
  const r = await analyze({ segments: SEGMENTS, currentVisual: null, cues: CUES });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.action, "skip");
  assert.equal(r.json.cueAnswers.length, 1);
});

test("no cues -> no cueAnswers key even if the model invents some", async () => {
  upstream.push(completion(decision({ action: "skip", sourceSegmentId: "", cueAnswers: [answer("c1")] })));
  const r = await analyze({ segments: SEGMENTS, currentVisual: null });
  assert.deepEqual(r.json, { action: "skip" });
});
