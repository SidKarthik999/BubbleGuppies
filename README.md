# Bubble Notes (formerly NOVA): Lecture Notes Prototype

A web prototype of Bubble Notes, an iPad-style note-taking app: a student
handwrites notes while a live visual feed builds from the lecture. The
product/UI spec and handoff notes are in [`HANDOFF.md`](HANDOFF.md). This repo is split
between two owners working from the same integration contract:

- **Agent 1 (this app)** — root scaffold, `src/`, `public/`: recording,
  live transcript, visual rendering, timeline, and the offline demo.
- **Agent 2** — `server/`: the `/api/analyze` analysis API.

## Requirements

Node 22+.

## Setup

```sh
npm install
```

Two processes, in separate terminals:

```sh
npm run dev   # Vite dev server (proxies /api -> http://127.0.0.1:8787)
npm run api   # analysis server (server/index.mjs)
```

`npm run api` loads `server/.env` if present: `cp server/.env.example server/.env`
and set `OPENROUTER_API_KEY` (`server/.env` is gitignored). Without a key the
API still runs but `/api/analyze` returns `503 API_KEY_MISSING` — the web app
stays usable (recording + transcript) regardless. See `server/README.md` for
the API's own docs and offline tests (`node --test 'server/test/*.test.mjs'`).

## Demo without the API

The app ships with a deterministic **offline demo**: a timed sample
transcript (binary search trees → tree traversal → graphs, two topic
changes) paired with fixture responses covering all four visual types
(concept-map, flowchart, schematic, recap). Create a notebook, tap it →
**New lecture**, and press **Begin lecture session**. Under **Prototype
options** in that sheet, the defaults are **Sample lecture** and **Offline
demo**, so no backend is required.

Live mic text and the sample transcript are routed through the exact same
transcript/timeline/analysis code (`src/hooks/useLectureSession.ts`), so
this is a faithful preview of the live flow.

Once Agent 2's server is merged, switch **Analysis** to **Real API** (with
either source) to exercise the same sample against the real
`/api/analyze` endpoint.

## Project layout

```
src/
  types.ts                  shared contract with the API (keep in sync with server/)
  lib/
    lectureClock.ts          single clock: timer, transcript timestamps, ink timestamps, seeks
    analyzeClient.ts         request queue: one in-flight call, coalesces the rest
    sampleTranscript.ts      timed fixture transcript for the offline demo
    offlineFixtures.ts       deterministic fixture responses for the sample
    speechRecognitionTypes.ts minimal typing for the Web Speech API
  hooks/
    useRecorder.ts           MediaRecorder: start/pause/resume/stop, mic release
    useSpeechRecognition.ts  live transcription, auto-restarts on unexpected stops
    useLectureSession.ts     orchestrates the above into one session
  screens/                   Home shelf, sheets, lecture (PiP / split / feed), review
  components/                notebook + ink toolbar, transcript panel, visual
                              renderer (SVG), icons, glass filter
server/
  .env.example                tracked; copy to .env (gitignored) for a real key
```

## v2.1 — Notes (handwriting)

The app opens on the **Notebooks** shelf. Inside a notebook, the live feed
shows as a picture-in-picture window (**Notes**), an adjustable **Split**,
or full screen (**Feed**). See `HANDOFF.md` Part 2 for where each screen
lives in `src/screens/`.

**What works**

- Notebook of pages: lined, grid, or blank, plus **PDF pages** (class
  materials, problem sets) as backgrounds to write on.
- Pen (6 colors, 3 widths), highlighter (translucent, beneath the ink),
  eraser (whole stroke, or partial with Shift+E), lasso (move, recolor,
  delete), text boxes, undo/redo. Press `?` for all keyboard shortcuts.
- Mouse, trackpad, and stylus (pressure). Once a pen is seen, touch stops
  drawing and pans/pinch-zooms instead (palm rejection). Ctrl/⌘+scroll zooms.
- Strokes are stored as vectors per page in IndexedDB and autosave; each is
  stamped with the lecture clock. After a lecture, pick ▶︎ (S) and tap ink to
  jump the recording to when it was written. The sample demo synthesizes a
  placeholder track so this works offline too.

**Visuals:** one SVG renderer handles every visual type from Agent 2's v2.1
server (concept map, flowchart, cycle, timeline, hierarchy, comparison, venn,
chart, schematic, recap) with a layout per type, group colors with a legend,
gold ★ for important nodes, dashed `?` for question nodes (click to expand
the detail). Visuals are validated in the browser first; anything unusable
falls back to the recap card. The old renderer drew everything through
Mermaid's flowchart grammar and drew unknown types as flowcharts — that's
why every graphic looked like a flowchart.

**Not wired into the UI yet:** the on-device cue detector (`??`, ★,
highlight → vocab) is built and evaluated (`npm run eval:cues`, results
below), and the analysis client already sends `cues` and
`recentVisualTypes`, but detected cues aren't surfaced in the notes yet.

**New dependencies**

- `perfect-freehand` — turns pointer samples + pressure into smooth,
  variable-width stroke outlines; small, no runtime deps.
- `pdfjs-dist` — renders PDF pages as notebook backgrounds. Loaded only when
  a PDF is opened; needs a 2024+ browser (`Promise.withResolvers`).
- `mermaid` was removed (it rendered every graph as a flowchart).

**Cue detection eval** (synthetic strokes — no real pen samples recorded
yet; run `npm run eval:cues`): `??` 94%, ★ rows 100% (correct count 100%),
highlight→vocab 100%, false positives on letters/digits/math 0.1% per glyph
and 0/100 pages of ordinary writing. Drop real samples in
`tests/fixtures/real-ink-samples.json` to measure on real handwriting.

**Housekeeping:** files retired during development live in `.trash/`
(gitignored) and can be deleted.

## Reading handwriting into the study guide

Turn on **✎ Read handwriting** in the notebook toolbar (on by default). When
you pause writing for ~1.5 s, each new or changed line of ink is cropped to a
clean black-on-white image and read by an **open-source handwriting model,
[TrOCR-small-handwritten](https://huggingface.co/Xenova/trocr-small-handwritten)**
(Microsoft, MIT license), running **in your browser** via
[Transformers.js](https://huggingface.co/docs/transformers.js) in a web
worker. Ink images never leave the device; only the recognized text does.

The text goes through the **same analysis pipeline as the lecture
transcript**: each line becomes a segment (`note-…`, timestamped with the
lecture clock, or with time into the notebook outside a lecture) in the same
single-flight `/api/analyze` queue, so it produces the same study-guide
cards and diagrams in the side panel. Notes are sent in their own batches so
every request stays in time order, and a re-read line replaces its older
unsent version. Offline mode summarizes your notes into a deterministic
"From your notes" card.

Read lines appear in the transcript panel marked ✎; click one to fix a
misread, which re-sends the corrected text. The toggle shows model download
progress (~60 MB the first time, then cached by the browser) and errors; if
the model can't load, ink and everything else keep working.

**Limits:** TrOCR reads one line at a time and was trained on English
handwriting (IAM), so neat print reads best; math notation and very slanted
or cursive writing read poorly. Mouse/trackpad handwriting is harder than pen
handwriting.

New dependency: `@huggingface/transformers` — runs the ONNX model in the
browser (WASM runtime fetched from jsDelivr on first use).

## Known gaps / integration notes

- Browser live speech recognition is Chrome-desktop-only; other browsers
  fall back to recording-only with a clear banner.
- Diagram responses from the real API take about 2–6 s (measured 2026-11-07 with
  the v2.1 server; several note cues or the web fallback can take up to ~12 s); the client keeps recording
  and coalesces new transcript while a request is in flight.
