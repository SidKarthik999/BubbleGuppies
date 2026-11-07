# NOVA (BubbleGuppies) — Handoff Notes

Last updated: 2026-11-07, end of an Agent 2 (server) session. Read this first, then `README.md` (root, app) and `server/README.md` (API).

## What the project is

NOVA is a lecture study-guide prototype. A student records a lecture; live transcript segments go to an analysis API that returns study-guide "cards" (visual diagrams). The student can also handwrite notes in a notebook.

- Repo: https://github.com/SidKarthik999/BubbleGuppies
- **Current `main`: `231876c`** (everything below is merged there)
- Two processes: `npm run dev` (Vite web app, proxies `/api` to 127.0.0.1:8787) and `npm run api` (Node server, port 8787). Node 22+.
- The API needs `server/.env` with `OPENROUTER_API_KEY=...` (git-ignored; copy from `server/.env.example`). Never commit it.

## Ownership split (from the two agent prompts)

- **Agent 1 (web app):** root scaffold, package.json/lockfile, Vite config, root README, `src/`, `public/`.
- **Agent 2 (server):** only `server/`. Built with Node built-ins only (no npm deps), `node:test` for tests.
- The shared v2.1 contract (request/response types) lives in both `src/types.ts` and `server/README.md`. Keep them in sync. The original prompts were `~/Documents/agent-1-v2-web-app_1.md` and `~/Documents/agent-2-v2-analysis-api_1.md`.

## What is done

### Server (Agent 2) — `server/`
- Modules: `server/index.mjs` (entry/router), `server/lib/*` (config, limits, errors, http, openrouter, png, visual, sources, text), `server/routes/{analyze,transcribe,assist}.mjs`.
- `POST /api/analyze`: segments + optional `cues`, `recentVisualTypes`, `materials`, `allowWeb` → `append` / `replace` / `skip`, plus `cueAnswers` and `sourceMode`.
  - 10 visual types: concept-map, flowchart, cycle, timeline, hierarchy, comparison, venn, chart, schematic, recap.
  - Per-type structure rules. A broken type is **downgraded** to concept-map or recap instead of returning 502. Comparison edges within one group are dropped (a repair, not a downgrade).
  - Chart values must appear as digits in the segments or materials.
  - Lenient input (v1-sized `currentVisual` accepted), strict output (≤12 nodes, ≤6-word labels).
