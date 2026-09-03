/**
 * Feature Show Command
 *
 * Displays detailed information about a specific feature.
 * Derives real-time status from the agent run.
 *
 * Usage: shep feat show <id>
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';
import yaml from 'js-yaml';
import { container } from '@/infrastructure/di/container.js';
import { ShowFeatureUseCase } from '@/application/use-cases/features/show-feature.use-case.js';
import type { IAgentRunRepository } from '@/application/ports/output/agents/agent-run-repository.interface.js';
import type { IPhaseTimingRepository } from '@/application/ports/output/agents/phase-timing-repository.interface.js';
import type {
  Feature,
  AgentRun,
  PhaseTiming,
  RejectionFeedbackEntry,
} from '@/domain/generated/output.js';
import { colors, symbols, messages, renderDetailView } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';
import { computeWorktreePath } from '@/infrastructure/services/ide-launchers/compute-worktree-path.js';

const AGENT_LABELS: Record<string, string> = {
  'claude-code': 'Claude Code',
  cursor: 'Cursor CLI',
  'gemini-cli': 'Gemini CLI',
  dev: 'Demo',
};

/** Map graph node names to human-readable phase labels (active). */
const NODE_TO_PHASE: Record<string, string> = {
  analyze: 'Analyzing',
  requirements: 'Requirements',
  research: 'Researching',
  plan: 'Planning',
  implement: 'Implementing',
  merge: 'Merging',
};

/** Map graph node names to review action labels. */
const NODE_TO_REVIEW: Record<string, string> = {
  analyze: 'Review Analysis',
  requirements: 'Review Requirements',
  research: 'Review Research',
  plan: 'Review Plan',
  implement: 'Review Merge',
  merge: 'Review Merge',
};

/** Map lifecycle event phases to display labels and symbols. */
const LIFECYCLE_EVENTS: Record<string, { label: string; color: (s: string) => string }> = {
  'run:started': { label: 'started', color: colors.info },
  'run:resumed': { label: 'resumed', color: colors.info },
  'run:completed': { label: 'completed', color: colors.success },
  'run:failed': { label: 'failed', color: colors.error },
  'run:stopped': { label: 'stopped', color: colors.warning },
  'run:crashed': { label: 'crashed', color: colors.error },
};

/** Check if a phase is a lifecycle event (run:*). */
function isLifecycleEvent(phase: string): boolean {
  return phase.startsWith('run:');
}

function formatStatus(feature: Feature, run: AgentRun | null): string {
  if (!run) {
    return `${colors.muted(symbols.dotEmpty)} ${colors.muted(feature.lifecycle)}`;
  }

  const isRunning = run.status === 'running' || run.status === 'pending';
  const nodeName = run.result?.startsWith('node:') ? run.result.slice(5) : undefined;
  const phase = nodeName ? (NODE_TO_PHASE[nodeName] ?? nodeName) : feature.lifecycle;

  if (isRunning) {
    if (run.pid && !isProcessAlive(run.pid)) {
      return `${colors.error(symbols.error)} ${colors.error('crashed')}`;
    }
    return `${colors.info(symbols.spinner[0])} ${colors.info(phase)}`;
  }
  if (run.status === 'completed')
    return `${colors.success(symbols.success)} ${colors.success('Completed')}`;
  if (run.status === 'failed') return `${colors.error(symbols.error)} ${colors.error('Failed')}`;
  if (run.status === 'waiting_approval') {
    const action = nodeName ? (NODE_TO_REVIEW[nodeName] ?? phase) : phase;
    return `${colors.brand(symbols.pointer)} ${colors.brand(action)}`;
  }
  if (run.status === 'interrupted')
    return `${colors.error(symbols.error)} ${colors.error('Interrupted')}`;
  return `${colors.muted(symbols.dotEmpty)} ${colors.muted(phase)}`;
}

function formatLifecycle(lifecycle: string): string {
  if (lifecycle === 'Maintain') return colors.success(lifecycle);
  if (lifecycle === 'Review') return colors.warning(lifecycle);
  return colors.info(lifecycle);
}

