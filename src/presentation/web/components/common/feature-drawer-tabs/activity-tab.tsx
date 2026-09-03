'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Loader2,
  AlertCircle,
  Clock,
  Zap,
  Cpu,
  DollarSign,
  Play,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Square,
  Ban,
  MessageSquare,
  Timer,
  ArrowDownToLine,
  ArrowUpFromLine,
  Copy,
  Check,
} from 'lucide-react';
import type {
  PhaseTimingData,
  RejectionFeedbackData,
} from '@/app/actions/get-feature-phase-timings';
import { InlineAttachments } from '@/components/common/inline-attachments';
import { formatDuration } from '@/lib/format-duration';

/**
 * Computes the effective duration for a phase timing entry.
 * For completed phases, uses the server-provided durationMs.
 * For in-progress phases (has startedAt but no completedAt), computes
 * elapsed time client-side so the UI shows a live-updating timer.
 */
function getEffectiveDuration(timing: PhaseTimingData, now: number): number {
  if (timing.durationMs != null && timing.durationMs > 0) return timing.durationMs;
  if (!timing.completedAt && timing.startedAt) {
    const started = new Date(timing.startedAt).getTime();
    if (!Number.isNaN(started)) return Math.max(0, now - started);
  }
  return 0;
}

/** Returns true if any non-lifecycle phase is still in progress. */
function hasRunningPhase(timings: PhaseTimingData[]): boolean {
  return timings.some((t) => !t.phase.startsWith('run:') && !t.completedAt && t.startedAt);
}

/** Hook that ticks every second while there are running phases. */
function useTickingNow(timings: PhaseTimingData[] | null): number {
  const [now, setNow] = useState(Date.now);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const running = timings ? hasRunningPhase(timings) : false;
    if (running) {
      // Tick every second
      intervalRef.current = setInterval(() => setNow(Date.now()), 1000);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [timings]);

  return now;
}

/** Format a token count with K/M suffix for readability. */
function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

