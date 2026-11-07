import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { NotebookStore } from "../ink/notebookStore";
import { InkSession } from "../ink/inkSession";
import {
  newId,
  newNotebook,
  newPage,
  type AttachmentKind,
  type CoverColor,
  type Notebook,
  type PageTemplate,
} from "../ink/model";
import {
  blobIdsOf,
  deleteBlob,
  deleteNotebook as deleteStoredNotebook,
  forgetLastNotebook,
  lastNotebookId,
  listNotebooks,
  loadBlob,
  loadNotebook,
  recordingIdsOf,
  rememberLastNotebook,
  saveBlob,
  type NotebookSummary,
} from "../ink/storage";

/** Fills fields added after a notebook was first saved. */
function migrate(nb: Notebook): Notebook {
  return {
    ...nb,
    cues: nb.cues ?? [],
    transcript: nb.transcript ?? [],
    cards: nb.cards ?? [],
    audioBlobId: nb.audioBlobId ?? null,
    dismissedSymbolIds: nb.dismissedSymbolIds ?? [],
    attachments: nb.attachments ?? [],
    pages: nb.pages.map((p) => ({ ...p, textBoxes: p.textBoxes ?? [] })),
  };
}

export function useStoreVersion(store: NotebookStore): number {
  return useSyncExternalStore(store.subscribe, store.getVersion);
}

export function useSessionVersion(session: InkSession): number {
  return useSyncExternalStore(session.subscribe, session.getVersion);
}

export type NewNotebookInput = {
  name: string;
  courseCode: string;
  cover: CoverColor;
  paper: PageTemplate;
};

export function useNotebook() {
  const [store] = useState(() => new NotebookStore(newNotebook("Untitled notes")));
  const [session] = useState(() => new InkSession());
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [notebooks, setNotebooks] = useState<NotebookSummary[]>([]);
  // The placeholder the store starts with is never saved: notebooks are made from the shelf.
  // A ref, because deleting the open notebook swaps in a fresh placeholder.
  const placeholderId = useRef(store.notebook.id);
  const saveCurrent = useCallback(
    () => (store.notebook.id === placeholderId.current ? Promise.resolve() : store.saveNow()),
    [store]
  );
  useStoreVersion(store);

  const refreshList = useCallback(async () => {
    try {
      setNotebooks(await listNotebooks());
    } catch {
      /* storage unavailable: the banner covers it */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const id = lastNotebookId();
        const nb = id ? await loadNotebook(id) : undefined;
        if (!cancelled && nb) store.replaceNotebook(migrate(nb));
      } catch (err) {
        if (!cancelled) setStorageError(err instanceof Error ? err.message : "Local storage unavailable");
      }
      if (!cancelled) {
        setReady(true);
        void refreshList();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store, refreshList]);

  useEffect(
    () =>
      store.subscribe((e) => {
        if (e.type === "save-failed") setStorageError(e.message);
        if (e.type === "saved") {
          setStorageError(null);
          void refreshList();
        }
      }),
    [store, refreshList]
  );

  /** Creates a notebook from the New notebook sheet and makes it current. */
  const createNotebook = useCallback(
    async (input: NewNotebookInput) => {
      await saveCurrent();
      const nb = newNotebook(input.name.trim());
      nb.courseCode = input.courseCode.trim();
      nb.cover = input.cover;
      nb.paper = input.paper;
      nb.attachments = [];
      nb.pages = [newPage({ kind: "template", template: input.paper })];
      store.replaceNotebook(nb);
      session.setSelection(null);
      rememberLastNotebook(nb.id);
      await store.saveNow();
      await refreshList();
      return nb.id;
    },
    [refreshList, saveCurrent, session, store]
  );

  /** Loads a notebook into the store (no-op when it is already current). */
  const openNotebook = useCallback(
    async (id: string): Promise<boolean> => {
      if (store.notebook.id === id) return true;
      await saveCurrent();
      const nb = await loadNotebook(id);
      if (!nb) return false;
      store.replaceNotebook(migrate(nb));
      session.setSelection(null);
      rememberLastNotebook(id);
      return true;
    },
    [saveCurrent, session, store]
  );

  /**
   * Permanently deletes a notebook with its PDFs and lecture audio. If it is
   * the open notebook, an unsaved blank one replaces it first so a pending
   * autosave can't write it back.
   */
  const deleteNotebook = useCallback(
    async (id: string) => {
      const stored = await loadNotebook(id);
      if (store.notebook.id === id) {
        const blank = newNotebook("Untitled notes");
        placeholderId.current = blank.id;
        store.replaceNotebook(blank);
        session.setSelection(null);
      }
      await deleteStoredNotebook(id);
      forgetLastNotebook(id);
      // PDFs are only ever attached to one notebook, so its blobs can go too,
      // along with every lecture recording (not just the latest one).
      const blobs = new Set([...(stored ? blobIdsOf(stored) : []), ...(await recordingIdsOf(id).catch(() => []))]);
      await Promise.all([...blobs].map((b) => deleteBlob(b).catch(() => undefined)));
      await refreshList();
    },
    [refreshList, session, store]
  );

  const addPage = useCallback(
    (template?: PageTemplate) => {
      store.addPages([newPage({ kind: "template", template: template ?? store.notebook.paper ?? "lined" })]);
    },
    [store]
  );

  /** Imports a PDF into the current notebook: every page becomes a notebook page with the PDF as its background. */
  const importPdf = useCallback(
    async (file: File, kind: AttachmentKind = "own-pdf") => {
      const { loadPdf, pdfPageSizes } = await import("../ink/pdf");
      const fileId = newId("pdf");
      await saveBlob(fileId, file);
      const doc = await loadPdf(fileId, () => file.arrayBuffer());
      const sizes = await pdfPageSizes(doc);
      store.notebook.attachments = [
        ...(store.notebook.attachments ?? []),
        { id: fileId, kind, fileName: file.name, pageCount: sizes.length, addedAt: Date.now() },
      ];
      store.addPages(
        sizes.map((s, i) => newPage({ kind: "pdf", fileId, fileName: file.name, pageIndex: i }, s.width, s.height))
      );
    },
    [store]
  );

  /** Bumps the shelf counters ("12 lectures · 4 problem sets"). */
  const noteActivity = useCallback(
    (what: "lecture" | "problem-set") => {
      const nb = store.notebook;
      if (what === "lecture") {
        nb.lectureCount = (nb.lectureCount ?? 0) + 1;
        nb.lastLectureAt = Date.now();
      } else {
        nb.problemSetCount = (nb.problemSetCount ?? 0) + 1;
      }
      void store.saveNow();
    },
    [store]
  );

  const loadAudio = useCallback(async (): Promise<string | null> => {
    const id = store.notebook.audioBlobId;
    if (!id) return null;
    const blob = await loadBlob(id).catch(() => undefined);
    return blob ? URL.createObjectURL(blob) : null;
  }, [store]);

  return {
    store,
    session,
    ready,
    storageError,
    notebooks,
    refreshList,
    createNotebook,
    openNotebook,
    deleteNotebook,
    addPage,
    importPdf,
    noteActivity,
    loadAudio,
  };
}

export type NotebookApi = ReturnType<typeof useNotebook>;
