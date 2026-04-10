'use client';

import { useState } from 'react';
import { Collapsible } from 'radix-ui';
import { Check, ChevronDown, ChevronRight, Circle, AlertTriangle } from 'lucide-react';
import type { Components } from 'react-markdown';
import Markdown from 'react-markdown';
import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/spinner';
import type { InteractiveMessage } from '@shepai/core/domain/generated/output';
import type { EnhancedStepState } from './useChatRuntime';
import { ToolBubble, parseToolEvent } from './tool-bubble';

const markdownComponents: Components = {
  p: ({ children }) => <p className="mb-2 leading-relaxed last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  code: ({ children, className }) =>
    className ? (
      <code className={`${className} text-[11px]`}>{children}</code>
    ) : (
      <code className="bg-background/50 rounded-md px-1.5 py-0.5 font-mono text-[11px]">
        {children}
      </code>
    ),
  pre: ({ children }) => (
    <pre className="bg-background/50 my-2 overflow-x-auto rounded-md p-3 font-mono text-[11px] leading-relaxed">
      {children}
    </pre>
  ),
  ul: ({ children }) => <ul className="mb-2 list-disc ps-4 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal ps-4 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="mb-0.5">{children}</li>,
  h1: ({ children }) => <h1 className="mb-1 text-sm font-bold">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-1 text-sm font-bold">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1 text-xs font-semibold">{children}</h3>,
  a: ({ children, href }) => (
    <a href={href} className="text-blue-500 underline" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
};

export interface StepTrackerProps {
  steps: EnhancedStepState[];
  className?: string;
  /**
   * When true, the tracker renders as a single collapsed "Initial
   * setup complete" summary card. Clicking it expands the full
   * 8-card breakdown inline. Used once the whole workflow has
   * finished — the user is now past setup and typically wants
   * the chat thread to breathe, not a tall tracker block.
   */
  collapsedSummary?: boolean;
  /**
   * Id of the currently-running workflow step. Used to attach the
   * `liveStatus` indicator to the right card so the agent's in-flight
   * activity surfaces inline next to its spinner instead of as a
   * floating bubble below the tracker.
   */
  activeStepId?: string | null;
  /**
   * Short live-status string ("Thinking…", "Reading file X", a
   * truncated chunk of the streaming reply). Rendered inline inside
   * the running step card.
   */
  liveStatus?: string | null;
}

/**
 * Vertical list of workflow step cards with a status indicator,
 * friendly title/description, and an expandable body. The expanded
 * view shows the step's metadata summary and any tool-event
 * messages (Bash, Read, Write, Edit, …) that the agent produced
 * while this step was active — the same bubble component the
 * regular thread would have used, just grouped by step.
 */
export function StepTracker({
  steps,
  className,
  collapsedSummary,
  activeStepId,
  liveStatus,
}: StepTrackerProps) {
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
      {steps.map((step, idx) => (
        // Each card fades + slides in on mount, briefly staggered so
        // the tracker assembles itself instead of popping in all at
        // once. Capped at 6 indexes so very long step lists don't
        // turn into a long cascade.
        <StepCard
          key={step.definition.id}
          step={step}
          liveStatus={step.definition.id === activeStepId ? (liveStatus ?? null) : null}
          mountIndex={idx}
        />
      ))}
    </ol>
  );
}

interface StepCardProps {
  step: EnhancedStepState;
  /**
   * Short live-status string surfaced inline next to the spinner on
   * the running step. Null/empty for any step that isn't the
   * currently-active one (or when the agent is between turns).
   */
  liveStatus: string | null;
  /**
   * Position of this card in the tracker. Used to stagger the mount
   * animation so the cards cascade in instead of popping all at once.
   */
  mountIndex: number;
}

/**
 * Classify a persisted assistant message into exactly one visible item:
 *   - a tool bubble (Bash / Read / Write / Edit / …)
 *   - a plain markdown prose block (the agent's final-word text for a
 *     step, e.g. the "report" step's summary)
 *
 * Messages that parse as tool events render via `ToolBubble`, everything
 * else renders via `react-markdown`. Both flavours count toward the
 * step's badge — so "title-only" steps that previously looked empty now
 * show their text content inline.
 */
type StepItem =
  | { kind: 'tool'; message: InteractiveMessage }
  | { kind: 'text'; message: InteractiveMessage };

function classifyMessages(messages: InteractiveMessage[]): StepItem[] {
  const items: StepItem[] = [];
  for (const m of messages) {
    const content = m.content?.trim() ?? '';
    if (!content) continue;
    if (parseToolEvent(content)) {
      items.push({ kind: 'tool', message: m });
    } else {
      items.push({ kind: 'text', message: m });
    }
  }
  return items;
}

