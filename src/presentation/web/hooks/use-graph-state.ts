'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import type { Edge, Position } from '@xyflow/react';
import type { CanvasNodeType } from '@/components/features/features-canvas';
import type { FeatureNodeData } from '@/components/common/feature-node';
import type { RepositoryNodeData } from '@/components/common/repository-node';
import {
  deriveGraph,
  type FeatureEntry,
  type RepoEntry,
  type GraphCallbacks,
} from '@/lib/derive-graph';
import { layoutWithDagre, CANVAS_LAYOUT_DEFAULTS } from '@/lib/layout-with-dagre';

export type { GraphCallbacks } from '@/lib/derive-graph';

export interface UseGraphStateReturn {
  /** Derived React Flow nodes (from domain Maps). */
  nodes: CanvasNodeType[];
  /** Derived React Flow edges (from domain Maps). */
  edges: Edge[];
  /**
   * Reconcile domain Maps with fresh server data (new initialNodes/initialEdges).
   * Preserves pending (creating) nodes unless a matching real feature appears.
   * No-ops when a mutation is in-flight (see beginMutation/endMutation).
   */
  reconcile: (newNodes: CanvasNodeType[], newEdges: Edge[]) => void;
  /** Update a feature's state/lifecycle/name (e.g., from SSE events). */
  updateFeature: (featureNodeId: string, updates: FeatureDataUpdates) => void;
  /** Add a pending (optimistic) feature node (state='creating'). */
  addPendingFeature: (nodeId: string, data: FeatureNodeData, parentNodeId?: string) => void;
  /** Remove a pending feature node (e.g., on rollback). */
  removePendingFeature: (nodeId: string) => void;
  /** Remove a real feature node from the domain Map. */
  removeFeature: (nodeId: string) => void;
  /** Reparent direct children of a node to a new parent (or no parent). */
  relocateChildren: (parentNodeId: string, newParentNodeId?: string) => void;
  /**
   * Atomically remove a feature AND reparent its direct children in a single
   * state update.  Prevents intermediate renders where children still reference
   * a deleted parent, which causes them to disconnect from the graph.
   */
  removeFeatureAndRelocateChildren: (nodeId: string, newParentNodeId?: string) => void;
  /** Restore a previously removed feature (rollback). */
  restoreFeature: (nodeId: string, entry: FeatureEntry) => void;
  /** Add a repository node (may use a temp ID initially). */
  addRepository: (nodeId: string, data: RepositoryNodeData) => void;
  /** Remove a repository node. */
  removeRepository: (nodeId: string) => void;
  /** Replace a temp repo ID with the real one (atomic). */
  replaceRepository: (tempId: string, realId: string, data: RepositoryNodeData) => void;
  /** Stable lookup: get the parentNodeId for a feature node. */
  getFeatureParentNodeId: (featureNodeId: string) => string | undefined;
  /** Stable lookup: get the repositoryPath for a feature node. */
  getFeatureRepositoryPath: (featureNodeId: string) => string | undefined;
  /** Stable lookup: get repository node data by nodeId. */
  getRepositoryData: (nodeId: string) => RepositoryNodeData | undefined;
  /** Stable lookup: get the current number of repositories in the domain Map. */
  getRepoMapSize: () => number;
  /** Update callbacks injected into node data (does NOT trigger re-render). */
  setCallbacks: (callbacks: GraphCallbacks) => void;
  /**
   * Signal that an optimistic mutation has started. While any mutation is
   * in-flight, `reconcile` becomes a no-op so stale poll data cannot
   * overwrite optimistic state. Calls are ref-counted — nest freely.
   */
  beginMutation: () => void;
  /**
   * Signal that an optimistic mutation has resolved. Adds a one-poll-interval
   * cooldown (default 3 s) so the next poll fetches post-mutation data.
   */
  endMutation: (cooldownMs?: number) => void;
  /** Whether a mutation is currently in-flight (for polling skip logic). */
  isMutating: () => boolean;
}

/** Parse initialNodes + initialEdges into domain Maps. */
function parseMaps(
  initialNodes: CanvasNodeType[],
  initialEdges: Edge[]
): {
  featureMap: Map<string, FeatureEntry>;
  repoMap: Map<string, RepoEntry>;
} {
  // Build parentNodeId map from dependency edges
  const parentByChild = new Map<string, string>();
  for (const edge of initialEdges) {
    if (edge.type === 'dependencyEdge') {
      parentByChild.set(edge.target, edge.source);
    }
  }

  const featureMap = new Map<string, FeatureEntry>();
  const repoMap = new Map<string, RepoEntry>();

  for (const node of initialNodes) {
    if (node.type === 'featureNode') {
      featureMap.set(node.id, {
        nodeId: node.id,
        data: node.data as FeatureNodeData,
        parentNodeId: parentByChild.get(node.id),
      });
    } else if (node.type === 'repositoryNode') {
      repoMap.set(node.id, {
        nodeId: node.id,
        data: node.data as RepositoryNodeData,
      });
    }
  }

  return { featureMap, repoMap };
}

