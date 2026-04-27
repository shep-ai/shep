/**
 * StreamAgentEventsUseCase
 *
 * Produces a stream of agent/feature lifecycle events by polling the
 * repositories and computing deltas per connection. Originally lived in
 * `src/presentation/web/app/api/agent-events/route.ts` (clean-arch violation
 * #4 in spec 089) — the SSE route is now a thin adapter that framing-wraps
 * whatever this use case yields.
 *
 * Delta computation has been extracted into pure helper modules under
 * `./stream-agent-events/` (clean-arch violation #30 in spec 089). This file
 * is now a thin orchestrator: it owns the connection-scoped cache, the poll
 * loop, and the cloud-deploy bus subscription, and delegates every per-tick
 * diff to the helpers.
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
import type { IApplicationRepository } from '../../ports/output/repositories/application-repository.interface.js';
import type { IInteractiveSessionRepository } from '../../ports/output/repositories/interactive-session-repository.interface.js';
import type { ICloudDeploymentEventBus } from '../../ports/output/services/cloud-deployment-event-bus.interface.js';
import type { ILogger } from '../../ports/output/services/logger.interface.js';
import type { IOperationLogEventBus } from '../../ports/output/services/operation-log-event-bus.interface.js';
import type { IProcessLivenessProbe } from '../../ports/output/services/process-liveness.interface.js';

import { ListFeaturesUseCase } from '../features/list-features.use-case.js';

import type { AgentRun, Feature } from '../../../domain/generated/output.js';
import {
  NotificationEventType,
  NotificationSeverity,
  OperationLogLevel,
} from '../../../domain/generated/output.js';

import { computeApplicationDeltas } from './stream-agent-events/compute-application-deltas.js';
import { computeFeatureDeltas } from './stream-agent-events/compute-feature-deltas.js';
import { computePhaseCompletionDeltas } from './stream-agent-events/compute-phase-completion-deltas.js';
import { computePrDeltas } from './stream-agent-events/compute-pr-deltas.js';
import { computeSessionDeltas } from './stream-agent-events/compute-session-deltas.js';
import { computeStatusDeltas } from './stream-agent-events/compute-status-deltas.js';
import type {
  CachedApplicationState,
  CachedFeatureState,
  CachedSessionState,
  StreamedAgentEvent,
} from './stream-agent-events/stream-agent-events.types.js';

// Re-export the public event types so existing consumers that import them
// from this module keep working.
export type {
  InteractiveSessionStreamEvent,
  NotificationStreamEvent,
  StreamedAgentEvent,
} from './stream-agent-events/stream-agent-events.types.js';

/** Default delta poll interval. */
const POLL_INTERVAL_MS = 2_000;

export interface StreamAgentEventsOptions {
  /** Filter events to a single agent run (omitted → stream everything). */
  runIdFilter?: string;
  /** Caller-owned abort signal — closes the generator cleanly on client disconnect. */
  signal?: AbortSignal;
  /** Override the poll interval (tests). */
  pollIntervalMs?: number;
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
    @inject('IApplicationRepository')
    private readonly applicationRepo: IApplicationRepository,
    @inject('IOperationLogEventBus')
    private readonly operationLogEventBus: IOperationLogEventBus,
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
    const applicationCache = new Map<string, CachedApplicationState>();

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

    const unsubscribeCloudDeploy = this.subscribeCloudDeploy(enqueue);
    const unsubscribeOperationLog = this.subscribeOperationLog(enqueue);

    let pollErrorCount = 0;

