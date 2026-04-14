/**
 * StreamAgentEventsUseCase
 *
 * Produces a stream of agent/feature lifecycle events by polling the
 * repositories and computing deltas per connection. Originally lived in
 * `src/presentation/web/app/api/agent-events/route.ts` (clean-arch violation
 * #4 in spec 089) — the SSE route is now a thin adapter that framing-wraps
 * whatever this use case yields.
 *
 * Output shape: a discriminated union so the caller can route each event
 * onto its own SSE channel without needing to know the business rules.
 *
 * - `{ kind: 'notification', event }`     → `NotificationEvent` (feature/PR/agent)
 * - `{ kind: 'interactive-session', ... }` → interactive session status change
 *
 * Heartbeats are a presentation concern (SSE framing) and are NOT emitted by
 * this use case.
 */

import { inject, injectable } from 'tsyringe';

import type { IAgentRunRepository } from '../../ports/output/agents/agent-run-repository.interface.js';
import type { IPhaseTimingRepository } from '../../ports/output/agents/phase-timing-repository.interface.js';
import type { IInteractiveSessionRepository } from '../../ports/output/repositories/interactive-session-repository.interface.js';
import type { ICloudDeploymentEventBus } from '../../ports/output/services/cloud-deployment-event-bus.interface.js';
import type { ILogger } from '../../ports/output/services/logger.interface.js';
import type { IProcessLivenessProbe } from '../../ports/output/services/process-liveness.interface.js';

import { ListFeaturesUseCase } from '../features/list-features.use-case.js';

import type { AgentRun, Feature, NotificationEvent } from '../../../domain/generated/output.js';
import {
  AgentRunStatus,
  InteractiveSessionStatus,
  InteractiveSessionEventType,
  NotificationEventType,
  NotificationSeverity,
  SdlcLifecycle,
} from '../../../domain/generated/output.js';
import { LIFECYCLE_TO_NODE } from '../../../domain/shared/sdlc-lifecycle-mapping.js';

/** Default delta poll interval. */
const POLL_INTERVAL_MS = 2_000;

/**
 * Payload shape for an interactive-session lifecycle transition. Mirrors the
 * historical `InteractiveSessionEvent` type emitted by the SSE route so the
 * client contract is preserved byte-for-byte.
 */
export interface InteractiveSessionStreamEvent {
  kind: 'interactive-session';
  type: InteractiveSessionEventType;
  sessionId: string;
  featureId: string;
}

/**
 * Envelope for a `NotificationEvent`. The optional `cloudDeployment` field is
 * preserved for cloud deploy broadcasts which historically piggy-back on the
 * notification channel with an extra `cloudDeployment` property.
 */
export interface NotificationStreamEvent {
  kind: 'notification';
  event: NotificationEvent & {
    cloudDeployment?: {
      applicationId: string;
      provider: string;
      status: string;
      url?: string;
      error?: string;
    };
  };
}

export type StreamedAgentEvent = NotificationStreamEvent | InteractiveSessionStreamEvent;

export interface StreamAgentEventsOptions {
  /** Filter events to a single agent run (omitted → stream everything). */
  runIdFilter?: string;
  /** Caller-owned abort signal — closes the generator cleanly on client disconnect. */
  signal?: AbortSignal;
  /** Override the poll interval (tests). */
  pollIntervalMs?: number;
}

interface CachedFeatureState {
  status: AgentRunStatus | null;
  lifecycle: string;
  completedPhases: Set<string>;
  featureName: string;
  prStatus: string | undefined;
  prMergeable: boolean | undefined;
  prCiStatus: string | undefined;
  /** Set once we've detected and emitted a crash event for this feature. */
  crashEmitted?: boolean;
}

interface CachedSessionState {
  status: InteractiveSessionStatus;
}

const STATUS_TO_EVENT: Partial<
  Record<AgentRunStatus, { eventType: NotificationEventType; severity: NotificationSeverity }>
> = {
  [AgentRunStatus.running]: {
    eventType: NotificationEventType.AgentStarted,
    severity: NotificationSeverity.Info,
  },
  [AgentRunStatus.waitingApproval]: {
    eventType: NotificationEventType.WaitingApproval,
    severity: NotificationSeverity.Warning,
  },
  [AgentRunStatus.completed]: {
    eventType: NotificationEventType.AgentCompleted,
    severity: NotificationSeverity.Success,
  },
  [AgentRunStatus.failed]: {
    eventType: NotificationEventType.AgentFailed,
    severity: NotificationSeverity.Error,
  },
  [AgentRunStatus.interrupted]: {
    eventType: NotificationEventType.AgentFailed,
    severity: NotificationSeverity.Warning,
  },
  [AgentRunStatus.cancelled]: {
    eventType: NotificationEventType.AgentFailed,
    severity: NotificationSeverity.Warning,
  },
};