function StepCard({ step, liveStatus, mountIndex }: StepCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { status, definition, metadata, toolMessages } = step;

  const details = readStringArray(metadata, 'details');
  const error = readString(metadata, 'error');
  const items = classifyMessages(toolMessages);
  // Note: the `summary` metadata field is populated by the orchestrator
  // with `definition.title` on every step (see RunWorkflowUseCase), so
  // it is always a duplicate of the card header and is intentionally
  // NOT rendered — otherwise the expanded body would open with a copy
  // of the title right above the real content.
  const hasBody = items.length > 0 || details.length > 0 || !!error;

  return (
    <Collapsible.Root asChild open={expanded} onOpenChange={setExpanded}>
      <li
        className={cn(
          // `transition-colors` glides the border + background tint
          // when the status changes (pending → running → done) so the
          // tracker feels alive instead of snapping.
          'rounded-lg border transition-[background-color,border-color] duration-300 ease-out',
          // Mount animation: each card slides + fades in. The
          // staggered animationDelay below makes the whole tracker
          // assemble itself instead of popping in.
          'animate-in fade-in-0 slide-in-from-top-2',
          // Green is reserved for the DONE state (the universal "this
          // finished cleanly" signal). The running card uses Shep's
          // indigo/violet brand accent so the in-progress step is
          // visually distinct from anything that has already completed.
          status === 'running' && 'border-violet-500/40 bg-violet-500/5',
          status === 'done' && 'border-border bg-background',
          status === 'pending' && 'border-border/40 bg-muted/20',
          status === 'failed' && 'border-red-500/40 bg-red-500/5',
          status === 'interrupted' && 'border-amber-500/40 bg-amber-500/5'
        )}
        style={{ animationDelay: `${Math.min(mountIndex, 6) * 40}ms`, animationDuration: '300ms' }}
      >
        <Collapsible.Trigger asChild>
          <button
            type="button"
            disabled={!hasBody}
            className={cn(
              'flex w-full items-center gap-3 px-3 py-1.5 text-left transition-colors duration-200',
              hasBody && 'hover:bg-muted/40 cursor-pointer',
              !hasBody && 'cursor-default'
            )}
          >
            <StatusIcon status={status} />
            {/* Single-row title + subtle inline subtitle / live status. */}
            <div className="flex min-w-0 flex-1 items-baseline gap-2">
              <span
                className={cn(
                  'shrink-0 truncate text-sm font-medium transition-colors duration-300',
                  status === 'pending' && 'text-muted-foreground/60'
                )}
              >
                {definition.title}
              </span>
              {liveStatus && status === 'running' ? (
                // While the step is running, the live status preempts
                // the static description — same slot, more useful
                // information. The only place agent in-flight activity
                // surfaces while the workflow is active. Color matches
                // the card accent (violet) so green stays exclusive to
                // "done". `key={liveStatus}` retriggers the fade-in
                // every time the status text rotates, so consecutive
                // tool calls feel like they tick instead of swap.
                <span className="flex min-w-0 items-baseline gap-1.5 text-xs text-violet-700 dark:text-violet-300">
                  <span className="inline-flex h-1 w-1 shrink-0 translate-y-[-1px] animate-pulse rounded-full bg-violet-500" />
                  <span
                    key={liveStatus}
                    className="animate-in fade-in-0 slide-in-from-left-1 truncate duration-300"
                  >
                    {liveStatus}
                  </span>
                </span>
              ) : definition.description ? (
                <span
                  className={cn(
                    'min-w-0 truncate text-xs font-normal',
                    status === 'pending' ? 'text-muted-foreground/40' : 'text-muted-foreground/70'
                  )}
                >
                  {definition.description}
                </span>
              ) : null}
            </div>
            {items.length > 0 ? (
              <span
                key={items.length}
                className="text-muted-foreground/60 animate-in fade-in-0 zoom-in-95 mr-1 shrink-0 text-[10px] tabular-nums duration-200"
              >
                {items.length}
              </span>
            ) : null}
            {hasBody ? (
              <ChevronRight
                className={cn(
                  'text-muted-foreground h-4 w-4 shrink-0 transition-transform duration-200 ease-out',
                  expanded && 'rotate-90'
                )}
              />
            ) : null}
          </button>
        </Collapsible.Trigger>
        <Collapsible.Content
          className={cn(
            'overflow-hidden',
            // The keyframes (defined in globals.css) animate from
            // height: 0 ↔ var(--radix-collapsible-content-height) so
            // the body smoothly slides open and back. Both directions
            // get matching cubic-bezier curves — one ease-out for
            // open, one ease-in for close — so the motion never feels
            // lopsided.
            'data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up'
          )}
        >
          <div className="border-border/40 space-y-2 border-t px-3 py-2.5 text-xs">
            {error ? (
              <p className="rounded bg-red-500/10 p-2 text-red-600 dark:text-red-400">{error}</p>
            ) : null}
            {details.length > 0 ? (
              <ul className="text-muted-foreground list-disc space-y-0.5 ps-4">
                {details.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            ) : null}
            {items.length > 0 ? (
              <div className="-mx-1 flex flex-col gap-1">
                {items.map((item, idx) =>
                  item.kind === 'tool' ? (
                    <div
                      key={item.message.id}
                      className="animate-in fade-in-0 slide-in-from-top-1 duration-200"
                      style={{ animationDelay: `${Math.min(idx, 6) * 30}ms` }}
                    >
                      <ToolBubble text={item.message.content} />
                    </div>
                  ) : (
                    <div
                      key={item.message.id}
                      className="text-foreground animate-in fade-in-0 slide-in-from-top-1 px-1 text-xs leading-relaxed duration-200"
                      style={{ animationDelay: `${Math.min(idx, 6) * 30}ms` }}
                    >
                      <Markdown components={markdownComponents}>{item.message.content}</Markdown>
                    </div>
                  )
                )}
              </div>
            ) : null}
          </div>
        </Collapsible.Content>
      </li>
    </Collapsible.Root>
  );
}

function StatusIcon({ status }: { status: EnhancedStepState['status'] }) {
  if (status === 'running') {
    return <Spinner size="sm" className="shrink-0 text-violet-500" />;
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
