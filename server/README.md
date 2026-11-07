# NOVA lecture analysis API (v2.1)

This server backs the NOVA browser app. It keeps no state between requests and uses only Node 22+ built-ins (`node:http` and `fetch`), so there is nothing to install.

| Route | What it does |
| --- | --- |
| `GET /api/health` | `200 {"ok":true}`. Never calls the model and never reports whether a key is set. |
| `POST /api/analyze` | Transcript segments (plus optional cues, materials, recent visual types) → one visual decision (`append` / `replace` / `skip`) and cue answers. |
| `POST /api/ink/transcribe` | A cropped PNG of handwriting → a verbatim transcription. |
| `POST /api/assist` | A problem-set question → a hint grounded in class materials and notes. |

Request and response shapes are the shared v2.1 contract. Every new request field is optional, so v1 browsers keep working.

## Setup

Run these commands from the project root.

```bash
cp server/.env.example server/.env
```

Then edit `server/.env` and set `OPENROUTER_API_KEY`. The root `.gitignore` keeps `server/.env` out of git.

| Variable | Default | Notes |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | — | Required for every model route. Without it they return 503 `API_KEY_MISSING`. |
| `OPENROUTER_MODEL` | `google/gemini-3.8-flash` | Must support `structured_outputs` on OpenRouter. |
| `OPENROUTER_VISION_MODEL` | `OPENROUTER_MODEL` | Used by `/api/ink/transcribe`. Must accept image input and structured outputs. `google/gemini-3.8-flash` does both. |
| `OPENROUTER_REASONING_EFFORT` | `low` | `minimal`, `low`, `medium`, `high`, or `off` (omit the parameter). See "Speed" below. |
| `OPENROUTER_TIMEOUT_MS` | `12000` | Analyze and assist upstream timeout. A timeout returns 502. |
| `OPENROUTER_VISION_TIMEOUT_MS` | `8000` | Transcribe upstream timeout. |
| `OPENROUTER_WEB_BUDGET_MS` | `20000` | Total budget for a request that uses the web fallback. |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | Tests point this at a local stub. |
| `PORT` | `8787` | The server always binds to `127.0.0.1`. The Vite proxy expects 8787. |

Model facts above were checked against OpenRouter's public model list and OpenAPI spec on 2026-11-07.

## Run

```bash
npm run api
```

That runs `node --env-file-if-exists=server/.env server/index.mjs`.

## Errors

Errors are `{"error":{"code":"…","message":"…"}}`.

| Status | Code | When |
| --- | --- | --- |
| 400 | `INVALID_INPUT` | Bad JSON or content type, a body over the cap (256 KB; 2 MB for transcribe), or any field outside the contract limits. |
| 503 | `API_KEY_MISSING` | No `OPENROUTER_API_KEY`. Checked after input validation. |
| 502 | `ANALYSIS_FAILED` | Upstream error, timeout, truncated or unreadable output, or output that can't be repaired (see below). |
| 404 / 405 | `NOT_FOUND` / `METHOD_NOT_ALLOWED` | Unknown route or wrong method. |

## Code layout

```
server/index.mjs          entry point and router (unchanged start command)
server/lib/               config, limits, errors, HTTP helpers, OpenRouter call, PNG checks, visual and source validation
server/routes/            analyze.mjs, transcribe.mjs, assist.mjs
server/test/*.test.mjs    node:test suites against a stub upstream
server/scripts/visual-eval.mjs, server/fixtures/visual-eval/   visual variety eval
server/fixtures/ink-sample.png   96 × 32 PNG of "? ?" for smoke tests
```

## Tier 1 · Handwriting

### `POST /api/ink/transcribe`

- **Image checks, no image library.** The image must be raw base64 (no `data:` prefix), with valid characters and padding. It must decode to 1.5 MB or less, start with the PNG signature, and begin with an `IHDR` chunk whose CRC matches. Width and height are read from `IHDR` and must each be 1–2,048 px.
- **Other fields.** `purpose` is required and must be `note`, `question`, `vocab`, or `math`. `context` is optional, up to 500 characters, and goes to the model as delimited untrusted data.
- **Prompt.** It asks for a verbatim transcription only and never an answer, explanation, or completion. Instructions written in the ink are transcribed as text and not followed. For `math`, the model also returns `tex`.
- **Confidence.** `confidence` is `"low"` when the model reports uncertainty or the text is empty, even if the model said `"high"`.
- **Limits and logging.** The upstream timeout is 8 seconds and leads to 502. Temperature is 0. The image is sent as an `image_url` data URL with `detail: "high"`. Image data is never logged.

