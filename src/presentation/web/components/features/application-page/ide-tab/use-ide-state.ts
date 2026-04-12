/**
 * useIdeState
 *
 * Owns all IDE tab state: file tree, open files, active tab, live
 * refresh from the filesystem watcher SSE stream, and save.
 *
 * Designed to be the single place where network, SSE, and reducer
 * logic live so the view components stay tiny and presentational.
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { fetchFileContent, fetchFileTree, saveFileContent } from './api';
import {
  isImagePath,
  isMarkdownPath,
  type FileChangeEvent,
  type FileTreeEntry,
  type OpenFile,
} from './types';

export interface OpenFileOptions {
  /**
   * `'preview'` (default): opens as a VSCode-style italic preview tab.
   * If a preview tab already exists, its slot is reused (the previous
   * preview is swapped out).
   *
   * `'persistent'`: opens as a normal non-preview tab that will never
   * be reused. Use this for double-clicks.
   */
  mode?: 'preview' | 'persistent';
}

export interface UseIdeStateResult {
  tree: FileTreeEntry | null;
  treeError: string | null;
  treeLoading: boolean;
  openFiles: OpenFile[];
  activePath: string | null;
  openFile: (path: string, options?: OpenFileOptions) => void;
  closeFile: (path: string) => void;
  selectFile: (path: string) => void;
  /** Promote an open file from preview → persistent (e.g. on double-click). */
  promoteFile: (path: string) => void;
  updateBuffer: (path: string, content: string) => void;
  /** Toggle between `source` (Monaco) and `rendered` (markdown preview). */
  toggleViewMode: (path: string) => void;
  saveActive: () => Promise<void>;
}

