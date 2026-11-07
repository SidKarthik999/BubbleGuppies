import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { NotebookStore } from "../ink/notebookStore";
import { InkSession } from "../ink/inkSession";
import { newId, newNotebook, newPage, type Notebook, type PageTemplate } from "../ink/model";
import { lastNotebookId, listNotebooks, loadBlob, loadNotebook, rememberLastNotebook, saveBlob } from "../ink/storage";

/** Fills fields added after a notebook was first saved. */
function migrate(nb: Notebook): Notebook {
  return {
    ...nb,
    cues: nb.cues ?? [],
    transcript: nb.transcript ?? [],
    cards: nb.cards ?? [],
    audioBlobId: nb.audioBlobId ?? null,
    dismissedSymbolIds: nb.dismissedSymbolIds ?? [],
    pages: nb.pages.map((p) => ({ ...p, textBoxes: p.textBoxes ?? [] })),
  };
}

export function useStoreVersion(store: NotebookStore): number {
  return useSyncExternalStore(store.subscribe, store.getVersion);
}

export function useSessionVersion(session: InkSession): number {
  return useSyncExternalStore(session.subscribe, session.getVersion);
}

export function useNotebook() {
  const [store] = useState(() => new NotebookStore(newNotebook("Untitled notes")));
  const [session] = useState(() => new InkSession());
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [notebooks, setNotebooks] = useState<{ id: string; title: string; updatedAt: number; sample?: boolean }[]>([]);
  useStoreVersion(store);

  const refreshList = useCallback(() => {
    listNotebooks().then(setNotebooks).catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const id = lastNotebookId();
        const nb = id ? await loadNotebook(id) : undefined;
        if (!cancelled && nb) store.replaceNotebook(migrate(nb));
        else await store.saveNow();
      } catch (err) {
        if (!cancelled) setStorageError(err instanceof Error ? err.message : "Local storage unavailable");
      }
      if (!cancelled) {
        rememberLastNotebook(store.notebook.id);
        setReady(true);
        refreshList();
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
        if (e.type === "saved") setStorageError(null);
      }),
    [store]
  );

  const createNotebook = useCallback(
    async (nb: Notebook = newNotebook(`Notes — ${new Date().toLocaleString()}`)) => {
      await store.saveNow();
      store.replaceNotebook(nb);
      session.setSelection(null);
      rememberLastNotebook(nb.id);
      await store.saveNow();
      refreshList();
    },
    [refreshList, session, store]
  );

  const openNotebook = useCallback(
    async (id: string) => {
      await store.saveNow();
      const nb = await loadNotebook(id);
      if (!nb) return;
      store.replaceNotebook(migrate(nb));
      session.setSelection(null);
      rememberLastNotebook(id);
    },
    [session, store]
  );

  const addPage = useCallback(
    (template: PageTemplate) => {
      store.addPages([newPage({ kind: "template", template })]);
    },
    [store]
  );

  /** Imports a PDF: every page becomes a notebook page with the PDF as its background. */
  const importPdf = useCallback(
    async (file: File) => {
      const { loadPdf, pdfPageSizes } = await import("../ink/pdf");
      const fileId = newId("pdf");
      await saveBlob(fileId, file);
      const doc = await loadPdf(fileId, () => file.arrayBuffer());
      const sizes = await pdfPageSizes(doc);
      store.addPages(
        sizes.map((s, i) => newPage({ kind: "pdf", fileId, fileName: file.name, pageIndex: i }, s.width, s.height))
      );
    },
    [store]
  );

  const loadAudio = useCallback(async (): Promise<string | null> => {
    const id = store.notebook.audioBlobId;
    if (!id) return null;
    const blob = await loadBlob(id).catch(() => undefined);
    return blob ? URL.createObjectURL(blob) : null;
  }, [store]);

  return { store, session, ready, storageError, notebooks, refreshList, createNotebook, openNotebook, addPage, importPdf, loadAudio };
}

export type NotebookApi = ReturnType<typeof useNotebook>;
