/**
 * IdeTab
 *
 * The IDE view for the Application page's right pane. Renders a split of
 * (editor) | (file explorer on the RIGHT). State is owned by `useIdeState`
 * so this component stays a thin layout shell.
 *
 * The underlying SSE watcher keeps the tree and any open files in sync
 * whenever the agent (or any other process) writes to the application's
 * working directory.
 */

'use client';

import { useCallback, useRef, useState } from 'react';
import { PanelRightClose } from 'lucide-react';
import { FileTreePanel } from './file-tree-panel';
import { EditorPane } from './editor-pane';
import { useIdeState } from './use-ide-state';
import type { OpenFileOptions } from './use-ide-state';

export interface IdeTabProps {
  applicationId: string;
}

const MIN_TREE_PX = 160;
const MIN_EDITOR_PX = 300;
const INITIAL_TREE_PX = 260;

export function IdeTab({ applicationId }: IdeTabProps) {
  const state = useIdeState(applicationId);
  const [treeWidth, setTreeWidth] = useState<number>(INITIAL_TREE_PX);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<boolean>(false);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    // Explorer is on the RIGHT: its width is the distance from the right edge
    // of the container to the pointer, not the distance from the left edge.
    const fromRight = rect.right - e.clientX;
    const clamped = Math.max(MIN_TREE_PX, Math.min(fromRight, rect.width - MIN_EDITOR_PX));
    setTreeWidth(clamped);
  }, []);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const showSidebar = useCallback(() => setSidebarCollapsed(false), []);
  const hideSidebar = useCallback(() => setSidebarCollapsed(true), []);

  // Adapt the tree's (path, mode) signature to the hook's (path, options).
  const handleTreeOpen = useCallback(
    (path: string, mode: OpenFileOptions['mode']) => {
      state.openFile(path, { mode });
    },
    [state]
  );

  return (
    <div
      ref={containerRef}
      className="bg-background flex h-full min-h-0 flex-1"
      data-testid="ide-tab"
    >
      {/* Editor (left) */}
      <section className="min-w-0 flex-1">
        <EditorPane
          applicationId={applicationId}
          openFiles={state.openFiles}
          activePath={state.activePath}
          onSelect={state.selectFile}
          onClose={state.closeFile}
          onChange={state.updateBuffer}
          onSave={state.saveActive}
          onPromote={state.promoteFile}
          onToggleViewMode={state.toggleViewMode}
          sidebarCollapsed={sidebarCollapsed}
          onShowSidebar={showSidebar}
        />
      </section>

      {/* Drag handle — only visible when the sidebar is shown */}
      {!sidebarCollapsed && (
        <div
          role="separator"
          aria-orientation="vertical"
          className="border-border hover:bg-primary/20 relative w-px shrink-0 cursor-col-resize border-l transition-colors"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <span className="absolute inset-y-0 -right-1 -left-1" />
        </div>
      )}

      {/* File explorer (right) */}
      {!sidebarCollapsed && (
        <aside
          className="border-border flex min-h-0 shrink-0 flex-col border-l"
          style={{ width: treeWidth }}
        >
          <div className="text-muted-foreground border-border bg-muted/30 flex h-8 shrink-0 items-center justify-between border-b px-2 text-[10px] font-medium tracking-wide uppercase">
            <span>Explorer</span>
            <button
              type="button"
              onClick={hideSidebar}
              className="text-muted-foreground hover:text-foreground -mr-1 flex h-6 w-6 items-center justify-center rounded-sm"
              aria-label="Hide file explorer"
              title="Hide file explorer"
            >
              <PanelRightClose className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <FileTreePanel
              tree={state.tree}
              loading={state.treeLoading}
              error={state.treeError}
              activePath={state.activePath}
              onOpenFile={handleTreeOpen}
            />
          </div>
        </aside>
      )}
    </div>
  );
}