/** Map agent graph node name from `AgentRun.result` to a phase name. */
function resultToPhase(result: string | undefined): string | undefined {
  if (!result?.startsWith('node:')) return undefined;
  return result.slice(5); // "node:analyze" → "analyze"
}

function statusToInteractiveEventType(
  status: InteractiveSessionStatus
): InteractiveSessionEventType {
  switch (status) {
    case InteractiveSessionStatus.booting:
      return InteractiveSessionEventType.Booting;
    case InteractiveSessionStatus.ready:
      return InteractiveSessionEventType.Ready;
    case InteractiveSessionStatus.error:
      return InteractiveSessionEventType.Error;
    default:
      return InteractiveSessionEventType.Stopped;
  }
}

@injectable()
export class StreamAgentEventsUseCase {
  constructor(
    @inject(ListFeaturesUseCase)
    private readonly listFeatures: ListFeaturesUseCase,
    @inject('IAgentRunRepository')
    private readonly agentRunRepo: IAgentRunRepository,
    @inject('IPhaseTimingRepository')
    private readonly phaseTimingRepo: IPhaseTimingRepository,
    @inject('IInteractiveSessionRepository')
    private readonly sessionRepo: IInteractiveSessionRepository,
    @inject('IProcessLivenessProbe')
    private readonly processLiveness: IProcessLivenessProbe,
    @inject('ICloudDeploymentEventBus')
    private readonly cloudEventBus: ICloudDeploymentEventBus,
    @inject('ILogger')
    private readonly logger: ILogger
  ) {}

