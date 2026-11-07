# Bubble Notes (BubbleGuppies): Handoff and Product Context

Last updated: 2026-11-07. This file combines the product/UI spec (formerly `CONTEXT.md`) with the engineering handoff notes. Read it first, then `README.md` (root, app) and `server/README.md` (API).

- **Name:** Bubble Notes. It was previously called **NOVA**, which still appears in code (`nova` IndexedDB name, `nova-lecture-prototype` package name, `nova:*` localStorage keys) and in file names such as `moodboard.pdf`.
- **Repo:** https://github.com/SidKarthik999/BubbleGuppies
- **Status:** The Bubble Notes UI from the spec below is now implemented in the web prototype (`src/`), on top of the existing analysis API (`server/`). It's a browser prototype styled as an iPad app (designed at 1180 × 820), not a native build.
- **Design references (not in the repo):** `design/mockup.html` (clickable mockup) and `design/moodboard.pdf` (annotated Figma board, 7 pages). The spec in Part 1 is the written source of truth for both.

---

# Part 1 — Product and UI spec

## 1. What the app is

Bubble Notes is an iPad note-taking app for lectures. While you handwrite notes, the app records the lecture and builds a **live visual feed** from it: concept maps, flowcharts, recaps and schematics, plus a running transcript. You can:

- keep the feed small (picture-in-picture) while you write,
- split the screen between the feed and your notes at any proportion, or
- go full-screen on the feed when you stop writing.

After class, **Lecture review** lets you replay the lecture along a timeline of the visuals it generated.

Core idea: your own handwriting stays primary, and the AI feed supports it without taking over.

## 2. Screens and flows

The target is an iPad in landscape (1180 × 820 pt).

### 2.1 Home: Notebooks
- One **notebook per class**, drawn as a physical notebook cover in the style of Notability. Each cover has a left spine shadow, an elastic band on the right, and a white label sticker with the course code (small caps) and class name (handwritten font).
- The title and meta line sit in small type **under** the cover, not on the cover. For example, "Deep Learning" with "12 lectures · 4 problem sets".
- A notebook recorded today shows a red **TODAY** pill on its cover. A notebook with attachments shows a **PDF n** pill.
- A dashed **New notebook** tile ends the shelf.
- **Recent sessions** row: tapping a session opens Lecture review.
- **Tapping a notebook** opens a small menu **attached to that notebook**, not a full-screen modal. The board says it "stays local to the object so it doesn't cause screen clutter." Its options:
  - **New lecture** → Start class
  - **Problem set** → plain notebook with no recording
  - **Add PDF or notes** → Import sheet, with this notebook preselected
- Liquid Glass top bar: app wordmark, a segmented filter (All / Lectures / Problem sets), search and avatar.

### 2.2 The + button (bottom-right)
The button opens a small menu anchored just above it, and the + rotates into an ×. The menu has three options:
1. **New notebook** → New notebook sheet
2. **Import PDF**: your own PDFs, such as a problem set
3. **Class-provided notes**: slides, handouts and readings from the course

**New notebook sheet:** cover color (sage, classic blue, forest, butter, blush, periwinkle), course code, class name (required) and paper (dotted / lined / grid / blank). **Create notebook** adds it to the shelf.

**Import sheet:** shared by options 2 and 3, with a tab to switch between "My PDF" and "Class-provided notes". It has:
- a drop zone and file picker (PDF),
- the list of chosen files, each removable,
- an **Add to notebook** row of notebook chips.

Imported PDFs open as pages in the notebook, ready to annotate. Adding files updates the notebook's PDF count.

### 2.3 Start class
A modal over the notebook canvas: "Start class?" with the course name. It contains:
- A choice between **Plain notes** and **Record lecture**.
- A microphone level meter.
- A toggle for **Expand feed when I stop writing**. This is the zone-out behaviour.
- **Begin lecture session**, with the footnote "Session data stays on this iPad."

### 2.4 Lecture: three modes, one screen
A glass segmented control at the bottom switches between **Notes / Split / Feed**. The bottom bar also has the recording timer with pause/stop on the left and the **Zone-out detection** toggle on the right.

| Mode | Layout |
|---|---|
| **Notes** | Full-screen dotted paper canvas with the live feed as a floating **PiP** window (§3) |
| **Split** | Dark feed panel on the left, notes on the right, with an adjustable divider (§4) |
| **Feed** | Full dark feed: live visual, timeline chips and transcript column. A **Take notes** button returns to Notes. |

