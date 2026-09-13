'use client';

/**
 * FleetStatusBar (spec 111)
 *
 * Compact, pinned fleet health pill row: how many features are cruising, queued,
 * waiting on a human, and failed — plus the circuit breaker state and a single
 * entry point into the triage drawer.
 *
 * The point of the surface is that an operator running 50 agents does not have to
 * scan 50 canvas nodes to find the 5 that need them. So the bar reports the
 * exception count prominently and stays quiet about everything else.
 */

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { FleetStatusCounts } from '@shepai/core/domain/generated/output';

/** Visual state of the bar. `loading` and `error` replace the counts. */
export type FleetStatusBarState = 'loading' | 'ready' | 'error';

export interface FleetStatusBarProps {
  counts?: FleetStatusCounts;
  circuitBreakerTripped?: boolean;
  circuitBreakerReason?: string;
  state?: FleetStatusBarState;
  /** Error detail shown when `state` is `error`. */
  errorMessage?: string;
  onOpenTriage?: () => void;
  onRetry?: () => void;
  className?: string;
}

function Chip({
  label,
  value,
  tone = 'muted',
  title,
  testId,
}: {
  label: string;
  value: number;
  tone?: 'muted' | 'success' | 'warning' | 'danger';
  title?: string;
  testId?: string;
}) {
  const toneClass = {
    muted: 'text-muted-foreground',
    success: 'text-emerald-600 dark:text-emerald-400',
    warning: 'text-amber-600 dark:text-amber-400',
    danger: 'text-destructive',
  }[tone];

  // A zero in a muted tone is noise; only call attention to counts that exist.
  const dim = value === 0;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs',
        dim ? 'text-muted-foreground' : toneClass
      )}
      title={title}
      data-testid={testId}
    >
      <span className="font-semibold tabular-nums">{value}</span>
      <span>{label}</span>
    </span>
  );
}

export function FleetStatusBar({
  counts,
  circuitBreakerTripped = false,
  circuitBreakerReason,
  state = 'ready',
  errorMessage,
  onOpenTriage,
  onRetry,
  className,
}: FleetStatusBarProps) {
  if (state === 'loading') {
    return (
      <div
        className={cn(
          'bg-background/80 text-muted-foreground inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs shadow-sm backdrop-blur',
          className
        )}
        data-testid="fleet-status-bar"
        data-state="loading"
        aria-busy="true"
      >
        <span className="bg-muted-foreground/40 h-2 w-2 animate-pulse rounded-full" />
        Fleet status…
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div
        className={cn(
          'bg-background/80 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs shadow-sm backdrop-blur',
          className
        )}
        data-testid="fleet-status-bar"
        data-state="error"
      >
        <span className="text-destructive">Fleet unavailable</span>
        {errorMessage ? (
          <span className="text-muted-foreground max-w-[22rem] truncate" title={errorMessage}>
            {errorMessage}
          </span>
        ) : null}
        {onRetry ? (
          <Button type="button" variant="ghost" size="sm" className="h-6 px-2" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </div>
    );
  }

  if (!counts || counts.total === 0) {
    return (
      <div
        className={cn(
          'bg-background/80 text-muted-foreground inline-flex items-center rounded-full border px-3 py-1.5 text-xs shadow-sm backdrop-blur',
          className
        )}
        data-testid="fleet-status-bar"
        data-state="empty"
      >
        No active features
      </div>
    );
  }

  return (
    <div
      className={cn(
        'bg-background/80 inline-flex items-center gap-3 rounded-full border px-3 py-1.5 shadow-sm backdrop-blur',
        className
      )}
      data-testid="fleet-status-bar"
      data-state="ready"
      aria-label="Fleet status"
    >
      <span className="text-xs font-medium">Fleet</span>
      <Chip label="cruising" value={counts.cruising} tone="success" testId="fleet-count-cruising" />
      <Chip label="queued" value={counts.queued} testId="fleet-count-queued" />
      <Chip
        label="need you"
        value={counts.attentionNeeded}
        tone="warning"
        testId="fleet-count-attention"
      />
      <Chip label="failed" value={counts.failed} tone="danger" testId="fleet-count-failed" />

      {circuitBreakerTripped ? (
        <Badge
          variant="destructive"
          className="text-[10px]"
          title={circuitBreakerReason ?? 'Consecutive failure threshold reached'}
          data-testid="fleet-circuit-breaker"
        >
          breaker tripped
        </Badge>
      ) : null}

      {onOpenTriage ? (
        <Button
          type="button"
          variant={counts.attentionNeeded > 0 ? 'default' : 'ghost'}
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={onOpenTriage}
          data-testid="fleet-open-triage"
        >
          Triage{counts.attentionNeeded > 0 ? ` (${counts.attentionNeeded})` : ''}
        </Button>
      ) : null}
    </div>
  );
}
