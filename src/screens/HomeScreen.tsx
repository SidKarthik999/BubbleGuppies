import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "../components/ui/Icon";
import { COVER_COLORS } from "../ink/model";
import type { NotebookSummary } from "../ink/storage";
import { formatClock } from "../lib/lectureClock";

export type NotebookAction = "lecture" | "problem-set" | "import";
type Filter = "all" | "lectures" | "problem-sets";

type Props = {
  notebooks: NotebookSummary[];
  onAction: (id: string, action: NotebookAction) => void;
  onReview: (id: string) => void;
  onNewNotebook: () => void;
  onImport: (kind: "own-pdf" | "class-provided") => void;
  banner?: ReactNode;
};

const isToday = (ms: number | null) => ms != null && new Date(ms).toDateString() === new Date().toDateString();

export function HomeScreen({ notebooks, onAction, onReview, onNewNotebook, onImport, banner }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [plusOpen, setPlusOpen] = useState(false);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return notebooks.filter((n) => {
      if (filter === "lectures" && n.lectureCount === 0 && !n.hasSession) return false;
      if (filter === "problem-sets" && n.problemSetCount === 0) return false;
      return !q || n.title.toLowerCase().includes(q) || n.courseCode.toLowerCase().includes(q);
    });
  }, [notebooks, filter, query]);

  const recent = useMemo(
    () => notebooks.filter((n) => n.hasSession).sort((a, b) => (b.lastLectureAt ?? b.updatedAt) - (a.lastLectureAt ?? a.updatedAt)).slice(0, 6),
    [notebooks]
  );

  return (
    <div className="screen home backdrop">
      <header className="glass topbar-glass">
        <span className="wordmark">
          <span className="wordmark-dot" aria-hidden="true" />
          Bubble Notes
        </span>
        <div className="glass chip segmented" role="tablist" aria-label="Filter notebooks">
          {(
            [
              ["all", "All"],
              ["lectures", "Lectures"],
              ["problem-sets", "Problem sets"],
            ] as [Filter, string][]
          ).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={filter === id} className={filter === id ? "on" : ""} onClick={() => setFilter(id)}>
              {label}
            </button>
          ))}
        </div>
        <label className="glass chip search">
          <Icon name="search" size={16} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search notebooks" aria-label="Search notebooks" />
        </label>
        <span className="avatar" aria-label="Account">
          P
        </span>
      </header>

      <main className="home-body">
        {banner}
        <h1 className="screen-title">Notebooks</h1>

        <div className="shelf">
          {shown.map((n) => (
            <div className="shelf-item" key={n.id}>
              <button
                className="cover-btn"
                onClick={() => setMenuFor((m) => (m === n.id ? null : n.id))}
                aria-haspopup="menu"
                aria-expanded={menuFor === n.id}
                aria-label={`${n.title} notebook`}
              >
                <NotebookCover n={n} />
              </button>
              <div className="shelf-meta">
                <div className="shelf-title">{n.title}</div>
                <div className="shelf-sub">{metaLine(n)}</div>
              </div>
              {menuFor === n.id && (
                <LocalMenu
                  onClose={() => setMenuFor(null)}
                  items={[
                    { icon: "mic", label: "New lecture", sub: "Record and build the live feed", run: () => onAction(n.id, "lecture") },
                    { icon: "notes", label: "Problem set", sub: "Plain notebook, no recording", run: () => onAction(n.id, "problem-set") },
                    { icon: "doc", label: "Add PDF or notes", sub: "Slides, handouts, your PDFs", run: () => onAction(n.id, "import") },
                  ]}
                />
              )}
            </div>
          ))}
          <div className="shelf-item">
            <button className="cover-btn new-cover" onClick={onNewNotebook}>
              <Icon name="plus" size={28} />
              <span>New notebook</span>
            </button>
          </div>
        </div>
        {shown.length === 0 && notebooks.length > 0 && <p className="empty-note">No notebooks match.</p>}

        <h2 className="section-title">Recent sessions</h2>
        {recent.length === 0 ? (
          <p className="empty-note">Record a lecture and it shows up here for review.</p>
        ) : (
          <div className="recent-row">
            {recent.map((n) => (
              <button key={n.id} className="glass menu-tier recent-card" onClick={() => onReview(n.id)}>
                <span className="recent-swatch" style={{ background: coverHex(n.cover) }} />
                <span className="recent-text">
                  <strong>{n.title}</strong>
                  <span>
                    {n.lastLectureAt ? new Date(n.lastLectureAt).toLocaleDateString([], { month: "short", day: "numeric" }) : "Lecture"} ·{" "}
                    {formatClock(n.sessionDurationSec)} · {n.visualCount} visual{n.visualCount === 1 ? "" : "s"}
                  </span>
                </span>
                <Icon name="play" size={16} />
              </button>
            ))}
          </div>
        )}
      </main>

      <PlusButton
        open={plusOpen}
        setOpen={setPlusOpen}
        onNewNotebook={onNewNotebook}
        onImport={onImport}
      />
    </div>
  );
}

