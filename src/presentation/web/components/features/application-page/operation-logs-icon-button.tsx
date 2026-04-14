'use client';

/**
 * OperationLogsIconButton — the subtle discoverability affordance for
 * the OperationLogsDrawer. Renders as a tiny info icon tucked next to
 * the Deploy / Publish buttons. Never shouts, never dominates the row.
 *
 * Visual states:
 *   - idle       → muted info dot, 60% opacity → 100% on hover
 *   - running    → animated loader dot, primary tint
 *   - failed     → destructive tint to match the parent button's red border
 *
 * Click opens the slide-over drawer for this operation.
 */

import { Info, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

export type OperationLogsIconState = 'idle' | 'running' | 'failed' | 'success';

export interface OperationLogsIconButtonProps {
  state: OperationLogsIconState;
  onClick(): void;
  className?: string;
  /** Screen-reader label. */
  label?: string;
}

/**
 * Tiny info-icon affordance that opens the OperationLogsDrawer.
 *
 * Deliberately NON-spinning in the running state — the parent action button
 * (Deploy, Publish) already owns the motion indicator for "operation in
 * progress". Duplicating the spinner here would add visual noise without
 * adding information. Instead, running is communicated via a coloured
 * pulsing dot overlay on a static Info glyph, which the eye reads as
 * "there's something live here" without competing with the button's
 * primary spinner.
 */
export function OperationLogsIconButton({
  state,
  onClick,
  className,
  label = 'View operation logs',
}: OperationLogsIconButtonProps) {
  const Icon = state === 'failed' ? TriangleAlert : Info;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'relative inline-flex size-6 cursor-pointer items-center justify-center rounded-md transition-colors',
        state === 'idle' && 'text-muted-foreground/70 hover:text-foreground hover:bg-accent',
        state === 'running' && 'text-primary hover:bg-primary/10 hover:text-primary',
        state === 'failed' && 'text-destructive hover:bg-destructive/10 hover:text-destructive',
        state === 'success' && 'text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-600',
        className
      )}
    >
      <Icon className="size-3.5" />
      {state === 'running' ? (
        <span
          aria-hidden="true"
          className="bg-primary absolute end-0.5 top-0.5 size-1.5 animate-pulse rounded-full"
        />
      ) : null}
    </button>
  );
}
