import { useState } from "react";
import { Icon } from "../../components/ui/Icon";
import type { CueRecord } from "../../ink/model";
import type { CuesApi } from "../../hooks/useCues";
import type { CueKind } from "../../types";

const KIND: Record<CueKind, { mark: string; label: string }> = {
  question: { mark: "??", label: "Question" },
  important: { mark: "★", label: "Starred" },
  vocab: { mark: "Aa", label: "Define" },
};

type Actions = Pick<CuesApi, "provideText" | "dismiss" | "toggle">;

/** "Your marks": the ??, ★ and highlight cues from your notes, with their answers. */
export function CueList({ cues, actions }: { cues: CueRecord[]; actions: Actions }) {
  const list = [...cues].sort((a, b) => b.createdAt - a.createdAt);
  return (
    <section className="cue-list" aria-label="Your marks">
      <div className="cue-head">
        Your marks <span className="cue-count">{cues.length}</span>
      </div>
      {list.map((rec) => (
        <CueCard key={rec.cue.id} rec={rec} actions={actions} />
      ))}
    </section>
  );
}

function CueCard({ rec, actions }: { rec: CueRecord; actions: Actions }) {
  const { cue, answer } = rec;
  const k = KIND[cue.kind];
  const stars = cue.kind === "important" && cue.weight && cue.weight > 1 ? "★".repeat(cue.weight) : k.mark;
  return (
    <article className={`cue-card ${cue.kind} ${answer ? "answered" : ""} ${rec.collapsed ? "collapsed" : ""}`}>
      <header className="cue-card-head">
        <span className="cue-mark" aria-label={k.label} title={k.label}>
          {stars}
        </span>
        <button className="cue-title" onClick={() => actions.toggle(cue.id)} aria-expanded={!rec.collapsed} title={rec.collapsed ? "Expand" : "Collapse"}>
          {answer?.title || cue.text || (rec.status === "needs-text" ? "What does this line say?" : "Reading your handwriting…")}
        </button>
        <button className="cue-x" onClick={() => actions.dismiss(cue.id)} aria-label="Dismiss this mark" title="Dismiss (it won't be detected again)">
          <Icon name="close" size={13} />
        </button>
      </header>
      {!rec.collapsed && <CueBody rec={rec} actions={actions} />}
    </article>
  );
}

function CueBody({ rec, actions }: { rec: CueRecord; actions: Actions }) {
  const { cue, answer } = rec;
  if (rec.status === "needs-text") return <NeedsText cueId={cue.id} kind={cue.kind} onSend={actions.provideText} />;
  if (rec.status === "transcribing") return <p className="cue-status">Reading your handwriting…</p>;
  if (!answer) {
    return (
      <p className="cue-status">
        <span className="cue-spinner" aria-hidden="true" />
        {cue.kind === "question" ? "Finding an answer…" : cue.kind === "vocab" ? "Looking up a definition…" : "Emphasizing it in the diagram…"}
      </p>
    );
  }
  return (
    <div className="cue-answer">
      {answer.title && cue.text && answer.title !== cue.text && <p className="cue-asked">“{cue.text}”</p>}
      <p>{answer.body}</p>
      {answer.unverified ? (
        <span className="cue-tag warn" title="Not found in the lecture or your materials">Unverified</span>
      ) : answer.citations.length > 0 ? (
        <span className="cue-tag">
          From the {answer.citations.some((c) => c.kind === "web") ? "web" : answer.citations.some((c) => c.kind === "material") ? "class materials" : "lecture"}
        </span>
      ) : null}
    </div>
  );
}

function NeedsText({ cueId, kind, onSend }: { cueId: string; kind: CueKind; onSend: (id: string, text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <form
      className="cue-needs"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim().length >= 2) onSend(cueId, text);
      }}
    >
      <label>
        {kind === "vocab" ? "Type the highlighted term" : "Type the line you marked"} so it can be sent
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={kind === "vocab" ? "e.g. backpropagation" : "e.g. why is the gradient negative"} />
      </label>
      <button className="btn small gold" disabled={text.trim().length < 2}>
        Send
      </button>
    </form>
  );
}

/** PiP: one line saying marks were answered (the full cards live in Split / Feed). */
export function CueBadge({ cues }: { cues: CueRecord[] }) {
  if (cues.length === 0) return null;
  const answered = cues.filter((c) => c.answer).length;
  const waiting = cues.filter((c) => c.status === "needs-text").length;
  return (
    <span className="cue-badge">
      {waiting > 0 ? `${waiting} mark${waiting === 1 ? "" : "s"} need text` : `${answered}/${cues.length} marks answered`} · open Split
    </span>
  );
}