Canvas toolbar (floating glass capsule): pen, highlighter, eraser, lasso, shapes and text, then ink colors. Undo/redo sit in a separate capsule on the right. In Split, the toolbar collapses to pen, highlighter, eraser and the current color so it fits the narrower notes side.

**Feed content** (dark panel): a "LIVE · <visual type>" label, the topic title, a one-sentence summary and the generated visual. Below that is a row of timeline chips for earlier visuals, with the live one outlined in gold. When the panel is at least 820 pt wide, a transcript column appears with the current line highlighted. If the feed expanded on its own, a gold badge says "Auto-expanded · you paused writing".

### 2.5 Lecture review
- A three-column layout:
  - **Timeline** (left): visuals with timestamp and type, such as "21:45 · Flowchart · Training loop".
  - **Selected visual** (center) with a **Play from mm:ss** button.
  - **Transcript** (right), with the lines for that visual highlighted.
- A glass scrubber at the bottom has tick marks at each visual's timestamp.
- **My notes** opens the notebook.

## 3. Picture-in-picture spec (corner snapping)

The goal comes from the board: *"The Picture in Picture Screen should auto jump to either of the 4 corners of the screen when attempt to be moved."* It's modelled on iOS PiP, as presented in WWDC 2018 *Designing Fluid Interfaces*.

| Behaviour | Value |
|---|---|
| Snap targets | 4 corners, 20 pt from the sides, below the top bars (y = 78) and above the bottom bar (80 from the bottom) |
| Default size | 300 pt wide. It can be resized from 240 to 460 pt by dragging the **inner** corner, the one facing the screen center. The outer corner stays pinned. |
| While dragging | Follows the finger. Rubber-bands past the screen edges at a factor of 0.35. Dashed ghost outlines show the 4 targets. |
| On release | Velocity comes from the last ~6 pointer samples. If the finger was still for more than 90 ms, velocity counts as 0. |
| Projection | `projected = position + (v / 1000) × 0.998 / (1 − 0.998)`. This matches UIScrollView's `.normal` deceleration rate. The window picks the corner **nearest the projected point**, not the release point, so a flick carries it across the screen. |
| Animation | A spring that starts with the finger's release velocity: damping 0.82, response 0.38 s. |
| Tuck away | Triggered by a hard sideways flick (\|vx\| > 1600 pt/s with the projected center past the screen edge by more than 40 pt) or by the **–** button. The window slides almost entirely off that side and leaves a 30 pt tab; tapping the tab springs it back. |
| Expand (↗) | Goes to Split at 50 / 50 |
| Close (×) | Hides the PiP while recording continues. A **Show live feed** pill appears in the bottom bar. |

## 4. Split view spec (adjustable proportion)

The goal comes from the board: *"When it's expanded but not fully expanded there's a way to adjust what proportion."*

- Drag the divider, a white pill grip, to resize. A badge shows the live ratio, for example "62 / 38".
- On release, the ratio is clamped to **28–72 %** and snaps to **⅓, ½ or ⅔** when it lands within 4.5 % of one of them. Dashed guides show the snap points while dragging.
- Dragging past **84 %** switches to **full Feed**, and dragging below **18 %** switches back to **Notes + PiP**. The badge says "Release for full feed" or "Release for notes".
- Double-click or double-tap resets to 50 / 50. The left and right arrow keys move it in 5 % steps.
- **Writing on the notes side shrinks the feed back to PiP.** A hint card says so and offers a **Back to notes** button.
- **Zone-out detection** (when on) does the opposite: if you stop writing, the feed auto-expands. The idle threshold is not decided yet (§8).

## 5. Visual design

### Direction
The doodle style comes from the board's Dribbble "doodle UI" references: playful, hand-drawn notes, pastel accents and a periwinkle ground with a gold star accent.

Decorative doodles (stars, squiggles, dots) were **removed** from the home screen at the user's request. Keep the UI clean and let the handwriting supply the personality.