/** Format a timestamp to a short local time string (e.g. "10:05:30 AM"). */
function formatTimestamp(value: string | Date | unknown): string {
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** Format a USD cost with appropriate precision. */
function formatCost(usd: number): string {
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  if (usd >= 0.01) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(4)}`;
}

export interface ActivityTabProps {
  timings: PhaseTimingData[] | null;
  loading: boolean;
  error: string | null;
  rejectionFeedback?: RejectionFeedbackData[];
}

const NODE_TO_PHASE: Record<string, string> = {
  analyze: 'Analyzing',
  requirements: 'Requirements',
  research: 'Researching',
  plan: 'Planning',
  implement: 'Implementing',
  rebase: 'Rebasing',
  'fast-implement': 'Fast Implement',
  evidence: 'Evidence',
  validate: 'Validating',
  repair: 'Repairing',
  merge: 'Merging',
};

const LIFECYCLE_EVENTS: Record<
  string,
  { label: string; colorClass: string; bgClass: string; icon: typeof Play }
> = {
  'run:started': {
    label: 'started',
    colorClass: 'text-blue-600',
    bgClass: 'bg-blue-50 dark:bg-blue-950/30',
    icon: Play,
  },
  'run:resumed': {
    label: 'resumed',
    colorClass: 'text-blue-600',
    bgClass: 'bg-blue-50 dark:bg-blue-950/30',
    icon: RotateCcw,
  },
  'run:completed': {
    label: 'completed',
    colorClass: 'text-emerald-600',
    bgClass: 'bg-emerald-50 dark:bg-emerald-950/30',
    icon: CheckCircle2,
  },
  'run:failed': {
    label: 'failed',
    colorClass: 'text-red-600',
    bgClass: 'bg-red-50 dark:bg-red-950/30',
    icon: XCircle,
  },
  'run:stopped': {
    label: 'stopped',
    colorClass: 'text-amber-600',
    bgClass: 'bg-amber-50 dark:bg-amber-950/30',
    icon: Square,
  },
  'run:crashed': {
    label: 'crashed',
    colorClass: 'text-red-600',
    bgClass: 'bg-red-50 dark:bg-red-950/30',
    icon: XCircle,
  },
  'run:rejected': {
    label: 'rejected',
    colorClass: 'text-orange-600',
    bgClass: 'bg-orange-50 dark:bg-orange-950/30',
    icon: Ban,
  },
};

function isLifecycleEvent(phase: string): boolean {
  return phase.startsWith('run:');
}

/* ---------------------------------------------------------------------------
 * Lifecycle-aware view model
 * ------------------------------------------------------------------------- */

/**
 * A single iteration in the lifecycle timeline.
 *
 * An iteration represents one cycle of work:
 *   started/resumed → phase work → rejected/completed/failed
 *
 * Each rejected iteration has associated rejection feedback.
 */
export interface TimelineIteration {
  /** 1-based iteration number */
  number: number;
  /** The timing events in this iteration */
  timings: PhaseTimingData[];
  /** If this iteration ended with rejection, the feedback message */
  rejectionMessage?: string;
  /** If this iteration ended with rejection, any attachments */
  rejectionAttachments?: string[];
}

/**
 * Build a lifecycle-aware timeline from flat timing events and rejection feedback.
 *
 * Splits the timing stream at run:rejected boundaries to produce iterations.
 * Each rejection feedback entry is matched to its iteration by index.
 *
 * When there are more feedback entries than run:rejected events in the timings,
 * synthetic run:rejected + run:resumed events are appended to ensure every
 * feedback entry is represented.
 */
export function buildLifecycleTimeline(
  timings: PhaseTimingData[],
  feedback?: RejectionFeedbackData[]
): TimelineIteration[] {
  if (!timings.length) return [];

  // Count existing run:rejected events
  const existingRejectionCount = timings.filter((t) => t.phase === 'run:rejected').length;
  const feedbackCount = feedback?.length ?? 0;

  // Augment timings with synthetic rejection/resumed cycles for unmatched feedback
  let augmented = timings;
  if (feedbackCount > existingRejectionCount) {
    augmented = [...timings];

    // Use last timing's agentRunId as template
    const templateRunId = timings[timings.length - 1].agentRunId;

    for (let i = existingRejectionCount; i < feedbackCount; i++) {
      const fb = feedback![i];
      // Add run:resumed before work (except for the first synthetic, which continues from existing)
      if (i > existingRejectionCount) {
        augmented.push({
          agentRunId: templateRunId,
          phase: 'run:resumed',
          startedAt: fb.timestamp ?? `synthetic-resumed-${i}`,
        });
      }
      // Add run:rejected
      augmented.push({
        agentRunId: templateRunId,
        phase: 'run:rejected',
        startedAt: fb.timestamp ?? `synthetic-${i}`,
      });
    }
  }

  // Split into iterations at run:rejected boundaries
  const iterations: TimelineIteration[] = [];
  let currentEvents: PhaseTimingData[] = [];
  let rejectionIndex = 0;

  for (const t of augmented) {
    currentEvents.push(t);

    if (t.phase === 'run:rejected') {
      const fb = feedback?.[rejectionIndex];
      iterations.push({
        number: iterations.length + 1,
        timings: currentEvents,
        rejectionMessage: fb?.message,
        rejectionAttachments: fb?.attachments,
      });
      currentEvents = [];
      rejectionIndex++;
    }
  }

  // Remaining events after last rejection (or all events if no rejections)
  if (currentEvents.length > 0) {
    iterations.push({
      number: iterations.length + 1,
      timings: currentEvents,
    });
  }

  return iterations;
}

/** Determine the outcome status of an iteration */
function getIterationOutcome(
  iteration: TimelineIteration
): { label: string; colorClass: string; dotClass: string } | null {
  const lastLifecycle = [...iteration.timings].reverse().find((t) => isLifecycleEvent(t.phase));
  if (!lastLifecycle) return null;

  switch (lastLifecycle.phase) {
    case 'run:rejected':
      return { label: 'Rejected', colorClass: 'text-orange-600', dotClass: 'bg-orange-500' };
    case 'run:completed':
      return { label: 'Completed', colorClass: 'text-emerald-600', dotClass: 'bg-emerald-500' };
    case 'run:failed':
      return { label: 'Failed', colorClass: 'text-red-600', dotClass: 'bg-red-500' };
    case 'run:crashed':
      return { label: 'Crashed', colorClass: 'text-red-600', dotClass: 'bg-red-500' };
    case 'run:stopped':
      return { label: 'Stopped', colorClass: 'text-amber-600', dotClass: 'bg-amber-500' };
    default:
      return null;
  }
}

/* ---------------------------------------------------------------------------
 * Component
 * ------------------------------------------------------------------------- */

export function ActivityTab({ timings, loading, error, rejectionFeedback }: ActivityTabProps) {
  const { t } = useTranslation('web');
  const now = useTickingNow(timings);

  if (loading) {
    return (
      <div data-testid="activity-tab-loading" className="flex items-center justify-center p-8">
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 p-4 text-base text-red-600">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>{error}</span>
      </div>
    );
  }

  if (!timings || timings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-8">
        <Clock className="text-muted-foreground h-8 w-8" />
        <p className="text-muted-foreground text-base">{t('activityTab.noActivityRecorded')}</p>
      </div>
    );
  }

  const nodeTimings = timings.filter((t) => !isLifecycleEvent(t.phase));
  const maxDurationMs = Math.max(
    ...nodeTimings.map((t) => getEffectiveDuration(t, now)),
    ...nodeTimings.map((t) => t.approvalWaitMs ?? 0),
    0
  );

  const iterations = buildLifecycleTimeline(timings, rejectionFeedback);
  const hasMultipleIterations = iterations.length > 1;

  const totalExecMs = nodeTimings.reduce((sum, t) => sum + getEffectiveDuration(t, now), 0);
  const totalWaitMs = nodeTimings.reduce((sum, t) => sum + (t.approvalWaitMs ?? 0), 0);
  const totalInputTokens = nodeTimings.reduce((sum, t) => sum + (t.inputTokens ?? 0), 0);
  const totalOutputTokens = nodeTimings.reduce((sum, t) => sum + (t.outputTokens ?? 0), 0);
  const totalCostUsd = nodeTimings.reduce((sum, t) => sum + (t.costUsd ?? 0), 0);

  return (
    <div className="flex flex-col gap-3 p-4">
      <div data-testid="activity-timings" className="flex flex-col gap-3">
        {iterations.map((iteration) => (
          <IterationGroup
            key={iteration.number}
            iteration={iteration}
            showHeader={hasMultipleIterations}
            maxDurationMs={maxDurationMs}
            now={now}
          />
        ))}
      </div>
      {totalExecMs > 0 ? (
        <SummaryTotals
          totalExecMs={totalExecMs}
          totalWaitMs={totalWaitMs}
          totalInputTokens={totalInputTokens}
          totalOutputTokens={totalOutputTokens}
          totalCostUsd={totalCostUsd}
        />
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Iteration group — one cycle of work
 * ------------------------------------------------------------------------- */

function IterationGroup({
  iteration,
  showHeader,
  maxDurationMs,
  now,
}: {
  iteration: TimelineIteration;
  showHeader: boolean;
  maxDurationMs: number;
  now: number;
}) {
  const outcome = getIterationOutcome(iteration);

  return (
    <div
      data-testid={`iteration-${iteration.number}`}
      className="border-border/50 bg-card/50 flex flex-col overflow-hidden rounded-lg border"
    >
      {/* Iteration header */}
      {showHeader ? (
        <div className="bg-muted/30 border-border/50 flex items-center justify-between border-b px-3 py-1.5">
          <span className="text-muted-foreground text-sm font-semibold tracking-wide">
            Iteration {iteration.number}
          </span>
          {outcome ? (
            <span className={`flex items-center gap-1 text-xs font-medium ${outcome.colorClass}`}>
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${outcome.dotClass}`} />
              {outcome.label}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Timeline content */}
      <div className="relative flex flex-col">
        {/* Vertical timeline line — centered on 20px dots with px-3 (12px) left padding: 12 + 10 - 0.5 = 21.5px */}
        <div className="bg-border/60 absolute top-4 bottom-4 left-[21.5px] w-px" />

        {iteration.timings.map((t, idx) => {
          if (isLifecycleEvent(t.phase)) {
            const isRejection = t.phase === 'run:rejected';
            const isFailure =
              t.phase === 'run:failed' || t.phase === 'run:crashed' || t.phase === 'run:stopped';
            // For failures, find the last phase with an error message in this iteration
            let message: string | undefined;
            if (isRejection) {
              message = iteration.rejectionMessage;
            } else if (isFailure) {
              const lastErrorPhase = [...iteration.timings]
                .reverse()
                .find((p) => !isLifecycleEvent(p.phase) && p.errorMessage);
              message = lastErrorPhase?.errorMessage ?? t.errorMessage;
            }
            return (
              <LifecycleEventRow
                key={`${t.agentRunId}-${t.phase}-${t.startedAt}`}
                timing={t}
                message={message}
                attachments={isRejection ? iteration.rejectionAttachments : undefined}
                isFirst={idx === 0}
                isLast={idx === iteration.timings.length - 1}
              />
            );
          }
          return (
            <NodeTimingRow
              key={`${t.agentRunId}-${t.phase}-${t.startedAt}`}
              timing={t}
              maxDurationMs={maxDurationMs}
              now={now}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Row components
 * ------------------------------------------------------------------------- */

function LifecycleEventRow({
  timing,
  message,
  attachments,
  isFirst,
  isLast,
}: {
  timing: PhaseTimingData;
  message?: string;
  attachments?: string[];
  isFirst?: boolean;
  isLast?: boolean;
}) {
  const event = LIFECYCLE_EVENTS[timing.phase];
  if (!event) return null;

  const hasAttachments = attachments && attachments.length > 0;
  const Icon = event.icon;

  return (
    <div
      className={`relative flex flex-col gap-1 px-3 ${isFirst ? 'pt-2' : 'pt-1'} ${isLast ? 'pb-2' : 'pb-1'}`}
    >
      <div className="flex items-center gap-2">
        {/* Timeline dot */}
        <div
          className={`relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${event.bgClass}`}
        >
          <Icon className={`h-3 w-3 ${event.colorClass}`} />
        </div>

        {/* Label */}
        <span className={`text-sm font-medium ${event.colorClass}`}>{event.label}</span>

        {/* Timestamp */}
        {timing.startedAt &&
        !(typeof timing.startedAt === 'string' && timing.startedAt.startsWith('synthetic')) ? (
          <span className="text-muted-foreground/60 ml-auto text-xs tabular-nums">
            {formatTimestamp(String(timing.startedAt))}
          </span>
        ) : null}
      </div>

      {/* Feedback / error message */}
      {message
        ? (() => {
            const isError =
              timing.phase === 'run:failed' ||
              timing.phase === 'run:crashed' ||
              timing.phase === 'run:stopped';
            return (
              <div
                className={`ml-[26px] flex items-start gap-1.5 rounded-md px-2 py-1.5 ${
                  isError
                    ? 'bg-red-50/50 dark:bg-red-950/20'
                    : 'bg-orange-50/50 dark:bg-orange-950/20'
                }`}
              >
                {isError ? (
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
                ) : (
                  <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-400" />
                )}
                <span
                  data-testid={isError ? 'error-message-text' : 'rejection-feedback-text'}
                  className="text-muted-foreground text-xs leading-relaxed italic"
                >
                  &mdash; {message}
                </span>
              </div>
            );
          })()
        : null}
      {hasAttachments ? (
        <div data-testid="rejection-feedback-attachments" className="ml-[26px]">
          <InlineAttachments text="" attachmentPaths={attachments} />
        </div>
      ) : null}
    </div>
  );
}

function NodeTimingRow({
  timing,
  maxDurationMs,
  now,
}: {
  timing: PhaseTimingData;
  maxDurationMs: number;
  now: number;
}) {
  const { t } = useTranslation('web');
  const base = timing.phase.includes(':') ? timing.phase.split(':')[0] : timing.phase;
  const suffix = timing.phase.includes(':') ? timing.phase.split(':')[1] : null;
  const isSubPhase = suffix !== null;
  const isImplPhase = suffix?.startsWith('phase-') ?? false;
  const baseName = NODE_TO_PHASE[base] ?? base;
  const label = isImplPhase
    ? `Phase ${suffix!.replace('phase-', '')}`
    : suffix !== null
      ? `${baseName} #${suffix}`
      : baseName;

  const durationMs = getEffectiveDuration(timing, now);
  const isRunning = !timing.completedAt && !!timing.startedAt;
  // Running phases get a minimum 15% bar so they're always visually prominent
  const minPercent = isRunning ? 15 : 2;
  const barPercent =
    maxDurationMs > 0 ? Math.max(minPercent, (durationMs / maxDurationMs) * 100) : minPercent;
  const barColorClass = timing.completedAt
    ? isImplPhase
      ? 'bg-emerald-400'
      : isSubPhase
        ? 'bg-amber-500'
        : 'bg-emerald-500'
    : 'bg-blue-500';
  const totalTokens =
    timing.inputTokens != null || timing.outputTokens != null
      ? (timing.inputTokens ?? 0) + (timing.outputTokens ?? 0)
      : null;

  const [copied, setCopied] = useState(false);
  const handleCopyPrompt = useCallback(() => {
    if (!timing.prompt) return;
    navigator.clipboard.writeText(timing.prompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [timing.prompt]);

  return (
    <div
      className={`group/phase relative flex flex-col gap-0.5 px-3 py-1.5 ${isSubPhase ? 'ms-4' : ''}`}
    >
      <div data-testid={`timing-bar-${timing.phase}`} className="flex items-center gap-2">
        {/* Timeline dot */}
        <div className="relative z-10 flex h-5 w-5 shrink-0 items-center justify-center">
          <div
            className={`rounded-full ${isRunning ? 'h-3 w-3 animate-pulse' : 'h-2.5 w-2.5'} ${
              isRunning
                ? 'bg-blue-500'
                : timing.completedAt
                  ? 'bg-emerald-500'
                  : 'bg-muted-foreground/30'
            }`}
          />
        </div>

        {/* Phase label — fixed width so all bars align in a single column */}
        <span
          className={`w-28 shrink-0 truncate text-sm font-medium ${
            isSubPhase ? 'text-muted-foreground' : 'text-foreground/80'
          }`}
        >
          {label}
        </span>

        {/* Copy prompt button — appears on hover */}
        {timing.prompt ? (
          <button
            type="button"
            onClick={handleCopyPrompt}
            className="text-muted-foreground/50 hover:text-foreground/70 -ms-1 shrink-0 opacity-0 transition-opacity group-hover/phase:opacity-100"
            title={t('activityTab.copyPromptToClipboard')}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        ) : null}

        {/* Progress bar */}
        <div
          className={`bg-muted relative min-w-0 flex-1 overflow-hidden rounded-full ${isSubPhase ? 'h-1.5' : 'h-2'}`}
        >
          {isRunning ? (
            <div
              className="absolute inset-0 rounded-full bg-blue-500/30"
              style={{
                backgroundImage:
                  'linear-gradient(90deg, transparent 0%, rgb(59 130 246) 50%, transparent 100%)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 1.5s ease-in-out infinite',
              }}
            />
          ) : (
            <div
              className={`h-full rounded-full transition-all duration-300 ${barColorClass}`}
              style={{ width: `${Math.min(barPercent, 100)}%` }}
            />
          )}
        </div>

        {/* Duration */}
        <span className="text-muted-foreground w-14 shrink-0 text-end text-sm font-medium tabular-nums">
          {formatDuration(durationMs)}
        </span>
      </div>

      {/* Metrics row (timestamp + tokens + cost) */}
      <div className="ml-[28px] flex items-center gap-3 text-xs">
        {timing.startedAt ? (
          <span className="text-muted-foreground/60 tabular-nums">
            {formatTimestamp(timing.startedAt)}
          </span>
        ) : null}
        {totalTokens != null && totalTokens > 0 ? (
          <span className="text-muted-foreground/70 inline-flex items-center gap-0.5">
            <Zap className="h-3 w-3 opacity-50" />
            {formatTokens(totalTokens)}
          </span>
        ) : null}
        {timing.costUsd != null && timing.costUsd > 0 ? (
          <span className="text-muted-foreground/70 inline-flex items-center gap-0.5">
            <DollarSign className="h-3 w-3 opacity-50" />
            {formatCost(timing.costUsd)}
          </span>
        ) : null}
        {/* Which model actually ran this phase. Constant across a run normally,
            but the whole point of adaptive selection is that it varies. */}
        {timing.modelId ? (
          <span
            className="text-muted-foreground/70 inline-flex items-center gap-0.5"
            data-testid={`timing-model-${timing.phase}`}
            title={t('activityTab.modelUsed', { model: timing.modelId })}
          >
            <Cpu className="h-3 w-3 opacity-50" />
            <span className="font-mono">{timing.modelId}</span>
          </span>
        ) : null}
      </div>

      {/* Approval wait sub-row */}
      {timing.approvalWaitMs != null && timing.approvalWaitMs > 0 ? (
        <ApprovalWaitRow timing={timing} maxDurationMs={maxDurationMs} />
      ) : null}
    </div>
  );
}

function ApprovalWaitRow({
  timing,
  maxDurationMs,
}: {
  timing: PhaseTimingData;
  maxDurationMs: number;
}) {
  const waitMs = timing.approvalWaitMs ?? 0;
  const barPercent = maxDurationMs > 0 ? Math.max(2, (waitMs / maxDurationMs) * 100) : 2;

  return (
    <div
      data-testid={`approval-wait-${timing.phase}`}
      className="ml-[26px] flex items-center gap-2 rounded-md bg-amber-50/50 px-1.5 py-1 dark:bg-amber-950/20"
    >
      <Timer className="h-3.5 w-3.5 shrink-0 text-amber-500" />
      <span className="text-muted-foreground w-16 shrink-0 text-xs">approval</span>
      <div className="bg-muted h-1.5 min-w-0 flex-1 overflow-hidden rounded-full">
        <div
          className="h-full rounded-full bg-amber-500"
          style={{ width: `${Math.min(barPercent, 100)}%` }}
        />
      </div>
      <span className="text-muted-foreground w-14 shrink-0 text-end text-xs tabular-nums">
        {formatDuration(waitMs)}
      </span>
    </div>
  );
}

function SummaryTotals({
  totalExecMs,
  totalWaitMs,
  totalInputTokens,
  totalOutputTokens,
  totalCostUsd,
}: {
  totalExecMs: number;
  totalWaitMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
}) {
  const { t } = useTranslation('web');
  const totalTokens = totalInputTokens + totalOutputTokens;
  return (
    <div
      data-testid="activity-summary"
      className="border-border bg-card/30 flex flex-col gap-2 rounded-lg border p-3"
    >
      <div className="text-muted-foreground mb-1 text-xs font-semibold tracking-wider uppercase">
        Summary
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <SummaryCell
          icon={Clock}
          label={t('activityTab.execution')}
          value={formatDuration(totalExecMs)}
        />
        <SummaryCell
          icon={Timer}
          label={t('activityTab.wait')}
          value={totalWaitMs > 0 ? formatDuration(totalWaitMs) : 'n/a'}
        />
        <SummaryCell
          icon={Clock}
          label="Wall-clock"
          value={
            totalWaitMs > 0
              ? formatDuration(totalExecMs + totalWaitMs)
              : formatDuration(totalExecMs)
          }
        />
        <SummaryCell
          icon={DollarSign}
          label={t('activityTab.cost')}
          value={totalCostUsd > 0 ? formatCost(totalCostUsd) : 'n/a'}
        />
        <div className="col-span-2 flex flex-col gap-0.5">
          <span className="text-muted-foreground flex items-center gap-1 text-xs">
            <Zap className="h-3 w-3 opacity-40" />
            Tokens
          </span>
          {totalTokens > 0 ? (
            <span className="flex items-center gap-2.5 text-sm tabular-nums">
              <span>{formatTokens(totalTokens)}</span>
              <span
                className="text-muted-foreground flex items-center gap-3 text-xs"
                title="Input tokens / Output tokens"
              >
                <span className="flex items-center gap-0.5">
                  <ArrowDownToLine className="h-3 w-3 text-blue-500 opacity-60" />
                  {formatTokens(totalInputTokens)}
                </span>
                <span className="flex items-center gap-0.5">
                  <ArrowUpFromLine className="h-3 w-3 text-emerald-500 opacity-60" />
                  {formatTokens(totalOutputTokens)}
                </span>
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground/40 text-sm italic tabular-nums">n/a</span>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryCell({
  icon: Icon,
  label,
  value,
  className = '',
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  className?: string;
}) {
  const isNA = value === 'n/a';
  return (
    <div className={`flex flex-col gap-0.5 ${className}`}>
      <span className="text-muted-foreground flex items-center gap-1 text-xs">
        <Icon className="h-3 w-3 opacity-40" />
        {label}
      </span>
      <span className={`text-sm tabular-nums ${isNA ? 'text-muted-foreground/40 italic' : ''}`}>
        {value}
      </span>
    </div>
  );
}
