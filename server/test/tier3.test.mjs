// Tier 3: materials-first grounding, citations, web fallback, /api/assist.

import assert from "node:assert/strict";
import { test } from "node:test";
import { SEGMENTS } from "./fixtures.mjs";
import { analyze, assist, completion, decision, expectError, noKeyPort, startApi, upstream, urlCitation } from "./helpers.mjs";

const webPort = await startApi({ webBudgetMs: 5000 });
const tightPort = await startApi({ webBudgetMs: 1800 });

const MATERIALS = [
  { id: "m1", materialId: "slides-4", title: "Lecture 4 slides", locator: "p. 12", kind: "slides", text: "Photosystem II splits water: 2H2O -> 4H+ + 4e- + O2." },
  { id: "m2", materialId: "eqs", title: "Equation sheet", locator: "p. 1", kind: "equation-sheet", text: "Gibbs free energy: dG = dH - T dS." },
];
const CUES = [
  { id: "c1", kind: "question", text: "why is oxygen released?", atSec: 10 },
  { id: "c2", kind: "vocab", text: "chemiosmosis", atSec: 22 },
];
const base = { segments: SEGMENTS, currentVisual: null, cues: CUES, materials: MATERIALS };
const ans = (cueId, citations, body = `Answer ${cueId}.`) => ({ cueId, title: `T ${cueId}`, body, citations });

// ---------------------------------------------------------------------------
// Materials and citations
// ---------------------------------------------------------------------------

for (const [name, materials] of [
  ["9 materials", Array.from({ length: 9 }, (_, i) => ({ ...MATERIALS[0], id: `m${i}` }))],
  ["excerpt over 1500 chars", [{ ...MATERIALS[0], text: "x".repeat(1501) }]],
  ["unknown kind", [{ ...MATERIALS[0], kind: "video" }]],
  ["duplicate ids", [MATERIALS[0], { ...MATERIALS[1], id: "m1" }]],
  ["missing title", [{ ...MATERIALS[0], title: undefined }]],
]) {
  test(`materials malformed: ${name} -> 400`, async () => {
    expectError(await analyze({ ...base, materials }), 400, "INVALID_INPUT");
  });
}

test("materials are sent as delimited data; material citations kept; sourceMode materials", async () => {
  upstream.push(completion(decision({ action: "skip", sourceSegmentId: "", cueAnswers: [ans("c1", [{ kind: "material", id: "m1" }, { kind: "lecture", id: "s2" }])] })));
  const r = await analyze(base);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.deepEqual(r.json.cueAnswers[0].citations, [{ kind: "material", excerptId: "m1" }, { kind: "lecture", segmentId: "s2" }]);
  assert.equal(r.json.sourceMode, "materials");
  const user = upstream.requests[0].body.messages[1].content;
  assert.ok(user.startsWith("<data>") && user.includes("Photosystem II splits water"));
  assert.match(upstream.requests[0].body.messages[0].content, /prefer materials for definitions, equations, and facts/);
});

test("invented material and segment ids are dropped from answers and visuals", async () => {
  const visual = {
    topic: "Water splitting", recap: "Water is split.", visualType: "concept-map",
    nodes: [{ id: "a", label: "Water" }, { id: "b", label: "Oxygen" }], edges: [{ from: "a", to: "b", label: "releases" }],
    citations: [{ kind: "material", id: "m404" }, { kind: "lecture", id: "s2" }],
  };
  upstream.push(completion(decision({ visual, cueAnswers: [ans("c1", [{ kind: "material", id: "m404" }])] })));
  const r = await analyze(base);
  assert.deepEqual(r.json.visual.citations, [{ kind: "lecture", segmentId: "s2" }]);
  assert.deepEqual(r.json.cueAnswers[0].citations, []);
  assert.equal(r.json.cueAnswers[0].unverified, true);
  assert.equal(r.json.sourceMode, "lecture");
});

// ---------------------------------------------------------------------------
// Web fallback
// ---------------------------------------------------------------------------

const pass1 = (needsWeb = ["c2"]) =>
  completion(decision({ action: "skip", sourceSegmentId: "", cueAnswers: [ans("c1", [{ kind: "material", id: "m1" }]), ans("c2", [], "Pass-1 guess.")], needsWeb }));
const webAnswer = (answers, annotations) => completion({ answers }, { annotations });