### Color tokens
| Token | Hex | Use |
|---|---|---|
| `--peri` | `#5b6cf2` | Primary / brand (buttons, selection) |
| `--peri-deep` | `#3f4fd6` | Pressed, handwritten headings |
| `--peri-soft` | `#e6e9ff` | Soft fills, highlighted transcript |
| `--star` | `#f4b43c` | Gold accent: live item, highlighter |
| `--ink` | `#1c2040` | Text |
| `--mute` | `#6a7090` | Secondary text |
| `--paper` | `#fbfaf6` | Notes canvas (dotted, 22 pt grid) |
| `--feed` / `--feed-2` | `#121729` / `#1b2238` | Dark live-feed surfaces |
| `--rec` | `#e5484d` | Recording, LIVE, PDF badge |
| Covers | sage `#a9cfc6`, classic `#2f5db8`, forest `#2f5c4a`, butter `#f2d37a`, blush `#ebb9c6`, periwinkle | Notebook covers |

### Type
- **Bricolage Grotesque** for display: screen titles and feed titles.
- **Figtree** for the UI.
- **Caveat** for handwriting: sample notes and notebook label names.

### Liquid Glass (navigation chrome)
The board asks for Apple's Liquid Glass on navigation, using the skill at https://github.com/stormaref/LiquidGlassSkill. Its rules:

1. **Glass needs a backdrop.** Glass over a flat fill reads as a gray box. The home and review screens have soft periwinkle, gold and pink radial glows behind the glass for this reason.
2. **Glass is colorless.** The tint is white to gray at 6 % alpha, and any color comes from behind. A branded surface such as the + button overrides only the tint.
3. **Children of a glass panel paint no background or border.** Separate them with spacing and type weight.
4. **Refraction is Chromium-only on the web** and can't be feature-detected. Elsewhere it falls back to `backdrop-filter: blur(3px) saturate(125%)`.

| Tier | Used for |
|---|---|
| Full glass + refraction | Top bars, tool capsule, mode switcher, + button |
| Chip tier | Segmented filter, search field |
| Menu tier, more opaque | Notebook menu, + menu, New notebook / Import sheets, so text stays readable over the covers |

On a native iPad build, use the system Liquid Glass materials rather than this CSS port.

## 6. Decision log

| # | Decision | Source |
|---|---|---|
| 1 | Notebooks look like Notability covers, with type under the cover | Board p.2: "notful inspired type sizing" |
| 2 | Notebook actions open locally on the tapped notebook, not in a modal | Board p.2 sketch: "stays local to the object" |
| 3 | The "busy" New lecture / Problem set modal is replaced by the local menu | Board p.2: "This here is too busy" |
| 4 | The PiP snaps to 4 corners with flick projection | Board p.4 + Apple reference |
| 5 | The split ratio is adjustable | Board p.4 |
| 6 | Liquid Glass navigation | Board p.1 |
| 7 | Doodle stars and decorations removed from home | Comment on the mockup |
| 8 | Semester subtitle ("Fall 2026 · 5 classes") removed from the Notebooks title | Comment on the mockup |
| 9 | App named **Bubble Notes** | Comment on the mockup |
| 10 | The + button handles new notebooks, PDF import and class-provided notes | Comment on the mockup |

## 7. Data model

The spec's suggested model (a starting point, not decided):

```
Notebook      { id, courseCode, name, cover, paper, createdAt }
Page          { id, notebookId, kind: "notes" | "pdf", strokes[], pdfRef?, order }
Attachment    { id, notebookId, kind: "own-pdf" | "class-provided", fileName, pageCount, addedAt }
LectureSession{ id, notebookId, startedAt, durationSec, audioRef, settings { expandOnIdle } }
TranscriptSeg { sessionId, tSec, text }
Visual        { sessionId, tSec, type: "concept-map" | "flowchart" | "recap" | "schematic", title, summary, graph }
```

What the prototype actually stores (`src/ink/model.ts`, IndexedDB `nova`): the existing `Notebook` record with new optional fields `courseCode`, `cover`, `paper`, `attachments[]`, `lectureCount`, `problemSetCount` and `lastLectureAt`. Pages, strokes and text boxes are unchanged. A notebook still holds **one** saved lecture (`transcript`, `cards`, `audioBlobId`), not a list of `LectureSession`s; see open work.

