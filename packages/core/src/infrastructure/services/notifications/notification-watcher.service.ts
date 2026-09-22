/**
 * Notification Watcher Service
 *
 * Polls the agent_runs and phase_timings tables to detect status
 * transitions, dispatching NotificationEvents via the NotificationService
 * (which handles settings filters, bus fan-out, and desktop dispatch).
 *
 * Maintains in-memory tracking of last-seen status per run to avoid
 * duplicate notifications. Polling starts/stops with start()/stop()
 * lifecycle methods.
 *
 * Design decision: Uses DB polling instead of IPC because the worker
 * process is spawned detached with IPC disconnected.
 */

import type { AgentRun, Feature, NotificationEvent } from '../../../domain/generated/output.js';
import {
  AgentRunStatus,
  NotificationEventType,
  NotificationSeverity,
  SdlcLifecycle,
} from '../../../domain/generated/output.js';
import { TERMINAL_AGENT_RUN_STATUSES } from '../../../domain/shared/agent-run-status.js';
import type { IAgentRunRepository } from '../../../application/ports/output/agents/agent-run-repository.interface.js';
import type { IPhaseTimingRepository } from '../../../application/ports/output/agents/phase-timing-repository.interface.js';
import type { IFeatureRepository } from '../../../application/ports/output/repositories/feature-repository.interface.js';
import type { INotificationService } from '../../../application/ports/output/services/notification-service.interface.js';

const DEFAULT_POLL_INTERVAL_MS = 3000;

const ACTIVE_STATUS_LIST: readonly AgentRunStatus[] = [
  AgentRunStatus.pending,
  AgentRunStatus.running,
  AgentRunStatus.waitingApproval,
];
const ACTIVE_STATUSES = new Set<string>(ACTIVE_STATUS_LIST);

interface WatcherState {
  status: AgentRunStatus;
  completedPhases: Set<string>;
  featureId: string;
  featureName: string;
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
};

const EVENT_MESSAGES: Partial<Record<NotificationEventType, string>> = {
  [NotificationEventType.AgentStarted]: 'Feature agent started',
  [NotificationEventType.WaitingApproval]: 'Feature agent is waiting for approval',
  [NotificationEventType.AgentCompleted]: 'Feature agent completed successfully',
  [NotificationEventType.AgentFailed]: 'Feature agent failed',
};

export class NotificationWatcherService {
  private readonly runRepository: IAgentRunRepository;
  private readonly phaseTimingRepository: IPhaseTimingRepository;
  private readonly featureRepository: IFeatureRepository;
  private readonly notificationService: INotificationService;
  private readonly pollIntervalMs: number;
  private readonly trackedRuns = new Map<string, WatcherState>();
  private readonly trackedFeatureLifecycles = new Map<string, SdlcLifecycle>();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  // A poll still awaiting the DB when the next tick fires would see the same
  // untracked run and emit its status a second time — ticks skip instead.
  private pollInFlight = false;
  // Suppresses notifications on the first poll to avoid replaying historical state
  private isBootstrapped = false;

  constructor(
    runRepository: IAgentRunRepository,
    phaseTimingRepository: IPhaseTimingRepository,
    featureRepository: IFeatureRepository,
    notificationService: INotificationService,
    pollIntervalMs: number = DEFAULT_POLL_INTERVAL_MS
  ) {
    this.runRepository = runRepository;
    this.phaseTimingRepository = phaseTimingRepository;
    this.featureRepository = featureRepository;
    this.notificationService = notificationService;
    this.pollIntervalMs = pollIntervalMs;
  }

  isRunning(): boolean {
    return this.intervalId !== null;
  }