export function useIdeState(applicationId: string): UseIdeStateResult {
  const [tree, setTree] = useState<FileTreeEntry | null>(null);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [treeLoading, setTreeLoading] = useState<boolean>(true);
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);

  /** Keep a ref to the latest openFiles so the SSE callback sees current state. */
  const openFilesRef = useRef<OpenFile[]>([]);
  useEffect(() => {
    openFilesRef.current = openFiles;
  }, [openFiles]);

  /* ---------------- Tree loading + refresh ---------------- */

  const reloadTree = useCallback(async () => {
    try {
      const fresh = await fetchFileTree(applicationId);
      setTree(fresh);
      setTreeError(null);
    } catch (err) {
      setTreeError(err instanceof Error ? err.message : String(err));
    } finally {
      setTreeLoading(false);
    }
  }, [applicationId]);

  useEffect(() => {
    void reloadTree();
  }, [reloadTree]);

  /* ---------------- Open / close / select ---------------- */

  const openFile = useCallback(
    async (path: string, options?: OpenFileOptions) => {
      const mode = options?.mode ?? 'preview';

      // Already open → just activate. If opened as persistent, also promote.
      const existing = openFilesRef.current.find((f) => f.path === path);
      if (existing) {
        setActivePath(path);
        if (mode === 'persistent' && existing.isPreview) {
          setOpenFiles((prev) =>
            prev.map((f) => (f.path === path ? { ...f, isPreview: false } : f))
          );
        }
        return;
      }

      try {
        // Images: skip the text-read round-trip entirely — the editor will
        // load bytes directly from the raw endpoint via an <img> tag.
        if (isImagePath(path)) {
          const newFile: OpenFile = {
            path,
            originalContent: '',
            content: '',
            isImage: true,
            viewMode: 'rendered',
            isPreview: mode === 'preview',
          };
          setOpenFiles((prev) => {
            if (mode === 'preview') {
              const previewIdx = prev.findIndex((f) => f.isPreview);
              if (previewIdx !== -1) {
                const next = prev.slice();
                next[previewIdx] = newFile;
                return next;
              }
            }
            return [...prev, newFile];
          });
          setActivePath(path);
          return;
        }

        const result = await fetchFileContent(applicationId, path);
        const resolvedPath = result.path || path;
        const markdown = isMarkdownPath(resolvedPath);
        const newFile: OpenFile = {
          path: resolvedPath,
          originalContent: result.content,
          content: result.content,
          tooLarge: result.tooLarge,
          binary: result.binary,
          isMarkdown: markdown,
          viewMode: markdown ? 'rendered' : 'source',
          isPreview: mode === 'preview',
        };

        setOpenFiles((prev) => {
          // VSCode-style preview reuse: if this open is a preview AND there's
          // already a preview tab, swap the new file into that slot.
          if (mode === 'preview') {
            const previewIdx = prev.findIndex((f) => f.isPreview);
            if (previewIdx !== -1) {
              const next = prev.slice();
              next[previewIdx] = newFile;
              return next;
            }
          }
          return [...prev, newFile];
        });
        setActivePath(resolvedPath);
      } catch (err) {
        toast.error('Could not open file', {
          description: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [applicationId]
  );

  const promoteFile = useCallback((path: string) => {
    setOpenFiles((prev) => prev.map((f) => (f.path === path ? { ...f, isPreview: false } : f)));
  }, []);

  const toggleViewMode = useCallback((path: string) => {
    setOpenFiles((prev) =>
      prev.map((f) =>
        f.path === path ? { ...f, viewMode: f.viewMode === 'rendered' ? 'source' : 'rendered' } : f
      )
    );
  }, []);

  const closeFile = useCallback((path: string) => {
    setOpenFiles((prev) => {
      const next = prev.filter((f) => f.path !== path);
      setActivePath((current) => {
        if (current !== path) return current;
        if (next.length === 0) return null;
        // Activate the file at the same index (or the last one).
        const idx = Math.min(
          prev.findIndex((f) => f.path === path),
          next.length - 1
        );
        return next[Math.max(0, idx)].path;
      });
      return next;
    });
  }, []);

  const selectFile = useCallback((path: string) => {
    setActivePath(path);
  }, []);

  const updateBuffer = useCallback((path: string, content: string) => {
    // Any edit promotes a preview tab to persistent, matching VSCode.
    setOpenFiles((prev) =>
      prev.map((f) =>
        f.path === path ? { ...f, content, isPreview: f.isPreview ? false : f.isPreview } : f
      )
    );
  }, []);

  /* ---------------- Save ---------------- */

  const saveActive = useCallback(async () => {
    const active = openFilesRef.current.find((f) => f.path === activePath);
    if (!active) return;
    if (active.content === active.originalContent) return;
    try {
      await saveFileContent(applicationId, active.path, active.content);
      setOpenFiles((prev) =>
        prev.map((f) => (f.path === active.path ? { ...f, originalContent: active.content } : f))
      );
      toast.success('Saved', { description: active.path });
    } catch (err) {
      toast.error('Failed to save', {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }, [applicationId, activePath]);

  /* ---------------- Live SSE watcher ---------------- */

  useEffect(() => {
    const url = `/api/applications/${applicationId}/files/watch`;
    const es = new EventSource(url);

    let treeRefreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleTreeRefresh = () => {
      if (treeRefreshTimer) return;
      treeRefreshTimer = setTimeout(() => {
        treeRefreshTimer = null;
        void reloadTree();
      }, 250);
    };

    es.addEventListener('change', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data) as FileChangeEvent;
        scheduleTreeRefresh();

        // If one of the open files changed on disk, refresh its buffer ONLY
        // if the user has no unsaved edits. Otherwise leave their edits alone.
        const isOpen = openFilesRef.current.some((f) => f.path === data.path);
        if (!isOpen || data.isDirectory) return;

        if (data.kind === 'deleted') {
          toast.message('File deleted on disk', { description: data.path });
          return;
        }

        void (async () => {
          try {
            const fresh = await fetchFileContent(applicationId, data.path);
            setOpenFiles((prev) =>
              prev.map((f) => {
                if (f.path !== data.path) return f;
                // User has unsaved edits → keep their buffer, just refresh baseline
                // so "dirty" state remains meaningful.
                if (f.content !== f.originalContent) return f;
                return {
                  ...f,
                  originalContent: fresh.content,
                  content: fresh.content,
                  tooLarge: fresh.tooLarge,
                  binary: fresh.binary,
                };
              })
            );
          } catch {
            // Silent — the file may have just been deleted or moved.
          }
        })();
      } catch {
        // Ignore malformed event.
      }
    });

    es.onerror = () => {
      // EventSource auto-reconnects; nothing to do.
    };

    return () => {
      es.close();
      if (treeRefreshTimer) clearTimeout(treeRefreshTimer);
    };
  }, [applicationId, reloadTree]);

  return {
    tree,
    treeError,
    treeLoading,
    openFiles,
    activePath,
    openFile,
    closeFile,
    selectFile,
    promoteFile,
    updateBuffer,
    toggleViewMode,
    saveActive,
  };
}
