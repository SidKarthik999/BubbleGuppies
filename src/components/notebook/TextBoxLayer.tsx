import { useEffect, useRef, useState } from "react";
import type { NotebookStore } from "../../ink/notebookStore";
import type { Page, TextBox } from "../../ink/model";

type Props = {
  store: NotebookStore;
  page: Page;
  zoom: number;
  draft: TextBox | null;
  onDraftDone: () => void;
  /** Called after a box is committed — typed cues are parsed from it. */
  onCommit: (pageId: string, box: TextBox) => void;
};

export function TextBoxLayer({ store, page, zoom, draft, onDraftDone, onCommit }: Props) {
  const boxes = draft ? [...page.textBoxes.filter((b) => b.id !== draft.id), draft] : page.textBoxes;
  return (
    <>
      {boxes.map((b) => (
        <TextBoxEditor
          key={b.id}
          box={b}
          zoom={zoom}
          autoFocus={draft?.id === b.id}
          onDone={(text) => {
            const isDraft = draft?.id === b.id;
            if (isDraft) onDraftDone();
            if (text.trim() === "") {
              if (!isDraft) store.removeTextBox(page.id, b.id);
              return;
            }
            if (text === b.text && !isDraft) return;
            const next = { ...b, text };
            store.upsertTextBox(page.id, next);
            onCommit(page.id, next);
          }}
        />
      ))}
    </>
  );
}

function TextBoxEditor({ box, zoom, autoFocus, onDone }: { box: TextBox; zoom: number; autoFocus: boolean; onDone: (text: string) => void }) {
  const [text, setText] = useState(box.text);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setText(box.text), [box.text]);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text, zoom]);
  return (
    <textarea
      ref={ref}
      className="nb-textbox"
      value={text}
      rows={1}
      placeholder="Type a note… (?? asks, * stars, ==term== vocab)"
      style={{ left: box.x * zoom, top: box.y * zoom, width: box.width * zoom, fontSize: 15 * zoom }}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onDone(text)}
      onKeyDown={(e) => {
        if (e.key === "Escape") (e.target as HTMLTextAreaElement).blur();
        e.stopPropagation();
      }}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
}
