// Minimal IndexedDB persistence: notebooks (vector strokes per page, cues,
// transcript, cards) and blobs (PDF files, recorded audio). Local only.

import type { CoverColor, Notebook, PageTemplate } from "./model.ts";

const DB_NAME = "nova";
const DB_VERSION = 1;
const NOTEBOOKS = "notebooks";
const BLOBS = "blobs";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("IndexedDB is unavailable"));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(NOTEBOOKS)) db.createObjectStore(NOTEBOOKS, { keyPath: "id" });
        if (!db.objectStoreNames.contains(BLOBS)) db.createObjectStore(BLOBS);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = run(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

export const saveNotebook = (nb: Notebook) => tx(NOTEBOOKS, "readwrite", (s) => s.put(nb)).then(() => undefined);
export const loadNotebook = (id: string) => tx<Notebook | undefined>(NOTEBOOKS, "readonly", (s) => s.get(id));
export const deleteNotebook = (id: string) => tx(NOTEBOOKS, "readwrite", (s) => s.delete(id)).then(() => undefined);

/** What the home shelf needs to draw a notebook without loading its ink. */
export type NotebookSummary = {
  id: string;
  title: string;
  updatedAt: number;
  createdAt: number;
  sample?: boolean;
  courseCode: string;
  cover: CoverColor;
  paper: PageTemplate;
  pdfCount: number;
  lectureCount: number;
  problemSetCount: number;
  lastLectureAt: number | null;
  /** A saved lecture (transcript or visuals) exists, so Lecture review can open. */
  hasSession: boolean;
  sessionDurationSec: number;
  visualCount: number;
};

export function summarize(n: Notebook): NotebookSummary {
  const last = n.transcript?.[n.transcript.length - 1];
  const pdfFiles = new Set(n.pages.flatMap((p) => (p.background.kind === "pdf" ? [p.background.fileId] : [])));
  return {
    id: n.id,
    title: n.title,
    updatedAt: n.updatedAt,
    createdAt: n.createdAt,
    sample: n.sample,
    courseCode: n.courseCode ?? "",
    cover: n.cover ?? "periwinkle",
    paper: n.paper ?? "lined",
    pdfCount: n.attachments?.length ?? pdfFiles.size,
    lectureCount: n.lectureCount ?? 0,
    problemSetCount: n.problemSetCount ?? 0,
    lastLectureAt: n.lastLectureAt ?? null,
    hasSession: (n.cards?.length ?? 0) > 0 || (n.transcript?.length ?? 0) > 0,
    sessionDurationSec: last ? last.endSec : 0,
    visualCount: n.cards?.length ?? 0,
  };
}

export async function listNotebooks(): Promise<NotebookSummary[]> {
  const all = await tx<Notebook[]>(NOTEBOOKS, "readonly", (s) => s.getAll());
  return all.map(summarize).sort((a, b) => b.updatedAt - a.updatedAt);
}

export const saveBlob = (id: string, blob: Blob) => tx(BLOBS, "readwrite", (s) => s.put(blob, id)).then(() => undefined);
export const loadBlob = (id: string) => tx<Blob | undefined>(BLOBS, "readonly", (s) => s.get(id));

const LAST_KEY = "nova:lastNotebookId";
export function rememberLastNotebook(id: string): void {
  try {
    localStorage.setItem(LAST_KEY, id);
  } catch {
    /* private mode — fine */
  }
}
export function lastNotebookId(): string | null {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}
