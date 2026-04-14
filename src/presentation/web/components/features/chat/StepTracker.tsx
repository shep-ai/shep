'use client';

import { useEffect, useState } from 'react';
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
  /**
   * Called when the user clicks "Continue" on an interrupted step.
   * Sends a message to the agent to resume from where it left off.
   */
  onRetry?: () => void;
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
  onRetry,
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
          className="hover:bg-muted/40 border-border bg-background flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors dark:bg-neutral-800/50"
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

  // Aggregate totals: total duration + total cost + total tokens
  // across every step. Rendered once every real step has timing
  // data so the user gets a single bottom-of-tracker summary. The
  // cost/tokens columns are omitted when none of the steps carry
  // usage metadata (e.g. a resumed workflow that finished before
  // usage snapshots were wired in).
  const totals = computeTotals(steps);

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
          onRetry={step.status === 'interrupted' ? onRetry : undefined}
        />
      ))}
      {totals ? (
        <li className="border-border/40 text-muted-foreground mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-[10px] tracking-wide uppercase">
          <span className="flex items-center gap-1">
            <span className="text-muted-foreground/70">Total</span>
            <span className="text-foreground font-semibold tracking-normal normal-case">
              {formatDuration(totals.durationMs)}
            </span>
          </span>
          {totals.costUsd > 0 ? (
            <span className="flex items-center gap-1">
              <span className="text-muted-foreground/70">Cost</span>
              <span className="text-foreground font-semibold tracking-normal normal-case">
                {formatCost(totals.costUsd)}
              </span>
            </span>
          ) : null}
          {totals.inputTokens > 0 || totals.outputTokens > 0 ? (
            <span className="flex items-center gap-1">
              <span className="text-muted-foreground/70">Tokens</span>
              <span className="text-foreground font-semibold tracking-normal normal-case">
                {formatTokens(totals.inputTokens)} in · {formatTokens(totals.outputTokens)} out
              </span>
            </span>
          ) : null}
        </li>
      ) : null}
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
  /** Called when the user clicks "Continue" on an interrupted step. */
  onRetry?: () => void;
}

/**
 * Classify a persisted assistant message into one visible item:
 *
 *   - `thinking` — the agent's extended-thinking block, rendered as
 *     a chrome-less inline row (label + chevron) so it visually
 *     recedes from the actual tool/output chain.
 *   - `tool` — a tool call (Bash / Read / Write / Edit / Grep / …),
 *     optionally paired with the adjacent `Output` result so one
 *     bubble carries BOTH the invocation input AND its stdout/
 *     contents response. Every tool render this way — no more two
 *     separate bubbles per call.
 *   - `text` — plain markdown prose block (the agent's final-word
 *     text for a step, e.g. the `report` step's summary).
 *
 * Pairing rule: when we see a tool message immediately followed by a
 * message whose label is `Output`, we consume both and emit ONE
 * paired item. Lone `Output` messages (no preceding tool call in this
 * step's buffer, which shouldn't happen but has shown up in practice
 * when SSE ordering jitters) fall back to rendering as an unpaired
 * tool item so nothing is silently lost.
 */
type StepItem =
  | { kind: 'thinking'; message: InteractiveMessage }
  | {
      kind: 'tool';
      message: InteractiveMessage;
      /** Paired `Output` message when the agent emitted one right after. */
      output: InteractiveMessage | null;
    }
  | { kind: 'text'; message: InteractiveMessage };

const OUTPUT_LABEL = 'Output';
const THINKING_LABEL = 'Thinking';

function classifyMessages(messages: InteractiveMessage[]): StepItem[] {
  // Pre-parse every message once so we can look ahead without
  // re-parsing inside the loop.
  const parsed = messages
    .map((m) => {
      const content = m.content?.trim() ?? '';
      return { message: m, content, event: content ? parseToolEvent(content) : null };
    })
    .filter((row) => row.content.length > 0);

  const items: StepItem[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const row = parsed[i]!;

    // Thinking gets its own bubble-less rendering path.
    if (row.event?.kind === 'tool' && row.event.name === THINKING_LABEL) {
      items.push({ kind: 'thinking', message: row.message });
      continue;
    }

    // A lone Output row (no preceding tool call we could pair it
    // with — already consumed below) renders as an unpaired tool
    // item. This is a fallback path that should rarely fire in
    // practice but keeps the data visible if SSE ordering ever
    // delivers Output before its parent tool.
    if (row.event?.kind === 'tool' && row.event.name === OUTPUT_LABEL) {
      items.push({ kind: 'tool', message: row.message, output: null });
      continue;
    }

    // Tool call — look ahead exactly one message and consume it if
    // it's an Output. This collapses the `Bash` + `Output` pair
    // that used to render as two stacked bubbles into one.
    if (row.event?.kind === 'tool') {
      const next = parsed[i + 1];
      const isOutputNext = next?.event?.kind === 'tool' && next.event.name === OUTPUT_LABEL;
      items.push({
        kind: 'tool',
        message: row.message,
        output: isOutputNext ? next.message : null,
      });
      if (isOutputNext) i++; // skip the paired Output on the next iteration
      continue;
    }

    // Label-only events (e.g. "Session started") still render as
    // unpaired tool items.
    if (row.event?.kind === 'label-only') {
      items.push({ kind: 'tool', message: row.message, output: null });
      continue;
    }

    // Plain prose — markdown renderer.
    items.push({ kind: 'text', message: row.message });
  }
  return items;
}

