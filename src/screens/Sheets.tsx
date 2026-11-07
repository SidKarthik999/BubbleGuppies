import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "../components/ui/Icon";
import { COVER_COLORS, type AttachmentKind, type CoverColor, type PageTemplate } from "../ink/model";
import type { NotebookSummary } from "../ink/storage";
import type { NewNotebookInput } from "../hooks/useNotebook";
import type { AnalysisBackend, SessionSource } from "../types";
import { NotebookCover } from "./HomeScreen";

/** Centered sheet on a dimmed backdrop (menu-tier glass so text stays readable). */
export function Sheet({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`glass menu-tier sheet ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}

const PAPERS: { id: PageTemplate; label: string }[] = [
  { id: "dotted", label: "Dotted" },
  { id: "lined", label: "Lined" },
  { id: "grid", label: "Grid" },
  { id: "blank", label: "Blank" },
];

export function NewNotebookSheet({ onClose, onCreate }: { onClose: () => void; onCreate: (input: NewNotebookInput) => void }) {
  const [cover, setCover] = useState<CoverColor>("sage");
  const [courseCode, setCourseCode] = useState("");
  const [name, setName] = useState("");
  const [paper, setPaper] = useState<PageTemplate>("dotted");
  const valid = name.trim().length > 0;
  const submit = () => valid && onCreate({ name, courseCode, cover, paper });

  return (
    <Sheet
      title="New notebook"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!valid} onClick={submit}>
            Create notebook
          </button>
        </>
      }
    >
      <div className="new-nb">
        <div className="new-nb-preview">
          <NotebookCover n={{ cover, courseCode, title: name || "Class name", lastLectureAt: null, pdfCount: 0 }} />
        </div>
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <fieldset>
            <legend>Cover</legend>
            <div className="swatches">
              {COVER_COLORS.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  className={`cover-swatch ${cover === c.id ? "on" : ""}`}
                  style={{ background: c.hex }}
                  aria-label={c.label}
                  aria-pressed={cover === c.id}
                  title={c.label}
                  onClick={() => setCover(c.id)}
                />
              ))}
            </div>
          </fieldset>
          <label className="field">
            <span>Course code</span>
            <input value={courseCode} onChange={(e) => setCourseCode(e.target.value)} placeholder="10-417" />
          </label>
          <label className="field">
            <span>
              Class name <em>required</em>
            </span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Deep Learning" autoFocus required />
          </label>
          <fieldset>
            <legend>Paper</legend>
            <div className="seg-row">
              {PAPERS.map((p) => (
                <button type="button" key={p.id} className={`seg-pill ${paper === p.id ? "on" : ""}`} aria-pressed={paper === p.id} onClick={() => setPaper(p.id)}>
                  <span className={`paper-thumb ${p.id}`} aria-hidden="true" />
                  {p.label}
                </button>
              ))}
            </div>
          </fieldset>
          <button type="submit" hidden />
        </form>
      </div>
    </Sheet>
  );
}

export function ImportSheet({
  initialKind,
  initialNotebookId,
  notebooks,
  onClose,
  onImport,
}: {
  initialKind: AttachmentKind;
  initialNotebookId: string | null;
  notebooks: NotebookSummary[];
  onClose: () => void;
  onImport: (notebookId: string, kind: AttachmentKind, files: File[]) => Promise<void>;
}) {
  const [kind, setKind] = useState<AttachmentKind>(initialKind);
  const [files, setFiles] = useState<File[]>([]);
  const [target, setTarget] = useState<string | null>(initialNotebookId ?? notebooks[0]?.id ?? null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const add = (list: FileList | null) => {
    if (!list) return;
    const pdfs = [...list].filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    if (pdfs.length < list.length) setError("Only PDF files can be imported.");
    else setError(null);
    setFiles((prev) => [...prev, ...pdfs.filter((f) => !prev.some((p) => p.name === f.name && p.size === f.size))]);
  };

  return (
    <Sheet
      title="Import"
      wide
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={busy || files.length === 0 || !target}
            onClick={async () => {
              if (!target) return;
              setBusy(true);
              try {
                await onImport(target, kind, files);
              } catch {
                setError("One of those PDFs couldn't be opened.");
                setBusy(false);
              }
            }}
          >
            {busy ? "Importing…" : `Add ${files.length || ""} to notebook`.replace("  ", " ")}
          </button>
        </>
      }
    >
      <div className="glass chip segmented sheet-tabs" role="tablist">
        <button role="tab" aria-selected={kind === "own-pdf"} className={kind === "own-pdf" ? "on" : ""} onClick={() => setKind("own-pdf")}>
          My PDF
        </button>
        <button role="tab" aria-selected={kind === "class-provided"} className={kind === "class-provided" ? "on" : ""} onClick={() => setKind("class-provided")}>
          Class-provided notes
        </button>
      </div>
      <p className="sheet-hint">
        {kind === "own-pdf" ? "Your own PDFs, like a problem set. Pages open in the notebook, ready to annotate." : "Slides, handouts and readings from the course."}
      </p>
      <div
        className={`dropzone ${dragging ? "over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          add(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
      >
        <Icon name="upload" size={26} />
        <strong>Drop PDFs here</strong>
        <span>or choose files</span>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          multiple
          hidden
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {error && <p className="form-error">{error}</p>}
      {files.length > 0 && (
        <ul className="file-list">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`}>
              <Icon name="doc" size={18} />
              <span className="file-name">{f.name}</span>
              <span className="file-size">{f.size < 1024 * 1024 ? `${Math.max(1, Math.round(f.size / 1024))} KB` : `${(f.size / 1024 / 1024).toFixed(1)} MB`}</span>
              <button className="icon-btn" aria-label={`Remove ${f.name}`} onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}>
                <Icon name="close" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="field-label">Add to notebook</div>
      {notebooks.length === 0 ? (
        <p className="sheet-hint">Create a notebook first.</p>
      ) : (
        <div className="nb-chips">
          {notebooks.map((n) => (
            <button key={n.id} className={`nb-chip ${target === n.id ? "on" : ""}`} aria-pressed={target === n.id} onClick={() => setTarget(n.id)}>
              <span className="recent-swatch" style={{ background: COVER_COLORS.find((c) => c.id === n.cover)?.hex }} />
              {n.title}
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}

export type StartClassChoice = {
  record: boolean;
  expandOnIdle: boolean;
  source: SessionSource;
  backend: AnalysisBackend;
};

export function StartClassModal({
  courseName,
  courseCode,
  initial,
  onClose,
  onBegin,
}: {
  courseName: string;
  courseCode: string;
  initial: { source: SessionSource; backend: AnalysisBackend };
  onClose: () => void;
  onBegin: (c: StartClassChoice) => void;
}) {
  const [record, setRecord] = useState(true);
  const [expandOnIdle, setExpandOnIdle] = useState(true);
  const [source, setSource] = useState<SessionSource>(initial.source);
  const [backend, setBackend] = useState<AnalysisBackend>(initial.backend);
  const level = useMicLevel(record && source === "live");

  return (
    <div className="scrim">
      <div className="glass menu-tier sheet start-class" role="dialog" aria-modal="true" aria-label="Start class">
        <div className="sheet-head">
          <div>
            <h2>Start class?</h2>
            <p className="sheet-sub">
              {courseCode && <span className="smallcaps">{courseCode}</span>} {courseName}
            </p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="sheet-body">
          <div className="choice-row">
            <button className={`choice ${!record ? "on" : ""}`} aria-pressed={!record} onClick={() => setRecord(false)}>
              <Icon name="notes" size={22} />
              <strong>Plain notes</strong>
              <span>Just your handwriting</span>
            </button>
            <button className={`choice ${record ? "on" : ""}`} aria-pressed={record} onClick={() => setRecord(true)}>
              <Icon name="mic" size={22} />
              <strong>Record lecture</strong>
              <span>Live visuals and transcript</span>
            </button>
          </div>

          {record && (
            <>
              <div className="mic-meter" aria-label="Microphone level">
                <Icon name="mic" size={16} />
                <div className="meter-bars">
                  {Array.from({ length: 24 }, (_, i) => (
                    <i key={i} className={i / 24 < level.value ? "lit" : ""} />
                  ))}
                </div>
                <span className="meter-note">{source === "sample" ? "Sample lecture (no mic)" : level.error ?? (level.value > 0.02 ? "Mic is picking you up" : "Listening…")}</span>
              </div>

              <label className="toggle-row">
                <span>
                  <strong>Expand feed when I stop writing</strong>
                  <small>Zone-out detection. You can change it during class.</small>
                </span>
                <Switch on={expandOnIdle} onChange={setExpandOnIdle} label="Expand feed when I stop writing" />
              </label>

              <details className="dev-opts">
                <summary>Prototype options</summary>
                <div className="dev-grid">
                  <label>
                    Audio
                    <select value={source} onChange={(e) => setSource(e.target.value as SessionSource)}>
                      <option value="sample">Sample lecture</option>
                      <option value="live">Live microphone</option>
                    </select>
                  </label>
                  <label>
                    Analysis
                    <select value={backend} onChange={(e) => setBackend(e.target.value as AnalysisBackend)}>
                      <option value="offline">Offline demo (no network)</option>
                      <option value="api">Real API</option>
                    </select>
                  </label>
                </div>
              </details>
            </>
          )}
        </div>
        <div className="sheet-foot column">
          <button className="btn primary block" onClick={() => onBegin({ record, expandOnIdle, source, backend })}>
            {record ? "Begin lecture session" : "Open notebook"}
          </button>
          <p className="footnote">Session data stays on this iPad.</p>
        </div>
      </div>
    </div>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`switch ${on ? "on" : ""}`}
      onClick={(e) => {
        e.preventDefault();
        onChange(!on);
      }}
    >
      <i />
    </button>
  );
}

/** Live microphone level (0–1) for the Start class meter; releases the mic when off or unmounted. */
function useMicLevel(active: boolean): { value: number; error: string | null } {
  const [value, setValue] = useState(0);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!active) {
      setValue(0);
      return;
    }
    let raf = 0;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let cancelled = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) return;
        ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const buf = new Float32Array(analyser.fftSize);
        const tick = () => {
          analyser.getFloatTimeDomainData(buf);
          let sum = 0;
          for (const v of buf) sum += v * v;
          setValue(Math.min(1, Math.sqrt(sum / buf.length) * 6));
          raf = requestAnimationFrame(tick);
        };
        tick();
        setError(null);
      } catch {
        if (!cancelled) setError("Microphone unavailable. Check browser permissions.");
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close();
    };
  }, [active]);
  return { value, error };
}
