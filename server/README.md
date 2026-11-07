# NOVA lecture analysis API

This server turns finalized lecture transcript segments into one decision: a new visual (`append`), a revision of the current visual (`replace`), or `skip`. It calls OpenRouter with structured output, validates the result, and returns it to the browser. It keeps no state between requests.

It uses only Node 22+ built-ins (`node:http` and `fetch`), so there is nothing to install.

## Setup

Run these commands from the project root.

```bash
cp server/.env.example server/.env
```

Then edit `server/.env` and set `OPENROUTER_API_KEY`. The `server/.gitignore` file keeps `server/.env` out of git.

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `OPENROUTER_API_KEY` | yes, for analysis | — | Without it, `/api/analyze` returns 503 `API_KEY_MISSING`. |
| `OPENROUTER_MODEL` | no | `google/gemini-3.8-flash` | The model must support `structured_outputs` on OpenRouter. |
| `OPENROUTER_TIMEOUT_MS` | no | `30000` | Upstream timeout. A timeout returns 502 `ANALYSIS_FAILED`. |
| `PORT` | no | `8787` | The server always binds to `127.0.0.1`. |

## Run

```bash
node --env-file-if-exists=server/.env server/index.mjs
```

After the merge, `npm run api` runs this same command (Agent 1 defines that script).

## API

- `GET /api/health` → `200 {"ok":true}`. It never calls the model and never reports whether a key is set.
- `POST /api/analyze` with `Content-Type: application/json` and an `AnalyzeRequest` body (see the shared contract) → `AnalyzeResponse`.

Errors are returned as `{"error":{"code":"…","message":"…"}}`:

| Status | Code | When |
| --- | --- | --- |
| 400 | `INVALID_INPUT` | Bad JSON, a body over 64 KB, or wrong content type. Also when segments are not 1–12, have bad or out-of-order times, duplicate ids, or empty text, or when `currentVisual` is invalid. |
| 503 | `API_KEY_MISSING` | No `OPENROUTER_API_KEY` is set on the server. |
| 502 | `ANALYSIS_FAILED` | Upstream error, timeout, empty, truncated, or unparseable output, or output that fails the schema or graph checks. |
| 404 / 405 | `NOT_FOUND` / `METHOD_NOT_ALLOWED` | Unknown route or wrong method. |

Notes on behavior:

- **Source time.** The model names the segment where a new idea starts (`sourceSegmentId`). For `append`, the server sets `sourceStartSec` to that segment's `startSec`. For `replace`, it always keeps `currentVisual.sourceStartSec`. `replace` without a `currentVisual` returns 502.
- **Diagrams.** A diagram needs 1–16 nodes and at most 24 edges. Node ids must be unique, and every edge must point to existing nodes. A `recap` must have empty `nodes` and `edges`. An empty edge label is omitted from the response.
- **Text.** All text is trimmed and collapsed to a single line of plain text. Length limits: topic 120, recap 500, node label 100, edge label 60, segment text 4000.
- **Logs.** The server logs only the method, path, status, duration, and a short failure reason. It never logs transcript text or keys.

## Offline tests (no key, no network)

```bash
node server/test/run.mjs
```

These tests start a stub OpenRouter server and check the following:

- health, unknown routes, and wrong methods
- 16 malformed-input cases and the missing-key case
- `append`, `replace`, `skip`, and recap success responses
- 10 kinds of invalid model output
- upstream failures: HTTP 4xx and 5xx, errors inside a 200 body, `finish_reason: length`, non-JSON content, and a provider timeout

## Smoke test (copy-paste)

Start the server in one terminal, then run these commands in another.

```bash
curl -s http://127.0.0.1:8787/api/health
```

```bash
curl -s -X POST http://127.0.0.1:8787/api/analyze \
  -H 'Content-Type: application/json' \
  -d '{"segments":[{"id":"s1","startSec":0,"endSec":6.5,"text":"Okay everyone, today we are covering photosynthesis."},{"id":"s2","startSec":6.5,"endSec":18.2,"text":"In the light reactions, light hits chlorophyll in the thylakoid membrane, and that energy is used to split water molecules, releasing oxygen."},{"id":"s3","startSec":18.2,"endSec":29.9,"text":"The energy from that electron transport chain produces ATP and NADPH, which then power the Calvin cycle in the stroma."}],"currentVisual":null}'
```

Expected results:

- With a key: `{"action":"append","visual":{…}}` or `{"action":"skip"}`.
- Without a key: `503 API_KEY_MISSING`.

## Live check (2026-11-07, `google/gemini-3.8-flash`, Node 22.23.4)

Three requests ran through OpenRouter with a real key. Each returned the expected action and passed server validation:

| Request | Result | Time |
| --- | --- | --- |
| The 3 photosynthesis segments above, no current visual | `append`: a 7-node flowchart with `sourceStartSec` 6.5 | ~9.2 s |
| A new detail about the two photosystems, with a current flowchart | `replace`: a 5-node flowchart that kept `sourceStartSec` 6.5 | ~9.0 s |
| Filler ("can everyone hear me in the back?") | `skip` | ~1.6 s |

Responses that include a diagram take about 9 seconds. The browser should send one request at a time and keep recording while it waits.

This request is malformed and should return `400 INVALID_INPUT`:

```bash
curl -s -X POST http://127.0.0.1:8787/api/analyze -H 'Content-Type: application/json' -d '{"segments":[],"currentVisual":null}'
```
