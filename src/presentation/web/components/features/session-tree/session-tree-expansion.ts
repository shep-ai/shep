/**
 * Session tree expansion state.
 *
 * Which repositories and features are expanded is pure presentation state, so
 * it lives client-side in localStorage — the same approach the theme and sidebar
 * state already use. Stored as the set of EXPANDED ids because the default is
 * collapsed, which keeps the payload proportional to what the user opened
 * rather than to how many repositories they track.
 *
 * Storage failures are swallowed: a private-mode browser or a full quota must
 * degrade to "nothing remembered", never break the panel.
 */

export const SESSION_TREE_STORAGE_KEY = 'shep.sessionTree.expanded';

export interface SessionTreeExpansion {
  /** Expanded repository paths */
  repositories: string[];
  /** Expanded feature ids */
  features: string[];
  /** Whether the whole panel is collapsed to its rail */
  panelCollapsed: boolean;
}

const EMPTY: SessionTreeExpansion = { repositories: [], features: [], panelCollapsed: false };

/** Parse persisted expansion state, tolerating anything malformed. */
export function parseExpansion(raw: string | null): SessionTreeExpansion {
  if (raw === null || raw === '') return EMPTY;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return EMPTY;

    const record = parsed as Record<string, unknown>;
    return {
      repositories: toStringArray(record.repositories),
      features: toStringArray(record.features),
      panelCollapsed: record.panelCollapsed === true,
    };
  } catch {
    // Corrupt value — treat as "nothing remembered" rather than throwing.
    return EMPTY;
  }
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

/** Read expansion state from localStorage. Safe to call when unavailable. */
export function loadExpansion(): SessionTreeExpansion {
  try {
    return parseExpansion(window.localStorage.getItem(SESSION_TREE_STORAGE_KEY));
  } catch {
    return EMPTY;
  }
}

/** Persist expansion state. Never throws. */
export function saveExpansion(expansion: SessionTreeExpansion): void {
  try {
    window.localStorage.setItem(SESSION_TREE_STORAGE_KEY, JSON.stringify(expansion));
  } catch {
    // Quota or private mode — remembering is best-effort.
  }
}

/** Toggle membership of `id` in a set, returning a new set. */
export function toggleInSet(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}