## 8. Open questions
- **Platform and stack:** native SwiftUI with PencilKit, or something else? The current code is a React/Vite web prototype.
- **Zone-out detection:** what idle time triggers auto-expand, and should it expand to Split or straight to Feed? The prototype uses 20 s → Feed (`ZONE_OUT_IDLE_MS` in `src/screens/lecture/LectureScreen.tsx`).
- **AI pipeline:** on-device or cloud transcription and visual generation? The Start screen promises "Session data stays on this iPad", but `/api/analyze` sends transcript text to OpenRouter. Check whether that promise is a real constraint.
- **Class-provided notes:** upload only, or also pull from the LMS (Canvas)?
- **Problem sets:** how do they relate to lectures inside a notebook (tabs, sections, separate list)?

## 9. References
- Liquid Glass skill: https://github.com/stormaref/LiquidGlassSkill
- Apple, *Designing Fluid Interfaces* (WWDC 2018, session 803): https://developer.apple.com/videos/play/wwdc2018/803/
- Nathan Gitter, *Building Fluid Interfaces* (includes the PiP corner-snap math): https://medium.com/@nathangitter/building-fluid-interfaces-ios-swift-9732bb934bf5
- Code for the above: https://github.com/nathangitter/fluid-interfaces

---

# Part 2 — Where the UI lives in code

| Spec | Code |
|---|---|
| Routing (Home / Notebook / Review), sheets, start-class wiring, saving a lecture with its notebook | `src/App.tsx` |
| §2.1 shelf, covers, local notebook menu, Recent sessions, + button | `src/screens/HomeScreen.tsx` |
| §2.2 New notebook and Import sheets, §2.3 Start class (with mic meter) | `src/screens/Sheets.tsx` |
| §2.4 Lecture screen, bottom bar, zone-out | `src/screens/lecture/LectureScreen.tsx` |
| Feed panel, PiP mini feed, transcript column at ≥ 820 pt | `src/screens/lecture/FeedPanel.tsx` |
| §3 PiP physics (`PIP` constants, `project()`) | `src/screens/lecture/PipWindow.tsx` |
| §4 Split divider (`SPLIT` constants, `settleSplit()`) | `src/screens/lecture/SplitView.tsx` |
| §2.5 Lecture review | `src/screens/ReviewScreen.tsx` |
| Glass tool capsules (full / compact), "⋯" menu for zoom, pages, PDF, handwriting reading, shortcuts | `src/components/notebook/InkToolbar.tsx` |
| §5 tokens, glass tiers, all styles | `src/index.css` |
| Chromium refraction filter | `src/components/ui/GlassFilters.tsx` |
| Icons | `src/components/ui/Icon.tsx` |
| Dotted paper (22 pt grid) | `src/ink/backgrounds.ts` |
| Shelf metadata (`NotebookSummary`, `summarize()`) | `src/ink/storage.ts` |

### Where the prototype differs from the spec
- **PiP top snap line is 134, not 78.** The ink tool capsules float under the top bar, so the PiP's top corners sit below them (`PIP_TOP_BELOW_TOOLBAR`). `PIP.top = 78` is kept as the default.
- **No shapes tool.** The ink engine has no shape tool yet, so the capsule shows pen, highlighter, eraser, lasso and text (plus "tap ink to replay" after a recording).
- **Start class has a collapsed "Prototype options" row** (sample lecture vs. live mic; offline fixtures vs. real API). This replaces the old top-bar Source/Analysis selects. With "Sample lecture", the mic meter is idle.
- **Plain notes / Problem set** open the notebook without recording. The bottom bar then shows **Record lecture**, which reopens Start class.
- **Avatar** is a placeholder; there are no accounts.
- **Over the dark feed** (Split/Feed), the top and bottom glass bars switch to light-on-dark text (`.dark-chrome`) so they stay readable.
- **Lecture audio** is now saved to IndexedDB when a lecture ends, so review can play it after a reload (sample lectures save the synthesized tone track).

### Verified in the browser (Chrome, 1180 × 820)
Create a notebook, notebook menu → New lecture → Start class → sample lecture with offline fixtures. Checked: visuals appear in the PiP; zone-out auto-expands to Feed with the gold badge; the divider snaps to ⅔ and switches to Feed past 84 %. PiP: a slow drag settles in the nearest corner, a flick projects to the far corner, a hard sideways flick tucks with a 30 pt tab, and tapping the tab springs it back. Inner-corner resize keeps the outer corner pinned and clamps at 460. × shows the "Show live feed" pill, and ↗ goes to Split 50/50. Writing on the notes side in Split returns to Notes + PiP. Import of a class-provided PDF adds pages and the PDF pill. Lecture review shows the timeline, visual, highlighted transcript and scrubber ticks. Not tested: a live microphone and the real API, both of which need a mic and `server/.env`.