test("allowWeb false: needsWeb is ignored, exactly one upstream call", async () => {
  upstream.push(pass1());
  const r = await analyze({ ...base, allowWeb: false }, { port: webPort });
  assert.equal(upstream.requests.length, 1);
  assert.equal(r.json.cueAnswers[1].unverified, true);
  assert.equal(r.json.sourceMode, "materials");
});

test("allowWeb true but nothing uncovered: no web pass", async () => {
  upstream.push(pass1([]));
  await analyze({ ...base, allowWeb: true }, { port: webPort });
  assert.equal(upstream.requests.length, 1);
});

test("allowWeb true and needsWeb: pass 2 uses the web tool; annotated URLs kept, invented URLs dropped", async () => {
  upstream.push(pass1(["c2", "c1", "ghost"]));
  upstream.push(webAnswer(
    [
      { cueId: "c2", title: "Chemiosmosis", body: "Ions move across a membrane down their gradient.", urls: ["https://example.edu/chemiosmosis/", "https://invented.example/fake"] },
      { cueId: "c1", title: "Oxygen", body: "Web answer with only an invented URL.", urls: ["https://invented.example/oxygen"] },
    ],
    [urlCitation("https://example.edu/chemiosmosis", "Chemiosmosis — Example University")],
  ));
  const r = await analyze({ ...base, allowWeb: true }, { port: webPort });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(upstream.requests.length, 2);
  const web = upstream.requests[1].body;
  assert.deepEqual(web.tools, [{ type: "openrouter:web_search", parameters: { max_results: 3 } }]);
  assert.ok(!web.messages[1].content.includes('"ghost"'), "only real cue ids go to pass 2");
  const [c1, c2] = r.json.cueAnswers;
  assert.deepEqual(c2.citations, [{ kind: "web", url: "https://example.edu/chemiosmosis", title: "Chemiosmosis — Example University" }]);
  assert.equal(c2.unverified, undefined);
  assert.equal(c1.body, "Answer c1.", "answer with only invented URLs keeps its pass-1 version");
  assert.equal(r.json.sourceMode, "web");
});

test("single uncovered cue: provider annotations back the answer even if the model lists no URLs", async () => {
  upstream.push(pass1(["c2"]));
  upstream.push(webAnswer([{ cueId: "c2", title: "Chemiosmosis", body: "Web body.", urls: [] }], [urlCitation("https://a.example/x", "")]));
  const r = await analyze({ ...base, allowWeb: true }, { port: webPort });
  assert.deepEqual(r.json.cueAnswers[1].citations, [{ kind: "web", url: "https://a.example/x", title: "a.example" }]);
});

test("web pass failure leaves pass-1 answers intact (200, not 502)", async () => {
  upstream.push(pass1(["c2"]));
  upstream.push({ status: 500, body: { error: { code: 500, message: "search down" } } });
  const r = await analyze({ ...base, allowWeb: true }, { port: webPort });
  assert.equal(r.status, 200);
  assert.equal(r.json.cueAnswers[1].body, "Pass-1 guess.");
  assert.equal(r.json.cueAnswers[1].unverified, true);
});

test("web pass is skipped when the 20 s budget (scaled down here) is nearly spent", async () => {
  upstream.push({ ...pass1(["c2"]), delayMs: 350 });
  const r = await analyze({ ...base, allowWeb: true }, { port: tightPort });
  assert.equal(r.status, 200);
  assert.equal(upstream.requests.length, 1);
});

// ---------------------------------------------------------------------------
// /api/assist
// ---------------------------------------------------------------------------

const NOTES = [
  { id: "n1", sessionId: "sess1", sessionTitle: "Lecture 4", startSec: 120, text: "dG negative means spontaneous." },
  { id: "n2", sessionId: "sess1", sessionTitle: "Lecture 4", startSec: null, text: "Entropy S measures disorder." },
];
const ASSIST = {
  problem: { id: "p3", label: "Problem 3", text: "Is the reaction spontaneous at 300 K if dH = -40 kJ and dS = -0.1 kJ/K?" },
  question: "which equation do I use?",
  studentWork: "dH = -40, dS = -0.1",
  notes: NOTES,
  materials: MATERIALS,
  helpLevel: "hint",
};
const assistOut = (over = {}) => ({
  hint: "Use the Gibbs equation with the values you have, then look at the sign.",
  relevantNotes: [{ excerptId: "n1", why: "Sign rule for spontaneity." }, { excerptId: "n404", why: "invented" }, { excerptId: "n1", why: "dup" }],
  equations: [
    { text: "dG = dH - T dS", tex: "\\Delta G = \\Delta H - T\\Delta S", citation: { kind: "material", id: "m2" } },
    { text: "uncited equation", tex: "", citation: { kind: "material", id: "m404" } },
    { text: "note-cited equation", tex: "", citation: { kind: "material", id: "n1" } },
  ],
  citations: [{ kind: "material", id: "m2" }, { kind: "note", id: "n1" }, { kind: "note", id: "n404" }],
  needsWeb: false,
  ...over,
});