  /**
   * Yields every notification/interactive-session event as soon as the
   * next poll cycle detects it. The generator runs until the provided
   * `signal` is aborted.
   *
   * Buffers events between yields via a simple queue + in-poll notifier,
   * so the cloud-deploy event bus subscription (which fires synchronously
   * on publish) can enqueue without blocking.
   */
  async *execute(options: StreamAgentEventsOptions = {}): AsyncGenerator<StreamedAgentEvent> {
    const { runIdFilter, signal } = options;
    const pollIntervalMs = options.pollIntervalMs ?? POLL_INTERVAL_MS;

    const featureCache = new Map<string, CachedFeatureState>();
    const sessionCache = new Map<string, CachedSessionState>();

    const queue: StreamedAgentEvent[] = [];
    let notify: (() => void) | null = null;
    const enqueue = (event: StreamedAgentEvent): void => {
      queue.push(event);
      if (notify) {
        const fn = notify;
        notify = null;
        fn();
      }
    };

    // Cloud deploy events flow through an in-process bus rather than DB
    // polling — subscribe for the lifetime of the generator and re-emit as
    // notification events.
    const unsubscribeCloudDeploy = this.cloudEventBus.subscribe((cloudEvent) => {
      enqueue({
        kind: 'notification',
        event: {
          eventType: NotificationEventType.CloudDeploymentUpdated,
          agentRunId: cloudEvent.applicationId,
          featureId: cloudEvent.applicationId,
          featureName: cloudEvent.applicationId,
          message:
            cloudEvent.message ??
            (cloudEvent.error
              ? `Deploy failed: ${cloudEvent.error}`
              : `Deploy ${cloudEvent.status}`),
          severity:
            cloudEvent.status === 'Deployed'
              ? NotificationSeverity.Success
              : cloudEvent.status === 'Failed'
                ? NotificationSeverity.Error
                : NotificationSeverity.Info,
          timestamp: new Date(cloudEvent.timestamp).toISOString(),
          cloudDeployment: {
            applicationId: cloudEvent.applicationId,
            provider: cloudEvent.provider,
            status: cloudEvent.status,
            url: cloudEvent.url,
            error: cloudEvent.error,
          },
        },
      });
    });

    let pollErrorCount = 0;

    try {
      while (!signal?.aborted) {
        try {
          await this.pollOnce({
            runIdFilter,
            featureCache,
            sessionCache,
            enqueue,
          });
          pollErrorCount = 0;
        } catch (error) {
          pollErrorCount++;
          if (pollErrorCount <= 3 || pollErrorCount % 60 === 0) {
            this.logger.error(
              `[SSE /api/agent-events] poll error #${pollErrorCount}: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
          }
        }

        // Drain anything the cloud bus enqueued or that the poll produced.
        while (queue.length > 0) {
          const next = queue.shift();
          if (next) yield next;
        }

        if (signal?.aborted) break;

        // Wait for the next poll tick OR a wake-up from the cloud bus.
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            notify = null;
            resolve();
          }, pollIntervalMs);
          notify = () => {
            clearTimeout(timer);
            resolve();
          };
          if (signal) {
            const onAbort = () => {
              clearTimeout(timer);
              notify = null;
              resolve();
            };
            if (signal.aborted) {
              onAbort();
            } else {
              signal.addEventListener('abort', onAbort, { once: true });
            }
          }
        });

        // Flush any events the cloud bus pushed while we were waiting.
        while (queue.length > 0) {
          const next = queue.shift();
          if (next) yield next;
        }
      }
    } finally {
      try {
        unsubscribeCloudDeploy();
      } catch {
        // Listener may already be detached.
      }
    }
  }

  /**
   * Single poll cycle: walk every feature's latest agent run, diff against
   * the connection cache, and enqueue notification events for any observed
   * state changes. Also polls interactive session state transitions.
   */
  private async pollOnce(args: {
    runIdFilter?: string;
    featureCache: Map<string, CachedFeatureState>;
    sessionCache: Map<string, CachedSessionState>;
    enqueue: (event: StreamedAgentEvent) => void;
  }): Promise<void> {
    const { runIdFilter, featureCache, sessionCache, enqueue } = args;

    const features = await this.listFeatures.execute();

    const entries: { feature: Feature; run: AgentRun | null }[] = await Promise.all(
      features.map(async (feature) => {
        const run = feature.agentRunId
          ? await this.agentRunRepo.findById(feature.agentRunId)
          : null;
        return { feature, run };
      })
    );

    for (const { feature, run } of entries) {
      if (!run) continue;
      if (runIdFilter && run.id !== runIdFilter) continue;

      const prev = featureCache.get(feature.id);
      if (!prev) {
        // Seed cache on first sight — don't emit to avoid a burst on connect.
        const completedPhases = new Set<string>();
        try {
          const timings = await this.phaseTimingRepo.findByRunId(run.id);
          for (const t of timings) {
            if (t.completedAt) completedPhases.add(t.phase);
          }
        } catch {
          // Ignore timing errors during seed.
        }

        featureCache.set(feature.id, {
          status: run.status,
          lifecycle: feature.lifecycle,
          completedPhases,
          featureName: feature.name,
          prStatus: feature.pr?.status,
          prMergeable: feature.pr?.mergeable,
          prCiStatus: feature.pr?.ciStatus,
        });
        continue;
      }

      this.emitDeltas({ feature, run, prev, enqueue });

      // New phase completions (timing rows only appear after finish).
      try {
        const timings = await this.phaseTimingRepo.findByRunId(run.id);
        for (const t of timings) {
          if (t.completedAt && !prev.completedPhases.has(t.phase)) {
            prev.completedPhases.add(t.phase);
            enqueue({
              kind: 'notification',
              event: {
                eventType: NotificationEventType.PhaseCompleted,
                agentRunId: run.id,
                featureId: feature.id,
                featureName: feature.name,
                phaseName: t.phase,
                message: `Completed ${t.phase} phase`,
                severity: NotificationSeverity.Info,
                timestamp: new Date().toISOString(),
              },
            });
          }
        }
      } catch {
        // Ignore timing errors mid-stream.
      }
    }

    // Interactive session polling — isolated in its own try so a repo failure
    // here can't poison the main loop.
    try {
      const activeSessions = await this.sessionRepo.findAllActive();

      for (const session of activeSessions) {
        const prev = sessionCache.get(session.id);
        if (prev?.status !== session.status) {
          sessionCache.set(session.id, { status: session.status });
          enqueue({
            kind: 'interactive-session',
            type: statusToInteractiveEventType(session.status),
            sessionId: session.id,
            featureId: session.featureId,
          });
        }
      }

      // Sessions that disappeared from the active list — fetch final status.
      for (const [sessionId, cached] of sessionCache) {
        const stillActive = activeSessions.find((s) => s.id === sessionId);
        const wasActive =
          cached.status === InteractiveSessionStatus.booting ||
          cached.status === InteractiveSessionStatus.ready;
        if (wasActive && !stillActive) {
          const session = await this.sessionRepo.findById(sessionId);
          if (session) {
            sessionCache.set(sessionId, { status: session.status });
            enqueue({
              kind: 'interactive-session',
              type: statusToInteractiveEventType(session.status),
              sessionId: session.id,
              featureId: session.featureId,
            });
          } else {
            sessionCache.delete(sessionId);
          }
        }
      }
    } catch {
      // Ignore interactive session poll errors to not affect main polling.
    }
  }

  /**
   * Emit every notification delta observable between `prev` and the current
   * `run`/`feature` pair. Mutates `prev` in place so the next tick compares
   * against the newly-emitted values.
   */
  private emitDeltas(args: {
    feature: Feature;
    run: AgentRun;
    prev: CachedFeatureState;
    enqueue: (event: StreamedAgentEvent) => void;
  }): void {
    const { feature, run, prev, enqueue } = args;

    // Status change.
    if (prev.status !== run.status) {
      prev.status = run.status;
      const mapping = STATUS_TO_EVENT[run.status];
      if (mapping) {
        const phase = resultToPhase(run.result);
        enqueue({
          kind: 'notification',
          event: {
            eventType: mapping.eventType,
            agentRunId: run.id,
            featureId: feature.id,
            featureName: feature.name,
            ...(phase && { phaseName: phase }),
            message: `Agent status: ${run.status}`,
            severity: mapping.severity,
            timestamp: new Date().toISOString(),
          },
        });
      }
    }

    // Crash detection — status still active but owning process is gone.
    const isActive = run.status === AgentRunStatus.running || run.status === AgentRunStatus.pending;
    if (
      isActive &&
      run.pid &&
      !prev.crashEmitted &&
      !this.processLiveness.isProcessAlive(run.pid)
    ) {
      prev.crashEmitted = true;
      const phase = resultToPhase(run.result);
      enqueue({
        kind: 'notification',
        event: {
          eventType: NotificationEventType.AgentFailed,
          agentRunId: run.id,
          featureId: feature.id,
          featureName: feature.name,
          ...(phase && { phaseName: phase }),
          message: `Agent crashed (PID ${run.pid} dead)`,
          severity: NotificationSeverity.Error,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Feature name change (AI metadata generation may rename a feature mid-flight).
    if (prev.featureName !== feature.name) {
      prev.featureName = feature.name;
      const nodeName = LIFECYCLE_TO_NODE[feature.lifecycle as SdlcLifecycle] ?? 'requirements';
      enqueue({
        kind: 'notification',
        event: {
          eventType: NotificationEventType.PhaseCompleted,
          agentRunId: run.id,
          featureId: feature.id,
          featureName: feature.name,
          phaseName: nodeName,
          message: `Feature metadata updated`,
          severity: NotificationSeverity.Info,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Lifecycle change — agent stays "running" while it moves between phases.
    if (prev.lifecycle !== feature.lifecycle) {
      const prevLifecycle = prev.lifecycle;
      prev.lifecycle = feature.lifecycle;
      const nodeName = LIFECYCLE_TO_NODE[feature.lifecycle as SdlcLifecycle];

      if (feature.lifecycle === SdlcLifecycle.Review && prevLifecycle !== SdlcLifecycle.Review) {
        const prUrl = feature.pr?.url;
        const message = prUrl ? `Ready for merge review — PR: ${prUrl}` : 'Ready for merge review';
        enqueue({
          kind: 'notification',
          event: {
            eventType: NotificationEventType.MergeReviewReady,
            agentRunId: run.id,
            featureId: feature.id,
            featureName: feature.name,
            phaseName: 'merge',
            message,
            severity: NotificationSeverity.Info,
            timestamp: new Date().toISOString(),
          },
        });
      } else if (nodeName) {
        enqueue({
          kind: 'notification',
          event: {
            eventType: NotificationEventType.PhaseCompleted,
            agentRunId: run.id,
            featureId: feature.id,
            featureName: feature.name,
            phaseName: nodeName,
            message: `Entered ${nodeName} phase`,
            severity: NotificationSeverity.Info,
            timestamp: new Date().toISOString(),
          },
        });
      }
    }

    // PR data changes — status, mergeable, CI status.
    const curPrStatus = feature.pr?.status;
    const curMergeable = feature.pr?.mergeable;
    const curCiStatus = feature.pr?.ciStatus;
    if (
      curPrStatus !== prev.prStatus ||
      curMergeable !== prev.prMergeable ||
      curCiStatus !== prev.prCiStatus
    ) {
      prev.prStatus = curPrStatus;
      prev.prMergeable = curMergeable;
      prev.prCiStatus = curCiStatus;
      const nodeName = LIFECYCLE_TO_NODE[feature.lifecycle as SdlcLifecycle] ?? 'merge';
      enqueue({
        kind: 'notification',
        event: {
          eventType: NotificationEventType.PhaseCompleted,
          agentRunId: run.id,
          featureId: feature.id,
          featureName: feature.name,
          phaseName: nodeName,
          message:
            curMergeable === false
              ? `PR #${feature.pr?.number} has merge conflicts`
              : `PR status updated`,
          severity:
            curMergeable === false ? NotificationSeverity.Warning : NotificationSeverity.Info,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }
}