- `POST /api/ink/transcribe`: base64 PNG → verbatim text (vision model). Strict base64/PNG/IHDR checks, 8 s timeout. **Built and tested, but the browser does not call it** (see below).
- `POST /api/assist`: problem-set hint grounded in materials and notes. **No browser UI yet.**
- Web fallback (only when `allowWeb`): OpenRouter `openrouter:web_search` tool. **Important finding:** citation annotations only come back for *prose* replies, not JSON. So analyze does one prose call per uncovered cue (max 3); assist does prose research, then a structured hint that cites sources by ID (`web1`…). URLs come only from provider annotations.
- Model: `google/gemini-3.8-flash`, reasoning effort `low` (set via `OPENROUTER_REASONING_EFFORT`).
- Measured (real API): visual eval 17 snippets → 10 types, 100% accuracy, p50 ~3.2–3.8 s (v1 baseline was 24%, flowchart/concept-map only). In the live app, analyze calls take 2–6 s.
- Tests: `node --test 'server/test/*.test.mjs'` → **150 pass** (quotes required; Node 22 won't take a directory). Eval: `node --env-file-if-exists=server/.env server/scripts/visual-eval.mjs [--stub-only]`.

### Web app (Agent 1) — `src/`
- Notes view: notebook (lined/grid/blank/PDF pages), pressure ink, pen/highlighter/eraser/lasso/text, undo/redo, IndexedDB autosave, tap ink to seek the recording.
- One SVG renderer for all 10 visual types (`src/visuals/layout.ts`, `GraphSVG.tsx`, `ChartSVG.tsx`).
- On-device handwriting reading (TrOCR via `@huggingface/transformers`, in a web worker): `src/ink/handwriting/*`, `src/hooks/useHandwriting.ts`. Read lines are sent to `/api/analyze` as segments with IDs `note-<line>-v<n>`. It **bypasses** `/api/ink/transcribe` by design (privacy).
- Cue detector (`src/ink/cues/*`) is built and evaluated (`npm run eval:cues`).

### Integration fixes made in this session
- Merged the missed server commit into main; fixed comparison downgrades found in the live app; fixed stale root README lines.
- Fixed Agent 1's handwriting reader never firing under React StrictMode in dev (`noteReader.ts` now has an idempotent `attach()`; `useHandwriting.ts` attaches in the effect). Verified in the browser.

## Open work (prioritized)

1. **Cues never reach the server from the UI.** `NotebookView` has an `onTypedText` prop that `App.tsx` never passes, and nothing calls `session.submitCues`. So typed `??` / `*` / `==term==` and drawn `??` / ★ / highlights do nothing. The server side works (verified with a manual request: 3 answers, node emphasis). Wire: text box commit → parse typed cues → `submitCues`; the cue detector → `submitCues` (optionally transcribe the target ink first).
2. **Tier 3 UI missing:** materials upload + local retrieval, citation chips, problem-set mode calling `/api/assist`, the "Allow web fallback" toggle.
3. **The offline demo covers only 4 visual types;** the spec wants ≥6, including a chart and a venn (`src/lib/offlineFixtures.ts`).
4. Handwriting reader: errors before the OCR step are swallowed silently (`noteReader.ts` `catch {}`); the small model sometimes repeats words; perfectly flat strokes get split into their own "line" by `groupIntoLines`.
5. `npm audit`: 2 advisories in vite 5 / esbuild (dev server). The fix is a breaking upgrade to vite 8 — Agent 1's decision.
6. Contract questions to settle: `sourceMode` for assist when nothing is cited (server returns `"materials"`); handwriting notes are analyzed like transcript, while the contract says notes are "context only".

## Environment gotchas on this machine

- **npm 10.9.9 here vs. a newer npm on Agent 1's machine.** `npm install` strips `libc` fields from `package-lock.json` and leaves it modified, which blocks `git pull`. **Use `npm ci`**, or upgrade npm (`npm install -g npm@11`).
- Don't run `npm ci` while Vite is running; it breaks Vite's dep cache (blank page, "504 Outdated Optimize Dep"). Stop Vite, install, restart.
- At handoff time a **stale Vite may still be running on 5173** in the user's first terminal tab (Ctrl+C it). A healthy one runs on **5174**. The API runs on 8787 from the main checkout.
- Git is 2.35.1 (old; `git merge-tree --write-tree` is unavailable).
- Make sure nothing else (e.g., an old v1 server from `../BubbleGuppies-agent-2-api`) is on port 8787: `lsof -nP -iTCP:8787 -sTCP:LISTEN`.

## Branches and worktrees (local)

- `main` = `231876c` (source of truth).
- Pushed history branches: `agent-2-v2.1-api`, `agent-1-v2.1`, `agent-1-handwriting-ocr`, `integrate-v2.1`, `integrate-handwriting`.
- Local-only: `backup/graphics-upgrade-046fda7` (old graphics experiment, superseded; safe to delete).
- Extra worktrees you can remove when done: `../BubbleGuppies-agent-2-api`, `../BubbleGuppies-agent-2-v2.1-api`, `../BubbleGuppies-integrate`, `../BubbleGuppies-handwriting` (`git worktree list`, then `git worktree remove <path>`). Each may contain a git-ignored `server/.env` copy.
- `.claude/launch.json` in the main checkout is a local test config (git-excluded); safe to delete.

## Quick start for the next agent

```bash
cd /Users/siddanthkarthik/Projects/BubbleGuppies
git pull --ff-only
npm ci
node --test 'server/test/*.test.mjs'
npm run build
```

Then run `npm run api` and `npm run dev` in two terminals, open the Vite URL, set **Analysis: Real API**, and press **Start sample**.
