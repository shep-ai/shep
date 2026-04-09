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
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 280, h: 400 });

  // Keep the module-scoped ref pointed at the latest callback.
  useEffect(() => {
    callbacksRef.current = { onOpenFile };
    return () => {
      if (callbacksRef.current?.onOpenFile === onOpenFile) callbacksRef.current = null;
    };
  }, [onOpenFile]);

  // Measure the container so react-arborist can virtualize correctly.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setSize({ w: Math.floor(rect.width), h: Math.floor(rect.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (loading && !tree) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center text-xs">
        Loading files…
      </div>
    );
  }
  if (error) {
    return (
      <div className="text-destructive flex h-full items-center justify-center p-2 text-center text-xs">
        {error}
      </div>
    );
  }
  if (!tree) return null;

  return (
    <div ref={containerRef} className="h-full w-full overflow-hidden">
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
    </div>
  );
}