---

# Part 3 — Engineering handoff

## What the project is (engineering view)

A student records a lecture; live transcript segments go to an analysis API that returns study-guide "cards" (visual diagrams), which the UI calls the live feed. The student can also handwrite notes in a notebook.

- Two processes: `npm run dev` (Vite web app, proxies `/api` to 127.0.0.1:8787) and `npm run api` (Node server, port 8787). Node 22+.
- The API needs `server/.env` with `OPENROUTER_API_KEY=...` (git-ignored; copy from `server/.env.example`). Never commit it.

## Ownership split (from the two agent prompts)

- **Agent 1 (web app):** root scaffold, package.json/lockfile, Vite config, root README, `src/`, `public/`.
- **Agent 2 (server):** only `server/`. Built with Node built-ins only (no npm deps), `node:test` for tests.
- The shared v2.1 contract (request/response types) lives in both `src/types.ts` and `server/README.md`. Keep them in sync.

## What is done

### Server (Agent 2): `server/`
- Modules: `server/index.mjs` (entry/router), `server/lib/*` (config, limits, errors, http, openrouter, png, visual, sources, text), `server/routes/{analyze,transcribe,assist}.mjs`.
- `POST /api/analyze`: segments + optional `cues`, `recentVisualTypes`, `materials`, `allowWeb` → `append` / `replace` / `skip`, plus `cueAnswers` and `sourceMode`.
  - 10 visual types: concept-map, flowchart, cycle, timeline, hierarchy, comparison, venn, chart, schematic, recap.
  - Per-type structure rules. A broken type is **downgraded** to concept-map or recap instead of returning 502. Comparison edges within one group are dropped (a repair, not a downgrade).
  - Chart values must appear as digits in the segments or materials.
  - Lenient input (v1-sized `currentVisual` accepted), strict output (≤12 nodes, ≤6-word labels).
