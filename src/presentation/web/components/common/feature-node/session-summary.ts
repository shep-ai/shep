/**
 * Shared session-summary type and display helpers.
 *
 * Extracted so FeatureSessionsDropdown, SessionRow, and SessionsProvider agree
 * on one shape and one set of formatting rules, and so neither component file
 * exceeds the project's ~300-line limit.
 */

/** Client-side view of a core AgentSession, as serialized by the sessions API. */
export interface SessionSummary {
  id: string;
  agentType?: string;
  preview?: string | null;
  messageCount: number;
  firstMessageAt?: string | null;
  lastMessageAt?: string | null;
  createdAt?: string | null;
  projectPath?: string;
  /** Absolute path to the conversation file (e.g. JSONL) */
  filePath?: string;
}

/** A session counts as active when it was touched within this window. */
export const ACTIVE_THRESHOLD_MS = 5 * 60 * 1000;

export function isSessionActive(session: SessionSummary): boolean {
  if (!session.lastMessageAt) return false;
  return Date.now() - new Date(session.lastMessageAt).getTime() < ACTIVE_THRESHOLD_MS;
}

export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function truncatePreview(preview: string | null | undefined, maxLength = 40): string {
  if (!preview) return 'No preview';
  if (preview.length <= maxLength) return preview;
  return `${preview.slice(0, maxLength)}...`;
}