    try {
      while (!signal?.aborted) {
        try {
          await this.pollOnce({
            runIdFilter,
            featureCache,
            sessionCache,
            applicationCache,
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
      try {
        unsubscribeOperationLog();
      } catch {
        // Listener may already be detached.
      }
    }
  }

  /**
   * Subscribe to the in-process cloud-deploy event bus and re-emit incoming
   * events as `notification` envelopes. Returns the unsubscribe handle.
   */
  private subscribeCloudDeploy(enqueue: (event: StreamedAgentEvent) => void): () => void {
    return this.cloudEventBus.subscribe((cloudEvent) => {
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
  }

  /**
   * Subscribe to the in-process operation-log event bus and re-emit each
   * publish as a `NotificationEventType.OperationLogAppended` notification.
   * Returns the unsubscribe handle.
   */
  private subscribeOperationLog(enqueue: (event: StreamedAgentEvent) => void): () => void {
    return this.operationLogEventBus.subscribe(({ entry }) => {
      const severity =
        entry.level === OperationLogLevel.Error
          ? NotificationSeverity.Error
          : entry.level === OperationLogLevel.Warn
            ? NotificationSeverity.Warning
            : NotificationSeverity.Info;

      const timestamp =
        entry.createdAt instanceof Date
          ? entry.createdAt.toISOString()
          : typeof entry.createdAt === 'string'
            ? entry.createdAt
            : String(entry.createdAt);

      enqueue({
        kind: 'notification',
        event: {
          eventType: NotificationEventType.OperationLogAppended,
          agentRunId: entry.operationId,
          featureId: entry.operationId,
          featureName: entry.operationKind,
          message: entry.message,
          severity,
          timestamp,
          operationLogAppend: { entry },
        },
      });
    });
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
    applicationCache: Map<string, CachedApplicationState>;
    enqueue: (event: StreamedAgentEvent) => void;
  }): Promise<void> {
    const { runIdFilter, featureCache, sessionCache, applicationCache, enqueue } = args;

    const features = await this.listFeatures.execute();

    // Batch-fetch all agent runs in one query instead of N findById calls
    // (kills the N+1 — was the dominant per-poll DB cost).
    const runIds = features
      .map((f) => f.agentRunId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    const runs = runIds.length > 0 ? await this.agentRunRepo.findByIds(runIds) : [];
    const runById = new Map<string, AgentRun>(runs.map((r) => [r.id, r]));

    const entries: { feature: Feature; run: AgentRun | null }[] = features.map((feature) => ({
      feature,
      run: feature.agentRunId ? (runById.get(feature.agentRunId) ?? null) : null,
    }));

    // Batch-fetch phase timings for every active run in one query, grouped
    // by agent_run_id. Replaces the per-feature findByRunId loop below.
    const activeRunIds = entries
      .filter(({ run }) => run !== null && (!runIdFilter || run.id === runIdFilter))
      .map(({ run }) => run!.id);
    const timingsByRunId = new Map<
      string,
      Awaited<ReturnType<typeof this.phaseTimingRepo.findByRunIds>>
    >();
    if (activeRunIds.length > 0) {
      try {
        const allTimings = await this.phaseTimingRepo.findByRunIds(activeRunIds);
        for (const t of allTimings) {
          const list = timingsByRunId.get(t.agentRunId) ?? [];
          list.push(t);
          timingsByRunId.set(t.agentRunId, list);
        }
      } catch {
        // Ignore timing errors mid-stream — phase-completion deltas just
        // won't be emitted this cycle.
      }
    }

    for (const { feature, run } of entries) {
      if (!run) continue;
      if (runIdFilter && run.id !== runIdFilter) continue;

      const prev = featureCache.get(feature.id);
      if (!prev) {
        await this.seedFeatureCache(feature, run, featureCache);
        continue;
      }

      // Feature-level deltas via pure helpers.
      for (const event of computeStatusDeltas({
        feature,
        run,
        prev,
        isProcessAlive: (pid) => this.processLiveness.isProcessAlive(pid),
      })) {
        enqueue(event);
      }
      for (const event of computeFeatureDeltas({ feature, run, prev })) {
        enqueue(event);
      }
      for (const event of computePrDeltas({ feature, run, prev })) {
        enqueue(event);
      }

      // New phase completions (timing rows only appear after finish).
      const timings = timingsByRunId.get(run.id) ?? [];
      for (const event of computePhaseCompletionDeltas({ feature, run, prev, timings })) {
        enqueue(event);
      }
    }

    // Interactive session polling — isolated in its own try so a repo failure
    // here can't poison the main loop.
    try {
      const activeSessions = await this.sessionRepo.findAllActive();
      const sessionEvents = await computeSessionDeltas({
        activeSessions,
        sessionCache,
        fetchById: (id) => this.sessionRepo.findById(id),
      });
      for (const event of sessionEvents) {
        enqueue(event);
      }
    } catch {
      // Ignore interactive session poll errors to not affect main polling.
    }

    // Application row polling — diff against per-connection cache and emit
    // `ApplicationUpdated` on any watched-field change. Seed is silent.
    try {
      const applications = await this.applicationRepo.list();
      for (const app of applications) {
        if (runIdFilter && app.id !== runIdFilter) continue;
        const prev = applicationCache.get(app.id);
        for (const event of computeApplicationDeltas({ application: app, prev })) {
          enqueue(event);
        }
        applicationCache.set(app.id, {
          setupComplete: app.setupComplete,
          status: app.status,
          gitRemoteUrl: app.gitRemoteUrl,
          cloudDeploymentProvider: app.cloudDeploymentProvider,
        });
      }
    } catch {
      // Ignore application-poll failures; same posture as session polling.
    }
  }

  /**
   * Seed the per-connection cache on first sight of a feature. We do NOT
   * emit any events here — otherwise the client would see a burst of
   * "current state" notifications every time it reconnects.
   */
  private async seedFeatureCache(
    feature: Feature,
    run: AgentRun,
    featureCache: Map<string, CachedFeatureState>
  ): Promise<void> {
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
  }
}