- `POST /api/ink/transcribe`: base64 PNG → verbatim text (vision model). Strict base64/PNG/IHDR checks, 8 s timeout. **Built and tested, but the browser does not call it** (see below).
- `POST /api/assist`: problem-set hint grounded in materials and notes. **No browser UI yet.**
- Web fallback (only when `allowWeb`): OpenRouter `openrouter:web_search` tool. Citation annotations only come back for *prose* replies, not JSON, so analyze does one prose call per uncovered cue (max 3); assist does prose research, then a structured hint that cites sources by ID (`web1`…). URLs come only from provider annotations.
- Model: `google/gemini-3.8-flash`, reasoning effort `low` (set via `OPENROUTER_REASONING_EFFORT`).
- Measured (real API): visual eval 17 snippets → 10 types, 100% accuracy, p50 ~3.2–3.8 s (v1 baseline was 24%, flowchart/concept-map only). In the live app, analyze calls take 2–6 s.
- Tests: `node --test 'server/test/*.test.mjs'` → **150 pass** (quotes required; Node 22 won't take a directory). Eval: `node --env-file-if-exists=server/.env server/scripts/visual-eval.mjs [--stub-only]`.

### Web app (Agent 1): `src/`
- Bubble Notes UI (Part 2). The old single-screen layout (`MainPanel`, `Timeline`, `ReviewView`, `ModeToggle`, `RecordControls`, `BackToLiveBanner`) was removed; its jobs moved into the screens above.
- Notebook engine: lined/grid/blank/**dotted**/PDF pages, pressure ink, pen/highlighter/eraser/lasso/text, undo/redo, IndexedDB autosave, tap ink to seek the recording.
- One SVG renderer for all 10 visual types (`src/visuals/layout.ts`, `GraphSVG.tsx`, `ChartSVG.tsx`).
- On-device handwriting reading (TrOCR via `@huggingface/transformers`, in a web worker): `src/ink/handwriting/*`, `src/hooks/useHandwriting.ts`. Read lines are sent to `/api/analyze` as segments with IDs `note-<line>-v<n>`. It **bypasses** `/api/ink/transcribe` by design (privacy). Toggle: toolbar "⋯" menu.
- Cue detector (`src/ink/cues/*`) is built and evaluated (`npm run eval:cues`).

## Open work (prioritized)

1. ~~Cues never reach the server from the UI.~~ **Done:** `src/hooks/useCues.ts` wires both paths. Typed `line ??`, `* line` / `line ***` and `==term==` in a text box are parsed on commit. Drawn `??`, ★ rows and highlights go through the on-device detector after 600 ms of pen rest. An ink cue's text comes from the handwriting reader's line under the mark. If reading is off, or nothing is read within 12 s, the card asks the student to type it. Answers show as "Your marks" cards in the feed panel (`src/screens/lecture/CueList.tsx`): a side column when the feed is ≥ 760 pt wide, otherwise under the visual, with a one-line badge in the PiP. Diagram emphasis comes from the server's node `emphasis`. With no lecture speech, the marked lines themselves are sent as context segments (`cue-ctx-*`). The offline demo returns canned, unverified answers and emphasizes the best word-match node. Remaining: highlight cues send the whole read line, not just the highlighted word; and the ink path has only been checked by `npm run eval:cues`, not by drawing marks in the browser.
2. **One lecture per notebook.** Starting a new lecture in a notebook replaces its saved transcript/visuals. The shelf counts lectures, but Recent sessions and review only see the latest. Move to a `LectureSession[]` per notebook (§7).
3. **Tier 3 UI missing:** materials retrieval from imported class notes, citation chips, problem-set mode calling `/api/assist`, the "Allow web fallback" toggle. The Import sheet now records `attachments[].kind` (`own-pdf` / `class-provided`), which is the hook for materials.
4. **Shapes tool** (spec'd in the toolbar, not in the ink engine).
5. **The offline demo covers only 4 visual types;** the spec wants ≥6, including a chart and a venn (`src/lib/offlineFixtures.ts`).
6. Handwriting reader: errors before the OCR step are swallowed silently (`noteReader.ts` `catch {}`); the small model sometimes repeats words; perfectly flat strokes get split into their own "line" by `groupIntoLines`.
7. Notebook pages are fixed 816 pt wide; in Split the notes side scrolls horizontally. Consider fit-to-width zoom when the pane narrows.
8. `npm audit`: 2 advisories in vite 5 / esbuild (dev server). The fix is a breaking upgrade to vite 8 — Agent 1's decision.
9. Contract questions to settle: `sourceMode` for assist when nothing is cited (server returns `"materials"`); handwriting notes are analyzed like transcript, while the contract says notes are "context only".

## Environment gotchas

- **npm version drift.** `npm install` with an older npm strips `libc` fields from `package-lock.json` and leaves it modified, which blocks `git pull`. **Use `npm ci`**, or upgrade npm (`npm install -g npm@11`).
- Don't run `npm ci` while Vite is running; it breaks Vite's dep cache (blank page, "504 Outdated Optimize Dep"). Stop Vite, install, restart.
- The first pen stroke in a dev session makes Vite optimize `@huggingface/transformers` and **reload the page** (back to Home). Dev-only.
- Make sure nothing else (e.g., an old v1 server) is on port 8787 (`lsof -nP -iTCP:8787 -sTCP:LISTEN` on macOS, `Get-NetTCPConnection -LocalPort 8787` on Windows).
- **Windows checkout (pbandi22):** Git 2.56 and Node 22 LTS were installed with winget. A terminal opened before that may not have them on PATH; open a new one. The repo lives under OneDrive, which can make `npm ci` slow.

## Branches and worktrees

- `main` is the source of truth. Pushed history branches: `agent-2-v2.1-api`, `agent-1-v2.1`, `agent-1-handwriting-ocr`, `integrate-v2.1`, `integrate-handwriting`.
- On the original Mac checkout: local-only `backup/graphics-upgrade-046fda7` (superseded, safe to delete) and extra worktrees `../BubbleGuppies-agent-2-api`, `../BubbleGuppies-agent-2-v2.1-api`, `../BubbleGuppies-integrate`, `../BubbleGuppies-handwriting` (`git worktree list`, then `git worktree remove <path>`). Each may contain a git-ignored `server/.env` copy.
- `.claude/launch.json` is a local preview config (git-excluded); safe to delete.

## Quick start

```bash
git pull --ff-only
npm ci
node --test 'server/test/*.test.mjs'
npm run build
```

Then run `npm run api` and `npm run dev` in two terminals and open the Vite URL. Create a notebook, tap it → **New lecture**, and press **Begin lecture session**. Open **Prototype options** in that sheet to choose Sample lecture vs. Live microphone and Offline demo vs. Real API.
