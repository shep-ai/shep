'use client';

import {
  ChevronRight,
  GitBranch,
  Sparkles,
  MessageSquare,
  Archive,
  FolderGit2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getAgentTypeIcon } from '@/components/common/feature-node/agent-type-icons';
import { formatRelativeTime } from '@/components/common/feature-node/session-summary';
import type {
  SessionTreeFeature,
  SessionTreeRepository,
  SessionTreeSession,
} from '@shepai/core/application/use-cases/agents/build-session-tree.use-case';

/** Indent per tree level, in rem. Kept small so three levels stay readable. */
const INDENT_REM = 0.75;

function Indent({ level }: { level: number }) {
  return <span style={{ width: `${level * INDENT_REM}rem` }} className="shrink-0" aria-hidden />;
}

/** Shared disclosure triangle. */
function Chevron({ open }: { open: boolean }) {
  return (
    <ChevronRight
      className={cn(
        'text-muted-foreground h-3 w-3 shrink-0 transition-transform',
        open && 'rotate-90'
      )}
      aria-hidden
    />
  );
}

// ── Session row ───────────────────────────────────────────────────────

export interface SessionTreeSessionRowProps {
  session: SessionTreeSession;
  level: number;
  onSelect?: (session: SessionTreeSession) => void;
  /** Rendered at the row's trailing edge — the action menu */
  actions?: React.ReactNode;
}

/**
 * One session. Adopted sessions are marked with a filled violet spark and
 * unadopted ones with the plain agent icon, so the distinction is visible
 * without hovering — which is the point of the tree.
 */
export function SessionTreeSessionRow({
  session,
  level,
  onSelect,
  actions,
}: SessionTreeSessionRowProps) {
  const AgentIcon = getAgentTypeIcon(session.agentType);

  return (
    <div
      className={cn(
        'group/row hover:bg-sidebar-accent flex items-center gap-1.5 rounded px-1 py-1 text-xs',
        session.archived && 'opacity-50'
      )}
      data-testid={`session-tree-session-${session.id}`}
      data-adopted={session.adopted}
      data-archived={session.archived}
    >
      <Indent level={level} />

      {session.adopted ? (
        <Sparkles
          className="h-3.5 w-3.5 shrink-0 text-violet-500"
          aria-label="Adopted as a feature"
        />
      ) : (
        <AgentIcon className="text-muted-foreground h-3.5 w-3.5 shrink-0" aria-hidden />
      )}

      <button
        type="button"
        className="min-w-0 flex-1 truncate text-start"
        onClick={() => onSelect?.(session)}
        title={session.preview ?? session.id}
      >
        {session.preview ?? session.id}
      </button>

      {session.archived ? (
        <Archive className="text-muted-foreground h-3 w-3 shrink-0" aria-label="Archived" />
      ) : null}

      <span className="text-muted-foreground flex shrink-0 items-center gap-0.5 text-[10px]">
        <MessageSquare className="h-2.5 w-2.5" aria-hidden />
        {session.messageCount}
      </span>

      {session.lastMessageAt ? (
        <span className="text-muted-foreground shrink-0 text-[10px]">
          {formatRelativeTime(session.lastMessageAt)}
        </span>
      ) : null}

      {actions ? (
        <span className="shrink-0 opacity-0 transition-opacity group-hover/row:opacity-100">
          {actions}
        </span>
      ) : null}
    </div>
  );
}

// ── Feature row ───────────────────────────────────────────────────────

export interface SessionTreeFeatureRowProps {
  feature: SessionTreeFeature;
  level: number;
  open: boolean;
  onToggle: () => void;
  onSelect?: (featureId: string) => void;
}

/** A feature, with the sessions it was adopted from nested beneath it. */
export function SessionTreeFeatureRow({
  feature,
  level,
  open,
  onToggle,
  onSelect,
}: SessionTreeFeatureRowProps) {
  const hasSessions = feature.sessions.length > 0;

  return (
    <div
      className="hover:bg-sidebar-accent flex items-center gap-1.5 rounded px-1 py-1 text-xs"
      data-testid={`session-tree-feature-${feature.id}`}
    >
      <Indent level={level} />

      <button
        type="button"
        onClick={onToggle}
        className="flex shrink-0 items-center"
        aria-label={open ? 'Collapse feature' : 'Expand feature'}
        aria-expanded={open}
        disabled={!hasSessions}
      >
        {hasSessions ? <Chevron open={open} /> : <span className="w-3" aria-hidden />}
      </button>

      <GitBranch className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />

      <button
        type="button"
        className="min-w-0 flex-1 truncate text-start font-medium"
        onClick={() => onSelect?.(feature.id)}
        title={feature.name}
      >
        {feature.name}
      </button>

      <span className="text-muted-foreground shrink-0 text-[10px]">{feature.lifecycle}</span>
    </div>
  );
}

// ── Repository row ────────────────────────────────────────────────────

export interface SessionTreeRepositoryRowProps {
  repository: SessionTreeRepository;
  open: boolean;
  onToggle: () => void;
}

export function SessionTreeRepositoryRow({
  repository,
  open,
  onToggle,
}: SessionTreeRepositoryRowProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="hover:bg-sidebar-accent flex w-full items-center gap-1.5 rounded px-1 py-1 text-xs font-semibold"
      data-testid={`session-tree-repo-${repository.name}`}
    >
      <Chevron open={open} />
      <FolderGit2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-start" title={repository.path}>
        {repository.name}
      </span>
      <span className="text-muted-foreground shrink-0 text-[10px] font-normal">
        {repository.sessionCount}
      </span>
    </button>
  );
}
