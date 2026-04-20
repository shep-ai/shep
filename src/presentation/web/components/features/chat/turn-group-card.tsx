'use client';

/**
 * TurnGroupCard
 *
 * One user-turn card in the chat timeline. Each card has exactly two
 * visual states: **open** (header + body) and **closed** (header only).
 *
 * - **Completed** cards default to CLOSED. Click the chevron to open
 *   and reveal the `details` slot (raw bubbles: user message + tool
 *   events + assistant replies).
 * - **In-progress** cards default to OPEN showing the `condensed`
 *   slot (user request + friendly streaming indicator — never raw
 *   tool events, per `CLAUDE.md`'s layered rule). Clicking the
 *   chevron FULLY collapses the card to header-only.
 *
 * When a card transitions from in-progress to completed (agent
 * finishes), the body auto-closes so the timeline doesn't suddenly
 * sprout a bunch of raw-bubble tails across every finished turn.
 */

import { useEffect, useState, type ReactNode } from 'react';
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
  /** Body content for in-progress cards (user message + friendly
   *  streaming indicator). Only used when `status === 'in-progress'`. */
  condensed?: ReactNode;
  /** Body content for completed cards — raw bubbles, tool events,
   *  full history. Falls back to `children` if not provided. */
  details?: ReactNode;
  /** Legacy slot used by completed cards — equivalent to `details`. */
  children?: ReactNode;
}

export function TurnGroupCard({
  id,
  title,
  assistantMessageCount,
  status,
  condensed,
  details,
  children,
}: TurnGroupCardProps) {
  const isInProgress = status === 'in-progress';
  // Start OPEN for in-progress (user wants to see live progress),
  // CLOSED for completed (user has to click to open history).
  const [open, setOpen] = useState<boolean>(isInProgress);
  // When a card finishes, auto-collapse so the timeline stays
  // compact — the user can still click to expand the details.
  useEffect(() => {
    if (!isInProgress) setOpen(false);
  }, [isInProgress]);

  const contentId = `${id}-content`;
  const body = isInProgress ? condensed : (details ?? children ?? null);

  return (
    <div
      // `shrink-0` — direct child of the ThreadPrimitive.Viewport
      // flex-col. Without it a sibling card expanding (e.g. a deploy
      // log) squashes this card's header into its own border.
      className={cn(
        'mx-3 my-2 shrink-0 overflow-hidden rounded-lg border shadow-sm',
        'animate-in fade-in-0 slide-in-from-top-1 duration-200 ease-out',
        isInProgress
          ? 'border-fuchsia-500/40 bg-gradient-to-br from-fuchsia-500/5 via-purple-500/5 to-sky-500/5'
          : 'border-border/60 bg-card/40'
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={contentId}
        className={cn(
          'group flex min-h-12 w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left transition-colors',
          'hover:bg-muted/50'
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
        {assistantMessageCount > 0 ? (
          <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1 text-[10px]">
            <MessageSquare className="h-3 w-3" />
            {assistantMessageCount}
          </span>
        ) : null}
        <ChevronDown
          className={cn(
            'text-muted-foreground h-3.5 w-3.5 shrink-0 transition-transform',
            open && 'rotate-180'
          )}
        />
      </button>

      {open && body ? (
        <div
          id={contentId}
          className={cn(
            'border-t px-3 py-2',
            isInProgress
              ? 'bg-background/60 border-fuchsia-500/20'
              : 'border-border/60 bg-background/40'
          )}
        >
          {body}
        </div>
      ) : null}
    </div>
  );
}
