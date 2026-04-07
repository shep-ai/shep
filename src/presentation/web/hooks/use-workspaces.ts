'use client';

/**
 * Playground prototype: client-side workspaces.
 *
 * ⚠️  PROTOTYPE BOUNDARY — DO NOT IMPORT FROM OUTSIDE THIS PROTOTYPE  ⚠️
 *
 * A workspace is a named, explicit allowlist of repositories and features
 * that should appear on the canvas. The "default" workspace is special: it
 * always shows everything (its allowlists are ignored).
 *
 * Persistence: localStorage only. There is no backend, no domain model, no
 * use cases, and no infrastructure adapter. Mutation rules ("default is
 * read-only", "default always exists", rename validation) are enforced
 * inline rather than as domain invariants.
 *
 * This file deliberately violates Clean Architecture by holding domain
 * shape (`Workspace`), application logic (mutations + invariants), and
 * infrastructure concerns (localStorage persistence) inside a React hook.
 * It exists ONLY to validate the workspace UX on the playground branch.
 *
 * Before promoting workspaces to a real feature, replace this file with:
 *   - tsp/Workspace.tsp                                — domain entity
 *   - application/ports/output/repositories/
 *       workspace.repository.interface.ts              — output port
 *   - application/use-cases/workspaces/
 *       create-workspace.use-case.ts
 *       rename-workspace.use-case.ts
 *       delete-workspace.use-case.ts
 *       set-workspace-members.use-case.ts
 *       list-workspaces.use-case.ts
 *       set-active-workspace.use-case.ts
 *   - infrastructure/repositories/sqlite-workspace.repository.ts
 *
 * Then this hook becomes a thin client wrapper that calls server actions
 * backed by those use cases. Until that refactor lands, the `Workspace`
 * type defined here MUST NOT be imported from any non-prototype code.
 */

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'shep:workspaces:v1';
export const DEFAULT_WORKSPACE_ID = 'default';
export const DEFAULT_WORKSPACE_NAME = 'Default';

export interface Workspace {
  id: string;
  name: string;
  /** Repository node IDs (React Flow node ids, e.g. "repo-..."). */
  repoIds: string[];
  /** Feature node IDs (React Flow node ids, e.g. "feat-..."). */
  featureIds: string[];
}

interface WorkspacesState {
  workspaces: Workspace[];
  activeWorkspaceId: string;
}

const INITIAL_STATE: WorkspacesState = {
  workspaces: [
    {
      id: DEFAULT_WORKSPACE_ID,
      name: DEFAULT_WORKSPACE_NAME,
      repoIds: [],
      featureIds: [],
    },
  ],
  activeWorkspaceId: DEFAULT_WORKSPACE_ID,
};

function loadState(): WorkspacesState {
  if (typeof window === 'undefined') return INITIAL_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL_STATE;
    const parsed = JSON.parse(raw) as Partial<WorkspacesState>;
    if (!parsed.workspaces || !Array.isArray(parsed.workspaces)) return INITIAL_STATE;
    // Make sure default workspace always exists
    const hasDefault = parsed.workspaces.some((w) => w.id === DEFAULT_WORKSPACE_ID);
    const workspaces = hasDefault
      ? parsed.workspaces
      : [INITIAL_STATE.workspaces[0]!, ...parsed.workspaces];
    return {
      workspaces,
      activeWorkspaceId: parsed.activeWorkspaceId ?? DEFAULT_WORKSPACE_ID,
    };
  } catch {
    return INITIAL_STATE;
  }
}

function saveState(state: WorkspacesState) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage may be unavailable (private mode); ignore.
  }
}

