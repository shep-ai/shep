/**
 * NotificationWatcherService Unit Tests
 *
 * Tests for the polling-based service that detects agent status
 * transitions and phase completions from the database, dispatching
 * notification events via INotificationService.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type {
  AgentRun,
  Feature,
  PhaseTiming,
  NotificationEvent,
} from '@/domain/generated/output.js';
import {
  AgentRunStatus,
  NotificationEventType,
  NotificationSeverity,
  SdlcLifecycle,
} from '@/domain/generated/output.js';
import { NotificationWatcherService } from '@/infrastructure/services/notifications/notification-watcher.service.js';
import type { IAgentRunRepository } from '@/application/ports/output/agents/agent-run-repository.interface.js';
import type { IPhaseTimingRepository } from '@/application/ports/output/agents/phase-timing-repository.interface.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import type { INotificationService } from '@/application/ports/output/services/notification-service.interface.js';

function createMockAgentRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run-1',
    agentType: 'claude-code' as any,
    agentName: 'feature-agent',
    status: AgentRunStatus.running,
    prompt: 'test prompt',
    threadId: 'thread-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    featureId: 'feat-1',
    ...overrides,
  };
}

function createMockPhaseTiming(overrides: Partial<PhaseTiming> = {}): PhaseTiming {
  return {
    id: 'timing-1',
    agentRunId: 'run-1',
    phase: 'analyze',
    startedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createMockRunRepository(runs: AgentRun[] = []): IAgentRunRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByThreadId: vi.fn(),
    findByIds: vi.fn().mockResolvedValue([]),
    updateStatus: vi.fn(),
    updatePinnedConfig: vi.fn(),
    findRunningByPid: vi.fn(),
    list: vi.fn().mockResolvedValue(runs),
    delete: vi.fn(),
  };
}

function createMockPhaseTimingRepository(timings: PhaseTiming[] = []): IPhaseTimingRepository {
  return {
    save: vi.fn(),
    update: vi.fn(),
    updateApprovalWait: vi.fn(),
    findByRunId: vi.fn().mockResolvedValue(timings),
    findByRunIds: vi.fn().mockResolvedValue([]),
    findByFeatureId: vi.fn(),
  };
}

function createMockFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'feat-1',
    name: 'Test Feature',
    slug: 'test-feature',
    repositoryPath: '/test/repo',
    branch: 'feat/test',
    lifecycle: SdlcLifecycle.Implementation,
    messages: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Feature;
}

function createMockFeatureRepository(): IFeatureRepository {
  return {
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue({ name: 'Quick Markdown File Creation' }),
    findByIdPrefix: vi.fn(),
    findBySlug: vi.fn(),
    findByBranch: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    delete: vi.fn(),
    softDelete: vi.fn(),
    findByParentId: vi.fn(),
  };
}

function createMockNotificationService(): INotificationService & {
  receivedEvents: NotificationEvent[];
} {
  const receivedEvents: NotificationEvent[] = [];
  return {
    receivedEvents,
    notify: vi.fn((event: NotificationEvent) => {
      receivedEvents.push(event);
    }),
  };
}

describe('NotificationWatcherService', () => {
  let runRepo: IAgentRunRepository;
  let phaseRepo: IPhaseTimingRepository;
  let featureRepo: IFeatureRepository;
  let notificationService: ReturnType<typeof createMockNotificationService>;
  let watcher: NotificationWatcherService;

  beforeEach(() => {
    vi.useFakeTimers();

    runRepo = createMockRunRepository();
    phaseRepo = createMockPhaseTimingRepository();
    featureRepo = createMockFeatureRepository();
    notificationService = createMockNotificationService();
    watcher = new NotificationWatcherService(runRepo, phaseRepo, featureRepo, notificationService);
  });

  afterEach(() => {
    watcher.stop();
    vi.useRealTimers();
  });

  /**
   * Bootstrap helper: triggers the first poll with empty runs so the watcher
   * transitions from bootstrap → live mode. After this call, the watcher is
   * bootstrapped and subsequent polls will emit notifications normally.
   */
  async function bootstrapWithEmptyRuns(): Promise<void> {
    vi.mocked(runRepo.list).mockResolvedValueOnce([]);
    vi.mocked(phaseRepo.findByRunId).mockResolvedValue([]);
    watcher.start();
    await vi.advanceTimersByTimeAsync(0); // trigger first (bootstrap) poll
    // Clear any tracking from bootstrap
    notificationService.receivedEvents.length = 0;
    vi.mocked(notificationService.notify).mockClear();
  }

  describe('bootstrap suppression', () => {
    it('should not emit notifications for pre-existing active runs on first poll', async () => {
      const run = createMockAgentRun({
        id: 'run-1',
        status: AgentRunStatus.running,
        featureId: 'feat-1',
      });

      vi.mocked(runRepo.list).mockResolvedValue([run]);
      vi.mocked(phaseRepo.findByRunId).mockResolvedValue([]);

      watcher.start();
      await vi.advanceTimersByTimeAsync(0);

      // Bootstrap poll should seed state silently — zero notifications
      expect(notificationService.notify).not.toHaveBeenCalled();
    });

    it('should not emit notifications for pre-existing completed phases on first poll', async () => {
      const run = createMockAgentRun({ id: 'run-1', status: AgentRunStatus.running });
      const completedPhase = createMockPhaseTiming({
        agentRunId: 'run-1',
        phase: 'analyze',
        completedAt: new Date(),
      });

      vi.mocked(runRepo.list).mockResolvedValue([run]);
      vi.mocked(phaseRepo.findByRunId).mockResolvedValue([completedPhase]);

      watcher.start();
      await vi.advanceTimersByTimeAsync(0);

      // Bootstrap poll should seed completed phases silently — zero notifications
      expect(notificationService.notify).not.toHaveBeenCalled();
    });

    it('should emit notification for genuinely new run on second poll', async () => {
      const existingRun = createMockAgentRun({ id: 'run-1', status: AgentRunStatus.running });

      // First poll (bootstrap): existing run is present, should be silently seeded
      vi.mocked(runRepo.list).mockResolvedValueOnce([existingRun]);
      vi.mocked(phaseRepo.findByRunId).mockResolvedValue([]);

      watcher.start();
      await vi.advanceTimersByTimeAsync(0);

      // Bootstrap must not emit
      expect(notificationService.notify).not.toHaveBeenCalled();

      // Second poll: a genuinely new run appears alongside the existing one
      const newRun = createMockAgentRun({ id: 'run-2', status: AgentRunStatus.running });
      vi.mocked(runRepo.list).mockResolvedValue([existingRun, newRun]);
      notificationService.receivedEvents.length = 0;
      vi.mocked(notificationService.notify).mockClear();

      await vi.advanceTimersByTimeAsync(3000);

      // Only the new run should trigger a notification
      expect(notificationService.receivedEvents).toHaveLength(1);
      expect(notificationService.receivedEvents[0]!.eventType).toBe(
        NotificationEventType.AgentStarted
      );
      expect(notificationService.receivedEvents[0]!.agentRunId).toBe('run-2');
    });

    it('should emit PhaseCompleted for new phase completion on second poll', async () => {
      const run = createMockAgentRun({ id: 'run-1', status: AgentRunStatus.running });
      const existingPhase = createMockPhaseTiming({
        agentRunId: 'run-1',
        phase: 'analyze',
        completedAt: new Date(),
      });

      // First poll (bootstrap): run with completed analyze phase — silently seeded
      vi.mocked(runRepo.list).mockResolvedValue([run]);
      vi.mocked(phaseRepo.findByRunId).mockResolvedValueOnce([existingPhase]);

      watcher.start();
      await vi.advanceTimersByTimeAsync(0);

      // Bootstrap must not emit
      expect(notificationService.notify).not.toHaveBeenCalled();

      // Second poll: a new phase (plan) completes
      const newPhase = createMockPhaseTiming({
        id: 'timing-2',
        agentRunId: 'run-1',
        phase: 'plan',
        completedAt: new Date(),
      });
      vi.mocked(phaseRepo.findByRunId).mockResolvedValue([existingPhase, newPhase]);
      notificationService.receivedEvents.length = 0;
      vi.mocked(notificationService.notify).mockClear();

      await vi.advanceTimersByTimeAsync(3000);

      // Only the new phase completion should trigger a notification
      const phaseEvents = notificationService.receivedEvents.filter(
        (e) => e.eventType === NotificationEventType.PhaseCompleted
      );
      expect(phaseEvents).toHaveLength(1);
      expect(phaseEvents[0]!.phaseName).toBe('plan');
    });

    it('should not emit notifications for unchanged runs on second poll', async () => {
      const run = createMockAgentRun({ id: 'run-1', status: AgentRunStatus.running });
      const completedPhase = createMockPhaseTiming({
        agentRunId: 'run-1',
        phase: 'analyze',
        completedAt: new Date(),
      });

      // First poll (bootstrap): run with completed phase — silently seeded
      vi.mocked(runRepo.list).mockResolvedValue([run]);
      vi.mocked(phaseRepo.findByRunId).mockResolvedValue([completedPhase]);

      watcher.start();
      await vi.advanceTimersByTimeAsync(0);

      // Bootstrap must not emit
      expect(notificationService.notify).not.toHaveBeenCalled();

      // Second poll: same runs, same phases — nothing changed
      notificationService.receivedEvents.length = 0;
      vi.mocked(notificationService.notify).mockClear();

      await vi.advanceTimersByTimeAsync(3000);

      // No notifications — nothing is new or changed
      expect(notificationService.notify).not.toHaveBeenCalled();
    });
  });

  describe('start/stop lifecycle', () => {
    it('should poll repository at configured interval', async () => {
      vi.mocked(runRepo.list).mockResolvedValue([]);

      watcher.start();

      // First poll happens immediately
      await vi.advanceTimersByTimeAsync(0);
      expect(runRepo.list).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(3000);
      expect(runRepo.list).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(3000);
      expect(runRepo.list).toHaveBeenCalledTimes(3);
    });

    it('should stop polling when stop() is called', async () => {
      vi.mocked(runRepo.list).mockResolvedValue([]);

      watcher.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(runRepo.list).toHaveBeenCalledTimes(1);

      watcher.stop();

      await vi.advanceTimersByTimeAsync(10000);
      expect(runRepo.list).toHaveBeenCalledTimes(1);
    });
  });

  describe('status transition detection', () => {
    it('should emit agentStarted event when run first appears after bootstrap', async () => {
      await bootstrapWithEmptyRuns();

      const run = createMockAgentRun({
        id: 'run-1',
        status: AgentRunStatus.running,
        featureId: 'feat-1',
      });

      vi.mocked(runRepo.list).mockResolvedValue([run]);
      vi.mocked(phaseRepo.findByRunId).mockResolvedValue([]);

      await vi.advanceTimersByTimeAsync(3000);

      expect(notificationService.receivedEvents).toHaveLength(1);
      expect(notificationService.receivedEvents[0]!.eventType).toBe(
        NotificationEventType.AgentStarted
      );
      expect(notificationService.receivedEvents[0]!.severity).toBe(NotificationSeverity.Info);
      expect(notificationService.receivedEvents[0]!.agentRunId).toBe('run-1');
    });

    it('should emit agentCompleted event when run transitions to completed', async () => {
      await bootstrapWithEmptyRuns();

      const runningRun = createMockAgentRun({ id: 'run-1', status: AgentRunStatus.running });
      const completedRun = createMockAgentRun({ id: 'run-1', status: AgentRunStatus.completed });

      vi.mocked(runRepo.list)
        .mockResolvedValueOnce([runningRun])
        .mockResolvedValueOnce([completedRun]);
      vi.mocked(phaseRepo.findByRunId).mockResolvedValue([]);

      await vi.advanceTimersByTimeAsync(3000); // poll 2: sees running run
      notificationService.receivedEvents.length = 0;

      await vi.advanceTimersByTimeAsync(3000); // poll 3: sees completed run

      expect(notificationService.receivedEvents).toHaveLength(1);
      expect(notificationService.receivedEvents[0]!.eventType).toBe(
        NotificationEventType.AgentCompleted
      );
      expect(notificationService.receivedEvents[0]!.severity).toBe(NotificationSeverity.Success);
    });

    it('should emit agentFailed event when run transitions to failed', async () => {
      await bootstrapWithEmptyRuns();

      const runningRun = createMockAgentRun({ id: 'run-1', status: AgentRunStatus.running });
      const failedRun = createMockAgentRun({ id: 'run-1', status: AgentRunStatus.failed });

      vi.mocked(runRepo.list)
        .mockResolvedValueOnce([runningRun])
        .mockResolvedValueOnce([failedRun]);
      vi.mocked(phaseRepo.findByRunId).mockResolvedValue([]);

      await vi.advanceTimersByTimeAsync(3000); // poll 2: sees running run
      notificationService.receivedEvents.length = 0;

      await vi.advanceTimersByTimeAsync(3000); // poll 3: sees failed run

      expect(notificationService.receivedEvents).toHaveLength(1);
      expect(notificationService.receivedEvents[0]!.eventType).toBe(
        NotificationEventType.AgentFailed
      );
      expect(notificationService.receivedEvents[0]!.severity).toBe(NotificationSeverity.Error);
    });

    it('should emit waitingApproval event when run transitions to waiting_approval', async () => {
      await bootstrapWithEmptyRuns();

      const runningRun = createMockAgentRun({ id: 'run-1', status: AgentRunStatus.running });
      const waitingRun = createMockAgentRun({
        id: 'run-1',
        status: AgentRunStatus.waitingApproval,
      });

      vi.mocked(runRepo.list)
        .mockResolvedValueOnce([runningRun])
        .mockResolvedValueOnce([waitingRun]);
      vi.mocked(phaseRepo.findByRunId).mockResolvedValue([]);

      await vi.advanceTimersByTimeAsync(3000); // poll 2: sees running run
      notificationService.receivedEvents.length = 0;

      await vi.advanceTimersByTimeAsync(3000); // poll 3: sees waiting run

      expect(notificationService.receivedEvents).toHaveLength(1);
      expect(notificationService.receivedEvents[0]!.eventType).toBe(
        NotificationEventType.WaitingApproval
      );
      expect(notificationService.receivedEvents[0]!.severity).toBe(NotificationSeverity.Warning);
    });

    it('should not emit duplicate event for already-seen status', async () => {
      await bootstrapWithEmptyRuns();

      const run = createMockAgentRun({ id: 'run-1', status: AgentRunStatus.running });

      vi.mocked(runRepo.list).mockResolvedValue([run]);
      vi.mocked(phaseRepo.findByRunId).mockResolvedValue([]);

      await vi.advanceTimersByTimeAsync(3000); // poll 2: first observation post-bootstrap
      expect(notificationService.receivedEvents).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(3000); // poll 3: same status
      expect(notificationService.receivedEvents).toHaveLength(1); // no duplicate
    });
  });

  describe('phase completion detection', () => {
    it('should emit phaseCompleted event when new phase timing has completedAt', async () => {
      await bootstrapWithEmptyRuns();

      const run = createMockAgentRun({ id: 'run-1', status: AgentRunStatus.running });
      const completedPhase = createMockPhaseTiming({
        agentRunId: 'run-1',
        phase: 'analyze',
        completedAt: new Date(),
      });

      vi.mocked(runRepo.list).mockResolvedValue([run]);
      vi.mocked(phaseRepo.findByRunId)
        .mockResolvedValueOnce([]) // poll 2: no completed phases yet
        .mockResolvedValueOnce([completedPhase]); // poll 3: analyze completed

      await vi.advanceTimersByTimeAsync(3000); // poll 2: sees run, no phases
      notificationService.receivedEvents.length = 0; // clear the agentStarted event

      await vi.advanceTimersByTimeAsync(3000); // poll 3: phase completed

      const phaseEvents = notificationService.receivedEvents.filter(
        (e) => e.eventType === NotificationEventType.PhaseCompleted
      );
      expect(phaseEvents).toHaveLength(1);
      expect(phaseEvents[0]!.phaseName).toBe('analyze');
      expect(phaseEvents[0]!.severity).toBe(NotificationSeverity.Info);
    });

    it('should not re-emit for already seen completed phases', async () => {
      await bootstrapWithEmptyRuns();

      const run = createMockAgentRun({ id: 'run-1', status: AgentRunStatus.running });
      const completedPhase = createMockPhaseTiming({
        agentRunId: 'run-1',
        phase: 'analyze',
        completedAt: new Date(),
      });

      vi.mocked(runRepo.list).mockResolvedValue([run]);
      vi.mocked(phaseRepo.findByRunId).mockResolvedValue([completedPhase]);

      await vi.advanceTimersByTimeAsync(3000); // poll 2: first observation
      const initialPhaseEvents = notificationService.receivedEvents.filter(
        (e) => e.eventType === NotificationEventType.PhaseCompleted
      );
      expect(initialPhaseEvents).toHaveLength(1);

      notificationService.receivedEvents.length = 0;
      await vi.advanceTimersByTimeAsync(3000); // poll 3: same phases

      const secondPhaseEvents = notificationService.receivedEvents.filter(
        (e) => e.eventType === NotificationEventType.PhaseCompleted
      );
      expect(secondPhaseEvents).toHaveLength(0);
    });
  });

  describe('feature name resolution', () => {
    it('should resolve actual feature name from repository', async () => {
      await bootstrapWithEmptyRuns();

      const run = createMockAgentRun({
        id: 'run-1',
        status: AgentRunStatus.running,
        featureId: 'feat-1',
      });

      vi.mocked(featureRepo.findById).mockResolvedValue({
        name: 'Quick Markdown File Creation',
      } as any);
      vi.mocked(runRepo.list).mockResolvedValue([run]);
      vi.mocked(phaseRepo.findByRunId).mockResolvedValue([]);

      await vi.advanceTimersByTimeAsync(3000);

      expect(featureRepo.findById).toHaveBeenCalledWith('feat-1');
      expect(notificationService.receivedEvents).toHaveLength(1);
      expect(notificationService.receivedEvents[0]!.featureName).toBe(
        'Quick Markdown File Creation'
      );
    });

    it('should use agent run id as fallback when featureId is not set', async () => {
      await bootstrapWithEmptyRuns();

      const run = createMockAgentRun({
        id: 'run-1',
        status: AgentRunStatus.running,
        featureId: undefined,
      });

      vi.mocked(runRepo.list).mockResolvedValue([run]);
      vi.mocked(phaseRepo.findByRunId).mockResolvedValue([]);

      await vi.advanceTimersByTimeAsync(3000); // poll 2: first observation post-bootstrap

      expect(notificationService.receivedEvents).toHaveLength(1);
      expect(notificationService.receivedEvents[0]!.featureName).toBe('Agent run-1');
    });

    it('should fall back to agent id when feature repository throws', async () => {
      await bootstrapWithEmptyRuns();

      const run = createMockAgentRun({
        id: 'run-1',
        status: AgentRunStatus.running,
        featureId: 'feat-1',
      });

      vi.mocked(featureRepo.findById).mockRejectedValue(new Error('DB error'));
      vi.mocked(runRepo.list).mockResolvedValue([run]);
      vi.mocked(phaseRepo.findByRunId).mockResolvedValue([]);

      await vi.advanceTimersByTimeAsync(3000);

      expect(notificationService.receivedEvents).toHaveLength(1);
      expect(notificationService.receivedEvents[0]!.featureName).toBe('Agent run-1');
    });
  });

  describe('cleanup of terminal runs', () => {
    it('should remove tracking for runs that reach terminal state', async () => {
      await bootstrapWithEmptyRuns();

      const runningRun = createMockAgentRun({ id: 'run-1', status: AgentRunStatus.running });
      const completedRun = createMockAgentRun({ id: 'run-1', status: AgentRunStatus.completed });

      vi.mocked(runRepo.list)
        .mockResolvedValueOnce([runningRun])
        .mockResolvedValueOnce([completedRun])
        .mockResolvedValueOnce([]); // run is gone
      vi.mocked(phaseRepo.findByRunId).mockResolvedValue([]);

      await vi.advanceTimersByTimeAsync(3000); // poll 2: agentStarted
      await vi.advanceTimersByTimeAsync(3000); // poll 3: agentCompleted
      notificationService.receivedEvents.length = 0;

      await vi.advanceTimersByTimeAsync(3000); // poll 4: should not re-emit anything
      expect(notificationService.receivedEvents).toHaveLength(0);
    });
  });

  describe('error handling', () => {
    it('should not crash if repository throws during poll', async () => {
      vi.mocked(runRepo.list).mockRejectedValue(new Error('DB error'));

      watcher.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(notificationService.receivedEvents).toHaveLength(0);

      // Should continue polling after error
      vi.mocked(runRepo.list).mockResolvedValue([]);
      await vi.advanceTimersByTimeAsync(3000);
      expect(runRepo.list).toHaveBeenCalledTimes(2);
    });
  });

  describe('feature lifecycle detection (merge review ready)', () => {
    it('should emit MergeReviewReady when feature transitions to Review', async () => {
      await bootstrapWithEmptyRuns();

      const feature = createMockFeature({
        id: 'feat-1',
        name: 'Dark Mode Toggle',
        lifecycle: SdlcLifecycle.Implementation,
      });

      // Poll 2: feature is in Implementation — seed it
      vi.mocked(featureRepo.list).mockResolvedValueOnce([feature]);
      await vi.advanceTimersByTimeAsync(3000);
      notificationService.receivedEvents.length = 0;
      vi.mocked(notificationService.notify).mockClear();

      // Poll 3: feature transitions to Review
      const reviewFeature = createMockFeature({
        id: 'feat-1',
        name: 'Dark Mode Toggle',
        lifecycle: SdlcLifecycle.Review,
        pr: { url: 'https://github.com/org/repo/pull/42', number: 42, status: 'open' as any },
      });
      vi.mocked(featureRepo.list).mockResolvedValueOnce([reviewFeature]);
      await vi.advanceTimersByTimeAsync(3000);

      const reviewEvents = notificationService.receivedEvents.filter(
        (e) => e.eventType === NotificationEventType.MergeReviewReady
      );
      expect(reviewEvents).toHaveLength(1);
      expect(reviewEvents[0]!.featureId).toBe('feat-1');
      expect(reviewEvents[0]!.featureName).toBe('Dark Mode Toggle');
      expect(reviewEvents[0]!.severity).toBe(NotificationSeverity.Info);
      expect(reviewEvents[0]!.message).toContain('https://github.com/org/repo/pull/42');
    });

    it('should include PR URL in message when available', async () => {
      await bootstrapWithEmptyRuns();

      const feature = createMockFeature({
        id: 'feat-1',
        lifecycle: SdlcLifecycle.Implementation,
      });

      vi.mocked(featureRepo.list).mockResolvedValueOnce([feature]);
      await vi.advanceTimersByTimeAsync(3000);
      notificationService.receivedEvents.length = 0;
      vi.mocked(notificationService.notify).mockClear();

      const reviewFeature = createMockFeature({
        id: 'feat-1',
        lifecycle: SdlcLifecycle.Review,
        pr: { url: 'https://github.com/org/repo/pull/99', number: 99, status: 'open' as any },
      });
      vi.mocked(featureRepo.list).mockResolvedValueOnce([reviewFeature]);
      await vi.advanceTimersByTimeAsync(3000);

      const reviewEvents = notificationService.receivedEvents.filter(
        (e) => e.eventType === NotificationEventType.MergeReviewReady
      );
      expect(reviewEvents[0]!.message).toBe(
        'Ready for merge review — PR: https://github.com/org/repo/pull/99'
      );
    });

    it('should use generic message when no PR URL available', async () => {
      await bootstrapWithEmptyRuns();

      const feature = createMockFeature({
        id: 'feat-1',
        lifecycle: SdlcLifecycle.Implementation,
      });

      vi.mocked(featureRepo.list).mockResolvedValueOnce([feature]);
      await vi.advanceTimersByTimeAsync(3000);
      notificationService.receivedEvents.length = 0;
      vi.mocked(notificationService.notify).mockClear();

      const reviewFeature = createMockFeature({
        id: 'feat-1',
        lifecycle: SdlcLifecycle.Review,
      });
      vi.mocked(featureRepo.list).mockResolvedValueOnce([reviewFeature]);
      await vi.advanceTimersByTimeAsync(3000);

      const reviewEvents = notificationService.receivedEvents.filter(
        (e) => e.eventType === NotificationEventType.MergeReviewReady
      );
      expect(reviewEvents[0]!.message).toBe('Ready for merge review');
    });

    it('should not emit MergeReviewReady for features already in Review on bootstrap', async () => {
      const feature = createMockFeature({
        id: 'feat-1',
        lifecycle: SdlcLifecycle.Review,
      });

      vi.mocked(runRepo.list).mockResolvedValue([]);
      vi.mocked(phaseRepo.findByRunId).mockResolvedValue([]);
      vi.mocked(featureRepo.list).mockResolvedValue([feature]);

      watcher.start();
      await vi.advanceTimersByTimeAsync(0); // bootstrap poll

      expect(notificationService.notify).not.toHaveBeenCalled();
    });

    it('should not re-emit MergeReviewReady for feature that stays in Review', async () => {
      await bootstrapWithEmptyRuns();

      const feature = createMockFeature({
        id: 'feat-1',
        lifecycle: SdlcLifecycle.Implementation,
      });

      vi.mocked(featureRepo.list).mockResolvedValueOnce([feature]);
      await vi.advanceTimersByTimeAsync(3000);
      notificationService.receivedEvents.length = 0;
      vi.mocked(notificationService.notify).mockClear();

      // Transition to Review
      const reviewFeature = createMockFeature({
        id: 'feat-1',
        lifecycle: SdlcLifecycle.Review,
      });
      vi.mocked(featureRepo.list).mockResolvedValue([reviewFeature]);
      await vi.advanceTimersByTimeAsync(3000); // emits MergeReviewReady
      expect(notificationService.receivedEvents).toHaveLength(1);

      notificationService.receivedEvents.length = 0;
      vi.mocked(notificationService.notify).mockClear();

      // Still in Review on next poll — should NOT re-emit
      await vi.advanceTimersByTimeAsync(3000);
      expect(notificationService.notify).not.toHaveBeenCalled();
    });

    it('should not emit MergeReviewReady for non-Review lifecycle transitions', async () => {
      await bootstrapWithEmptyRuns();

      const feature = createMockFeature({
        id: 'feat-1',
        lifecycle: SdlcLifecycle.Started,
      });

      vi.mocked(featureRepo.list).mockResolvedValueOnce([feature]);
      await vi.advanceTimersByTimeAsync(3000);
      notificationService.receivedEvents.length = 0;
      vi.mocked(notificationService.notify).mockClear();

      // Transition to Implementation (not Review)
      const implFeature = createMockFeature({
        id: 'feat-1',
        lifecycle: SdlcLifecycle.Implementation,
      });
      vi.mocked(featureRepo.list).mockResolvedValueOnce([implFeature]);
      await vi.advanceTimersByTimeAsync(3000);

      const reviewEvents = notificationService.receivedEvents.filter(
        (e) => e.eventType === NotificationEventType.MergeReviewReady
      );
      expect(reviewEvents).toHaveLength(0);
    });
  });
});
