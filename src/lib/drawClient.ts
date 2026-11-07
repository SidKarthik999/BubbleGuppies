// Client for POST /api/draw (Anatomy Live, mounted on the analysis API).
// The response is newline-delimited JSON: {command}, {reviewing}, {replacement},
// {done, source?, review?, partial?} or {error}.

import type { SketchCommand } from "../ink/model";

export type SketchHandlers = {
  onCommand: (command: SketchCommand) => void;
  onNote: (note: string) => void;
  /** A checked, simpler drawing that replaces everything drawn so far. */
  onReplacement: (commands: SketchCommand[]) => void;
};

export type SketchResult = { source?: string; review?: string; partial?: boolean };

export class SketchError extends Error {}

export async function streamSketch(prompt: string, h: SketchHandlers, signal: AbortSignal): Promise<SketchResult> {
  let res: Response;
  try {
    res = await fetch("/api/draw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
      signal,
    });
  } catch (err) {
    if (signal.aborted) throw err;
    throw new SketchError("Could not reach the sketch engine.");
  }
  if (!res.ok || !res.body) {
    const data = (await res.json().catch(() => null)) as { error?: { message?: string } | string } | null;
    const message = typeof data?.error === "string" ? data.error : data?.error?.message;
    if (message) throw new SketchError(message);
    if (res.status >= 500) throw new SketchError("The analysis server isn't running (`npm run api`), so sketches can't be drawn.");
    throw new SketchError(`Sketch request failed (${res.status}).`);
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let pending = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    pending += value;
    const rows = pending.split("\n");
    pending = rows.pop() ?? "";
    for (const row of rows) {
      if (!row.trim()) continue;
      let event: { command?: SketchCommand; replacement?: SketchCommand[]; done?: boolean; error?: string } & SketchResult;
      try {
        event = JSON.parse(row);
      } catch {
        continue;
      }
      if (event.error) throw new SketchError(event.error);
      if (event.replacement) h.onReplacement(event.replacement.filter((c) => c[0] !== "note"));
      if (event.command) {
        if (event.command[0] === "note") h.onNote(String(event.command[1]));
        else h.onCommand(event.command);
      }
      if (event.done) return { source: event.source, review: event.review, partial: event.partial };
    }
  }
  throw new SketchError("The sketch stream ended before the drawing finished.");
}

/** Anatomy Live takes a 1–360 character prompt; the card's topic + summary fit in that. */
export function sketchPrompt(topic: string, recap: string, emphasize: string[] = []): string {
  const tail = emphasize.length ? ` Emphasize: ${emphasize.slice(0, 3).join(", ")}.` : "";
  const head = `${topic}: `;
  const room = 360 - head.length - tail.length;
  const body = recap.length > room ? recap.slice(0, Math.max(0, room - 1)).replace(/\s+\S*$/, "") + "…" : recap;
  return (head + body + tail).slice(0, 360);
}
