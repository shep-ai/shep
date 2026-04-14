/**
 * FileTreePanel
 *
 * Left-side VSCode-style file tree for the IDE tab. Uses react-arborist
 * for virtualization, keyboard navigation, and folder expansion. Clicking
 * a file node calls `onOpenFile` so the parent can load it into the
 * editor.
 */

'use client';

import { useMemo, useRef, useEffect, useState } from 'react';
import { Tree } from 'react-arborist';
import type { NodeRendererProps, TreeApi } from 'react-arborist';
import { ChevronDown, ChevronRight, File, FolderClosed, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FileTreeEntry } from './types';

export interface FileTreePanelProps {
  tree: FileTreeEntry | null;
  loading: boolean;
  error: string | null;
  activePath: string | null;
  /** Open a file. Mode is `'preview'` on single click, `'persistent'` on double-click. */
  onOpenFile: (path: string, mode: 'preview' | 'persistent') => void;
}

/** react-arborist wants `{id, name, children?}`. Files have no `children` key. */
interface ArboristNode {
  id: string;
  name: string;
  isDirectory: boolean;
  path: string;
  children?: ArboristNode[];
}

function toArboristNodes(entries: FileTreeEntry[] | undefined): ArboristNode[] {
  if (!entries) return [];
  return entries.map((e) => ({
    id: e.path || e.name,
    name: e.name,
    isDirectory: e.isDirectory,
    path: e.path,
    children: e.isDirectory ? toArboristNodes(e.children) : undefined,
  }));
}

/**
 * Shared ref to the current `onOpenFile` callback.
 *
 * react-arborist has no `meta` prop for passing arbitrary data into
 * `NodeRenderer`, and we don't want to define the renderer inline inside
 * `FileTreePanel` (re-creating it on every render thrashes virtualization).
 * A module-scoped ref is the pragmatic middle ground: the renderer reads
 * the latest callback without being re-instantiated.
 */
interface FileTreeCallbacks {
  onOpenFile: (path: string, mode: 'preview' | 'persistent') => void;
}

const callbacksRef: { current: FileTreeCallbacks | null } = { current: null };

function NodeRenderer({ node, style }: NodeRendererProps<ArboristNode>) {
  const isDir = node.data.isDirectory;
  const isOpen = node.isOpen;
  return (
    <div
      style={style}
      className={cn(
        'flex h-6 cursor-pointer items-center gap-1 rounded-sm px-1 text-[12px] select-none',
        node.isSelected
          ? 'bg-primary/10 text-foreground'
          : 'text-muted-foreground hover:bg-muted/60'
      )}
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        if (isDir) {
          node.toggle();
          return;
        }
        node.select();
        // Single click → preview (italic, reused slot).
        callbacksRef.current?.onOpenFile(node.data.path, 'preview');
      }}
      onDoubleClick={(e) => {
        if (isDir) return;
        e.preventDefault();
        // Double click → promote to a persistent tab.
        callbacksRef.current?.onOpenFile(node.data.path, 'persistent');
      }}
    >
      {isDir ? (
        isOpen ? (
          <ChevronDown className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" />
        )
      ) : (
        <span className="inline-block w-3 shrink-0" />
      )}
      {isDir ? (
        isOpen ? (
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-500" />
        ) : (
          <FolderClosed className="h-3.5 w-3.5 shrink-0 text-amber-500" />
        )
      ) : (
        <File className="h-3.5 w-3.5 shrink-0 text-sky-500" />
      )}
      <span className="truncate">{node.data.name}</span>
    </div>
  );
}

export function FileTreePanel({
  tree,
  loading,
  error,
  activePath,
  onOpenFile,
}: FileTreePanelProps) {
  const data = useMemo(() => toArboristNodes(tree?.children), [tree]);
  const treeRef = useRef<TreeApi<ArboristNode> | null>(null);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 280, h: 400 });

  // Keep the module-scoped ref pointed at the latest callback.
  useEffect(() => {
    callbacksRef.current = { onOpenFile };
    return () => {
      if (callbacksRef.current?.onOpenFile === onOpenFile) callbacksRef.current = null;
    };
  }, [onOpenFile]);

  // Measure the container so react-arborist can virtualize correctly.
  //
  // We use a callback ref (setContainer) rather than useRef + a single
  // useEffect([], …) because the component early-returns a loading /
  // error placeholder BEFORE the container div gets a chance to mount.
  // With the old pattern the effect ran once on first render with
  // containerRef.current === null, the ResizeObserver never attached,
  // and size.h stayed stuck at the 400 placeholder forever — which
  // produced the "my file list is clipped until I collapse+reopen the
  // explorer" bug, because collapse/reopen remounted the component and
  // this time tree was already loaded so the container div was rendered
  // on the first render pass.
  useEffect(() => {
    if (!container) return;
    // Seed size synchronously from the live element — ResizeObserver
    // only fires after a layout tick, and we'd rather not show a flash
    // of the 400px placeholder in the meantime.
    const rect = container.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setSize({ w: Math.floor(rect.width), h: Math.floor(rect.height) });
    }
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]?.contentRect;
      if (entry) setSize({ w: Math.floor(entry.width), h: Math.floor(entry.height) });
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [container]);

  // IMPORTANT: always render the containerRef div as the outer wrapper,
  // even during loading / error / empty states. Loading and error content
  // render INSIDE it so the ResizeObserver effect above stays attached to
  // a single stable DOM node across the loading→loaded transition — no
  // re-attach flicker, no stale measurement on the first frame after the
  // file tree arrives.
  return (
    <div ref={setContainer} className="h-full w-full overflow-hidden">
      {loading && !tree ? (
        <div className="text-muted-foreground flex h-full items-center justify-center text-xs">
          Loading files…
        </div>
      ) : error ? (
        <div className="text-destructive flex h-full items-center justify-center p-2 text-center text-xs">
          {error}
        </div>
      ) : !tree ? null : (
        <Tree<ArboristNode>
          ref={treeRef}
          data={data}
          openByDefault={false}
          width={size.w}
          height={size.h}
          rowHeight={24}
          indent={12}
          padding={4}
          selection={activePath ?? undefined}
        >
          {NodeRenderer}
        </Tree>
      )}
    </div>
  );
}