function generateId(): string {
  return `ws-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface UseWorkspacesResult {
  workspaces: Workspace[];
  activeWorkspace: Workspace;
  activeWorkspaceId: string;
  isDefaultActive: boolean;
  setActiveWorkspace: (id: string) => void;
  createWorkspace: (name: string) => Workspace;
  renameWorkspace: (id: string, name: string) => void;
  deleteWorkspace: (id: string) => void;
  setWorkspaceMembers: (id: string, members: { repoIds: string[]; featureIds: string[] }) => void;
  toggleRepoInActive: (repoId: string) => void;
  toggleFeatureInActive: (featureId: string) => void;
  /**
   * Append node IDs to the active workspace's allowlists. No-op when the
   * default workspace is active (it shows everything anyway). Idempotent —
   * IDs already present are skipped.
   */
  addToActiveWorkspace: (members: { repoIds?: string[]; featureIds?: string[] }) => void;
}

export function useWorkspaces(): UseWorkspacesResult {
  const [state, setState] = useState<WorkspacesState>(INITIAL_STATE);

  // Hydrate from localStorage on mount (client-only).
  useEffect(() => {
    setState(loadState());
  }, []);

  // Persist whenever state changes (after hydration).
  useEffect(() => {
    saveState(state);
  }, [state]);

  const setActiveWorkspace = useCallback((id: string) => {
    setState((prev) => {
      if (!prev.workspaces.some((w) => w.id === id)) return prev;
      return { ...prev, activeWorkspaceId: id };
    });
  }, []);

  const createWorkspace = useCallback((name: string): Workspace => {
    const trimmed = name.trim() || 'Untitled workspace';
    const next: Workspace = {
      id: generateId(),
      name: trimmed,
      repoIds: [],
      featureIds: [],
    };
    setState((prev) => ({
      workspaces: [...prev.workspaces, next],
      activeWorkspaceId: next.id,
    }));
    return next;
  }, []);

  const renameWorkspace = useCallback((id: string, name: string) => {
    if (id === DEFAULT_WORKSPACE_ID) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    setState((prev) => ({
      ...prev,
      workspaces: prev.workspaces.map((w) => (w.id === id ? { ...w, name: trimmed } : w)),
    }));
  }, []);

  const deleteWorkspace = useCallback((id: string) => {
    if (id === DEFAULT_WORKSPACE_ID) return;
    setState((prev) => {
      const workspaces = prev.workspaces.filter((w) => w.id !== id);
      const activeWorkspaceId =
        prev.activeWorkspaceId === id ? DEFAULT_WORKSPACE_ID : prev.activeWorkspaceId;
      return { workspaces, activeWorkspaceId };
    });
  }, []);

  const setWorkspaceMembers = useCallback(
    (id: string, members: { repoIds: string[]; featureIds: string[] }) => {
      if (id === DEFAULT_WORKSPACE_ID) return;
      setState((prev) => ({
        ...prev,
        workspaces: prev.workspaces.map((w) =>
          w.id === id
            ? { ...w, repoIds: [...members.repoIds], featureIds: [...members.featureIds] }
            : w
        ),
      }));
    },
    []
  );

  const toggleMember = useCallback((kind: 'repo' | 'feature', nodeId: string) => {
    setState((prev) => {
      if (prev.activeWorkspaceId === DEFAULT_WORKSPACE_ID) return prev;
      return {
        ...prev,
        workspaces: prev.workspaces.map((w) => {
          if (w.id !== prev.activeWorkspaceId) return w;
          const list = kind === 'repo' ? w.repoIds : w.featureIds;
          const nextList = list.includes(nodeId)
            ? list.filter((x) => x !== nodeId)
            : [...list, nodeId];
          return kind === 'repo' ? { ...w, repoIds: nextList } : { ...w, featureIds: nextList };
        }),
      };
    });
  }, []);

  const toggleRepoInActive = useCallback(
    (repoId: string) => toggleMember('repo', repoId),
    [toggleMember]
  );
  const toggleFeatureInActive = useCallback(
    (featureId: string) => toggleMember('feature', featureId),
    [toggleMember]
  );

  const addToActiveWorkspace = useCallback(
    (members: { repoIds?: string[]; featureIds?: string[] }) => {
      const incomingRepos = members.repoIds ?? [];
      const incomingFeatures = members.featureIds ?? [];
      if (incomingRepos.length === 0 && incomingFeatures.length === 0) return;

      setState((prev) => {
        if (prev.activeWorkspaceId === DEFAULT_WORKSPACE_ID) return prev;
        return {
          ...prev,
          workspaces: prev.workspaces.map((w) => {
            if (w.id !== prev.activeWorkspaceId) return w;
            const repoSet = new Set(w.repoIds);
            for (const id of incomingRepos) repoSet.add(id);
            const featureSet = new Set(w.featureIds);
            for (const id of incomingFeatures) featureSet.add(id);
            // Bail out if nothing actually changed — keeps referential equality
            // so downstream effects don't re-fire.
            if (repoSet.size === w.repoIds.length && featureSet.size === w.featureIds.length) {
              return w;
            }
            return {
              ...w,
              repoIds: Array.from(repoSet),
              featureIds: Array.from(featureSet),
            };
          }),
        };
      });
    },
    []
  );

  const activeWorkspace =
    state.workspaces.find((w) => w.id === state.activeWorkspaceId) ?? state.workspaces[0]!;

  return {
    workspaces: state.workspaces,
    activeWorkspace,
    activeWorkspaceId: state.activeWorkspaceId,
    isDefaultActive: state.activeWorkspaceId === DEFAULT_WORKSPACE_ID,
    setActiveWorkspace,
    createWorkspace,
    renameWorkspace,
    deleteWorkspace,
    setWorkspaceMembers,
    toggleRepoInActive,
    toggleFeatureInActive,
    addToActiveWorkspace,
  };
}
