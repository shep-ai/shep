'use client';

/**
 * TurnGroupCard
 *
 * One user-turn card in the chat timeline. Two modes:
 *
 * - `completed`: collapsed by default, emerald check icon, click
 *   the chevron to reveal raw bubbles.
 *
 * - `in-progress`: the card's DEFAULT surface is the `condensed`
 *   slot — typically the user's request plus a friendly streaming
 *   indicator ("Working on…"), never raw tool events. The chevron
 *   progressively discloses the `details` slot containing every
 *   raw bubble (thinking / read / output / assistant text).
 *
 * This preserves the layered rule from `CLAUDE.md` in this
 * directory: by default the chat shows a high-level friendly
 * surface with the user request visible and nothing else raw.
 * Raw events are hidden behind a single click.
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
  /** Default visible content for in-progress cards (user message
   *  + friendly streaming indicator). Ignored for completed cards. */
  condensed?: ReactNode;
  /** Progressive-disclosure body revealed when the chevron is
   *  toggled — raw bubbles, tool events, full history. Falls back
   *  to `children` if not provided. */
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
  const [userExpanded, setUserExpanded] = useState(false);
  const contentId = `${id}-content`;
  const disclosureBody = details ?? children ?? null;

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
        onClick={() => setUserExpanded((v) => !v)}
        aria-expanded={userExpanded}
        aria-controls={contentId}
        className={cn(
          'group flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left transition-colors',
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
            userExpanded && 'rotate-180'
          )}
        />
      </button>

      {/* Default surface for in-progress cards — user request +
          friendly streaming indicator. Never raw tool events.
          Hidden while the chevron is expanded so the `details`
          body below becomes the single source of content and the
          user message doesn't render twice. */}
      {isInProgress && condensed && !userExpanded ? (
        <div className="border-border/60 bg-background/40 border-t px-3 py-2">{condensed}</div>
      ) : null}

      {/* Progressive disclosure: raw bubbles hidden until the
          chevron is clicked. */}
      {userExpanded ? (
        <div
          id={contentId}
          className={cn(
            'border-t px-3 py-2',
            isInProgress
              ? 'bg-background/60 border-fuchsia-500/20'
              : 'border-border/60 bg-background/40'
          )}
        >
          {disclosureBody ?? (
            <div className="text-muted-foreground text-[11px] italic">No content.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
