# Anatomy Live documentation

Anatomy Live turns a short text prompt into an SVG illustration. The browser renders each drawing command as it arrives. Some subjects have built-in geometry, including hand anatomy, jellyfish, right triangles, torque, external gears, and circuit diagrams.

## Run it locally

1. Install Node.js 22 or newer.
2. Clone the repository and open its directory.

   ```sh
   git clone https://github.com/k3t6hup/anatomy-live.git
   cd anatomy-live
   ```

3. Copy the environment template.

   ```sh
   cp .env.example .env
   ```

   In PowerShell, use `Copy-Item .env.example .env`.

4. To enable generated sketches, create an API key in your [OpenRouter account](https://openrouter.ai/settings/keys). Open the local `.env` file and put your own key after the equals sign.

   ```dotenv
   OPENROUTER_API_KEY=YOUR_OPENROUTER_API_KEY
   ```

   Your OpenRouter account must have access to `anthropic/claude-haiku-5.5` and sufficient credits for paid requests. To run just the built-in illustrations, leave the value blank.

5. Start the server.

   ```sh
   node --env-file=.env dev.mjs
   ```

6. Open [http://127.0.0.1:4173](http://127.0.0.1:4173), enter a prompt, and select **Draw**. Add `PORT=4180` to `.env` if you need a different port, then restart.

Try `hand bones`, `right triangle with legs 5 and 12`, or `two external gears with 12 and 36 teeth` for built-in illustrations. Try `a seahorse` or `show the stages of a PCR cycle` for model-generated examples.

## How a drawing reaches the browser

1. `ui/app.js` sends the prompt to `POST /api/draw`.
2. `server.mjs` tries the built-in scenes in `ui/organic-scenes.js`, `ui/scenes.js`, and `ui/technical-scenes.js`. Matching illustrations render without calling OpenRouter. Calculated scenes derive their shapes and labels from the same inputs.
3. For other prompts, the server calls OpenRouter and reads the model's streamed commands. It validates command names, argument counts, coordinates, and colors. It can lay out process steps and two-participant message sequences from structured commands.
4. The server sends newline-delimited JSON to the browser. The browser creates SVG elements from validated geometry and treats labels as plain text.
5. Some detailed freeform diagrams get a short second model check after the first sketch is visible. The server can send a simpler replacement diagram. Generated illustrations can still contain technical errors.

## Drawing protocol

Send JSON with a `prompt` string of 1–360 characters. The response content type is `application/x-ndjson`. Each line is a separate JSON object.

```jsonl
{"command":["line",100,120,240,120,"mint"]}
{"command":["text",170,100,"Pivot","ink"]}
{"command":["note","The lever turns around its pivot."]}
{"done":true}
```

Commands use an 800 by 480 coordinate system. The origin is at the upper left, with x increasing rightward and y increasing downward. The renderer supports lines, arrows, boxes, circles, polygons, curves, filled paths, open contours, labels, and notes. Built-in scenes also use ellipses.

Other event types include `reviewing`, `replacement`, and `error`. A replacement contains a full command array. A completed built-in drawing has a `source` of `calculated` or `illustrated`.

## Extend and test

- Add an exact geometry or anatomy example to the relevant scene module. Return an array of drawing commands for prompts the scene supports and return `null` for others.
- Keep the geometry and labels tied to the same inputs when a drawing includes calculations.
- Run `npm test` for the scene and streaming tests. They use local fixtures and require no API key.
- Run `npm run build` to produce the self-contained worker entry point at `dist/server/index.js`. Supply `OPENROUTER_API_KEY` as a server-side secret if deploying the worker with generated sketches enabled.

## Keep your key private

The browser never needs the key. Keep it in your ignored local `.env` file or in your host's server secret store. Keep it out of source files, browser code, screenshots, and commits. Generated sketch prompts are sent to OpenRouter. If you host this app for other people with your key, protect the drawing endpoint with authentication and rate limits so visitors cannot run up charges.

The visual approach was inspired by [Anatomy](https://github.com/wheresryan22/anatomy).
