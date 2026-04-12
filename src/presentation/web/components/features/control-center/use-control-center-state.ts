'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { Connection, Edge, NodeChange } from '@xyflow/react';
import type { FeatureNodeData } from '@/components/common/feature-node';
import type { RepositoryNodeData } from '@/components/common/repository-node';
import type { CanvasNodeType } from '@/components/features/features-canvas';
import {
  layoutWithDagre,
  getCanvasLayoutDefaults,
  type LayoutDirection,
} from '@/lib/layout-with-dagre';
import type { ApplicationNodeData } from '@/components/common/application-node/application-node-config';
import { archiveFeature } from '@/app/actions/archive-feature';
import { deleteFeature } from '@/app/actions/delete-feature';
import { resumeFeature } from '@/app/actions/resume-feature';
import { startFeature } from '@/app/actions/start-feature';
import { stopFeature } from '@/app/actions/stop-feature';
import { unarchiveFeature } from '@/app/actions/unarchive-feature';
import { addRepository } from '@/app/actions/add-repository';
import { deleteRepository } from '@/app/actions/delete-repository';
import { deleteApplication } from '@/app/actions/delete-application';
import { getFeatureMetadata } from '@/app/actions/get-feature-metadata';
import { useAgentEventsContext } from '@/hooks/agent-events-provider';
import { useDeploymentStatusContext } from '@/hooks/deployment-status-provider';
import { useSoundAction } from '@/hooks/use-sound-action';
import { createLogger } from '@/lib/logger';

import {
  mapEventTypeToState,
  resolveSseEventUpdates,
} from '@/components/common/feature-node/derive-feature-state';
import { useGraphState, type GraphCallbacks } from '@/hooks/use-graph-state';
import type { FeatureEntry } from '@/lib/derive-graph';

const log = createLogger('[Polling]');
const POLL_INTERVAL_MS = 15_000;

export interface ControlCenterState {
  nodes: CanvasNodeType[];
  edges: Edge[];
  onNodesChange: (changes: NodeChange<CanvasNodeType>[]) => void;
  handleConnect: (connection: Connection) => void;
  handleAddRepository: (path: string) => {
    wasEmpty: boolean;
    repoPath: string;
    tempNodeId: string;
  };
  handleLayout: (direction: LayoutDirection) => void;
  handleArchiveFeature: (featureId: string) => void;
  handleDeleteFeature: (
    featureId: string,
    cleanup?: boolean,
    cascadeDelete?: boolean,
    closePr?: boolean
  ) => void;
  handleRetryFeature: (featureId: string) => void;
  handleStartFeature: (featureId: string) => void;
  handleStopFeature: (featureId: string) => void;
  handleUnarchiveFeature: (featureId: string) => void;
  handleDeleteRepository: (
    repositoryId: string,
    options?: { deleteFromDisk?: boolean }
  ) => Promise<void>;
  handleDeleteApplication: (applicationId: string) => Promise<void>;
  createFeatureNode: (
    sourceNodeId: string | null,
    dataOverride?: Partial<FeatureNodeData>,
    edgeType?: string
  ) => string;
  /** Add an application node to the canvas optimistically. */
  addApplication: (nodeId: string, data: ApplicationNodeData) => void;
  /** Whether archived features are shown on the canvas. */
  showArchived: boolean;
  /** Toggle archived feature visibility. */
  setShowArchived: (show: boolean) => void;
  /** Stable lookup: repositoryPath for a feature node. */
  getFeatureRepositoryPath: (featureNodeId: string) => string | undefined;
  /** Stable lookup: repository data by nodeId. */
  getRepositoryData: (nodeId: string) => RepositoryNodeData | undefined;
  /** Sync callbacks into derived node data (does not trigger re-render). */
  setCallbacks: (callbacks: GraphCallbacks) => void;
}

/** Must match the message string emitted by the SSE route in agent-events/route.ts */
const METADATA_UPDATED_MESSAGE = 'Feature metadata updated';