for (const [name, body] of [
  ["missing problem", { ...ASSIST, problem: undefined }],
  ["problem text over 4000", { ...ASSIST, problem: { ...ASSIST.problem, text: "x".repeat(4001) } }],
  ["studentWork over 2000", { ...ASSIST, studentWork: "x".repeat(2001) }],
  ["bad helpLevel", { ...ASSIST, helpLevel: "solve" }],
  ["9 notes", { ...ASSIST, notes: Array.from({ length: 9 }, (_, i) => ({ ...NOTES[0], id: `n${i}` })) }],
  ["note over 1500", { ...ASSIST, notes: [{ ...NOTES[0], text: "x".repeat(1501) }] }],
  ["notes missing", { ...ASSIST, notes: undefined }],
]) {
  test(`assist malformed: ${name} -> 400`, async () => {
    expectError(await assist(body), 400, "INVALID_INPUT");
    assert.equal(upstream.requests.length, 0);
  });
}

test("assist: missing key -> 503", async () => {
  expectError(await assist(ASSIST, { port: noKeyPort }), 503, "API_KEY_MISSING");
});

test("assist: hint returned; only supplied note ids; equations must cite a material", async () => {
  upstream.push(completion(assistOut()));
  const r = await assist(ASSIST);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.deepEqual(r.json, {
    hint: "Use the Gibbs equation with the values you have, then look at the sign.",
    relevantNotes: [{ excerptId: "n1", why: "Sign rule for spontaneity." }],
    equations: [{ text: "dG = dH - T dS", tex: "\\Delta G = \\Delta H - T\\Delta S", citation: { kind: "material", excerptId: "m2" } }],
    citations: [{ kind: "material", excerptId: "m2" }, { kind: "note", excerptId: "n1" }],
    sourceMode: "materials",
  });
  const sys = upstream.requests[0].body.messages[0].content;
  assert.match(sys, /never give the final answer/);
});

test("assist: empty hint -> 502; hint clipped to 800", async () => {
  upstream.push(completion(assistOut({ hint: "  " })));
  expectError(await assist(ASSIST), 502, "ANALYSIS_FAILED");
  upstream.push(completion(assistOut({ hint: "step ".repeat(300) })));
  const r = await assist(ASSIST);
  assert.ok(r.json.hint.length <= 800);
});

test("assist: web pass only when allowWeb and needsWeb; invented URLs dropped", async () => {
  upstream.push(completion(assistOut({ needsWeb: true })));
  await assist({ ...ASSIST, allowWeb: false }, { port: webPort });
  assert.equal(upstream.requests.length, 1);

  upstream.requests = [];
  upstream.push(completion(assistOut({ needsWeb: true })));
  const { needsWeb, ...web } = assistOut({
    citations: [{ kind: "web", id: "", url: "https://chem.example/gibbs" }, { kind: "web", id: "", url: "https://made.up/x" }],
    equations: [{ text: "dG = dH - T dS", tex: "", citation: { kind: "web", id: "", url: "https://made.up/y" } }],
    relevantNotes: [],
  });
  upstream.push(completion(web, { annotations: [urlCitation("https://chem.example/gibbs", "Gibbs free energy")] }));
  const r = await assist({ ...ASSIST, allowWeb: true }, { port: webPort });
  assert.equal(upstream.requests.length, 2);
  assert.deepEqual(upstream.requests[1].body.tools, [{ type: "openrouter:web_search", parameters: { max_results: 3 } }]);
  assert.deepEqual(r.json.citations, [{ kind: "web", url: "https://chem.example/gibbs", title: "Gibbs free energy" }]);
  assert.deepEqual(r.json.equations, [], "equation citing an invented URL is dropped");
  assert.equal(r.json.sourceMode, "web");
});

test("assist: web pass failure falls back to pass 1", async () => {
  upstream.push(completion(assistOut({ needsWeb: true })));
  upstream.push({ hang: true });
  const r = await assist({ ...ASSIST, allowWeb: true }, { port: webPort });
  assert.equal(r.status, 200);
  assert.equal(r.json.sourceMode, "materials");
});
