/**
 * Cross-component request to bring a repository node into view on the
 * Control Center canvas.
 *
 * The session tree sub-nav and the canvas live in different React subtrees
 * (the tree is rendered by the `(dashboard)` layout, the canvas by
 * `ControlCenter`), so they talk over the same window CustomEvent bus the
 * canvas already uses for `shep:add-repository` and friends.
 */

/** Window CustomEvent name — canvas listens, other surfaces dispatch. */
export const FOCUS_REPOSITORY_EVENT = 'shep:focus-repository';

/** Node type of a repository card on the canvas. */
const REPOSITORY_NODE_TYPE = 'repositoryNode';

/** Identifies the repository to focus. `repositoryId` is absent for virtual repos. */
export interface FocusRepositoryDetail {
  repositoryId?: string;
  repositoryPath: string;
}

/** Minimal shape of a canvas node this module needs to match against. */
interface RepositoryNodeLike {
  id: string;
  type?: string;
  data: Record<string, unknown>;
}

/** Canvas node data stores forward-slash paths; callers may hold OS-native ones. */
function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Resolve the canvas node id for a repository, preferring the entity id
 * (stable) and falling back to the path (the only handle virtual repository
 * nodes have). Returns null when the repository isn't on the canvas — e.g.
 * filtered out by the active workspace.
 */
export function findRepositoryNodeId(
  nodes: readonly RepositoryNodeLike[],
  target: FocusRepositoryDetail
): string | null {
  const repoNodes = nodes.filter((n) => n.type === REPOSITORY_NODE_TYPE);

  if (target.repositoryId) {
    const byId = repoNodes.find((n) => n.data.id === target.repositoryId);
    if (byId) return byId.id;
  }

  const wanted = normalizePath(target.repositoryPath);
  const byPath = repoNodes.find(
    (n) =>
      typeof n.data.repositoryPath === 'string' && normalizePath(n.data.repositoryPath) === wanted
  );

  return byPath?.id ?? null;
}

/** Ask the canvas to pan/zoom onto the given repository node. */
export function requestRepositoryFocus(detail: FocusRepositoryDetail): void {
  window.dispatchEvent(new CustomEvent<FocusRepositoryDetail>(FOCUS_REPOSITORY_EVENT, { detail }));
}