function StepCard({ step, liveStatus, mountIndex, onRetry }: StepCardProps) {
  const [optimisticRunning, setOptimisticRunning] = useState(false);
  // Clear optimistic override once the real status catches up
  useEffect(() => {
    if (step.status !== 'interrupted') setOptimisticRunning(false);
  }, [step.status]);
  const status = optimisticRunning ? 'running' : step.status;
  const [expanded, setExpanded] = useState(
    step.status === 'interrupted' || step.status === 'failed'
  );
  const { definition, metadata, toolMessages } = step;

  const details = readStringArray(metadata, 'details');
  const error = readString(metadata, 'error');
  const items = classifyMessages(toolMessages);
  // Live-ticking duration: for the currently running step we want the
  // pill to count up every second so the user sees elapsed time. For
  // finished steps we just render the static diff between startedAt
  // and finishedAt. Pending steps have no duration at all.
  const durationMs = useStepDurationMs(step, status);
  const costUsd = readNumber(metadata, 'costUsd');
  const inputTokens = readNumber(metadata, 'inputTokens');
  const outputTokens = readNumber(metadata, 'outputTokens');
  // Note: the `summary` metadata field is populated by the orchestrator
  // with `definition.title` on every step (see RunWorkflowUseCase), so
  // it is always a duplicate of the card header and is intentionally
  // NOT rendered — otherwise the expanded body would open with a copy
  // of the title right above the real content.
  const hasBody = items.length > 0 || details.length > 0 || !!error || status === 'interrupted';

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
          status === 'running' && 'border-violet-500/40 bg-violet-500/5 dark:bg-violet-500/10',
          status === 'done' && 'border-border bg-background dark:bg-neutral-800/50',
          status === 'pending' && 'border-border/40 bg-muted/20 dark:bg-neutral-800/30',
          status === 'failed' && 'border-red-500/40 bg-red-500/5 dark:bg-red-500/10',
          status === 'interrupted' && 'border-amber-500/40 bg-amber-500/5 dark:bg-amber-500/10'
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
              {status === 'interrupted' ? (
                <span className="min-w-0 truncate text-xs font-medium text-amber-600 dark:text-amber-400">
                  Interrupted
                </span>
              ) : liveStatus && status === 'running' ? (
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
            {durationMs !== null ? (
              <span
                className={cn(
                  'shrink-0 text-[10px] font-medium tabular-nums transition-colors duration-300',
                  status === 'running'
                    ? 'text-violet-600 dark:text-violet-300'
                    : 'text-muted-foreground/70'
                )}
                title={`Step duration — ${formatDuration(durationMs)}`}
              >
                {formatDuration(durationMs)}
              </span>
            ) : null}
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
            {status === 'interrupted' && !error ? (
              <div className="flex items-center justify-between rounded bg-amber-500/10 p-2">
                <span className="text-amber-700 dark:text-amber-400">
                  This step was interrupted before it could finish.
                </span>
                {onRetry ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOptimisticRunning(true);
                      setExpanded(false);
                      onRetry();
                    }}
                    className="ms-3 shrink-0 cursor-pointer rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-[11px] font-medium text-amber-700 transition-colors hover:bg-amber-500/20 dark:text-amber-400"
                  >
                    Continue
                  </button>
                ) : null}
              </div>
            ) : null}
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
            {costUsd > 0 || inputTokens > 0 || outputTokens > 0 ? (
              <div className="text-muted-foreground/70 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] tabular-nums">
                {costUsd > 0 ? <span>{formatCost(costUsd)}</span> : null}
                {inputTokens > 0 || outputTokens > 0 ? (
                  <span>
                    {formatTokens(inputTokens)} in · {formatTokens(outputTokens)} out
                  </span>
                ) : null}
              </div>
            ) : null}
            {items.length > 0 ? (
              <div className="-mx-1 flex flex-col gap-1">
                {items.map((item, idx) => {
                  const animStyle = {
                    animationDelay: `${Math.min(idx, 6) * 30}ms`,
                  } as const;
                  if (item.kind === 'thinking') {
                    return (
                      <div
                        key={item.message.id}
                        className="animate-in fade-in-0 slide-in-from-top-1 duration-200"
                        style={animStyle}
                      >
                        <ThinkingRow text={item.message.content} />
                      </div>
                    );
                  }
                  if (item.kind === 'tool') {
                    return (
                      <div
                        key={item.message.id}
                        className="animate-in fade-in-0 slide-in-from-top-1 duration-200"
                        style={animStyle}
                      >
                        <ToolBubble text={item.message.content} outputText={item.output?.content} />
                      </div>
                    );
                  }
                  return (
                    <div
                      key={item.message.id}
                      className="animate-in fade-in-0 slide-in-from-top-1 duration-200"
                      style={animStyle}
                    >
                      <div className="border-border/60 bg-background text-foreground rounded-md border px-2.5 py-1.5 text-xs leading-relaxed dark:bg-neutral-800/70">
                        <Markdown components={markdownComponents}>{item.message.content}</Markdown>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        </Collapsible.Content>
      </li>
    </Collapsible.Root>
  );
}

/**
 * Chrome-less "Thinking" row used for extended-thinking blocks
 * inside a step card. Intentionally NOT wrapped in the same
 * bordered chip as regular tool bubbles — thinking is meta-commentary
 * about the agent's reasoning, not a tool call, and should visually
 * recede into the background so the real tool/output chain stands
 * out. Collapsed by default; click the label + chevron to expand
 * and read the full reasoning block inline without a bordered box.
 */
function ThinkingRow({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  // Strip the `**Thinking** \`...\`` persistence wrapper so the
  // expanded body shows the raw reasoning text.
  const body = (() => {
    const event = parseToolEvent(text);
    if (event?.kind === 'tool' && event.name === 'Thinking') {
      return event.detail;
    }
    return text;
  })();
  return (
    <div className="flex max-w-full flex-col">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="text-muted-foreground/80 hover:text-foreground inline-flex items-center gap-1 self-start rounded px-1 py-0.5 text-[11px] italic transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 opacity-60" />
        )}
        <span>Thinking</span>
      </button>
      {expanded ? (
        <p className="text-muted-foreground/80 mt-0.5 ml-5 max-w-full text-[11px] leading-relaxed break-words whitespace-pre-wrap italic">
          {body}
        </p>
      ) : null}
    </div>
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
    return (
      <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white">
        <AlertTriangle className="h-2.5 w-2.5" strokeWidth={3} />
      </div>
    );
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

function readNumber(metadata: Record<string, unknown> | null, key: string): number {
  if (!metadata) return 0;
  const v = metadata[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/**
 * Millisecond-precision duration for a step. Returns:
 *  - null when pending (no startedAt yet)
 *  - a live-ticking value when running (updates every second so the
 *    user sees elapsed time count up inside the pill)
 *  - a static finishedAt - startedAt value when terminal
 */
function useStepDurationMs(
  step: EnhancedStepState,
  status: EnhancedStepState['status']
): number | null {
  // Tick state for running steps — forces a re-render every second so
  // `Date.now() - startedAt` advances in the rendered pill.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (status !== 'running' || step.startedAt === null) return undefined;
    const handle = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(handle);
  }, [status, step.startedAt]);
  // Silence unused-var warning without disabling the effect's contribution.
  void tick;

  if (step.startedAt === null) return null;
  if (status === 'running') return Math.max(0, Date.now() - step.startedAt);
  if (step.finishedAt === null) return null;
  return Math.max(0, step.finishedAt - step.startedAt);
}

/**
 * Human-friendly duration. Uses a compact form so the inline pill
 * stays narrow: `850ms`, `12s`, `3m 5s`, `1h 12m`.
 */
function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '';
  if (ms < 1_000) return `${Math.round(ms)}ms`;
  const totalSeconds = Math.round(ms / 1_000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return remMinutes === 0 ? `${hours}h` : `${hours}h ${remMinutes}m`;
}

/** USD cost formatted with enough precision to show sub-cent values. */
function formatCost(cost: number): string {
  if (!Number.isFinite(cost) || cost <= 0) return '$0';
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

/** Compact token count: 1.2k, 3.4M. */
function formatTokens(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return '0';
  if (count < 1_000) return String(Math.round(count));
  if (count < 1_000_000) return `${(count / 1_000).toFixed(count < 10_000 ? 1 : 0)}k`;
  return `${(count / 1_000_000).toFixed(1)}M`;
}

/**
 * Sum per-step timing + usage metadata into tracker-level totals.
 * Returns null when no real step has completed yet (no startedAt on
 * any card) so the bottom-of-tracker footer stays hidden for the
 * placeholder tracker and for freshly-booted workflows.
 */
function computeTotals(steps: EnhancedStepState[]): {
  durationMs: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
} | null {
  let earliestStart: number | null = null;
  let latestFinish: number | null = null;
  let costUsd = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  for (const step of steps) {
    if (step.startedAt !== null) {
      earliestStart =
        earliestStart === null ? step.startedAt : Math.min(earliestStart, step.startedAt);
    }
    // Use `now` for a still-running step so the footer ticks forward
    // with the step card. Terminal steps use their own finishedAt.
    const stepEnd = step.status === 'running' ? Date.now() : (step.finishedAt ?? null);
    if (stepEnd !== null) {
      latestFinish = latestFinish === null ? stepEnd : Math.max(latestFinish, stepEnd);
    }
    costUsd += readNumber(step.metadata, 'costUsd');
    inputTokens += readNumber(step.metadata, 'inputTokens');
    outputTokens += readNumber(step.metadata, 'outputTokens');
  }
  if (earliestStart === null || latestFinish === null) return null;
  return {
    durationMs: Math.max(0, latestFinish - earliestStart),
    costUsd,
    inputTokens,
    outputTokens,
  };
}