let nextFeatureId = 0;
let nextRepoTempId = 0;

export function useControlCenterState(
  initialNodes: CanvasNodeType[],
  initialEdges: Edge[]
): ControlCenterState {
  const router = useRouter();
  const deleteSound = useSoundAction('delete');
  const createSound = useSoundAction('create');

  // Archive toggle: persists during session, resets on page reload (FR-10)
  const [showArchived, setShowArchived] = useState(false);

  const {
    nodes,
    edges,
    reconcile,
    updateFeature,
    addPendingFeature,
    removeFeature,
    restoreFeature,
    addRepository: addRepositoryToMap,
    removeRepository,
    replaceRepository,
    getFeatureRepositoryPath,
    getRepositoryData,
    getRepoMapSize,
    addApplication: addApplicationToMap,
    removeApplication,
    setCallbacks,
    beginMutation,
    endMutation,
    isMutating,
  } = useGraphState(initialNodes, initialEdges, showArchived);

  // Refs for stable access to latest nodes/edges without callback recreation
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  useEffect(() => {
    nodesRef.current = nodes;
    edgesRef.current = edges;
  }, [nodes, edges]);

  // Sync server props into domain Maps when initialNodes/initialEdges change.
  // Keyed by a stable string so we don't re-reconcile on every render.
  const initialNodeKey = useMemo(
    () =>
      initialNodes
        .map((n) => n.id)
        .sort()
        .join(','),
    [initialNodes]
  );
  const initialDataKey = useMemo(
    () =>
      initialNodes
        .filter((n) => n.type === 'featureNode')
        .map((n) => {
          const d = n.data as FeatureNodeData;
          return `${n.id}:${d.state}:${d.lifecycle}`;
        })
        .sort()
        .join(','),
    [initialNodes]
  );

  const prevReconcileKey = useRef('');

  useEffect(() => {
    const key = `${initialNodeKey}|${initialDataKey}`;
    if (key !== prevReconcileKey.current) {
      prevReconcileKey.current = key;
      reconcile(initialNodes, initialEdges);
    }
  }, [initialNodeKey, initialDataKey, initialNodes, initialEdges, reconcile]);

  // Track previous feature states for fallback notifications
  const prevFeatureStatesRef = useRef<Map<string, FeatureNodeData['state']>>(new Map());

  const { events } = useAgentEventsContext();
  const { store: deploymentStore } = useDeploymentStatusContext();

  useEffect(() => {
    const prevStates = prevFeatureStatesRef.current;
    for (const node of initialNodes) {
      if (node.type !== 'featureNode') continue;
      const data = node.data as FeatureNodeData;
      const prev = prevStates.get(node.id);
      if (prev !== undefined && prev !== data.state) {
        const sseAlreadyCovered = events.some(
          (e) => e.featureId === data.featureId && mapEventTypeToState(e.eventType) === data.state
        );
        if (!sseAlreadyCovered) {
          if (data.state === 'done') {
            toast.success(data.name, { description: 'Feature completed!' });
          } else if (data.state === 'action-required') {
            toast.warning(data.name, {
              description: 'Waiting for your approval',
              action: {
                label: 'Review',
                onClick: () => router.push(`/feature/${data.featureId}`),
              },
            });
          } else if (data.state === 'error') {
            toast.error(data.name, { description: data.errorMessage ?? 'Agent failed' });
          }
        }
      }
      prevStates.set(node.id, data.state);
    }
  }, [initialDataKey, initialNodes, events, router]);

  // SSE effect: only state + lifecycle updates
  const processedEventCountRef = useRef(0);

  useEffect(() => {
    // Clamp cursor if events were pruned
    if (processedEventCountRef.current > events.length) {
      processedEventCountRef.current = 0;
    }
    if (events.length <= processedEventCountRef.current) return;
    const newEvents = events.slice(processedEventCountRef.current);
    processedEventCountRef.current = events.length;

    for (const { featureId, state, lifecycle } of resolveSseEventUpdates(newEvents)) {
      if (state !== undefined || lifecycle !== undefined) {
        const nodeId = `feat-${featureId}`;
        const existingNode = nodesRef.current.find((n) => n.id === nodeId);
        const existingState = existingNode
          ? (existingNode.data as FeatureNodeData).state
          : undefined;

        // Skip SSE updates for features in 'deleting' state — the optimistic
        // delete state must not be overwritten by stale SSE events (e.g. agent
        // cancellation emitting AgentFailed during the soft-delete window).
        if (existingState === 'deleting') continue;

        // Skip SSE error events during mutation cooldown — after approve/reject
        // the agent may still report AgentFailed from the previous run before
        // the resume kicks in. The optimistic 'running' state must not be
        // overwritten by stale error events during this transition window.
        if (state === 'error' && isMutating() && existingState === 'running') continue;

        updateFeature(nodeId, {
          ...(state !== undefined && { state }),
          ...(lifecycle !== undefined && { lifecycle }),
        });
      }
    }
  }, [events, updateFeature, isMutating]);

  // Listen for optimistic approval/rejection events from the drawer (fires before SSE arrives).
  // Uses beginMutation + endMutation to prevent stale poll/reconcile data from overwriting
  // the optimistic 'running' state during the transition window (avoids brief "Something went wrong" flash).
  useEffect(() => {
    const handler = (e: Event) => {
      const { featureId } = (e as CustomEvent<{ featureId: string }>).detail;
      beginMutation();
      updateFeature(`feat-${featureId}`, { state: 'running' });
      endMutation();
    };
    window.addEventListener('shep:feature-approved', handler);
    return () => window.removeEventListener('shep:feature-approved', handler);
  }, [updateFeature, beginMutation, endMutation]);

  // Separate effect: fetch metadata (name + description) when SSE reports it changed
  const metadataFetchedRef = useRef<Set<string>>(new Set());
  const processedMetadataCountRef = useRef(0);

  useEffect(() => {
    // Clamp cursor if events were pruned
    if (processedMetadataCountRef.current > events.length) {
      processedMetadataCountRef.current = 0;
    }
    if (events.length <= processedMetadataCountRef.current) return;
    const newEvents = events.slice(processedMetadataCountRef.current);
    processedMetadataCountRef.current = events.length;

    for (const event of newEvents) {
      if (event.message !== METADATA_UPDATED_MESSAGE) continue;
      if (metadataFetchedRef.current.has(event.featureId)) continue;
      metadataFetchedRef.current.add(event.featureId);

      const nodeId = `feat-${event.featureId}`;
      getFeatureMetadata(event.featureId)
        .then((meta) => {
          if (meta) {
            updateFeature(nodeId, { name: meta.name, description: meta.description });
          }
        })
        .catch(() => {
          // Silent: metadata fetch failure is non-critical
        });
    }
  }, [events, updateFeature]);

  // --- Polling fallback: catch any SSE events that were missed ---
  useEffect(() => {
    log.debug(`polling enabled (${POLL_INTERVAL_MS}ms interval)`);

    const timer = setInterval(async () => {
      // Skip when tab is hidden — no point polling for a user who isn't looking.
      if (document.hidden) return;
      // Skip fetch entirely while a mutation is in-flight — the response
      // would contain pre-mutation data that reconcile would discard anyway.
      if (isMutating()) return;

      try {
        // Use a plain fetch instead of a server action so the poll
        // doesn't trigger the Next.js "Rendering…" indicator.
        const res = await fetch('/api/graph-data');
        if (!res.ok) throw new Error(`status ${res.status}`);
        const {
          nodes: freshNodes,
          edges: freshEdges,
          deployments: freshDeployments,
        } = await res.json();
        reconcile(freshNodes, freshEdges);
        if (Array.isArray(freshDeployments)) {
          deploymentStore.hydrate(freshDeployments);
        }
      } catch {
        log.warn('poll fetch failed — will retry next interval');
      }
    }, POLL_INTERVAL_MS);

    return () => {
      log.debug('polling disabled');
      clearInterval(timer);
    };
  }, [reconcile, isMutating, deploymentStore]);

  // onNodesChange is a no-op: nodes are derived from domain Maps.
  // Since nodesDraggable=false and elementsSelectable=false, only React Flow's
  // internal replace/dimensions changes come through — we ignore them all.
  const onNodesChange = useCallback((_changes: NodeChange<CanvasNodeType>[]) => {
    // Intentional no-op: domain Maps are the source of truth.
  }, []);

  const handleConnect = useCallback((_connection: Connection) => {
    // Connections are managed via domain operations, not direct edge manipulation.
  }, []);

  const createFeatureNode = useCallback(
    (
      sourceNodeId: string | null,
      dataOverride?: Partial<FeatureNodeData>,
      edgeType?: string
    ): string => {
      // Use real feature ID when available (from server), otherwise temp ID
      const id = dataOverride?.featureId
        ? `feat-${dataOverride.featureId}`
        : `feature-${Date.now()}-${nextFeatureId++}`;
      const newFeatureData: FeatureNodeData = {
        name: dataOverride?.name ?? 'New Feature',
        description: dataOverride?.description ?? 'Describe what this feature does',
        featureId: dataOverride?.featureId ?? `#${id.slice(-4)}`,
        lifecycle: 'requirements',
        state: dataOverride?.state ?? 'running',
        progress: 0,
        repositoryPath: dataOverride?.repositoryPath ?? '',
        branch: dataOverride?.branch ?? '',
      };

      const parentNodeId = edgeType === 'dependencyEdge' && sourceNodeId ? sourceNodeId : undefined;

      addPendingFeature(id, newFeatureData, parentNodeId);

      return id;
    },
    [addPendingFeature]
  );

  const handleRetryFeature = useCallback(
    (featureId: string) => {
      const nodeId = `feat-${featureId}`;
      // Optimistic: switch to running state
      beginMutation();
      updateFeature(nodeId, { state: 'running' });

      resumeFeature(featureId)
        .then((result) => {
          if (result.error) {
            updateFeature(nodeId, { state: 'error' });
            toast.error(result.error);
          } else {
            toast.success('Feature resumed');
          }
        })
        .catch(() => {
          updateFeature(nodeId, { state: 'error' });
          toast.error('Failed to resume feature');
        })
        .finally(() => endMutation());
    },
    [updateFeature, beginMutation, endMutation]
  );

  const handleStartFeature = useCallback(
    (featureId: string) => {
      const nodeId = `feat-${featureId}`;
      // Optimistic: switch to running state
      beginMutation();
      updateFeature(nodeId, { state: 'running' });

      startFeature(featureId)
        .then((result) => {
          if (result.error) {
            updateFeature(nodeId, { state: 'pending' });
            toast.error(result.error);
          } else {
            toast.success('Feature started');
          }
        })
        .catch(() => {
          updateFeature(nodeId, { state: 'pending' });
          toast.error('Failed to start feature');
        })
        .finally(() => endMutation());
    },
    [updateFeature, beginMutation, endMutation]
  );

  const handleStopFeature = useCallback(
    (featureId: string) => {
      beginMutation();

      stopFeature(featureId)
        .then((result) => {
          if (result.error) {
            toast.error(result.error);
          } else {
            toast.success('Agent stopped');
          }
        })
        .catch(() => {
          toast.error('Failed to stop agent');
        })
        .finally(() => endMutation());
    },
    [beginMutation, endMutation]
  );

  const handleArchiveFeature = useCallback(
    (featureId: string) => {
      const nodeId = `feat-${featureId}`;
      beginMutation();
      updateFeature(nodeId, { state: 'archived' });

      archiveFeature(featureId)
        .then((result) => {
          if (result.error) {
            updateFeature(nodeId, { state: 'done' });
            toast.error(result.error);
          } else {
            toast.success('Feature archived');
          }
        })
        .catch(() => {
          updateFeature(nodeId, { state: 'done' });
          toast.error('Failed to archive feature');
        })
        .finally(() => endMutation());
    },
    [updateFeature, beginMutation, endMutation]
  );

  const handleUnarchiveFeature = useCallback(
    (featureId: string) => {
      const nodeId = `feat-${featureId}`;
      beginMutation();
      updateFeature(nodeId, { state: 'done' });

      unarchiveFeature(featureId)
        .then((result) => {
          if (result.error) {
            updateFeature(nodeId, { state: 'archived' });
            toast.error(result.error);
          } else {
            toast.success('Feature unarchived');
          }
        })
        .catch(() => {
          updateFeature(nodeId, { state: 'archived' });
          toast.error('Failed to unarchive feature');
        })
        .finally(() => endMutation());
    },
    [updateFeature, beginMutation, endMutation]
  );

  const handleDeleteFeature = useCallback(
    (featureId: string, cleanup?: boolean, cascadeDelete?: boolean, closePr?: boolean) => {
      const nodeId = `feat-${featureId}`;
      const shouldCascade = cascadeDelete === true;

      // Collect all descendant feature node IDs (children, grandchildren, etc.)
      const descendants: string[] = [];
      if (shouldCascade) {
        const queue = [nodeId];
        while (queue.length > 0) {
          const current = queue.shift()!;
          for (const edge of edgesRef.current) {
            if (edge.type === 'dependencyEdge' && edge.source === current) {
              descendants.push(edge.target);
              queue.push(edge.target);
            }
          }
        }
      }

      // Snapshot current states for rollback (parent + descendants)
      const prevStates = new Map<string, FeatureNodeData['state']>();
      for (const nid of [nodeId, ...descendants]) {
        const node = nodesRef.current.find((n) => n.id === nid);
        if (node) {
          prevStates.set(nid, (node.data as FeatureNodeData).state);
        }
      }

      // Optimistic: show "deleting" state on parent (and descendants if cascading)
      beginMutation();
      updateFeature(nodeId, { state: 'deleting' });
      for (const childId of descendants) {
        updateFeature(childId, { state: 'deleting' });
      }
      deleteSound.play();
      router.push('/');

      deleteFeature(featureId, cleanup, cascadeDelete, closePr)
        .then((result) => {
          if (result.error) {
            // Rollback all to previous states
            for (const [nid, prevState] of prevStates) {
              if (prevState) updateFeature(nid, { state: prevState });
            }
            toast.error(result.error);
          } else {
            // Delete succeeded — remove features from the canvas.  The polling
            // reconcile would eventually clean them up, but we remove them
            // explicitly so the user sees them disappear promptly.
            removeFeature(nodeId);
            for (const childId of descendants) {
              removeFeature(childId);
            }
          }
        })
        .catch(() => {
          for (const [nid, prevState] of prevStates) {
            if (prevState) updateFeature(nid, { state: prevState });
          }
          toast.error('Failed to delete feature');
        })
        .finally(() => endMutation());
    },
    [router, deleteSound, updateFeature, removeFeature, beginMutation, endMutation]
  );

  const handleDeleteRepository = useCallback(
    async (repositoryId: string, options?: { deleteFromDisk?: boolean }) => {
      const repoNodeId = `repo-${repositoryId}`;

      // Find children of this repo via edges
      const childFeatureIds = new Set(
        edgesRef.current.filter((e) => e.source === repoNodeId).map((e) => e.target)
      );

      // Snapshot for rollback
      const prevRepoData = getRepositoryData(repoNodeId);
      const childSnapshots = new Map<string, FeatureEntry>();
      for (const childId of childFeatureIds) {
        const childNode = nodesRef.current.find((n) => n.id === childId);
        if (childNode) {
          childSnapshots.set(childId, { nodeId: childId, data: childNode.data as FeatureNodeData });
        }
      }

      const rollback = () => {
        if (prevRepoData) addRepositoryToMap(repoNodeId, prevRepoData);
        for (const [childId, entry] of childSnapshots) {
          restoreFeature(childId, entry);
        }
      };

      // Optimistic: remove repo + children
      beginMutation();
      removeRepository(repoNodeId);
      for (const childId of childFeatureIds) {
        removeFeature(childId);
      }

      try {
        const result = await deleteRepository(repositoryId, {
          deleteFromDisk: options?.deleteFromDisk === true,
        });
        if (!result.success) {
          toast.error(result.error ?? 'Failed to remove repository');
          rollback();
          return;
        }
        deleteSound.play();
      } catch {
        toast.error('Failed to remove repository');
        rollback();
      } finally {
        endMutation();
      }
    },
    [
      deleteSound,
      removeRepository,
      removeFeature,
      addRepositoryToMap,
      restoreFeature,
      getRepositoryData,
      beginMutation,
      endMutation,
    ]
  );

  const handleDeleteApplication = useCallback(
    async (applicationId: string) => {
      const appNodeId = `app-${applicationId}`;

      // Optimistic: remove application node
      beginMutation();
      removeApplication(appNodeId);
      deleteSound.play();

      try {
        const result = await deleteApplication(applicationId);
        if (result.error) {
          toast.error(result.error);
          // Rollback would require storing the previous data; for now we let
          // the next polling reconcile restore it if the delete actually failed.
        }
      } catch {
        toast.error('Failed to delete application');
      } finally {
        endMutation();
      }
    },
    [deleteSound, removeApplication, beginMutation, endMutation]
  );

  const handleLayout = useCallback(
    (direction: LayoutDirection) => {
      // Layout is applied via reconcile on next server prop update.
      // For immediate re-layout, we apply dagre and trigger a reconcile-like update.
      const result = layoutWithDagre(nodesRef.current, edgesRef.current, {
        ...getCanvasLayoutDefaults(),
        direction,
      });
      reconcile(result.nodes, result.edges);
    },
    [reconcile]
  );

  const handleAddRepository = useCallback(
    (path: string): { wasEmpty: boolean; repoPath: string; tempNodeId: string } => {
      const wasEmpty = getRepoMapSize() === 0;
      const tempId = `repo-temp-${++nextRepoTempId}`;
      const repoName =
        path
          .replace(/[\\/]+$/, '')
          .split(/[\\/]/)
          .pop() ?? path;

      beginMutation();
      addRepositoryToMap(tempId, {
        name: repoName,
        repositoryPath: path,
        id: tempId,
        createdAt: Date.now(),
        gitInfoStatus: 'loading',
      });

      addRepository({ path, name: repoName })
        .then((result) => {
          if (result.error) {
            removeRepository(tempId);
            toast.error(result.error);
            return;
          }
          const repo = result.repository!;
          const realId = `repo-${repo.id}`;
          replaceRepository(tempId, realId, {
            name: repo.name,
            repositoryPath: repo.path,
            id: repo.id,
            createdAt:
              repo.createdAt instanceof Date ? repo.createdAt.getTime() : Number(repo.createdAt),
          });
          createSound.play();
        })
        .catch(() => {
          removeRepository(tempId);
          toast.error('Failed to add repository');
        })
        .finally(() => endMutation());

      return { wasEmpty, repoPath: path, tempNodeId: tempId };
    },
    [
      addRepositoryToMap,
      removeRepository,
      replaceRepository,
      createSound,
      getRepoMapSize,
      beginMutation,
      endMutation,
    ]
  );

  return {
    nodes,
    edges,
    onNodesChange,
    handleConnect,
    handleAddRepository,
    handleArchiveFeature,
    handleLayout,
    handleDeleteFeature,
    handleRetryFeature,
    handleStartFeature,
    handleStopFeature,
    handleUnarchiveFeature,
    handleDeleteRepository,
    handleDeleteApplication,
    createFeatureNode,
    addApplication: addApplicationToMap,
    showArchived,
    setShowArchived,
    getFeatureRepositoryPath,
    getRepositoryData,
    setCallbacks,
  };
}