function metaLine(n: NotebookSummary): string {
  const parts: string[] = [];
  parts.push(`${n.lectureCount} lecture${n.lectureCount === 1 ? "" : "s"}`);
  if (n.problemSetCount) parts.push(`${n.problemSetCount} problem set${n.problemSetCount === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

const coverHex = (id: string) => COVER_COLORS.find((c) => c.id === id)?.hex ?? COVER_COLORS[5].hex;

export function NotebookCover({ n }: { n: Pick<NotebookSummary, "cover" | "courseCode" | "title" | "lastLectureAt" | "pdfCount"> }) {
  const c = COVER_COLORS.find((x) => x.id === n.cover) ?? COVER_COLORS[5];
  return (
    <span className="cover" style={{ background: c.hex }}>
      <span className="cover-spine" aria-hidden="true" />
      <span className="cover-band" aria-hidden="true" />
      <span className="cover-label">
        {n.courseCode && <span className="cover-code">{n.courseCode}</span>}
        <span className="cover-name">{n.title}</span>
      </span>
      <span className="cover-pills">
        {isToday(n.lastLectureAt) && <span className="pill rec">TODAY</span>}
        {n.pdfCount > 0 && <span className="pill pdf">PDF {n.pdfCount}</span>}
      </span>
    </span>
  );
}

type MenuItem = { icon: IconName; label: string; sub?: string; run: () => void };

/** Small menu attached to the object that opened it ("stays local to the object"). */
function LocalMenu({ items, onClose, className = "" }: { items: MenuItem[]; onClose: () => void; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Clicks inside the owning object (the cover, the + button) toggle it themselves.
    const down = (e: PointerEvent) => {
      const owner = ref.current?.parentElement;
      if (owner && !owner.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key);
    ref.current?.querySelector("button")?.focus();
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("keydown", key);
    };
  }, [onClose]);
  return (
    <div ref={ref} className={`glass menu local-menu ${className}`} role="menu">
      {items.map((it) => (
        <button
          key={it.label}
          role="menuitem"
          className="menu-item"
          onClick={() => {
            onClose();
            it.run();
          }}
        >
          <span className="menu-icon">
            <Icon name={it.icon} size={18} />
          </span>
          <span className="menu-label">
            {it.label}
            {it.sub && <small>{it.sub}</small>}
          </span>
        </button>
      ))}
    </div>
  );
}

function PlusButton({
  open,
  setOpen,
  onNewNotebook,
  onImport,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  onNewNotebook: () => void;
  onImport: (kind: "own-pdf" | "class-provided") => void;
}) {
  return (
    <div className="plus-wrap">
      {open && (
        <LocalMenu
          className="plus-menu"
          onClose={() => setOpen(false)}
          items={[
            { icon: "book", label: "New notebook", run: onNewNotebook },
            { icon: "upload", label: "Import PDF", sub: "Your own PDFs, like a problem set", run: () => onImport("own-pdf") },
            { icon: "doc", label: "Class-provided notes", sub: "Slides, handouts and readings", run: () => onImport("class-provided") },
          ]}
        />
      )}
      <button className={`glass plus-btn ${open ? "open" : ""}`} onClick={() => setOpen(!open)} aria-label={open ? "Close menu" : "New"} aria-expanded={open}>
        <Icon name="plus" size={26} />
      </button>
    </div>
  );
}
