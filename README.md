# NOVA — Lecture Study Guide Prototype

A desktop-first prototype: a student presses Record and follows a study
guide that takes shape as the lecture progresses. This repo is split
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

`npm run api` loads `server/.env` if present (copy `server/.env.example`
and fill in your key — `server/.env` is gitignored). Without it, the API
runs but returns `503 API_KEY_MISSING` on `/api/analyze` — the web app
stays usable (recording + transcript) regardless.

## Demo without the API

The app ships with a deterministic **offline demo**: a timed sample
transcript (binary search trees → tree traversal → graphs, two topic
changes) paired with fixture responses covering all four visual types
(concept-map, flowchart, schematic, recap). From the top bar, set
**Source: Sample transcript** and **Analysis: Offline demo (fixtures)**,
then press **Start sample** — no backend required.

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
    lectureClock.ts          single clock: timer, transcript timestamps, recording seeks
    analyzeClient.ts         request queue: one in-flight call, coalesces the rest
    sampleTranscript.ts      timed fixture transcript for the offline demo
    offlineFixtures.ts       deterministic fixture responses for the sample
    speechRecognitionTypes.ts minimal typing for the Web Speech API
  hooks/
    useRecorder.ts           MediaRecorder: start/pause/resume/stop, mic release
    useSpeechRecognition.ts  live transcription, auto-restarts on unexpected stops
    useLectureSession.ts     orchestrates the above into one session
  components/                UI: recording controls, transcript panel, visual
                              renderer (Mermaid + SVG schematic), timeline, review
server/
  .env.example                tracked; copy to .env (gitignored) for a real key
```

## Known gaps / integration notes

- Browser live speech recognition is Chrome-desktop-only; other browsers
  fall back to recording-only with a clear banner.
- `npm run build` / `npm run dev` have not been run in this environment —
  the source was authored without local npm registry access. Please run
  `npm install && npm run build` and report any TypeScript/build errors.
