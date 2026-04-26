'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { FolderPlus } from 'lucide-react';
import type { Edge, Viewport } from '@xyflow/react';
import { useReactFlow } from '@xyflow/react';
import { FeaturesCanvas } from '@/components/features/features-canvas';
import { CanvasToolbar } from '@/components/features/features-canvas/canvas-toolbar';
import { WorkspaceSelector } from '@/components/features/features-canvas/workspace-selector';
import { ManageWorkspaceDialog } from '@/components/features/features-canvas/manage-workspace-dialog';
import { WorkspaceNameDialog } from '@/components/features/features-canvas/workspace-name-dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useWorkspaces, DEFAULT_WORKSPACE_ID } from '@/hooks/use-workspaces';
import { Layers, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CanvasNodeType } from '@/components/features/features-canvas';
import type { FeatureNodeData } from '@/components/common/feature-node';
import type { RepositoryNodeData } from '@/components/common/repository-node';
import {
  FloatingActionButton,
  type FloatingActionButtonAction,
} from '@/components/common/floating-action-button';
import {
  useSidebarFeaturesContext,
  mapNodeStateToSidebarStatus,
} from '@/hooks/sidebar-features-context';
import { useTranslation } from 'react-i18next';
import { useFeatureFlags } from '@/hooks/feature-flags-context';

import { useSelectedFeatureId } from '@/hooks/use-selected-feature-id';
import { useSelectedRepository } from '@/hooks/use-selected-repository';
import { useSoundAction } from '@/hooks/use-sound-action';
import { useDrawerCloseGuard } from '@/hooks/drawer-close-guard';
import { useViewportPersistence } from '@/hooks/use-viewport-persistence';
import { useSidebar } from '@/components/ui/sidebar';
import { useFabLayout } from '@/hooks/fab-layout-context';
import { ControlCenterEmptyState } from './control-center-empty-state';
import { ControlCenterOnboarding } from './control-center-onboarding';
import { NewProjectDialog } from './new-project-dialog';
import { useControlCenterState } from './use-control-center-state';
import { useCanvasEventListeners } from './use-canvas-event-listeners';
import { useWorkspaceFitView } from './use-workspace-fit-view';
import { useFabActions } from './use-fab-actions';

const AUTO_FOCUS_OPTIONS = {
  maxZoom: 1.0,
  padding: 0.5,
  duration: 500,
} as const;

const AUTO_FOCUS_DRAWER_DELAY_MS = 600;

interface ControlCenterInnerProps {
  initialNodes: CanvasNodeType[];
  initialEdges: Edge[];
}

