'use client';

import { useState } from 'react';
import { Check, ChevronDown, ChevronRight, Circle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/spinner';
import type { EnhancedStepState } from './useChatRuntime';
import { ToolBubble } from './tool-bubble';

export interface StepTrackerProps {
  steps: EnhancedStepState[];
  className?: string;
  /**
   * When true, the tracker renders as a single collapsed "Initial
   * setup complete" summary card. Clicking it expands the full
   * 9-card breakdown inline. Used once the whole workflow has
   * finished — the user is now past setup and typically wants
   * the chat thread to breathe, not a tall tracker block.
   */
  collapsedSummary?: boolean;
}

/**
 * Vertical list of workflow step cards with a status indicator,
 * friendly title/description, and an expandable body. The expanded
 * view shows the step's metadata summary and any tool-event
 * messages (Bash, Read, Write, Edit, …) that the agent produced
 * while this step was active — the same bubble component the
 * regular thread would have used, just grouped by step.
 */
export function StepTracker({ steps, className, collapsedSummary }: StepTrackerProps) {
  const [expandedOverride, setExpandedOverride] = useState(false);
  if (steps.length === 0) return null;

  if (collapsedSummary && !expandedOverride) {
    const doneCount = steps.filter((s) => s.status === 'done').length;
    return (
      <div className={cn('p-4', className)}>
        <button
          type="button"
          onClick={() => setExpandedOverride(true)}
          className="hover:bg-muted/40 border-border bg-background flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors"
        >
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
            <Check className="h-4 w-4" strokeWidth={3} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Initial setup complete</div>
            <div className="text-muted-foreground text-xs">
              {doneCount} of {steps.length} steps finished — click to review
            </div>
          </div>
          <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
        </button>
      </div>
    );
  }

  return (
    <ol className={cn('flex flex-col gap-2 p-4', className)}>
      {collapsedSummary ? (
        <li>
          <button
            type="button"
            onClick={() => setExpandedOverride(false)}
            className="text-muted-foreground hover:text-foreground mb-1 inline-flex items-center gap-1 text-[10px] tracking-wide uppercase"
          >
            <ChevronDown className="h-3 w-3" />
            Collapse setup
          </button>
        </li>
      ) : null}
      {steps.map((step) => (
        <StepCard key={step.definition.id} step={step} />
      ))}
    </ol>
  );
}

interface StepCardProps {
  step: EnhancedStepState;
}

function StepCard({ step }: StepCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { status, definition, metadata, toolMessages } = step;

  const summary = readString(metadata, 'summary');
  const details = readStringArray(metadata, 'details');
  const error = readString(metadata, 'error');
  const hasBody = !!summary || details.length > 0 || toolMessages.length > 0 || !!error;

  return (
    <li
      className={cn(
        'rounded-lg border transition-colors',
        status === 'running' && 'border-emerald-500/40 bg-emerald-500/5',
        status === 'done' && 'border-border bg-background',
        status === 'pending' && 'border-border/40 bg-muted/20',
        status === 'failed' && 'border-red-500/40 bg-red-500/5',
        status === 'interrupted' && 'border-amber-500/40 bg-amber-500/5'
      )}
    >
      <button
        type="button"
        onClick={() => hasBody && setExpanded((v) => !v)}
        disabled={!hasBody}
        className={cn(
          'flex w-full items-center gap-3 px-3 py-2.5 text-left',
          hasBody && 'hover:bg-muted/40 cursor-pointer',
          !hasBody && 'cursor-default'
        )}
      >
        <StatusIcon status={status} />
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              'truncate text-sm font-medium',
              status === 'pending' && 'text-muted-foreground/60'
            )}
          >
            {definition.title}
          </div>
          {definition.description ? (
            <div
              className={cn(
                'truncate text-xs',
                status === 'pending' ? 'text-muted-foreground/40' : 'text-muted-foreground'
              )}
            >
              {definition.description}
            </div>
          ) : null}
        </div>
        {toolMessages.length > 0 ? (
          <span className="text-muted-foreground/60 mr-1 shrink-0 text-[10px] tabular-nums">
            {toolMessages.length}
          </span>
        ) : null}
        {hasBody ? (
          expanded ? (
            <ChevronDown className="text-muted-foreground h-4 w-4 shrink-0" />
          ) : (
            <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
          )
        ) : null}
      </button>
      {expanded && hasBody ? (
        <div className="border-border/40 space-y-2 border-t px-3 py-2.5 text-xs">
          {error ? (
            <p className="rounded bg-red-500/10 p-2 text-red-600 dark:text-red-400">{error}</p>
          ) : null}
          {summary ? <p className="text-foreground">{summary}</p> : null}
          {details.length > 0 ? (
            <ul className="text-muted-foreground list-disc space-y-0.5 ps-4">
              {details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          ) : null}
          {toolMessages.length > 0 ? (
            <div className="-mx-1 flex flex-col gap-1">
              {toolMessages.map((m) => (
                <ToolBubble key={m.id} text={m.content} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function StatusIcon({ status }: { status: EnhancedStepState['status'] }) {
  if (status === 'running') {
    return <Spinner size="sm" className="shrink-0 text-emerald-500" />;
  }
  if (status === 'done') {
    return (
      <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
        <Check className="h-3 w-3" strokeWidth={3} />
      </div>
    );
  }
  if (status === 'failed') {
    return (
      <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-red-500 text-white">
        <AlertTriangle className="h-2.5 w-2.5" strokeWidth={3} />
      </div>
    );
  }
  if (status === 'interrupted') {
    return <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />;
  }
  return <Circle className="text-muted-foreground/30 h-4 w-4 shrink-0" />;
}

function readString(metadata: Record<string, unknown> | null, key: string): string {
  if (!metadata) return '';
  const v = metadata[key];
  return typeof v === 'string' ? v : '';
}

function readStringArray(metadata: Record<string, unknown> | null, key: string): string[] {
  if (!metadata) return [];
  const v = metadata[key];
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}