  start(): void {
    if (this.intervalId !== null) return;

    // Run first poll immediately
    void this.poll();

    this.intervalId = setInterval(() => {
      void this.poll();
    }, this.pollIntervalMs);
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async poll(): Promise<void> {
    if (this.pollInFlight) return;
    this.pollInFlight = true;
    try {
      await this.pollOnce();
    } finally {
      this.pollInFlight = false;
    }
  }

  /**
   * Only runs that can still change are read: the active ones, plus any run
   * we are tracking that has since left the active set (to report its
   * terminal transition). Listing every run ever recorded every tick grew
   * without bound.
   */
  private async fetchChangeableRuns(): Promise<AgentRun[]> {
    const active = await this.runRepository.list({ statuses: ACTIVE_STATUS_LIST });
    const seen = new Set(active.map((run) => run.id));
    const departed = [...this.trackedRuns.keys()].filter((id) => !seen.has(id));
    if (departed.length === 0) return active;
    return [...active, ...(await this.runRepository.findByIds(departed))];
  }

  private async pollOnce(): Promise<void> {
    let runs: AgentRun[] = [];
    try {
      runs = await this.fetchChangeableRuns();
      await this.processRuns(runs);
    } catch {
      // DB not ready or query failed — skip this poll cycle
    }

    try {
      const features = await this.fetchWatchedFeatures(runs);
      this.checkFeatureLifecycles(features);
    } catch {
      // DB not ready or query failed — skip this poll cycle
    }
  }

  /**
   * Only a feature an agent run is driving can move to Review under the
   * watcher's eye, so only those are read: the features of the runs fetched
   * this tick — every active run plus every tracked run, including one that
   * just finished.
   * Listing every feature ever created on each tick grew without bound.
   */
  private async fetchWatchedFeatures(runs: AgentRun[]): Promise<Feature[]> {
    const featureIds = new Set<string>();
    for (const run of runs) if (run.featureId) featureIds.add(run.featureId);

    // A feature nobody watches any more is forgotten, so a later
    // re-observation is a first sighting rather than a stale "transition".
    for (const id of this.trackedFeatureLifecycles.keys()) {
      if (!featureIds.has(id)) this.trackedFeatureLifecycles.delete(id);
    }

    const features = await Promise.all(
      [...featureIds].map((id) => this.featureRepository.findById(id))
    );
    return features.filter((feature): feature is Feature => feature !== null);
  }

  private async processRuns(runs: AgentRun[]): Promise<void> {
    const currentRunIds = new Set<string>();

    for (const run of runs) {
      if (!ACTIVE_STATUSES.has(run.status) && !this.trackedRuns.has(run.id)) {
        // Skip terminal runs we haven't been tracking
        continue;
      }

      currentRunIds.add(run.id);
      const prevState = this.trackedRuns.get(run.id);

      if (!prevState) {
        // New run — track and emit initial status event
        const { featureId, featureName } = await this.resolveFeatureIdentity(run);
        const newState: WatcherState = {
          status: run.status,
          completedPhases: new Set<string>(),
          featureId,
          featureName,
        };

        this.trackedRuns.set(run.id, newState);
        if (this.isBootstrapped) {
          this.emitStatusEvent(run, newState);
        }

        // Check for completed phases on first observation
        await this.checkPhaseCompletions(run.id, newState);
      } else if (prevState.status !== run.status) {
        // Status changed — emit event
        prevState.status = run.status;
        this.emitStatusEvent(run, prevState);

        if (TERMINAL_AGENT_RUN_STATUSES.has(run.status)) {
          // Run reached terminal state — clean up after emitting
          this.trackedRuns.delete(run.id);
        } else {
          // Still active — check for phase completions
          await this.checkPhaseCompletions(run.id, prevState);
        }
      } else {
        // Same status — just check for phase completions
        await this.checkPhaseCompletions(run.id, prevState);
      }
    }

    if (!this.isBootstrapped) {
      this.isBootstrapped = true;
    }

    // Clean up tracking for runs that disappeared from the list
    for (const trackedId of this.trackedRuns.keys()) {
      if (!currentRunIds.has(trackedId)) {
        this.trackedRuns.delete(trackedId);
      }
    }
  }

  private emitStatusEvent(run: AgentRun, state: WatcherState): void {
    const mapping = STATUS_TO_EVENT[run.status];
    if (!mapping) return;

    const event: NotificationEvent = {
      eventType: mapping.eventType,
      agentRunId: run.id,
      featureId: state.featureId,
      featureName: state.featureName,
      message: EVENT_MESSAGES[mapping.eventType] ?? `Agent status: ${run.status}`,
      severity: mapping.severity,
      timestamp: new Date().toISOString(),
    };

    this.notificationService.notify(event);
  }

  private async checkPhaseCompletions(runId: string, state: WatcherState): Promise<void> {
    const timings = await this.phaseTimingRepository.findByRunId(runId);

    for (const timing of timings) {
      if (timing.completedAt && !state.completedPhases.has(timing.phase)) {
        state.completedPhases.add(timing.phase);

        if (this.isBootstrapped) {
          const event: NotificationEvent = {
            eventType: NotificationEventType.PhaseCompleted,
            agentRunId: runId,
            featureId: state.featureId,
            featureName: state.featureName,
            phaseName: timing.phase,
            message: `Completed ${timing.phase} phase`,
            severity: NotificationSeverity.Info,
            timestamp: new Date().toISOString(),
          };

          this.notificationService.notify(event);
        }
      }
    }
  }

  private checkFeatureLifecycles(features: Feature[]): void {
    for (const feature of features) {
      const prevLifecycle = this.trackedFeatureLifecycles.get(feature.id);
      this.trackedFeatureLifecycles.set(feature.id, feature.lifecycle);

      // Emit notification when a feature transitions TO Review from a known previous state.
      // Skip when prevLifecycle is undefined (first observation / bootstrap seeding) or
      // when the watcher hasn't completed its first poll yet.
      if (
        this.isBootstrapped &&
        prevLifecycle !== undefined &&
        feature.lifecycle === SdlcLifecycle.Review &&
        prevLifecycle !== SdlcLifecycle.Review
      ) {
        const prUrl = feature.pr?.url;
        const message = prUrl ? `Ready for merge review — PR: ${prUrl}` : 'Ready for merge review';

        const event: NotificationEvent = {
          eventType: NotificationEventType.MergeReviewReady,
          agentRunId: feature.agentRunId ?? '',
          featureId: feature.id,
          featureName: feature.name,
          message,
          severity: NotificationSeverity.Info,
          timestamp: new Date().toISOString(),
        };

        this.notificationService.notify(event);
      }
    }
  }

  private async resolveFeatureIdentity(
    run: AgentRun
  ): Promise<{ featureId: string; featureName: string }> {
    if (run.featureId) {
      try {
        const feature = await this.featureRepository.findById(run.featureId);
        if (feature) return { featureId: feature.id, featureName: feature.name };
      } catch {
        // Fall through to fallback
      }
    }
    return { featureId: run.featureId ?? run.id, featureName: `Agent ${run.id}` };
  }
}

// --- Singleton accessors (follows getNotificationBus() pattern) ---

let watcherInstance: NotificationWatcherService | null = null;

/**
 * Initialize the notification watcher singleton.
 * Must be called once during web server startup.
 *
 * @throws Error if the watcher is already initialized
 */
export function initializeNotificationWatcher(
  runRepository: IAgentRunRepository,
  phaseTimingRepository: IPhaseTimingRepository,
  featureRepository: IFeatureRepository,
  notificationService: INotificationService,
  pollIntervalMs?: number
): void {
  if (watcherInstance !== null) {
    throw new Error('Notification watcher already initialized. Cannot re-initialize.');
  }

  watcherInstance = new NotificationWatcherService(
    runRepository,
    phaseTimingRepository,
    featureRepository,
    notificationService,
    pollIntervalMs
  );
}

/**
 * Get the notification watcher singleton.
 *
 * @returns The notification watcher service
 * @throws Error if the watcher hasn't been initialized yet
 */
export function getNotificationWatcher(): NotificationWatcherService {
  if (watcherInstance === null) {
    throw new Error(
      'Notification watcher not initialized. Call initializeNotificationWatcher() during web server startup.'
    );
  }

  return watcherInstance;
}

/**
 * Check if the notification watcher has been initialized.
 */
export function hasNotificationWatcher(): boolean {
  return watcherInstance !== null;
}

/**
 * Reset the notification watcher singleton (for testing purposes only).
 * Stops the watcher if running before resetting.
 *
 * @internal
 */
export function resetNotificationWatcher(): void {
  if (watcherInstance !== null) {
    watcherInstance.stop();
  }
  watcherInstance = null;
}
