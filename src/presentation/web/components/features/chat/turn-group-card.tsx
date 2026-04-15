'use client';

/**
 * TurnGroupCard
 *
 * One user-turn card in the chat thread. Two modes:
 *
 * - `completed`: collapsed by default, emerald check icon, click to
 *   reveal the persisted messages inside the turn. Matches the
 *   StepTracker visual language so "completed setup" and "completed
 *   user turn" read as siblings in the timeline.
 *
 * - `in-progress`: EXPANDED by default, non-collapsible, a spinning
 *   fuchsia indicator, title reads "Working on your request…". The
 *   parent renders the turn's persisted messages AND the live
 *   streaming indicator inside `children`, so the moment the user
 *   sends a message they see a new card pop in with the reply
 *   building up inside it — no stray "Thinking…" bubble in the
 *   flat thread.
 */

import { useState, type ReactNode } from 'react';
import { ChevronDown, CheckCircle2, MessageSquare, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TurnGroupCardProps {
  /** Stable id for React keys / aria-controls. */
  id: string;
  /** Human-readable title, e.g. "Working on: Fix login bug". */
  title: string;
  /** Number of assistant replies collected inside the turn. */
  assistantMessageCount: number;
  /** Render mode — see file header. */
  status: 'completed' | 'in-progress';
  /** Children rendered when the card is expanded (raw messages +
   *  the live streaming indicator for in-progress turns). */
  children?: ReactNode;
}

export function TurnGroupCard({
  id,
  title,
  assistantMessageCount,
  status,
  children,
}: TurnGroupCardProps) {
  const isInProgress = status === 'in-progress';
  // In-progress cards are always expanded; completed cards collapse
  // by default and only open on explicit click.
  const [userExpanded, setUserExpanded] = useState(false);
  const expanded = isInProgress || userExpanded;
  const contentId = `${id}-content`;

  return (
    <div
      className={cn(
        'mx-3 my-2 overflow-hidden rounded-lg border shadow-sm',
        'animate-in fade-in-0 slide-in-from-top-1 duration-200 ease-out',
        isInProgress
          ? 'border-fuchsia-500/40 bg-gradient-to-br from-fuchsia-500/5 via-purple-500/5 to-sky-500/5'
          : 'border-border/60 bg-card/40'
      )}
    >
      <button
        type="button"
        onClick={() => {
          if (!isInProgress) setUserExpanded((v) => !v);
        }}
        aria-expanded={expanded}
        aria-controls={contentId}
        disabled={isInProgress}
        className={cn(
          'group flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors',
          !isInProgress && 'hover:bg-muted/50 cursor-pointer'
        )}
      >
        <span
          className={cn(
            'flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
            isInProgress
              ? 'bg-gradient-to-br from-fuchsia-500 via-purple-500 to-sky-500 text-white shadow-sm'
              : 'bg-emerald-500/15'
          )}
        >
          {isInProgress ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
          )}
        </span>
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-[12px] font-medium',
            isInProgress ? 'text-fuchsia-700 dark:text-fuchsia-300' : 'text-foreground'
          )}
        >
          {isInProgress ? 'Working on your request…' : title}
        </span>
        {!isInProgress && assistantMessageCount > 0 ? (
          <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1 text-[10px]">
            <MessageSquare className="h-3 w-3" />
            {assistantMessageCount}
          </span>
        ) : null}
        {!isInProgress ? (
          <ChevronDown
            className={cn(
              'text-muted-foreground h-3.5 w-3.5 shrink-0 transition-transform',
              expanded && 'rotate-180'
            )}
          />
        ) : null}
      </button>
      {expanded ? (
        <div
          id={contentId}
          className={cn(
            'border-t px-3 py-2',
            isInProgress
              ? 'bg-background/60 border-fuchsia-500/20'
              : 'border-border/60 bg-background/40'
          )}
        >
          {children ?? <div className="text-muted-foreground text-[11px] italic">No content.</div>}
        </div>
      ) : null}
    </div>
  );
}