export function ControlCenterInner({ initialNodes, initialEdges }: ControlCenterInnerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const selectedFeatureId = useSelectedFeatureId();
  const selectedRepository = useSelectedRepository();
  const clickSound = useSoundAction('click');
  const { guardedNavigate } = useDrawerCloseGuard();
  const { fitView } = useReactFlow();
  const drawerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    defaultViewport,
    onMoveEnd: handleViewportChange,
    resetViewport,
  } = useViewportPersistence();

  const {
    nodes,
    edges,
    onNodesChange,
    handleConnect,
    handleAddRepository,
    handleArchiveFeature,
    handleDeleteFeature,
    handleRetryFeature,
    handleStartFeature,
    handleStopFeature,
    handleUnarchiveFeature,
    handleDeleteRepository,
    handleDeleteApplication,
    createFeatureNode,
    showArchived,
    setShowArchived,
    setCallbacks,
  } = useControlCenterState(initialNodes, initialEdges);

  // ── Workspaces (client-only prototype) ────────────────────────────────
  const {
    workspaces,
    activeWorkspace,
    isDefaultActive,
    setActiveWorkspace,
    createWorkspace,
    renameWorkspace,
    deleteWorkspace,
    setWorkspaceMembers,
    addToActiveWorkspace,
  } = useWorkspaces();
  // Tracks the set of node ids we've already seen, so we can detect new
  // repo/feature nodes appearing on the canvas and auto-include them in the
  // active workspace (when it isn't the default).
  const knownNodeIdsRef = useRef<Set<string>>(new Set());
  const [manageWorkspaceOpen, setManageWorkspaceOpen] = useState(false);
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [renameWorkspaceOpen, setRenameWorkspaceOpen] = useState(false);
  const [deleteWorkspaceOpen, setDeleteWorkspaceOpen] = useState(false);
  // Target of the delete confirmation dialog. Allows deleting any workspace
  // (not just the active one) directly from the workspace dropdown.
  const [pendingDeleteWorkspaceId, setPendingDeleteWorkspaceId] = useState<string | null>(null);
  // Inline "New Project" dialog launched from the empty-workspace state.
  const [workspaceNewProjectOpen, setWorkspaceNewProjectOpen] = useState(false);

  // Publish sidebar features + repo state to context
  const { setFeatures: setSidebarFeatures, setHasRepositories: setSidebarHasRepos } =
    useSidebarFeaturesContext();

  const featureNodes = useMemo(() => nodes.filter((n) => n.type === 'featureNode'), [nodes]);

  const sidebarKey = useMemo(() => {
    return featureNodes
      .map((n) => {
        const d = n.data as FeatureNodeData;
        return `${d.featureId}:${d.state}:${d.name}:${d.repositoryPath}`;
      })
      .sort()
      .join(',');
  }, [featureNodes]);

  useEffect(() => {
    const sidebarItems = featureNodes
      .map((n) => {
        const d = n.data as FeatureNodeData;
        const status = mapNodeStateToSidebarStatus(d.state);
        if (!status) return null;
        const repoPath = d.repositoryPath ?? '';
        return {
          featureId: d.featureId,
          name: d.name,
          status,
          repositoryPath: repoPath,
          repositoryName: d.repositoryName ?? repoPath.split('/').filter(Boolean).pop() ?? repoPath,
          ...(d.startedAt != null && { startedAt: d.startedAt }),
          ...(d.runtime != null && { duration: d.runtime }),
          ...(d.agentType && { agentType: d.agentType }),
          ...(d.modelId && { modelId: d.modelId }),
        };
      })
      .filter(Boolean) as {
      featureId: string;
      name: string;
      status: 'action-needed' | 'in-progress' | 'done';
      repositoryPath: string;
      repositoryName: string;
      startedAt?: number;
      duration?: string;
      agentType?: string;
      modelId?: string;
    }[];

    setSidebarFeatures(sidebarItems);
  }, [sidebarKey, featureNodes, setSidebarFeatures]);

  // ── URL-based navigation handlers ────────────────────────────────────

  const handleApplicationClick = useCallback(
    (applicationId: string) => {
      guardedNavigate(() => router.push(`/application/${applicationId}`));
    },
    [router, guardedNavigate]
  );

  const handleNodeClick = useCallback(
    (event: React.MouseEvent, node: CanvasNodeType) => {
      if (node.type === 'featureNode') {
        const data = node.data as FeatureNodeData;
        if (data.state === 'creating' || data.state === 'deleting') return;
        // Only navigate when the click lands on the card itself, not on
        // overlay buttons (delete, add) or pointer events leaking from dialogs.
        const target = event.target as HTMLElement;
        if (!target.closest('[data-testid="feature-node-card"]')) return;
        guardedNavigate(() => {
          clickSound.play();
          router.push(`/feature/${data.featureId}`);
        });
      }
    },
    [router, clickSound, guardedNavigate]
  );

  const handleAddFeature = useCallback(() => {
    clickSound.play();
    router.push('/create');
  }, [router, clickSound]);

  const handleAddFeatureToRepo = useCallback(
    (repoNodeId: string) => {
      clickSound.play();
      const node = nodes.find((n) => n.id === repoNodeId);
      const repoPath = (node?.data as { repositoryPath?: string } | undefined)?.repositoryPath;
      if (repoPath) {
        router.push(`/create?repo=${encodeURIComponent(repoPath)}`);
      } else {
        router.push('/create');
      }
    },
    [nodes, router, clickSound]
  );

  const handleAddFeatureToFeature = useCallback(
    (featureNodeId: string) => {
      const featureId = featureNodeId.startsWith('feat-') ? featureNodeId.slice(5) : featureNodeId;
      // Find the repo node that owns this feature
      const repoEdge = edges.find((e) => e.target === featureNodeId);
      const repoNode = repoEdge ? nodes.find((n) => n.id === repoEdge.source) : null;
      const repoPath = (repoNode?.data as { repositoryPath?: string } | undefined)?.repositoryPath;

      clickSound.play();
      const params = new URLSearchParams();
      if (repoPath) params.set('repo', repoPath);
      params.set('parent', featureId);
      router.push(`/create?${params.toString()}`);
    },
    [nodes, edges, router, clickSound]
  );

  const handleRepositoryClick = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (node?.type === 'repositoryNode') {
        const data = node.data as RepositoryNodeData;
        if (data.id) {
          guardedNavigate(() => router.push(`/repository/${data.id}`));
        }
      }
    },
    [nodes, router, guardedNavigate]
  );

  // Close all drawers — navigate back to the control-center canvas
  const handleClearDrawers = useCallback(() => {
    if (pathname !== '/control-center') {
      guardedNavigate(() => router.push('/control-center'));
    }
  }, [router, pathname, guardedNavigate]);

  // Shared: after adding first repo, center canvas and open create drawer
  const focusAndOpenDrawer = useCallback(
    (repoPath: string) => {
      // Wait for next render so the repo node exists in the DOM
      setTimeout(() => {
        fitView(AUTO_FOCUS_OPTIONS);

        // Open the create-feature drawer after the fitView animation completes
        drawerTimerRef.current = setTimeout(() => {
          guardedNavigate(() => router.push(`/create?repo=${encodeURIComponent(repoPath)}`));
        }, AUTO_FOCUS_DRAWER_DELAY_MS);
      }, 0);
    },
    [fitView, guardedNavigate, router]
  );

  // Smoothly pan/zoom to a specific node after it appears on canvas
  const focusOnNode = useCallback(
    (nodeId: string) => {
      // Wait for next render so the node exists in the DOM
      setTimeout(() => {
        fitView({
          nodes: [{ id: nodeId }],
          maxZoom: 1.0,
          padding: 0.4,
          duration: 600,
        });
      }, 0);
    },
    [fitView]
  );

  // Wrapper: add repo + auto-focus on the new node
  const addRepoAndFocus = useCallback(
    (path: string) => {
      const { wasEmpty, repoPath, tempNodeId } = handleAddRepository(path);
      if (wasEmpty) {
        focusAndOpenDrawer(repoPath);
      } else {
        focusOnNode(tempNodeId);
      }
    },
    [handleAddRepository, focusAndOpenDrawer, focusOnNode]
  );

  // All five window-level CustomEvent listeners (add-repository, feature-
  // created, delete/archive/unarchive requests) live in this hook so the
  // parent component stays focused on graph state + rendering.
  useCanvasEventListeners({
    addRepoAndFocus,
    createFeatureNode,
    nodes,
    handleDeleteFeature,
    handleArchiveFeature,
    handleUnarchiveFeature,
  });

  // Cleanup the drawer timer on unmount. Used to live inside the inlined
  // shep:add-repository listener; now standalone since the listener moved.
  useEffect(() => {
    return () => {
      if (drawerTimerRef.current != null) {
        clearTimeout(drawerTimerRef.current);
      }
    };
  }, []);

  // Wire callbacks into derived node data (via ref — no re-render).
  useEffect(() => {
    setCallbacks({
      onNodeAction: handleAddFeatureToFeature,
      onFeatureDelete: handleDeleteFeature,
      onRetryFeature: handleRetryFeature,
      onStartFeature: handleStartFeature,
      onStopFeature: handleStopFeature,
      onArchiveFeature: handleArchiveFeature,
      onUnarchiveFeature: handleUnarchiveFeature,
      onRepositoryAdd: handleAddFeatureToRepo,
      onRepositoryClick: handleRepositoryClick,
      onRepositoryDelete: handleDeleteRepository,
      onApplicationClick: handleApplicationClick,
      onApplicationDelete: handleDeleteApplication,
    });
  }, [
    setCallbacks,
    handleAddFeatureToFeature,
    handleArchiveFeature,
    handleDeleteFeature,
    handleRetryFeature,
    handleStartFeature,
    handleStopFeature,
    handleUnarchiveFeature,
    handleAddFeatureToRepo,
    handleRepositoryClick,
    handleDeleteRepository,
    handleApplicationClick,
    handleDeleteApplication,
  ]);

  const handleMoveEnd = useCallback(
    (_event: unknown, viewport: Viewport) => {
      handleViewportChange(viewport);
    },
    [handleViewportChange]
  );

  const hasRepositories = nodes.some((n) => n.type === 'repositoryNode');
  // The canvas is "non-empty" as soon as ANY repo OR application node is
  // present — applications are first-class top-level nodes, so creating
  // an application alone must be enough to keep the prompt empty state
  // from re-appearing on next visit.
  const hasCanvasContent = hasRepositories || nodes.some((n) => n.type === 'applicationNode');

  // Publish repo state to sidebar context so AppShell can hide FAB during onboarding
  useEffect(() => {
    setSidebarHasRepos(hasRepositories);
  }, [hasRepositories, setSidebarHasRepos]);

  // Debounced latch: prevent empty-state flicker during brief reconcile gaps
  // (e.g. stale poll momentarily drops nodes), but allow the empty state to
  // return after a real delete once content stays gone past the debounce window.
  const [showCanvas, setShowCanvas] = useState(hasCanvasContent);
  const latchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (hasCanvasContent) {
      // Repos / apps exist — show canvas immediately, cancel any pending unlatch
      if (latchTimerRef.current) {
        clearTimeout(latchTimerRef.current);
        latchTimerRef.current = null;
      }
      setShowCanvas(true);
    } else if (showCanvas) {
      // All canvas content gone — clear saved viewport so next add starts
      // centered, then wait before showing empty state (debounce stale polls)
      resetViewport();
      latchTimerRef.current = setTimeout(() => {
        setShowCanvas(false);
        latchTimerRef.current = null;
      }, 500);
    }
    return () => {
      if (latchTimerRef.current) clearTimeout(latchTimerRef.current);
    };
  }, [hasCanvasContent, showCanvas, resetViewport]);

  // Auto-include any newly-appearing repo/feature nodes in the active
  // workspace (skipped when default is active — that workspace shows
  // everything anyway). We diff the current node id list against the set
  // we've already seen so we only add the deltas.
  useEffect(() => {
    const seen = knownNodeIdsRef.current;
    const newRepoIds: string[] = [];
    const newFeatureIds: string[] = [];
    for (const n of nodes) {
      if (seen.has(n.id)) continue;
      seen.add(n.id);
      if (n.type === 'repositoryNode') newRepoIds.push(n.id);
      else if (n.type === 'featureNode') newFeatureIds.push(n.id);
    }
    if (isDefaultActive) return;
    if (newRepoIds.length === 0 && newFeatureIds.length === 0) return;
    addToActiveWorkspace({ repoIds: newRepoIds, featureIds: newFeatureIds });
  }, [nodes, isDefaultActive, addToActiveWorkspace]);

  // Filter nodes by the active workspace (default workspace = no filter).
  // We always filter from the full `nodes` list so `displayNodes` already
  // reflects workspace membership before pulse-add decoration runs.
  const workspaceFilteredNodes = useMemo(() => {
    if (isDefaultActive) return nodes;
    const allowedRepos = new Set(activeWorkspace.repoIds);
    const allowedFeatures = new Set(activeWorkspace.featureIds);
    return nodes.filter((n) => {
      if (n.type === 'repositoryNode') return allowedRepos.has(n.id);
      if (n.type === 'featureNode') return allowedFeatures.has(n.id);
      return true;
    });
  }, [nodes, isDefaultActive, activeWorkspace]);

  // Drop edges whose endpoints were filtered out.
  const workspaceFilteredEdges = useMemo(() => {
    if (isDefaultActive) return edges;
    const visibleIds = new Set(workspaceFilteredNodes.map((n) => n.id));
    return edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target));
  }, [edges, isDefaultActive, workspaceFilteredNodes]);

  // Pulse the "+" button when there's a single repo with no features and the
  // create-feature drawer is not open — draws attention to the next action.
  const isCreateDrawerOpen = pathname.startsWith('/create');
  const displayNodes = useMemo(() => {
    const source = workspaceFilteredNodes;
    const repoNodes = source.filter((n) => n.type === 'repositoryNode');
    const hasFeatures = source.some((n) => n.type === 'featureNode');
    const shouldPulse = repoNodes.length === 1 && !hasFeatures && !isCreateDrawerOpen;

    if (!shouldPulse) return source;

    return source.map((n) =>
      n.type === 'repositoryNode' ? { ...n, data: { ...n.data, pulseAdd: true } } : n
    );
  }, [workspaceFilteredNodes, isCreateDrawerOpen]);

  const handlePickFolder = useCallback(() => {
    window.dispatchEvent(new CustomEvent('shep:pick-folder'));
  }, []);

  // Re-fit the viewport when the active workspace's visible node set changes.
  // See use-workspace-fit-view.ts for the scoping rules.
  useWorkspaceFitView({
    activeWorkspace,
    isDefaultActive,
    workspaceFilteredNodes,
    fitView,
  });

  // When the active (non-default) workspace has no members but real canvas
  // content (repos or applications) exists, show a workspace-aware empty
  // state instead of the welcome wizard. The wizard would imply "no nodes
  // at all", which is wrong here — and crucially, leaves the workspace
  // selector visible via the toolbar so users can switch back to default.
  const workspaceFilteredEmpty =
    hasCanvasContent && !isDefaultActive && workspaceFilteredNodes.length === 0;

  const emptyStateNode = workspaceFilteredEmpty ? (
    <div className="pointer-events-auto flex h-full w-full flex-col items-center justify-center px-8">
      <div className="bg-primary/10 text-primary mb-5 flex h-12 w-12 items-center justify-center rounded-2xl">
        <Layers className="h-6 w-6" />
      </div>
      <h2 className="text-foreground/90 text-center text-2xl font-light tracking-tight">
        This workspace is empty
      </h2>
      <p className="text-muted-foreground mt-2 max-w-sm text-center text-sm leading-relaxed">
        Add repositories or features from the canvas, or switch back to the default workspace to see
        everything.
      </p>
      <div className="mt-6 flex items-center gap-2">
        <Button
          size="sm"
          onClick={() => setWorkspaceNewProjectOpen(true)}
          className="bg-blue-500 text-white hover:bg-blue-600"
        >
          <FolderPlus className="me-1.5 h-3.5 w-3.5" />
          New project
        </Button>
        <Button variant="outline" size="sm" onClick={() => setManageWorkspaceOpen(true)}>
          <Plus className="me-1.5 h-3.5 w-3.5" />
          Manage items
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setActiveWorkspace(DEFAULT_WORKSPACE_ID)}>
          Switch to Default
        </Button>
      </div>
    </div>
  ) : (
    <ControlCenterOnboarding onRepositorySelect={addRepoAndFocus} />
  );

  // ── Full-screen create prompt overlay ────────────────────────────────
  const [showCreatePrompt, setShowCreatePrompt] = useState(false);

  const featureFlags = useFeatureFlags();

  // (+) FAB actions — only visible on control center. Action list lives in
  // its own hook so this component stays focused on graph state + rendering.
  const fabActions = useFabActions({
    router,
    clickSound,
    guardedNavigate,
    handlePickFolder,
    onNewProject: () => setWorkspaceNewProjectOpen(true),
    onNewApplication: () => setShowCreatePrompt(true),
    featureFlags,
  });

  const canvasToolbar = (
    <CanvasToolbar
      showArchived={showArchived}
      onToggleArchived={() => setShowArchived(!showArchived)}
      onResetViewport={resetViewport}
      startSlot={
        <WorkspaceSelector
          workspaces={workspaces}
          activeWorkspace={activeWorkspace}
          onSelect={setActiveWorkspace}
          onRequestCreate={() => setCreateWorkspaceOpen(true)}
          onRequestRename={() => setRenameWorkspaceOpen(true)}
          onRequestDelete={(id) => {
            setPendingDeleteWorkspaceId(id);
            setDeleteWorkspaceOpen(true);
          }}
          onManage={() => setManageWorkspaceOpen(true)}
        />
      }
    />
  );

  return (
    <>
      <FeaturesCanvas
        nodes={showCanvas ? displayNodes : []}
        edges={showCanvas ? workspaceFilteredEdges : []}
        selectedFeatureId={selectedFeatureId}
        selectedRepository={selectedRepository}
        defaultViewport={defaultViewport}
        onNodesChange={onNodesChange}
        onConnect={handleConnect}
        onAddFeature={handleAddFeature}
        onNodeClick={handleNodeClick}
        onPaneClick={handleClearDrawers}
        onMoveEnd={handleMoveEnd}
        toolbar={canvasToolbar}
        showToolbarOnEmpty={workspaceFilteredEmpty}
        emptyState={emptyStateNode}
      />
      {/* (+) FAB — bottom-left, moves with sidebar */}
      {showCanvas ? <CreateFab actions={fabActions} /> : null}
      <NewProjectDialog
        open={workspaceNewProjectOpen}
        onOpenChange={setWorkspaceNewProjectOpen}
        onCreated={(path) => addRepoAndFocus(path)}
      />
      <ManageWorkspaceDialog
        open={manageWorkspaceOpen}
        onOpenChange={setManageWorkspaceOpen}
        workspace={activeWorkspace}
        allNodes={nodes}
        onSave={(members) => setWorkspaceMembers(activeWorkspace.id, members)}
      />
      <WorkspaceNameDialog
        open={createWorkspaceOpen}
        onOpenChange={setCreateWorkspaceOpen}
        title="New workspace"
        description="Create a workspace to filter the canvas to a specific set of repositories and features."
        confirmLabel="Create"
        onConfirm={(name) => {
          createWorkspace(name);
          setManageWorkspaceOpen(true);
        }}
      />
      <WorkspaceNameDialog
        open={renameWorkspaceOpen}
        onOpenChange={setRenameWorkspaceOpen}
        title="Rename workspace"
        initialValue={activeWorkspace.name}
        confirmLabel="Rename"
        onConfirm={(name) => renameWorkspace(activeWorkspace.id, name)}
      />
      <AlertDialog
        open={deleteWorkspaceOpen}
        onOpenChange={(open) => {
          setDeleteWorkspaceOpen(open);
          if (!open) setPendingDeleteWorkspaceId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete workspace?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the workspace &ldquo;
              {workspaces.find((w) => w.id === pendingDeleteWorkspaceId)?.name ??
                activeWorkspace.name}
              &rdquo;. The repositories and features themselves are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (pendingDeleteWorkspaceId) {
                  deleteWorkspace(pendingDeleteWorkspaceId);
                  setPendingDeleteWorkspaceId(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Full-screen create prompt overlay (replaces the old dialog) */}
      {showCreatePrompt ? (
        <div className="absolute inset-0 z-50">
          <ControlCenterEmptyState
            onRepositorySelect={(path) => {
              setShowCreatePrompt(false);
              addRepoAndFocus(path);
            }}
            onApplicationCreated={(appId) => {
              // Navigate first — keep overlay mounted to avoid canvas flash.
              // The overlay unmounts when the route changes.
              router.push(`/application/${appId}`);
            }}
            onClose={() => setShowCreatePrompt(false)}
            className="bg-background"
          />
        </div>
      ) : null}
    </>
  );
}

/** (+) FAB that tracks sidebar width via CSS var + transition.
 *  When fabLayout.swapPosition is true, moves to the end side (right in LTR). */
function CreateFab({ actions }: { actions: FloatingActionButtonAction[] }) {
  const { state } = useSidebar();
  const { i18n } = useTranslation('web');
  const { swapPosition } = useFabLayout();
  const isRtl = i18n.dir() === 'rtl';

  // Default: start side (left in LTR), tracking sidebar width
  // Swapped: end side (right in LTR), fixed 32px from edge
  if (swapPosition) {
    const positionStyle: React.CSSProperties = isRtl
      ? {
          left: 'calc(var(--sidebar-width-icon) + 32px)',
          transition: 'left 200ms ease-in-out',
        }
      : { right: '32px', transition: 'right 200ms ease-in-out' };

    return (
      <FloatingActionButton actions={actions} className="!fixed bottom-6" style={positionStyle} />
    );
  }

  // Sidebar expanded = var(--sidebar-width) = 16rem, collapsed = var(--sidebar-width-icon) = 3rem
  // Position just outside the sidebar edge with 16px gap
  const offset =
    state === 'expanded'
      ? 'calc(var(--sidebar-width) + 32px)'
      : 'calc(var(--sidebar-width-icon) + 32px)';

  const positionStyle: React.CSSProperties = isRtl
    ? { right: offset, transition: 'right 200ms ease-in-out' }
    : { left: offset, transition: 'left 200ms ease-in-out' };

  return (
    <FloatingActionButton actions={actions} className="!fixed bottom-6" style={positionStyle} />
  );
}