type FeatureDataUpdates = Partial<
  Pick<FeatureNodeData, 'state' | 'lifecycle' | 'name' | 'description'>
>;

function isFeatureDataUnchanged(data: FeatureNodeData, updates: FeatureDataUpdates): boolean {
  return (
    (updates.state === undefined || updates.state === data.state) &&
    (updates.lifecycle === undefined || updates.lifecycle === data.lifecycle) &&
    (updates.name === undefined || updates.name === data.name) &&
    (updates.description === undefined || updates.description === data.description)
  );
}

/**
 * Shallow-compare two Maps by key set and entry data (JSON equality).
 * Returns true if they are structurally identical, avoiding unnecessary re-renders.
 */
function mapsEqual<T extends { data: unknown; parentNodeId?: string }>(
  a: Map<string, T>,
  b: Map<string, T>
): boolean {
  if (a.size !== b.size) return false;
  for (const [key, aEntry] of a) {
    const bEntry = b.get(key);
    if (!bEntry) return false;
    if (aEntry.parentNodeId !== bEntry.parentNodeId) return false;
    if (aEntry.data === bEntry.data) continue;
    if (JSON.stringify(aEntry.data) !== JSON.stringify(bEntry.data)) return false;
  }
  return true;
}

export function useGraphState(
  initialNodes: CanvasNodeType[],
  initialEdges: Edge[]
): UseGraphStateReturn {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: parse only on mount (like useState initializer)
  const init = useMemo(() => parseMaps(initialNodes, initialEdges), []);

  const [featureMap, setFeatureMap] = useState<Map<string, FeatureEntry>>(init.featureMap);
  const [repoMap, setRepoMap] = useState<Map<string, RepoEntry>>(init.repoMap);
  const [pendingMap, setPendingMap] = useState<Map<string, FeatureEntry>>(
    new Map<string, FeatureEntry>()
  );

  // Buffer for SSE updates that arrive before their feature is in featureMap.
  // When reconcile adds new features, buffered updates are applied automatically.
  const pendingUpdatesRef = useRef<
    Map<string, Partial<Pick<FeatureNodeData, 'state' | 'lifecycle' | 'name' | 'description'>>>
  >(new Map());

  // Protect recently-added/replaced repos from stale-poll reconcile.
  // After addRepository or replaceRepository, the repo ID is marked as protected.
  // Once reconcile sees the repo in server data, the protection is cleared.
  // This prevents a stale poll (that fetched data before the server action completed)
  // from wiping a repo that the client has already added.
  const protectedRepoIdsRef = useRef<Set<string>>(new Set());

  // Mutation guard: ref-counted counter. While > 0, reconcile is a no-op
  // so stale poll data cannot overwrite optimistic state.
  const mutationCountRef = useRef(0);
  const mutationTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  // Track 'deleting' features that the server no longer returns.
  // Retained for one extra reconcile cycle so the user sees the deleting state
  // before the node disappears from the canvas.
  const deletingRetainedRef = useRef<Set<string>>(new Set());

  // Callbacks stored in a ref so changing them doesn't trigger re-render.
  // The stable wrapper object reads from the ref so node closures always use latest callbacks.
  const callbacksRef = useRef<GraphCallbacks>({});
  const stableCallbacks = useMemo<GraphCallbacks>(
    () => ({
      onNodeAction: (nodeId) => callbacksRef.current.onNodeAction?.(nodeId),
      onNodeSettings: (nodeId) => callbacksRef.current.onNodeSettings?.(nodeId),
      onFeatureDelete: (featureId) => callbacksRef.current.onFeatureDelete?.(featureId),
      onRepositoryAdd: (nodeId) => callbacksRef.current.onRepositoryAdd?.(nodeId),
      onRepositoryClick: (nodeId) => callbacksRef.current.onRepositoryClick?.(nodeId),
      onRepositoryDelete: (repositoryId) => callbacksRef.current.onRepositoryDelete?.(repositoryId),
      onRetryFeature: (featureId) => callbacksRef.current.onRetryFeature?.(featureId),
    }),
    []
  );

  // Stable refs for domain Maps (for use in callbacks without depending on state)
  const featureMapRef = useRef(featureMap);
  featureMapRef.current = featureMap;
  const repoMapRef = useRef(repoMap);
  repoMapRef.current = repoMap;

  // Derive graph from domain Maps (runs on every Map change, but dagre only on topology change)
  const derived = useMemo(
    () => deriveGraph(featureMap, repoMap, pendingMap, stableCallbacks),
    [featureMap, repoMap, pendingMap, stableCallbacks]
  );

  // Cache dagre layout positions — only re-run when node set or edge connections change
  const layoutCacheRef = useRef<{
    key: string;
    positions: Map<
      string,
      { position: { x: number; y: number }; targetPosition: Position; sourcePosition: Position }
    >;
  }>({ key: '', positions: new Map() });

  const { nodes, edges } = useMemo(() => {
    const nodeIds = derived.nodes
      .map((n) => n.id)
      .sort()
      .join(',');
    const edgeKeys = derived.edges
      .map((e) => `${e.source}-${e.target}`)
      .sort()
      .join(',');
    const topologyKey = `${nodeIds}|${edgeKeys}`;

    if (topologyKey !== layoutCacheRef.current.key) {
      // Topology changed — re-run dagre
      const result = layoutWithDagre(derived.nodes, derived.edges, CANVAS_LAYOUT_DEFAULTS);
      const positions = new Map<
        string,
        { position: { x: number; y: number }; targetPosition: Position; sourcePosition: Position }
      >();
      for (const node of result.nodes) {
        positions.set(node.id, {
          position: node.position,
          targetPosition: (node as Record<string, unknown>).targetPosition as Position,
          sourcePosition: (node as Record<string, unknown>).sourcePosition as Position,
        });
      }

      // Anchor new layout to previous positions so the graph doesn't drift.
      // Find the first surviving node (exists in both old and new layouts) and
      // shift the entire new layout by the delta between its old and new position.
      const prevPositions = layoutCacheRef.current.positions;
      if (prevPositions.size > 0) {
        let dx = 0;
        let dy = 0;
        for (const [id, newPos] of positions) {
          const oldPos = prevPositions.get(id);
          if (oldPos) {
            dx = oldPos.position.x - newPos.position.x;
            dy = oldPos.position.y - newPos.position.y;
            break;
          }
        }
        if (dx !== 0 || dy !== 0) {
          for (const pos of positions.values()) {
            pos.position = { x: pos.position.x + dx, y: pos.position.y + dy };
          }
          for (const node of result.nodes) {
            node.position = { x: node.position.x + dx, y: node.position.y + dy };
          }
        }
      }

      layoutCacheRef.current = { key: topologyKey, positions };
      return result;
    }

    // Data-only change — apply cached positions without re-running dagre
    const { positions } = layoutCacheRef.current;
    const nodes = derived.nodes.map((node) => {
      const cached = positions.get(node.id);
      return cached ? { ...node, ...cached } : node;
    });
    return { nodes, edges: derived.edges };
  }, [derived]);

  // --- Mutations ---

  const reconcile = useCallback((newNodes: CanvasNodeType[], newEdges: Edge[]) => {
    // Skip reconciliation while an optimistic mutation is in-flight.
    // Stale poll data fetched before the mutation completed would overwrite
    // the optimistic state, causing flicker (nodes disappearing/reappearing).
    if (mutationCountRef.current > 0) return;

    const { featureMap: newFeatureMap, repoMap: newRepoMap } = parseMaps(newNodes, newEdges);

    // Precompute match keys so we don't scan newFeatureMap.values() per pending entry
    const realFeatureKeys = new Set(
      [...newFeatureMap.values()].map((e) => `${e.data.name}\0${e.data.repositoryPath}`)
    );

    setFeatureMap((currentFeatureMap) => {
      // Preserve pending (creating) nodes unless matched by name+repositoryPath from newFeatureMap
      const pendingEntries = [...currentFeatureMap.entries()].filter(
        ([, e]) => e.data.state === 'creating'
      );

      const merged = new Map(newFeatureMap);

      // Keep pending nodes that don't have a real counterpart in new data
      for (const [tempId, pendingEntry] of pendingEntries) {
        const key = `${pendingEntry.data.name}\0${pendingEntry.data.repositoryPath}`;
        if (!realFeatureKeys.has(key)) {
          merged.set(tempId, pendingEntry);
        }
      }

      // Preserve 'deleting' state for features being deleted.
      // If the server still returns the feature, override its state to 'deleting'.
      // If the server no longer returns it (soft-deleted), retain it for one
      // extra reconcile cycle so the user sees the deleting animation.
      const nextRetained = new Set<string>();
      for (const [id, entry] of currentFeatureMap) {
        if (entry.data.state === 'deleting') {
          if (merged.has(id)) {
            // Server still has it — override state to keep showing 'deleting'
            merged.set(id, {
              ...merged.get(id)!,
              data: { ...merged.get(id)!.data, state: 'deleting' },
            });
          } else if (!deletingRetainedRef.current.has(id)) {
            // First reconcile after server removal — retain with deleting state
            merged.set(id, entry);
            nextRetained.add(id);
          }
          // else: already retained once — let it disappear
        }
      }
      deletingRetainedRef.current = nextRetained;

      // Apply any buffered SSE updates to features that now exist in the map
      for (const [nodeId, updates] of pendingUpdatesRef.current) {
        const entry = merged.get(nodeId);
        if (entry) {
          merged.set(nodeId, { ...entry, data: { ...entry.data, ...updates } });
          pendingUpdatesRef.current.delete(nodeId);
        }
      }

      // Avoid re-render when polling returns identical data
      if (mapsEqual(currentFeatureMap, merged)) return currentFeatureMap;
      return merged;
    });

    // Clean pendingMap entries that now have a real counterpart in server data
    setPendingMap((currentPendingMap) => {
      if (currentPendingMap.size === 0) return currentPendingMap;
      let changed = false;
      const next = new Map(currentPendingMap);
      for (const [tempId, pendingEntry] of currentPendingMap) {
        const key = `${pendingEntry.data.name}\0${pendingEntry.data.repositoryPath}`;
        if (realFeatureKeys.has(key)) {
          next.delete(tempId);
          changed = true;
        }
      }
      return changed ? next : currentPendingMap;
    });

    // Merge repoMap: preserve optimistic (temp) repos AND recently-added/replaced
    // repos that the server doesn't know about yet.  Without this, a polling
    // reconcile that fires before the server action returns (or uses stale data
    // from an in-flight fetch) would wipe the repo, causing a canvas→empty flicker.
    setRepoMap((currentRepoMap) => {
      // Start with everything the server returned
      const merged = new Map(newRepoMap);

      // Build a set of repositoryPaths present in server data for dedup
      const serverPaths = new Set([...newRepoMap.values()].map((e) => e.data.repositoryPath));

      for (const [id, entry] of currentRepoMap) {
        if (merged.has(id)) {
          // Server confirmed this repo — no longer needs protection
          protectedRepoIdsRef.current.delete(id);
          continue;
        }
        if (serverPaths.has(entry.data.repositoryPath)) {
          // Server has a repo with same path — clear protection
          protectedRepoIdsRef.current.delete(id);
          continue;
        }
        // Keep temp repos or protected (recently added/replaced) repos
        if (id.startsWith('repo-temp-') || protectedRepoIdsRef.current.has(id)) {
          merged.set(id, entry);
        }
      }

      // Avoid re-render when polling returns identical data
      if (mapsEqual(currentRepoMap, merged)) return currentRepoMap;
      return merged;
    });
  }, []);

  const updateFeature = useCallback((featureNodeId: string, updates: FeatureDataUpdates) => {
    setFeatureMap((prev) => {
      const entry = prev.get(featureNodeId);
      if (!entry) {
        // Feature not yet in map — buffer update for when reconcile adds it
        pendingUpdatesRef.current.set(featureNodeId, {
          ...pendingUpdatesRef.current.get(featureNodeId),
          ...updates,
        });
        return prev;
      }
      // Clear any buffered update for this feature since it's now in the map
      pendingUpdatesRef.current.delete(featureNodeId);
      if (isFeatureDataUnchanged(entry.data, updates)) return prev;
      const next = new Map(prev);
      next.set(featureNodeId, { ...entry, data: { ...entry.data, ...updates } });
      return next;
    });

    // Also check pendingMap
    setPendingMap((prev) => {
      const entry = prev.get(featureNodeId);
      if (!entry) return prev;
      if (isFeatureDataUnchanged(entry.data, updates)) return prev;
      const next = new Map(prev);
      next.set(featureNodeId, { ...entry, data: { ...entry.data, ...updates } });
      return next;
    });
  }, []);

  const addPendingFeature = useCallback(
    (nodeId: string, data: FeatureNodeData, parentNodeId?: string) => {
      setPendingMap((prev) => {
        const next = new Map(prev);
        next.set(nodeId, { nodeId, data, parentNodeId });
        return next;
      });
    },
    []
  );

  const removePendingFeature = useCallback((nodeId: string) => {
    setPendingMap((prev) => {
      if (!prev.has(nodeId)) return prev;
      const next = new Map(prev);
      next.delete(nodeId);
      return next;
    });
  }, []);

  const removeFeature = useCallback((nodeId: string) => {
    setFeatureMap((prev) => {
      if (!prev.has(nodeId)) return prev;
      const next = new Map(prev);
      next.delete(nodeId);
      return next;
    });
  }, []);

  const relocateChildren = useCallback((parentNodeId: string, newParentNodeId?: string) => {
    setFeatureMap((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const [id, entry] of prev) {
        if (entry.parentNodeId === parentNodeId) {
          next.set(id, { ...entry, parentNodeId: newParentNodeId });
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const removeFeatureAndRelocateChildren = useCallback(
    (nodeId: string, newParentNodeId?: string) => {
      setFeatureMap((prev) => {
        const next = new Map(prev);
        // Reparent direct children first, clearing any blocked-by state
        // that referenced the deleted parent.
        for (const [id, entry] of prev) {
          if (entry.parentNodeId === nodeId) {
            const updatedData = { ...entry.data };
            // If the child was blocked by the deleted parent, unblock it
            if (updatedData.blockedBy) {
              delete updatedData.blockedBy;
              if (updatedData.state === 'blocked') {
                updatedData.state = 'done';
              }
            }
            next.set(id, { ...entry, parentNodeId: newParentNodeId, data: updatedData });
          }
        }
        // Then remove the feature itself
        next.delete(nodeId);
        return next;
      });
    },
    []
  );

  const restoreFeature = useCallback((nodeId: string, entry: FeatureEntry) => {
    setFeatureMap((prev) => {
      const next = new Map(prev);
      next.set(nodeId, entry);
      return next;
    });
  }, []);

  const addRepository = useCallback((nodeId: string, data: RepositoryNodeData) => {
    protectedRepoIdsRef.current.add(nodeId);
    setRepoMap((prev) => {
      const next = new Map(prev);
      next.set(nodeId, { nodeId, data });
      return next;
    });
  }, []);

  const removeRepository = useCallback((nodeId: string) => {
    protectedRepoIdsRef.current.delete(nodeId);
    setRepoMap((prev) => {
      if (!prev.has(nodeId)) return prev;
      const next = new Map(prev);
      next.delete(nodeId);
      return next;
    });
  }, []);

  const replaceRepository = useCallback(
    (tempId: string, realId: string, data: RepositoryNodeData) => {
      protectedRepoIdsRef.current.delete(tempId);
      protectedRepoIdsRef.current.add(realId);
      setRepoMap((prev) => {
        if (!prev.has(tempId)) return prev;
        const next = new Map(prev);
        next.delete(tempId);
        next.set(realId, { nodeId: realId, data });
        return next;
      });
    },
    []
  );

  const getFeatureParentNodeId = useCallback((featureNodeId: string): string | undefined => {
    return featureMapRef.current.get(featureNodeId)?.parentNodeId;
  }, []);

  const getFeatureRepositoryPath = useCallback((featureNodeId: string): string | undefined => {
    return featureMapRef.current.get(featureNodeId)?.data.repositoryPath;
  }, []);

  const getRepositoryData = useCallback((nodeId: string): RepositoryNodeData | undefined => {
    return repoMapRef.current.get(nodeId)?.data;
  }, []);

  const getRepoMapSize = useCallback((): number => {
    return repoMapRef.current.size;
  }, []);

  const setCallbacks = useCallback((callbacks: GraphCallbacks) => {
    callbacksRef.current = callbacks;
  }, []);

  const beginMutation = useCallback(() => {
    mutationCountRef.current++;
  }, []);

  const endMutation = useCallback((cooldownMs = 3_000) => {
    // Delay decrement by one poll interval so the next fetch after the
    // mutation returns post-mutation data, not a stale in-flight response.
    const timer = setTimeout(() => {
      mutationCountRef.current = Math.max(0, mutationCountRef.current - 1);
      mutationTimersRef.current.delete(timer);
    }, cooldownMs);
    mutationTimersRef.current.add(timer);
  }, []);

  const isMutating = useCallback(() => mutationCountRef.current > 0, []);

  // Cleanup cooldown timers on unmount
  useEffect(() => {
    const timers = mutationTimersRef.current;
    return () => {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  return {
    nodes,
    edges,
    reconcile,
    updateFeature,
    addPendingFeature,
    removePendingFeature,
    removeFeature,
    relocateChildren,
    removeFeatureAndRelocateChildren,
    restoreFeature,
    addRepository,
    removeRepository,
    replaceRepository,
    getFeatureParentNodeId,
    getFeatureRepositoryPath,
    getRepositoryData,
    getRepoMapSize,
    setCallbacks,
    beginMutation,
    endMutation,
    isMutating,
  };
}