### Cues in `/api/analyze`

- **Input.** `cues` holds up to 10 entries. Each cue has a unique `id`, a `kind`, and non-empty `text` of 1,000 characters or fewer. `weight` (1–3) is read only for `important` cues. A missing `atSec` is treated as `null`.
- **Model instructions.**
  - `question` gets a deeper explanation. The matching node gets `emphasis: "question"` plus a `detail`, and the model uses `replace` when the question is about the current visual.
  - `important` gets one line on why it matters, and the matching node gets emphasis.
  - `vocab` gets a concise definition.
- **What the server enforces.** At most one answer per cue, in request order. Unknown cue IDs are ignored. The answer's `kind` is copied from the request's cue, not from the model. `body` is clipped to 600 characters. Citations must reference IDs in the request. An answer left with no valid citation gets `"citations": []` and `"unverified": true`.
- **Answers with `skip`.** Answers are allowed alongside `skip`. If the model's visual is unusable but some cue answers are valid, the server returns `skip` with those answers instead of a 502.
- **Response shape.** `cueAnswers` and `sourceMode` appear only when there is something to report. A v1 request without cues or materials gets exactly the v1 response.

## Tier 2 · Diverse visuals

### Why output was almost always a flowchart

The causes, all found in the v1 code on `main` (`5a7def8`):