function formatDuration(ms: number): string {
  const secs = ms / 1000;
  const totalSecs = Math.round(secs);
  const mins = Math.floor(totalSecs / 60);
  const remSecs = totalSecs % 60;
  const secsStr = secs.toFixed(1);
  if (mins > 0) {
    return `${secsStr}s (${mins}m ${remSecs}s)`;
  }
  return `${secsStr}s`;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Load rejection feedback entries from spec.yaml (best-effort).
 */
function loadRejectionFeedback(specPath: string | undefined | null): RejectionFeedbackEntry[] {
  if (!specPath) return [];
  try {
    const content = readFileSync(join(specPath, 'spec.yaml'), 'utf-8');
    const spec = yaml.load(content) as Record<string, unknown>;
    return Array.isArray(spec?.rejectionFeedback)
      ? (spec.rejectionFeedback as RejectionFeedbackEntry[])
      : [];
  } catch {
    return [];
  }
}

/**
 * Group timings by agentRunId, preserving order.
 */
function groupTimingsByRun(timings: PhaseTiming[]): { runId: string; timings: PhaseTiming[] }[] {
  const groups: { runId: string; timings: PhaseTiming[] }[] = [];
  let current: { runId: string; timings: PhaseTiming[] } | null = null;

  for (const t of timings) {
    // eslint-disable-next-line @typescript-eslint/prefer-optional-chain
    if (!current || current.runId !== t.agentRunId) {
      current = { runId: t.agentRunId, timings: [] };
      groups.push(current);
    }
    current.timings.push(t);
  }
  return groups;
}

/**
 * Render a single timing entry (node phase, not lifecycle event).
 */
function renderNodeTiming(
  t: PhaseTiming,
  isLast: boolean,
  isWaiting: boolean,
  isRunTerminal: boolean,
  run: AgentRun | null,
  maxDurationMs: number,
  maxBar: number,
  rejectionMessage?: string
): string[] {
  const lines: string[] = [];
  const isSubPhase = t.phase.includes(':');
  const label = isSubPhase
    ? `  \u21b3 rev ${t.phase.split(':')[1]}`.padEnd(16)
    : (NODE_TO_PHASE[t.phase] ?? t.phase).padEnd(16);

  // Completed phase - green bar with duration
  if (t.completedAt && t.durationMs != null) {
    const ms = Number(t.durationMs);
    const secs = (ms / 1000).toFixed(1);
    const barLen =
      maxDurationMs > 0
        ? Math.min(maxBar, Math.max(1, Math.round((ms / maxDurationMs) * maxBar)))
        : 1;
    const bar = `${colors.success('\u2588'.repeat(barLen))}${colors.muted('\u2591'.repeat(maxBar - barLen))}`;
    lines.push(`${label} ${bar} ${secs}s`);
  }
  // Waiting for approval - only the LAST timing
  else if (isLast && isWaiting) {
    lines.push(`${label} ${colors.warning('awaiting review')}`);
  }
  // Crashed/stopped phase - red bar with frozen duration
  else if (isRunTerminal) {
    const endTime = run?.updatedAt
      ? new Date(run.updatedAt as string | number).getTime()
      : Date.now();
    const elapsedMs = Math.max(0, endTime - new Date(t.startedAt).getTime());
    const secs = (elapsedMs / 1000).toFixed(1);
    const barLen =
      maxDurationMs > 0
        ? Math.min(maxBar, Math.max(1, Math.round((elapsedMs / maxDurationMs) * maxBar)))
        : 1;
    const bar = `${colors.error('\u2588'.repeat(barLen))}${colors.muted('\u2591'.repeat(maxBar - barLen))}`;
    lines.push(`${label} ${bar} ${secs}s (crashed)`);
  }
  // Running phase - blue bar with elapsed time
  else {
    const elapsedMs = Math.max(0, Date.now() - new Date(t.startedAt).getTime());
    const secs = (elapsedMs / 1000).toFixed(1);
    const barLen =
      maxDurationMs > 0
        ? Math.min(maxBar, Math.max(1, Math.round((elapsedMs / maxDurationMs) * maxBar)))
        : 1;
    const bar = `${colors.info('\u2588'.repeat(barLen))}${colors.muted('\u2591'.repeat(maxBar - barLen))}`;
    lines.push(`${label} ${bar} ${secs}s (running)`);
  }

  // Show approval wait time under gated phases
  if (t.approvalWaitMs != null && Number(t.approvalWaitMs) > 0) {
    const waitMs = Number(t.approvalWaitMs);
    const waitSecs = (waitMs / 1000).toFixed(1);
    const waitLabel = '  \u21b3 approval'.padEnd(16);
    const waitBarLen =
      maxDurationMs > 0
        ? Math.min(maxBar, Math.max(1, Math.round((waitMs / maxDurationMs) * maxBar)))
        : 1;
    const waitBar = `${colors.warning('\u2588'.repeat(waitBarLen))}${colors.muted('\u2591'.repeat(maxBar - waitBarLen))}`;
    lines.push(`${waitLabel} ${waitBar} ${waitSecs}s`);
  } else if (isLast && isWaiting && t.waitingApprovalAt) {
    const waitStart =
      t.waitingApprovalAt instanceof Date
        ? t.waitingApprovalAt.getTime()
        : Number(t.waitingApprovalAt);
    const waitElapsedMs = Math.max(0, Date.now() - waitStart);
    const waitSecs = (waitElapsedMs / 1000).toFixed(1);
    const waitLabel = '  \u21b3 approval'.padEnd(16);
    const waitBarLen =
      maxDurationMs > 0
        ? Math.min(maxBar, Math.max(1, Math.round((waitElapsedMs / maxDurationMs) * maxBar)))
        : 1;
    const waitBar = `${colors.warning('\u2588'.repeat(waitBarLen))}${colors.muted('\u2591'.repeat(maxBar - waitBarLen))}`;
    lines.push(`${waitLabel} ${waitBar} ${waitSecs}s (waiting)`);
  }

  // Show rejection feedback after approval wait (if this phase was rejected)
  if (rejectionMessage) {
    const maxLen = 60;
    const msg =
      rejectionMessage.length > maxLen
        ? `${rejectionMessage.slice(0, maxLen)}\u2026`
        : rejectionMessage;
    lines.push(`  ${colors.error(`\u21a9 rejected: "${msg}"`)}`);
  }

  return lines;
}

/**
 * Render the full phase timing section, grouped by agent run with lifecycle events.
 * @internal Exported for testing only.
 */
export function renderPhaseTimings(
  timings: PhaseTiming[],
  currentRun: AgentRun | null,
  rejections: RejectionFeedbackEntry[] = []
): string[] {
  const groups = groupTimingsByRun(timings);
  const multiRun = groups.length > 1;

  // Compute max duration across ALL timings for consistent bar scaling
  const nodeTimings = timings.filter((t) => !isLifecycleEvent(t.phase));
  const maxDurationMs = Math.max(
    ...nodeTimings.map((t) => (t.durationMs != null ? Number(t.durationMs) : 0)),
    0
  );
  const MAX_BAR = 20;

  const lines: string[] = [];

  for (const [groupIdx, group] of groups.entries()) {
    const isCurrentRun = group.runId === currentRun?.id;
    const isLastGroup = groupIdx === groups.length - 1;

    // Run header for multi-run display
    if (multiRun) {
      if (groupIdx > 0) lines.push('');
      const runLabel = `Run #${groupIdx + 1}`;
      // Check if this run started with a resume event
      const firstEvent = group.timings[0];
      const isResumed = firstEvent && firstEvent.phase === 'run:resumed';
      const suffix = isResumed ? ' (resumed)' : '';
      lines.push(colors.muted(`  ${runLabel}${suffix}`));
    }

    // Determine if this run is in a terminal state (for the crashed bar display)
    const isCrashed =
      isCurrentRun &&
      currentRun &&
      (currentRun.status === 'running' || currentRun.status === 'pending') &&
      currentRun.pid != null &&
      !isProcessAlive(currentRun.pid);
    // For non-current runs, they are always terminal (otherwise they'd be current)
    const isRunTerminal =
      !isCurrentRun ||
      isCrashed ||
      currentRun?.status === 'interrupted' ||
      currentRun?.status === 'failed' ||
      currentRun?.status === 'cancelled';

    const isWaiting = isCurrentRun && currentRun?.status === 'waiting_approval';

    // Build a map of phase timing IDs to rejection messages.
    // A rejection belongs to the phase timing that has approvalWaitMs set
    // and whose base phase matches the rejection's phase field.
    // For each node timing with approvalWaitMs, find the next rejection
    // for that base phase (consumed in order).
    const rejectionsByPhase = new Map<string, RejectionFeedbackEntry[]>();
    for (const r of rejections) {
      const key = r.phase ?? '_legacy';
      const list = rejectionsByPhase.get(key) ?? [];
      list.push(r);
      rejectionsByPhase.set(key, list);
    }
    // Track consumption index per phase
    const rejectionIdx = new Map<string, number>();

    for (const [idx, t] of group.timings.entries()) {
      const isLast = isLastGroup && idx === group.timings.length - 1;

      // Lifecycle event - render as a marker line
      if (isLifecycleEvent(t.phase)) {
        const event = LIFECYCLE_EVENTS[t.phase];
        if (event) {
          // For resumed events without a matching rejection, show as info marker
          // (rejections are now rendered inline after approval wait)
          if (t.phase === 'run:resumed') {
            // Check if this resume was preceded by a rejection that we already rendered
            // If so, skip the resumed marker to avoid visual duplication
            const prevIdx = idx - 1;
            const prevTiming = prevIdx >= 0 ? group.timings[prevIdx] : null;
            if (prevTiming && !isLifecycleEvent(prevTiming.phase)) {
              // The rejection was already shown inline, skip this marker
              continue;
            }
          }
          const sym =
            t.phase === 'run:completed'
              ? symbols.success
              : t.phase === 'run:failed' || t.phase === 'run:crashed'
                ? symbols.error
                : t.phase === 'run:stopped'
                  ? symbols.warning
                  : symbols.info;
          lines.push(`  ${event.color(`${sym} ${event.label}`)}`);
        }
        continue;
      }

      // Determine if this phase timing was rejected (has approvalWaitMs and a matching rejection)
      let rejectionMessage: string | undefined;
      if (t.approvalWaitMs != null && Number(t.approvalWaitMs) > 0) {
        const basePhase = t.phase.includes(':') ? t.phase.split(':')[0] : t.phase;
        // Try phase-specific rejections first, then fall back to legacy (no phase)
        for (const key of [basePhase, '_legacy']) {
          const phaseRejections = rejectionsByPhase.get(key);
          if (phaseRejections && phaseRejections.length > 0) {
            const consumed = rejectionIdx.get(key) ?? 0;
            if (consumed < phaseRejections.length) {
              rejectionMessage = phaseRejections[consumed].message;
              rejectionIdx.set(key, consumed + 1);
              break;
            }
          }
        }
      }

      // Regular node phase
      const rendered = renderNodeTiming(
        t,
        isLast,
        isWaiting ?? false,
        isRunTerminal ?? false,
        isCurrentRun ? currentRun : null,
        maxDurationMs,
        MAX_BAR,
        rejectionMessage
      );
      lines.push(...rendered);
    }
  }

  // Summary totals (across all runs, excluding lifecycle events)
  const totalExecMs = nodeTimings.reduce(
    (sum, t) => sum + (t.durationMs != null ? Number(t.durationMs) : 0),
    0
  );
  const totalWaitMs = nodeTimings.reduce(
    (sum, t) => sum + (t.approvalWaitMs != null ? Number(t.approvalWaitMs) : 0),
    0
  );

  if (totalExecMs > 0) {
    lines.push('');
    lines.push(`${'Total execution'.padEnd(16)} ${formatDuration(totalExecMs)}`);
    if (totalWaitMs > 0) {
      lines.push(`${'Total wait'.padEnd(16)} ${formatDuration(totalWaitMs)}`);
      lines.push(`${'Total wall-clock'.padEnd(16)} ${formatDuration(totalExecMs + totalWaitMs)}`);
    }
  }

  return lines;
}

export function createShowCommand(): Command {
  const t = getCliI18n().t;
  return new Command('show')
    .description(t('cli:commands.feat.show.description'))
    .argument('<id>', t('cli:commands.feat.show.idArgument'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep feat show abc12345
  $ shep feat show fe-auth-login`
    )
    .action(async (featureId: string) => {
      try {
        const useCase = container.resolve(ShowFeatureUseCase);
        const runRepo = container.resolve<IAgentRunRepository>('IAgentRunRepository');
        const timingRepo = container.resolve<IPhaseTimingRepository>('IPhaseTimingRepository');
        const feature = await useCase.execute(featureId);
        const run = feature.agentRunId ? await runRepo.findById(feature.agentRunId) : null;
        // Fetch timings across ALL runs for the feature (not just the current run)
        const timings = await timingRepo.findByFeatureId(feature.id);

        const worktreePath =
          feature.worktreePath ?? computeWorktreePath(feature.repositoryPath, feature.branch);

        const formatTs = (ts: unknown): string => {
          if (ts instanceof Date) return ts.toLocaleString();
          return String(ts);
        };

        const textBlocks = [];

        if (feature.plan) {
          textBlocks.push({
            title: t('cli:commands.feat.show.planTitle'),
            content: [
              t('cli:commands.feat.show.planState', { state: feature.plan.state }),
              t('cli:commands.feat.show.planTasks', { count: feature.plan.tasks.length }),
            ].join('\n'),
          });
        }

        if (feature.messages.length > 0) {
          const last5 = feature.messages
            .slice(-5)
            .map((m) => `${colors.muted(`${m.role}:`)} ${m.content.slice(0, 80)}`)
            .join('\n');
          textBlocks.push({
            title: t('cli:commands.feat.show.messagesTitle', { count: feature.messages.length }),
            content: last5,
          });
        }

        if (timings.length > 0) {
          const rejections = loadRejectionFeedback(feature.specPath);
          const lines = renderPhaseTimings(timings, run, rejections);
          textBlocks.push({
            title: t('cli:commands.feat.show.phaseTimingTitle'),
            content: lines.join('\n'),
          });
        }

        if (feature.pr?.ciFixHistory && feature.pr.ciFixHistory.length > 0) {
          const fixLines = feature.pr.ciFixHistory.map((r) => {
            const outcomeColor =
              r.outcome === 'fixed'
                ? colors.success
                : r.outcome === 'timeout'
                  ? colors.warning
                  : colors.error;
            return `  #${r.attempt}  ${outcomeColor(r.outcome)}  ${colors.muted(r.startedAt)}  ${r.failureSummary.slice(0, 60)}`;
          });
          textBlocks.push({
            title: t('cli:commands.feat.show.ciFixHistoryTitle'),
            content: fixLines.join('\n'),
          });
        }

        if (run?.status === 'waiting_approval') {
          const phase = run.result?.startsWith('node:')
            ? (NODE_TO_PHASE[run.result.slice(5)] ?? run.result.slice(5))
            : t('cli:commands.feat.show.currentPhase');
          textBlocks.push({
            title: t('cli:commands.feat.show.awaitingApprovalTitle'),
            content: [
              t('cli:commands.feat.show.awaitingApprovalMessage', { phase }),
              '',
              `  ${colors.accent(`shep feat approve ${feature.id.slice(0, 8)}`)}  ${t('cli:commands.feat.show.awaitingApprovalApprove')}`,
              `  ${colors.accent(`shep feat reject ${feature.id.slice(0, 8)}`)}   ${t('cli:commands.feat.show.awaitingApprovalReject')}`,
            ].join('\n'),
          });
        }

        renderDetailView({
          title: t('cli:commands.feat.show.title', { name: feature.name }),
          sections: [
            {
              fields: [
                { label: t('cli:commands.feat.show.idLabel'), value: feature.id },
                { label: t('cli:commands.feat.show.slugLabel'), value: feature.slug },
                { label: t('cli:commands.feat.show.descriptionLabel'), value: feature.description },
                { label: t('cli:commands.feat.show.userQueryLabel'), value: feature.userQuery },
                {
                  label: t('cli:commands.feat.show.repositoryLabel'),
                  value: feature.repositoryPath,
                },
                {
                  label: t('cli:commands.feat.show.branchLabel'),
                  value: colors.accent(feature.branch),
                },
                {
                  label: t('cli:commands.feat.show.statusLabel'),
                  value: formatStatus(feature, run),
                },
                {
                  label: t('cli:commands.feat.show.lifecycleLabel'),
                  value: formatLifecycle(feature.lifecycle),
                },
                {
                  label: t('cli:commands.feat.show.agentLabel'),
                  value: run
                    ? (AGENT_LABELS[run.agentType as string] ?? (run.agentType as string))
                    : null,
                },
                { label: t('cli:commands.feat.show.modelLabel'), value: run?.modelId ?? null },
                { label: t('cli:commands.feat.show.worktreeLabel'), value: worktreePath },
                {
                  label: t('cli:commands.feat.show.specDirLabel'),
                  value: feature.specPath ?? null,
                },
                {
                  label: t('cli:commands.feat.show.agentRunLabel'),
                  value: feature.agentRunId ?? null,
                },
              ],
            },
            {
              title: t('cli:commands.feat.show.timestampsTitle'),
              fields: [
                {
                  label: t('cli:commands.feat.show.createdLabel'),
                  value: formatTs(feature.createdAt),
                },
                {
                  label: t('cli:commands.feat.show.updatedLabel'),
                  value: formatTs(feature.updatedAt),
                },
              ],
            },
            {
              title: t('cli:commands.feat.show.workflowTitle'),
              fields: [
                {
                  label: t('cli:commands.feat.show.pushLabel'),
                  value: feature.push
                    ? colors.success(t('cli:commands.feat.show.yesValue'))
                    : colors.muted(t('cli:commands.feat.show.noValue')),
                },
                {
                  label: t('cli:commands.feat.show.openPrLabel'),
                  value: feature.openPr
                    ? colors.success(t('cli:commands.feat.show.yesValue'))
                    : colors.muted(t('cli:commands.feat.show.noValue')),
                },
                {
                  label: t('cli:commands.feat.show.gatesLabel'),
                  value: feature.approvalGates
                    ? [
                        `PRD ${feature.approvalGates.allowPrd ? colors.success('\u2713') : colors.error('\u2717')}`,
                        `Plan ${feature.approvalGates.allowPlan ? colors.success('\u2713') : colors.error('\u2717')}`,
                        `Merge ${feature.approvalGates.allowMerge ? colors.success('\u2713') : colors.error('\u2717')}`,
                      ].join('  ')
                    : colors.muted(t('cli:commands.feat.show.gatesNotSet')),
                },
              ],
            },
            ...(feature.pr
              ? [
                  {
                    title: t('cli:commands.feat.show.pullRequestTitle'),
                    fields: [
                      { label: t('cli:commands.feat.show.urlLabel'), value: feature.pr.url },
                      {
                        label: t('cli:commands.feat.show.numberLabel'),
                        value: `#${feature.pr.number}`,
                      },
                      {
                        label: t('cli:commands.feat.show.prStatusLabel'),
                        value:
                          feature.pr.status === 'Merged'
                            ? colors.success(`${feature.pr.status} \u2713`)
                            : feature.pr.status === 'Closed'
                              ? colors.error(feature.pr.status)
                              : colors.warning(feature.pr.status),
                      },
                      {
                        label: t('cli:commands.feat.show.commitLabel'),
                        value: feature.pr.commitHash ?? null,
                      },
                      {
                        label: t('cli:commands.feat.show.ciLabel'),
                        value: feature.pr.ciStatus
                          ? feature.pr.ciStatus === 'Success'
                            ? colors.success(`${feature.pr.ciStatus} \u2713`)
                            : feature.pr.ciStatus === 'Failure'
                              ? colors.error(`${feature.pr.ciStatus} \u2717`)
                              : colors.warning(feature.pr.ciStatus)
                          : null,
                      },
                      {
                        label: t('cli:commands.feat.show.ciFixesLabel'),
                        value:
                          feature.pr.ciFixAttempts && feature.pr.ciFixAttempts > 0
                            ? t('cli:commands.feat.show.ciFixAttempts', {
                                count: feature.pr.ciFixAttempts,
                              })
                            : null,
                      },
                    ],
                  },
                ]
              : []),
          ],
          textBlocks,
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.feat.show.failedToShow'), err);
        process.exitCode = 1;
      }
    });
}
