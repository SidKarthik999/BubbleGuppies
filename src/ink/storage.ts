// Minimal IndexedDB persistence: notebooks (vector strokes per page, cues,
// transcript, cards) and blobs (PDF files, recorded audio). Local only.

import type { Notebook } from "./model.ts";

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

export async function listNotebooks(): Promise<{ id: string; title: string; updatedAt: number; sample?: boolean }[]> {
  const all = await tx<Notebook[]>(NOTEBOOKS, "readonly", (s) => s.getAll());
  return all
    .map((n) => ({ id: n.id, title: n.title, updatedAt: n.updatedAt, sample: n.sample }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
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