1. **The type list was too small.** The v1 schema allowed only `concept-map`, `flowchart`, `schematic`, and `recap`. Cycles, timelines, hierarchies, comparisons, venns, and charts had nowhere to go, so ordered or sequential content landed in `flowchart`. In the eval set below, 12 of 17 snippets have an expected type that v1 could not express.
2. **The prompt over-claimed for flowchart.** It described flowchart as "ordered steps, processes, or decisions". "Processes" covers most lecture explanations. There were no examples for any type.
3. **No variety signal.** The model never saw which types it had just produced, so nothing discouraged repeating the same type.
4. **Browser rendering (Agent 1's area, reported for completeness).** The v1 browser drew every non-schematic visual, including concept maps, with Mermaid flowchart syntax (`direction LR` instead of `TD`). So even non-flowchart answers looked like flowcharts.
5. **Supporting data.** The v1 live check returned flowcharts for both diagram responses. The baseline v1 run on the real provider is in "Measured results" below.

### What changed

- **Prompt.** The system prompt follows the contract's content-shape table. It gives one short example per type, says "Flowchart is NOT the default", limits flowchart to ordered steps or decisions, and asks for 2–5 meaningful `group`s, labels of 6 words or fewer, and 12 nodes or fewer.
- **Variety.** The prompt gets `lastVisualType` and `recentVisualTypes` and is told not to repeat the last type unless the content clearly has that shape. If `recentVisualTypes` is absent (v1 browsers), `currentVisual.visualType` is used as the last type.
- **Request format.** Everything is wrapped in `<data>…</data>` as untrusted data. `<` is escaped inside it, so transcript text can't close the delimiter.

### Validation

Model output is strict. Over-long text is clipped instead of rejected. Labels keep their first 6 words plus `…`. Topic, detail, and body are clipped on a word boundary.

| Type | Structure rule the server checks |
| --- | --- |
| flowchart | ≥ 2 nodes, ≥ 1 edge, and some node with no incoming edge has an outgoing edge (a start node). |
| cycle | ≥ 3 nodes, edges = nodes, each node has exactly one edge in and one out, and following edges visits every node and returns to the start. |
| timeline | Edges are exactly `nodes[i] → nodes[i+1]` in node order. |
| hierarchy | Edges = nodes − 1, exactly one root, every other node has one parent, every node is reachable from the root, and there are no cycles. |
| comparison | Every node has a group, there are 2–3 groups, and edges (if any) link nodes in different groups. |
| venn | Every node's group is `A`, `B`, or `both`, and all three are used. |
| chart | `chart.kind` is `bar` or `line`, with 2–12 points of finite numbers and non-empty labels. **Every value must appear as digits in the segments or materials.** |
| concept-map, schematic | ≥ 2 nodes and ≥ 1 edge. Edge labels are requested but not required. |
| recap | Empty nodes and edges. |

- A visual that is structurally sound but breaks its type rule is **downgraded**, not rejected. It becomes a `concept-map` if it has at least 2 nodes and 1 edge, and a `recap` otherwise.
- A response returns 502 only when the visual can't be used at all: an unknown type or action, empty topic or recap, more than 12 nodes, duplicate IDs, an edge to a missing node, or a recap with nodes.
- More than 5 color groups on a non-venn, non-comparison visual: the groups are dropped and the visual kept.
- How chart grounding works:
  - Numbers are taken from digits only: `1,250` reads as 1250, `87.5%` as 87.5, `.25` as 0.25.
  - Sign is not compared, so "fell 5 percent" can be charted as −5.
  - Number words ("twenty") and rescaled values (a value of 1500000 for "1.5 million") are rejected. The prompt tells the model to copy the number as written and put the scale in `unit`.
- `chart` appears only on `chart` visuals.

### Input stays lenient

A v1 browser sends its on-screen visual back as `currentVisual`. That input may still have up to 16 nodes, labels up to 100 characters, and any of the 10 types. Citations on `currentVisual` are ignored.

## Tier 3 · Grounding, citations, web fallback, assist

### Sources

- **Materials.** Up to 8 excerpts of 1,500 characters or fewer, each with a unique `id` and a valid `kind`. Notes (assist only) have the same limits.
- **Citations.** Every citation must reference a `segmentId` or `excerptId` from the same request, or a URL the provider returned as a `url_citation` annotation. Anything else is dropped.
- **`sourceMode`** is the lowest-priority tier actually cited. It is `web` if any web citation remains. Otherwise it is `materials` if any material citation remains. Otherwise it is `lecture` (analyze) or `materials` (assist, which has no transcript).

### Web fallback

1. **Pass 1** uses only the supplied sources. The model lists cues the sources don't cover in an internal `needsWeb` field. For assist, `needsWeb` is a boolean.
2. **Pass 2** runs only when `allowWeb` is `true` and that list is not empty. It uses OpenRouter's `openrouter:web_search` server tool (`max_results: 3`). The older `plugins: [{id:"web"}]` and `:online` options are deprecated in the current docs.
3. **URLs** come only from the provider's annotations, and any URL the model lists that isn't one of them is dropped.
   - If pass 2 answers exactly one cue and the model lists no URLs, that cue gets the provider's annotations, since every source in that pass belongs to it.
   - A web answer left with no valid URL keeps its pass-1 version.
4. **Time budget.** Both passes share a 20-second budget. Pass 2 is skipped if less than 1.5 s remains. If pass 2 fails or times out, the pass-1 response is returned with status 200.

### `POST /api/assist`

- **Required fields.** `problem` (`text` ≤ 4,000 characters), `question` (may be empty), `studentWork` (≤ 2,000 characters, may be empty), `notes`, `materials`, and `helpLevel` (`hint` or `explain`).
- **Prompt.** It never gives the final answer at either level. Materials come first (equation sheets preferred for equations), then notes as context.
- **Output rules:**
  - `hint` is clipped to 800 characters. An empty hint returns 502.
  - `relevantNotes` holds up to 4 supplied note IDs, with no duplicates.
  - `equations` holds up to 4. Each must cite a supplied material, or a provider-annotated web URL in pass 2, and is dropped otherwise.

## Tests (offline, no key, no network)

```bash
node --test 'server/test/*.test.mjs'
```

The quotes matter: Node 22 expands the glob itself, and `node --test server/test/` (a directory) does not work on Node 22. Running this gives 147 tests in 5 files, each starting its own stub upstream:

- **core**: routes, error shape, 19 malformed analyze inputs, the 256 KB cap, v1-sized `currentVisual` accepted, append, replace, skip, recap, label clipping, `<data>` breakout, 10 invalid model outputs, 9 upstream failures (including timeout), and no key or upstream message leaked.
- **transcribe**: bad base64, bad length, `data:` prefix, non-PNG, oversized width and height, zero size, bad IHDR CRC, over 1.5 MB, bad or missing purpose, context over 500, the 2 MB body cap, instructions in the ink returned verbatim, `tex` for math, low confidence on empty output, timeout → 502, missing key → 503.
- **cues**: cue validation, and answers with `skip`, `append` (important emphasis), and `replace` (question emphasis + detail, start time kept). Also: one answer per cue, unknown IDs ignored, invented citations → unverified, body clip, unusable visual salvaged as skip.
- **visuals**: valid and downgraded cases for each of the 8 graph types, cycle and hierarchy edge cases, too many groups, chart grounding (passes, rejects ungrounded values, accepts material values, bad point counts), number extraction, and `recentVisualTypes` reaching the prompt.
- **tier3**: material validation, invented IDs dropped, web pass only when allowed and needed, the tool shape, invented URLs dropped, the single-cue annotation fallback, web failure → pass 1, budget skip, and assist validation, filtering, clipping, and web.

## Visual variety eval

```bash
node --env-file-if-exists=server/.env server/scripts/visual-eval.mjs --out /tmp/visual-eval.json
```

- **Snippets.** `server/fixtures/visual-eval/snippets.json` has 17 short lecture snippets. Every type has at least one, and 7 types have two. Each has an expected type and a reference visual.
- **Stub run (always).** The script runs every reference visual through the real validation path and fails if any is downgraded.
- **Real run.** This happens only when a key is set. It reports the type distribution, accuracy, latency, and downgrades. `--stub-only` skips it.
- **Targets on the real provider:** at least 7 distinct types, no type above 35%, at least 70% matching the expected type.

## Smoke tests (copy-paste)

Start the server (`npm run api`), then run these from the project root in another terminal.

```bash
curl -s http://127.0.0.1:8787/api/health
```

```bash
IMG=$(base64 < server/fixtures/ink-sample.png | tr -d '\n'); curl -s -X POST http://127.0.0.1:8787/api/ink/transcribe -H 'Content-Type: application/json' -d "{\"image\":\"$IMG\",\"purpose\":\"question\"}"
```

```bash
curl -s -X POST http://127.0.0.1:8787/api/analyze \
  -H 'Content-Type: application/json' \
  -d '{"segments":[{"id":"s1","startSec":0,"endSec":6.5,"text":"Okay everyone, today we are covering photosynthesis."},{"id":"s2","startSec":6.5,"endSec":18.2,"text":"In the light reactions, light hits chlorophyll in the thylakoid membrane, and that energy is used to split water molecules, releasing oxygen."},{"id":"s3","startSec":18.2,"endSec":29.9,"text":"The energy from that electron transport chain produces ATP and NADPH, which then power the Calvin cycle in the stroma."}],"currentVisual":null,"recentVisualTypes":["flowchart"],"cues":[{"id":"c1","kind":"question","text":"why is oxygen released?","atSec":12,"source":"ink"},{"id":"c2","kind":"important","text":"ATP and NADPH","weight":2,"atSec":25,"source":"typed"},{"id":"c3","kind":"vocab","text":"thylakoid","atSec":null,"source":"transcript"}]}'
```

Expected results:

- **Health:** `{"ok":true}`.
- **Transcribe:** with a key, `{"text":"…","confidence":"high"|"low"}` (the sample image shows "? ?"). Without a key, `503 API_KEY_MISSING`.
- **Analyze:** with a key, an `append` or `skip` with up to three `cueAnswers` and a `sourceMode`. Without a key, `503 API_KEY_MISSING`.

This malformed request should return `400 INVALID_INPUT`:

```bash
curl -s -X POST http://127.0.0.1:8787/api/ink/transcribe -H 'Content-Type: application/json' -d '{"image":"not-base64","purpose":"note"}'
```

## Speed

OpenRouter lists reasoning as mandatory for `google/gemini-3.8-flash`, with efforts `high`, `medium`, and `low` and a default of `medium`. That likely explains the ~9 s responses in v1. The server sends `reasoning: {effort: "low", exclude: true}`. Reasoning tokens share the `max_tokens` budget (4,096 for analyze, 3,000 for the web pass and assist, 2,048 for transcribe). Temperature is 0.2, or 0 for transcribe. Logs contain only the method, route, status, latency, and a short reason code.

## Measured results

Not run yet: no `server/.env` key was available in this worktree when this was written. See the handoff report.
