import { useEffect, useRef } from "react";
import { SketchError, sketchPrompt, streamSketch } from "../lib/drawClient";
import type { NotebookStore } from "../ink/notebookStore";
import type { Sketch, SketchCommand } from "../ink/model";
import type { Card } from "../types";

/**
 * Option B: Anatomy Live draws the picture for every feed card.
 * The live card and the card being viewed get sketched as soon as they appear
 * (or change topic); each sketch streams into the notebook store, so the feed,
 * the PiP and Lecture review all read the same strokes. A failed sketch keeps
 * its error and the feed falls back to the card's diagram.
 */
export function useSketches({ store, wanted, enabled }: { store: NotebookStore; wanted: (Card | null)[]; enabled: boolean }) {
  const inFlight = useRef(new Map<string, AbortController>());

  // Only stop streams on unmount (leaving the notebook); a stopped sketch is
  // cleared so it is drawn again next time instead of looking failed.
  useEffect(
    () => () => {
      for (const [cardId, c] of inFlight.current) {
        c.abort();
        if (store.notebook.sketches?.[cardId]?.status === "drawing") store.setSketch(cardId, null);
      }
      inFlight.current.clear();
    },
    [store]
  );

  const key = wanted.map((c) => (c ? `${c.id}:${c.visual.topic}` : "")).join("|");
  useEffect(() => {
    if (!enabled) return;
    for (const card of wanted) {
      if (!card || inFlight.current.has(card.id)) continue;
      const existing = store.notebook.sketches?.[card.id];
      if (existing && existing.topic === card.visual.topic) continue;
      start(card);
    }

    function start(card: Card) {
      const starred = (store.notebook.cues ?? [])
        .filter((c) => c.cue.kind === "important" && c.cue.text)
        .slice(-3)
        .map((c) => c.cue.text);
      const prompt = sketchPrompt(card.visual.topic, card.visual.recap, starred);
      let sketch: Sketch = { cardId: card.id, topic: card.visual.topic, prompt, commands: [], status: "drawing", updatedAt: Date.now() };
      const save = (patch: Partial<Sketch>) => {
        sketch = { ...sketch, ...patch, updatedAt: Date.now() };
        store.setSketch(card.id, sketch);
      };
      save({});
      const controller = new AbortController();
      inFlight.current.set(card.id, controller);
      // Batch strokes per frame so a fast stream doesn't re-render per command.
      let buffer: SketchCommand[] = [];
      let raf = 0;
      const flush = () => {
        raf = 0;
        if (buffer.length) save({ commands: [...sketch.commands, ...buffer] });
        buffer = [];
      };
      streamSketch(
        prompt,
        {
          onCommand: (c) => {
            buffer.push(c);
            if (!raf) raf = requestAnimationFrame(flush);
          },
          onNote: (note) => save({ note }),
          onReplacement: (commands) => {
            buffer = [];
            save({ commands });
          },
        },
        controller.signal
      )
        .then((r) => {
          flush();
          save({ status: "done", source: r.review === "simplified" ? "simplified" : r.source ?? r.review });
        })
        .catch((err: unknown) => {
          cancelAnimationFrame(raf);
          if (controller.signal.aborted) return;
          flush();
          const message = err instanceof SketchError ? err.message : "The sketch couldn't be drawn.";
          // A partial drawing is still worth showing; with no strokes, fall back to the diagram.
          save(sketch.commands.length ? { status: "done", error: message } : { status: "error", error: message });
        })
        .finally(() => inFlight.current.delete(card.id));
    }
    // `wanted` is captured through `key`; cards change identity every render.
  }, [key, enabled, store]);
}
