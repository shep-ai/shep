/**
 * PrSyncWatcherService Unit Tests
 *
 * Tests for the polling-based service that detects PR status and CI status
 * transitions from GitHub, updating features and dispatching notification
 * events via INotificationService.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Feature, NotificationEvent } from '@/domain/generated/output.js';
import {
  SdlcLifecycle,
  PrStatus,
  CiStatus,
  NotificationEventType,
  NotificationSeverity,
} from '@/domain/generated/output.js';
import {
  PrSyncWatcherService,
  initializePrSyncWatcher,
  getPrSyncWatcher,
  hasPrSyncWatcher,
  resetPrSyncWatcher,
} from '@/infrastructure/services/pr-sync/pr-sync-watcher.service.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import type { IAgentRunRepository } from '@/application/ports/output/agents/agent-run-repository.interface.js';
import type { IGitPrService } from '@/application/ports/output/services/git-pr-service.interface.js';
import type { INotificationService } from '@/application/ports/output/services/notification-service.interface.js';
import { AgentRunStatus, FeatureMode } from '@/domain/generated/output.js';

function createMockFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'feat-1',
    name: 'Test Feature',
    userQuery: 'test',
    slug: 'test-feature',
    description: 'A test feature',
    repositoryPath: '/repo/path',
    branch: 'feat/test',
    lifecycle: SdlcLifecycle.Review,
    messages: [],
    relatedArtifacts: [],
    mode: FeatureMode.Regular,
    iterationCount: 0,
    push: true,
    openPr: true,
    forkAndPr: false,
    commitSpecs: true,
    ciWatchEnabled: true,
    enableEvidence: false,
    injectSkills: false,
    commitEvidence: false,
    approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
    pr: {
      url: 'https://github.com/org/repo/pull/1',
      number: 1,
      status: PrStatus.Open,
      ciStatus: CiStatus.Pending,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createMockFeatureRepository(features: Feature[] = []): IFeatureRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByIdPrefix: vi.fn(),
    findBySlug: vi.fn(),
    findByBranch: vi.fn(),
    findByParentId: vi.fn().mockResolvedValue([]),
    list: vi.fn().mockResolvedValue(features),
    update: vi.fn(),
    delete: vi.fn(),
    softDelete: vi.fn(),
  };
}

function createMockGitPrService(): IGitPrService {
  return {
    hasRemote: vi.fn().mockResolvedValue(true),
    getRemoteUrl: vi.fn().mockResolvedValue('https://github.com/org/repo'),
    getDefaultBranch: vi.fn().mockResolvedValue('main'),
    hasUncommittedChanges: vi.fn(),
    commitAll: vi.fn(),
    push: vi.fn(),
    createPr: vi.fn(),
    mergePr: vi.fn(),
    mergeBranch: vi.fn(),
    getCiStatus: vi.fn().mockResolvedValue({ status: 'pending' }),
    watchCi: vi.fn(),
    deleteBranch: vi.fn(),
    getPrDiffSummary: vi.fn(),
    listPrStatuses: vi.fn().mockResolvedValue([]),
    getFailureLogs: vi.fn().mockResolvedValue(''),
    getFileDiffs: vi.fn().mockResolvedValue([]),
    verifyMerge: vi.fn().mockResolvedValue(false),
    getMergeableStatus: vi.fn().mockResolvedValue(undefined),
    revParse: vi.fn().mockResolvedValue('mock-sha'),
    localMergeSquash: vi.fn().mockResolvedValue(undefined),
    syncMain: vi.fn().mockResolvedValue(undefined),
    rebaseOnMain: vi.fn().mockResolvedValue(undefined),
    getConflictedFiles: vi.fn().mockResolvedValue([]),
    stageFiles: vi.fn().mockResolvedValue(undefined),
    rebaseContinue: vi.fn().mockResolvedValue(undefined),
    rebaseAbort: vi.fn().mockResolvedValue(undefined),
    getBranchSyncStatus: vi.fn().mockResolvedValue({ ahead: 0, behind: 0 }),
    stash: vi.fn().mockResolvedValue(false),
    stashPop: vi.fn().mockResolvedValue(undefined),
    stashDrop: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockAgentRunRepository(): IAgentRunRepository {
  return {
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue(null),
    findByThreadId: vi.fn().mockResolvedValue(null),
    updateStatus: vi.fn(),
    updatePinnedConfig: vi.fn(),
    findRunningByPid: vi.fn().mockResolvedValue([]),
    list: vi.fn().mockResolvedValue([]),
    delete: vi.fn(),
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

describe('PrSyncWatcherService', () => {
  let featureRepo: IFeatureRepository;
  let agentRunRepo: IAgentRunRepository;
  let gitPrService: IGitPrService;
  let notificationService: ReturnType<typeof createMockNotificationService>;
  let watcher: PrSyncWatcherService;

  beforeEach(() => {
    vi.useFakeTimers();

    featureRepo = createMockFeatureRepository();
    agentRunRepo = createMockAgentRunRepository();
    gitPrService = createMockGitPrService();
    notificationService = createMockNotificationService();
    watcher = new PrSyncWatcherService(
      featureRepo,
      agentRunRepo,
      gitPrService,
      notificationService
    );
  });

  afterEach(() => {
    watcher.stop();
    vi.useRealTimers();
  });

  describe('start/stop lifecycle', () => {
    it('should set isRunning to true when started', () => {
      vi.mocked(featureRepo.list).mockResolvedValue([]);

      watcher.start();

      expect(watcher.isRunning()).toBe(true);
    });

    it('should set isRunning to false when stopped', () => {
      vi.mocked(featureRepo.list).mockResolvedValue([]);

      watcher.start();
      watcher.stop();

      expect(watcher.isRunning()).toBe(false);
    });

    it('should be no-op when start() is called while already running', async () => {
      vi.mocked(featureRepo.list).mockResolvedValue([]);

      watcher.start();
      await vi.advanceTimersByTimeAsync(0);

      watcher.start(); // second start should be no-op

      await vi.advanceTimersByTimeAsync(30_000);
      // Only 2 polls: one immediate + one after 30s (not 4 from double-start)
      // Each poll calls list() twice: once for Review, once for AwaitingUpstream
      expect(featureRepo.list).toHaveBeenCalledTimes(4);
    });

    it('should poll at configured interval', async () => {
      vi.mocked(featureRepo.list).mockResolvedValue([]);

      watcher.start();

      // First poll happens immediately
      // Each poll calls list() twice: once for Review, once for AwaitingUpstream
      await vi.advanceTimersByTimeAsync(0);
      expect(featureRepo.list).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(30_000);
      expect(featureRepo.list).toHaveBeenCalledTimes(4);

      await vi.advanceTimersByTimeAsync(30_000);
      expect(featureRepo.list).toHaveBeenCalledTimes(6);
    });

    it('should stop polling when stop() is called', async () => {
      vi.mocked(featureRepo.list).mockResolvedValue([]);

      watcher.start();
      await vi.advanceTimersByTimeAsync(0);
      // Each poll calls list() twice: once for Review, once for AwaitingUpstream
      expect(featureRepo.list).toHaveBeenCalledTimes(2);

      watcher.stop();

      await vi.advanceTimersByTimeAsync(10000);
      expect(featureRepo.list).toHaveBeenCalledTimes(2);
    });

    it('should support custom poll interval', async () => {
      vi.mocked(featureRepo.list).mockResolvedValue([]);
      const customWatcher = new PrSyncWatcherService(
        featureRepo,
        agentRunRepo,
        gitPrService,
        notificationService,
        1000
      );

      customWatcher.start();
      await vi.advanceTimersByTimeAsync(0);
      // Each poll calls list() twice: once for Review, once for AwaitingUpstream
      expect(featureRepo.list).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(1000);
      expect(featureRepo.list).toHaveBeenCalledTimes(4);

      customWatcher.stop();
    });
  });

  describe('PR status polling and transition detection', () => {
    it('should detect Open→Merged transition and update feature and agent run', async () => {
      const feature = createMockFeature({
        id: 'feat-1',
        name: 'My Feature',
        repositoryPath: '/repo/path',
        branch: 'feat/test',
        agentRunId: 'run-1',
        pr: { url: 'https://github.com/org/repo/pull/1', number: 1, status: PrStatus.Open },
      });

      vi.mocked(featureRepo.list).mockResolvedValue([feature]);
      vi.mocked(gitPrService.listPrStatuses).mockResolvedValue([
        {
          number: 1,
          state: PrStatus.Merged,
          url: 'https://github.com/org/repo/pull/1',
          headRefName: 'feat/test',
        },
      ]);
      vi.mocked(gitPrService.getCiStatus).mockResolvedValue({ status: 'pending' });

      watcher.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(featureRepo.update).toHaveBeenCalledTimes(1);
      const updatedFeature = vi.mocked(featureRepo.update).mock.calls[0][0];
      expect(updatedFeature.pr!.status).toBe(PrStatus.Merged);
      expect(updatedFeature.lifecycle).toBe(SdlcLifecycle.Maintain);

      // Agent run should be marked as completed
      expect(agentRunRepo.updateStatus).toHaveBeenCalledWith('run-1', AgentRunStatus.completed);
    });

    it('should skip duplicate Maintain transition when merge node already handled it (#354)', async () => {
      const feature = createMockFeature({
        id: 'feat-1',
        name: 'My Feature',
        repositoryPath: '/repo/path',
        branch: 'feat/test',
        agentRunId: 'run-1',
        pr: { url: 'https://github.com/org/repo/pull/1', number: 1, status: PrStatus.Open },
      });

      // The merge node already transitioned this feature to Maintain
      const freshFeature = createMockFeature({
        ...feature,
        lifecycle: SdlcLifecycle.Maintain,
        pr: { url: 'https://github.com/org/repo/pull/1', number: 1, status: PrStatus.Open },
      });

      vi.mocked(featureRepo.list).mockResolvedValue([feature]);
      vi.mocked(featureRepo.findById).mockResolvedValue(freshFeature);
      vi.mocked(gitPrService.listPrStatuses).mockResolvedValue([
        {
          number: 1,
          state: PrStatus.Merged,
          url: 'https://github.com/org/repo/pull/1',
          headRefName: 'feat/test',
        },
      ]);
      vi.mocked(gitPrService.getCiStatus).mockResolvedValue({ status: 'pending' });

      watcher.start();
      await vi.advanceTimersByTimeAsync(0);

      // Should NOT call completeAgentRun (merge node already did)
      expect(agentRunRepo.updateStatus).not.toHaveBeenCalled();

      // Should still update the PR status to Merged on the feature record
      expect(featureRepo.update).toHaveBeenCalledTimes(1);
      const updatedFeature = vi.mocked(featureRepo.update).mock.calls[0][0];
      expect(updatedFeature.pr!.status).toBe(PrStatus.Merged);
      // Lifecycle should remain Maintain (not re-set)
      expect(updatedFeature.lifecycle).toBe(SdlcLifecycle.Maintain);
    });

    it('should skip agent run update when feature has no agentRunId', async () => {
      const feature = createMockFeature({
        id: 'feat-1',
        name: 'My Feature',
        repositoryPath: '/repo/path',
        branch: 'feat/test',
        pr: { url: 'https://github.com/org/repo/pull/1', number: 1, status: PrStatus.Open },
      });

      vi.mocked(featureRepo.list).mockResolvedValue([feature]);
      vi.mocked(gitPrService.listPrStatuses).mockResolvedValue([
        {
          number: 1,
          state: PrStatus.Merged,
          url: 'https://github.com/org/repo/pull/1',
          headRefName: 'feat/test',
        },
      ]);
      vi.mocked(gitPrService.getCiStatus).mockResolvedValue({ status: 'pending' });

      watcher.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(featureRepo.update).toHaveBeenCalledTimes(1);
      expect(agentRunRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('should detect Open→Closed transition and update feature without lifecycle change', async () => {
      const feature = createMockFeature({
        id: 'feat-2',
        name: 'Closed Feature',
        repositoryPath: '/repo/path',
        branch: 'feat/closed',
        pr: { url: 'https://github.com/org/repo/pull/2', number: 2, status: PrStatus.Open },
      });

      vi.mocked(featureRepo.list).mockResolvedValue([feature]);
      vi.mocked(gitPrService.listPrStatuses).mockResolvedValue([
        {
          number: 2,
          state: PrStatus.Closed,
          url: 'https://github.com/org/repo/pull/2',
          headRefName: 'feat/closed',
        },
      ]);
      vi.mocked(gitPrService.getCiStatus).mockResolvedValue({ status: 'pending' });

      watcher.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(featureRepo.update).toHaveBeenCalledTimes(1);
      const updatedFeature = vi.mocked(featureRepo.update).mock.calls[0][0];
      expect(updatedFeature.pr!.status).toBe(PrStatus.Closed);
      expect(updatedFeature.lifecycle).toBe(SdlcLifecycle.Review); // stays Review
    });

    it('should not call update when PR status has not changed', async () => {
      const feature = createMockFeature({
        id: 'feat-3',
        repositoryPath: '/repo/path',
        pr: {
          url: 'https://github.com/org/repo/pull/3',
          number: 3,
          status: PrStatus.Open,
          ciStatus: CiStatus.Pending,
        },
      });

      vi.mocked(featureRepo.list).mockResolvedValue([feature]);
      vi.mocked(gitPrService.listPrStatuses).mockResolvedValue([
        {
          number: 3,
          state: PrStatus.Open,
          url: 'https://github.com/org/repo/pull/3',
          headRefName: 'feat/test',
        },
      ]);
      vi.mocked(gitPrService.getCiStatus).mockResolvedValue({ status: 'pending' });

      watcher.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(featureRepo.update).not.toHaveBeenCalled();
    });

    it('should group features by repositoryPath for batch PR queries', async () => {
      const feature1 = createMockFeature({
        id: 'feat-1',
        repositoryPath: '/repo/a',
        pr: { url: 'https://github.com/org/repo-a/pull/1', number: 1, status: PrStatus.Open },
        branch: 'feat/a',
      });
      const feature2 = createMockFeature({
        id: 'feat-2',
        repositoryPath: '/repo/a',
        pr: { url: 'https://github.com/org/repo-a/pull/2', number: 2, status: PrStatus.Open },
        branch: 'feat/b',
      });
      const feature3 = createMockFeature({
        id: 'feat-3',
        repositoryPath: '/repo/b',
        pr: { url: 'https://github.com/org/repo-b/pull/1', number: 1, status: PrStatus.Open },
        branch: 'feat/c',
      });

      vi.mocked(featureRepo.list).mockResolvedValue([feature1, feature2, feature3]);
      vi.mocked(gitPrService.listPrStatuses).mockResolvedValue([
        { number: 1, state: PrStatus.Open, url: '', headRefName: '' },
        { number: 2, state: PrStatus.Open, url: '', headRefName: '' },
      ]);
      vi.mocked(gitPrService.getCiStatus).mockResolvedValue({ status: 'pending' });

      watcher.start();
      await vi.advanceTimersByTimeAsync(0);

      // One call per unique repositoryPath
      expect(gitPrService.listPrStatuses).toHaveBeenCalledTimes(2);
      expect(gitPrService.listPrStatuses).toHaveBeenCalledWith('/repo/a');
      expect(gitPrService.listPrStatuses).toHaveBeenCalledWith('/repo/b');
    });

    it('should prune features that left Review from tracking map', async () => {
      const feature = createMockFeature({
        id: 'feat-1',
        repositoryPath: '/repo/path',
        pr: { url: 'https://github.com/org/repo/pull/1', number: 1, status: PrStatus.Open },
      });

      vi.mocked(featureRepo.list)
        .mockResolvedValueOnce([feature]) // first poll: feature in Review
        .mockResolvedValueOnce([]); // second poll: feature no longer in Review
      vi.mocked(gitPrService.listPrStatuses).mockResolvedValue([
        { number: 1, state: PrStatus.Open, url: '', headRefName: '' },
      ]);
      vi.mocked(gitPrService.getCiStatus).mockResolvedValue({ status: 'pending' });

      watcher.start();
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(30_000);

      // On second poll with empty list, no API calls should be made
      // listPrStatuses called only on first poll
      expect(gitPrService.listPrStatuses).toHaveBeenCalledTimes(1);
    });

    it('should emit PrMerged notification with correct fields including featureId and agentRunId', async () => {
      const feature = createMockFeature({
        id: 'feat-1',
        name: 'Merged Feature',
        agentRunId: 'run-1',
        repositoryPath: '/repo/path',
        pr: { url: 'https://github.com/org/repo/pull/1', number: 1, status: PrStatus.Open },
      });

      vi.mocked(featureRepo.list).mockResolvedValue([feature]);
      vi.mocked(gitPrService.listPrStatuses).mockResolvedValue([
        {
          number: 1,
          state: PrStatus.Merged,
          url: 'https://github.com/org/repo/pull/1',
          headRefName: 'feat/test',
        },
      ]);
      vi.mocked(gitPrService.getCiStatus).mockResolvedValue({ status: 'pending' });

      watcher.start();
      await vi.advanceTimersByTimeAsync(0);

      const prEvents = notificationService.receivedEvents.filter(
        (e) => e.eventType === NotificationEventType.PrMerged
      );
      expect(prEvents).toHaveLength(1);
      expect(prEvents[0]!.featureId).toBe('feat-1');
      expect(prEvents[0]!.agentRunId).toBe('run-1');
      expect(prEvents[0]!.featureName).toBe('Merged Feature');
      expect(prEvents[0]!.severity).toBe(NotificationSeverity.Success);
    });

    it('should emit PrClosed notification with correct fields including featureId', async () => {
      const feature = createMockFeature({
        id: 'feat-1',
        name: 'Closed Feature',
        agentRunId: 'run-1',
        repositoryPath: '/repo/path',
        pr: { url: 'https://github.com/org/repo/pull/1', number: 1, status: PrStatus.Open },
      });

      vi.mocked(featureRepo.list).mockResolvedValue([feature]);
      vi.mocked(gitPrService.listPrStatuses).mockResolvedValue([
        {
          number: 1,
          state: PrStatus.Closed,
          url: 'https://github.com/org/repo/pull/1',
          headRefName: 'feat/test',
        },
      ]);
      vi.mocked(gitPrService.getCiStatus).mockResolvedValue({ status: 'pending' });

      watcher.start();
      await vi.advanceTimersByTimeAsync(0);

      const prEvents = notificationService.receivedEvents.filter(
        (e) => e.eventType === NotificationEventType.PrClosed
      );
      expect(prEvents).toHaveLength(1);
      expect(prEvents[0]!.featureId).toBe('feat-1');
      expect(prEvents[0]!.agentRunId).toBe('run-1');
      expect(prEvents[0]!.featureName).toBe('Closed Feature');
      expect(prEvents[0]!.severity).toBe(NotificationSeverity.Warning);
    });

    it('should skip already-merged PRs during branch discovery (likely stale)', async () => {
      const feature = createMockFeature({
        id: 'feat-1',
        name: 'Externally Merged',
        repositoryPath: '/repo/path',
        branch: 'feat/external',
        agentRunId: 'run-1',
        pr: undefined, // No PR data on the feature
      });

      vi.mocked(featureRepo.list).mockResolvedValue([feature]);
      vi.mocked(gitPrService.listPrStatuses).mockResolvedValue([
        {
          number: 42,
          state: PrStatus.Merged,
          url: 'https://github.com/org/repo/pull/42',
          headRefName: 'feat/external',
        },
      ]);

      watcher.start();
      await vi.advanceTimersByTimeAsync(0);

      // Merged PRs should not be linked — they're likely from a previous branch iteration
      expect(featureRepo.update).not.toHaveBeenCalled();
      expect(agentRunRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('should discover open PR by branch name and populate feature PR data', async () => {
      const feature = createMockFeature({
        id: 'feat-1',
        name: 'External PR',
        repositoryPath: '/repo/path',
        branch: 'feat/external',
        pr: undefined,
      });

      vi.mocked(featureRepo.list).mockResolvedValue([feature]);
      vi.mocked(gitPrService.listPrStatuses).mockResolvedValue([
        {
          number: 10,
          state: PrStatus.Open,
          url: 'https://github.com/org/repo/pull/10',
          headRefName: 'feat/external',
        },
      ]);

      watcher.start();
      await vi.advanceTimersByTimeAsync(0);

      // Feature should be updated with discovered PR data (stays in Review since Open)
      expect(featureRepo.update).toHaveBeenCalledTimes(1);
      const updatedFeature = vi.mocked(featureRepo.update).mock.calls[0][0];
      expect(updatedFeature.pr!.url).toBe('https://github.com/org/repo/pull/10');
      expect(updatedFeature.pr!.number).toBe(10);
      expect(updatedFeature.pr!.status).toBe(PrStatus.Open);
      expect(updatedFeature.lifecycle).toBe(SdlcLifecycle.Review); // stays Review
    });

    it('should not update feature when no matching PR found by branch', async () => {
      const feature = createMockFeature({
        id: 'feat-1',
        repositoryPath: '/repo/path',
        branch: 'feat/no-match',
        pr: undefined,
      });

      vi.mocked(featureRepo.list).mockResolvedValue([feature]);
      vi.mocked(gitPrService.listPrStatuses).mockResolvedValue([
        { number: 1, state: PrStatus.Open, url: '', headRefName: 'feat/other-branch' },
      ]);

      watcher.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(featureRepo.update).not.toHaveBeenCalled();
    });

    it('should not emit duplicate notification on subsequent polls with same status', async () => {
      const feature = createMockFeature({
        id: 'feat-1',
        repositoryPath: '/repo/path',
        pr: { url: 'https://github.com/org/repo/pull/1', number: 1, status: PrStatus.Open },
      });

      // Feature merged on first poll, then removed from Review on second
      vi.mocked(featureRepo.list)
        .mockResolvedValueOnce([feature])
        .mockResolvedValueOnce([{ ...feature, lifecycle: SdlcLifecycle.Maintain }])
        .mockResolvedValueOnce([]);
      vi.mocked(gitPrService.listPrStatuses).mockResolvedValue([
        { number: 1, state: PrStatus.Merged, url: '', headRefName: '' },
      ]);
      vi.mocked(gitPrService.getCiStatus).mockResolvedValue({ status: 'pending' });

      watcher.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(notificationService.receivedEvents).toHaveLength(1); // PrMerged

      notificationService.receivedEvents.length = 0;
      await vi.advanceTimersByTimeAsync(30_000);
      // Feature is still returned by list but state hasn't changed in map
      // No duplicate notification since it's already tracked as Merged
      const prMergedEvents = notificationService.receivedEvents.filter(
        (e) => e.eventType === NotificationEventType.PrMerged
      );
      expect(prMergedEvents).toHaveLength(0);
    });
  });

  describe('CI status polling and transition detection', () => {
    it('should detect CI Pending→Success and update feature', async () => {
      const feature = createMockFeature({
        id: 'feat-1',
        repositoryPath: '/repo/path',
        branch: 'feat/test',
        pr: {
          url: 'https://github.com/org/repo/pull/1',
          number: 1,
          status: PrStatus.Open,
          ciStatus: CiStatus.Pending,
        },
      });

      vi.mocked(featureRepo.list).mockResolvedValue([feature]);
      vi.mocked(gitPrService.listPrStatuses).mockResolvedValue([
        { number: 1, state: PrStatus.Open, url: '', headRefName: '' },
      ]);
      vi.mocked(gitPrService.getCiStatus).mockResolvedValue({ status: 'success' });

      watcher.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(featureRepo.update).toHaveBeenCalledTimes(1);
      const updatedFeature = vi.mocked(featureRepo.update).mock.calls[0][0];
      expect(updatedFeature.pr!.ciStatus).toBe(CiStatus.Success);
    });

    it('should detect CI Pending→Failure and update feature', async () => {
      const feature = createMockFeature({
        id: 'feat-1',
        repositoryPath: '/repo/path',
        branch: 'feat/test',
        pr: {
          url: 'https://github.com/org/repo/pull/1',
          number: 1,
          status: PrStatus.Open,
          ciStatus: CiStatus.Pending,
        },
      });

      vi.mocked(featureRepo.list).mockResolvedValue([feature]);
      vi.mocked(gitPrService.listPrStatuses).mockResolvedValue([
        { number: 1, state: PrStatus.Open, url: '', headRefName: '' },
      ]);
      vi.mocked(gitPrService.getCiStatus).mockResolvedValue({ status: 'failure' });

      watcher.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(featureRepo.update).toHaveBeenCalledTimes(1);
      const updatedFeature = vi.mocked(featureRepo.update).mock.calls[0][0];
      expect(updatedFeature.pr!.ciStatus).toBe(CiStatus.Failure);
    });

    it('should emit PrChecksPassed notification on CI success', async () => {
      const feature = createMockFeature({
        id: 'feat-1',
        name: 'CI Pass Feature',
        repositoryPath: '/repo/path',
        branch: 'feat/test',
        pr: {
          url: 'https://github.com/org/repo/pull/1',
          number: 1,
          status: PrStatus.Open,
          ciStatus: CiStatus.Pending,
        },
      });

      vi.mocked(featureRepo.list).mockResolvedValue([feature]);
      vi.mocked(gitPrService.listPrStatuses).mockResolvedValue([
        { number: 1, state: PrStatus.Open, url: '', headRefName: '' },
      ]);
      vi.mocked(gitPrService.getCiStatus).mockResolvedValue({ status: 'success' });

      watcher.start();
      await vi.advanceTimersByTimeAsync(0);

      const ciEvents = notificationService.receivedEvents.filter(
        (e) => e.eventType === NotificationEventType.PrChecksPassed
      );
      expect(ciEvents).toHaveLength(1);
      expect(ciEvents[0]!.featureName).toBe('CI Pass Feature');
      expect(ciEvents[0]!.severity).toBe(NotificationSeverity.Success);
    });

    it('should emit PrChecksFailed notification on CI failure', async () => {
      const feature = createMockFeature({
        id: 'feat-1',
        name: 'CI Fail Feature',
        repositoryPath: '/repo/path',
        branch: 'feat/test',
        pr: {
          url: 'https://github.com/org/repo/pull/1',
          number: 1,
          status: PrStatus.Open,
          ciStatus: CiStatus.Pending,
        },
      });

      vi.mocked(featureRepo.list).mockResolvedValue([feature]);
      vi.mocked(gitPrService.listPrStatuses).mockResolvedValue([
        { number: 1, state: PrStatus.Open, url: '', headRefName: '' },
      ]);
      vi.mocked(gitPrService.getCiStatus).mockResolvedValue({ status: 'failure' });

      watcher.start();
      await vi.advanceTimersByTimeAsync(0);

      const ciEvents = notificationService.receivedEvents.filter(
        (e) => e.eventType === NotificationEventType.PrChecksFailed
      );
      expect(ciEvents).toHaveLength(1);
      expect(ciEvents[0]!.featureName).toBe('CI Fail Feature');
      expect(ciEvents[0]!.severity).toBe(NotificationSeverity.Error);
    });

    it('should not trigger update when CI status is unchanged', async () => {
      const feature = createMockFeature({
        id: 'feat-1',
        repositoryPath: '/repo/path',
        branch: 'feat/test',
        pr: {
          url: 'https://github.com/org/repo/pull/1',
          number: 1,
          status: PrStatus.Open,
          ciStatus: CiStatus.Pending,
        },
      });

      vi.mocked(featureRepo.list).mockResolvedValue([feature]);
      vi.mocked(gitPrService.listPrStatuses).mockResolvedValue([
        { number: 1, state: PrStatus.Open, url: '', headRefName: '' },
      ]);
      vi.mocked(gitPrService.getCiStatus).mockResolvedValue({ status: 'pending' });

      watcher.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(featureRepo.update).not.toHaveBeenCalled();
    });

    it('should handle getCiStatus errors gracefully and continue', async () => {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const feature1 = createMockFeature({
        id: 'feat-1',
        name: 'Feature 1',
        repositoryPath: '/repo/path',
        branch: 'feat/a',
        pr: { url: 'https://github.com/org/repo/pull/1', number: 1, status: PrStatus.Open },
      });
      const feature2 = createMockFeature({
        id: 'feat-2',
        name: 'Feature 2',
        repositoryPath: '/repo/path',
        branch: 'feat/b',
        pr: { url: 'https://github.com/org/repo/pull/2', number: 2, status: PrStatus.Open },
      });

      vi.mocked(featureRepo.list).mockResolvedValue([feature1, feature2]);
      vi.mocked(gitPrService.listPrStatuses).mockResolvedValue([
        { number: 1, state: PrStatus.Merged, url: '', headRefName: '' },
        { number: 2, state: PrStatus.Open, url: '', headRefName: '' },
      ]);
      vi.mocked(gitPrService.getCiStatus)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ status: 'success' });

      watcher.start();
      await vi.advanceTimersByTimeAsync(0);

      // Feature 1 should still be updated for PR merge despite CI error
      expect(featureRepo.update).toHaveBeenCalled();
      // Feature 2 CI success should be processed
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('error handling and edge cases', () => {
    it('should not make API calls when no features are in Review', async () => {
      vi.mocked(featureRepo.list).mockResolvedValue([]);

      watcher.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(gitPrService.listPrStatuses).not.toHaveBeenCalled();
      expect(gitPrService.getCiStatus).not.toHaveBeenCalled();
    });

    it('should still poll GitHub for features without PR data (for branch-based discovery)', async () => {
      const featureNoPr = createMockFeature({
        id: 'feat-no-pr',
        branch: 'feat/no-pr',
        pr: undefined,
      });

      vi.mocked(featureRepo.list).mockResolvedValue([featureNoPr]);
      vi.mocked(gitPrService.listPrStatuses).mockResolvedValue([]);

      watcher.start();
      await vi.advanceTimersByTimeAsync(0);

      // Should poll GitHub to discover PRs by branch
      expect(gitPrService.listPrStatuses).toHaveBeenCalledWith('/repo/path');
    });

    it('should skip features with missing repositoryPath', async () => {
      const featureMissingRepo = createMockFeature({
        id: 'feat-no-repo',
        repositoryPath: '',
        pr: { url: 'https://github.com/org/repo/pull/1', number: 1, status: PrStatus.Open },
      });

      vi.mocked(featureRepo.list).mockResolvedValue([featureMissingRepo]);

      watcher.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(gitPrService.listPrStatuses).not.toHaveBeenCalled();
    });

    it('should skip feature when PR number is not found in listPrStatuses response', async () => {
      const feature = createMockFeature({
        id: 'feat-1',
        repositoryPath: '/repo/path',
        pr: {
          url: 'https://github.com/org/repo/pull/99',
          number: 99,
          status: PrStatus.Open,
          ciStatus: CiStatus.Pending,
        },
      });

      vi.mocked(featureRepo.list).mockResolvedValue([feature]);
      vi.mocked(gitPrService.listPrStatuses).mockResolvedValue([
        { number: 1, state: PrStatus.Open, url: '', headRefName: '' }, // PR 99 not in response
      ]);
      vi.mocked(gitPrService.getCiStatus).mockResolvedValue({ status: 'pending' });

      watcher.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(featureRepo.update).not.toHaveBeenCalled();
    });

    it('should isolate listPrStatuses errors per repository', async () => {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const feature1 = createMockFeature({
        id: 'feat-1',
        repositoryPath: '/repo/a',
        branch: 'feat/a',
        pr: { url: 'https://github.com/org/repo-a/pull/1', number: 1, status: PrStatus.Open },
      });
      const feature2 = createMockFeature({
        id: 'feat-2',
        repositoryPath: '/repo/b',
        branch: 'feat/b',
        pr: { url: 'https://github.com/org/repo-b/pull/1', number: 1, status: PrStatus.Open },
      });

      vi.mocked(featureRepo.list).mockResolvedValue([feature1, feature2]);
      vi.mocked(gitPrService.listPrStatuses)
        .mockRejectedValueOnce(new Error('Auth failure for repo a'))
        .mockResolvedValueOnce([{ number: 1, state: PrStatus.Merged, url: '', headRefName: '' }]);
      vi.mocked(gitPrService.getCiStatus).mockResolvedValue({ status: 'pending' });

      watcher.start();
      await vi.advanceTimersByTimeAsync(0);

      // Repo b should still be processed despite repo a failure
      expect(featureRepo.update).toHaveBeenCalled();
      const updatedFeature = vi.mocked(featureRepo.update).mock.calls[0][0];
      expect(updatedFeature.id).toBe('feat-2');
      expect(updatedFeature.pr!.status).toBe(PrStatus.Merged);

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should catch and log top-level poll errors', async () => {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.mocked(featureRepo.list).mockRejectedValue(new Error('DB connection error'));

      watcher.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(consoleSpy).toHaveBeenCalled();
      expect(notificationService.receivedEvents).toHaveLength(0);

      // Should continue polling on next cycle
      vi.mocked(featureRepo.list).mockResolvedValue([]);
      await vi.advanceTimersByTimeAsync(30_000);
      // First poll: 1 call (Review list rejects, AwaitingUpstream never reached)
      // Second poll: 2 calls (Review + AwaitingUpstream both succeed)
      expect(featureRepo.list).toHaveBeenCalledTimes(3);

      consoleSpy.mockRestore();
    });
  });

  describe('mergeable status tracking', () => {
    it('should detect PR becoming unmergeable (conflicts) and emit PrBlocked notification', async () => {
      const feature = createMockFeature({
        id: 'feat-1',
        name: 'Conflict Feature',
        agentRunId: 'run-1',
        repositoryPath: '/repo/path',
        branch: 'feat/test',
        pr: {
          url: 'https://github.com/org/repo/pull/1',
          number: 1,
          status: PrStatus.Open,
          ciStatus: CiStatus.Pending,
        },
      });

      vi.mocked(featureRepo.list).mockResolvedValue([feature]);
      vi.mocked(gitPrService.listPrStatuses).mockResolvedValue([
        {
          number: 1,
          state: PrStatus.Open,
          url: 'https://github.com/org/repo/pull/1',
          headRefName: 'feat/test',
          mergeable: false,
        },
      ]);
      vi.mocked(gitPrService.getCiStatus).mockResolvedValue({ status: 'pending' });

      watcher.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(featureRepo.update).toHaveBeenCalledTimes(1);
      const updatedFeature = vi.mocked(featureRepo.update).mock.calls[0][0];
      expect(updatedFeature.pr!.mergeable).toBe(false);

      const blockedEvents = notificationService.receivedEvents.filter(
        (e) => e.eventType === NotificationEventType.PrBlocked
      );
      expect(blockedEvents).toHaveLength(1);
      expect(blockedEvents[0]!.featureName).toBe('Conflict Feature');
      expect(blockedEvents[0]!.severity).toBe(NotificationSeverity.Warning);
      expect(blockedEvents[0]!.message).toContain('merge conflicts');
    });

    it('should not emit PrBlocked notification when mergeable is true', async () => {
      const feature = createMockFeature({
        id: 'feat-1',
        name: 'Good Feature',
        repositoryPath: '/repo/path',
        branch: 'feat/test',
        pr: {
          url: 'https://github.com/org/repo/pull/1',
          number: 1,
          status: PrStatus.Open,
          ciStatus: CiStatus.Pending,
        },
      });

      vi.mocked(featureRepo.list).mockResolvedValue([feature]);
      vi.mocked(gitPrService.listPrStatuses).mockResolvedValue([
        {
          number: 1,
          state: PrStatus.Open,
          url: 'https://github.com/org/repo/pull/1',
          headRefName: 'feat/test',
          mergeable: true,
        },
      ]);
      vi.mocked(gitPrService.getCiStatus).mockResolvedValue({ status: 'pending' });

      watcher.start();
      await vi.advanceTimersByTimeAsync(0);

      // Update should happen (mergeable changed from undefined to true) but no PrBlocked event
      expect(featureRepo.update).toHaveBeenCalledTimes(1);
      const blockedEvents = notificationService.receivedEvents.filter(
        (e) => e.eventType === NotificationEventType.PrBlocked
      );
      expect(blockedEvents).toHaveLength(0);
    });

    it('should not re-emit PrBlocked when mergeable status is unchanged', async () => {
      const feature = createMockFeature({
        id: 'feat-1',
        name: 'Conflict Feature',
        repositoryPath: '/repo/path',
        branch: 'feat/test',
        pr: {
          url: 'https://github.com/org/repo/pull/1',
          number: 1,
          status: PrStatus.Open,
          ciStatus: CiStatus.Pending,
          mergeable: false,
        },
      });

      vi.mocked(featureRepo.list).mockResolvedValue([feature]);
      vi.mocked(gitPrService.listPrStatuses).mockResolvedValue([
        {
          number: 1,
          state: PrStatus.Open,
          url: 'https://github.com/org/repo/pull/1',
          headRefName: 'feat/test',
          mergeable: false,
        },
      ]);
      vi.mocked(gitPrService.getCiStatus).mockResolvedValue({ status: 'pending' });

      watcher.start();
      await vi.advanceTimersByTimeAsync(0);

      // No update since mergeable is already false
      expect(featureRepo.update).not.toHaveBeenCalled();
      expect(notificationService.receivedEvents).toHaveLength(0);
    });

    it('should update feature when mergeable status is undefined (unknown)', async () => {
      const feature = createMockFeature({
        id: 'feat-1',
        name: 'Unknown Feature',
        repositoryPath: '/repo/path',
        branch: 'feat/test',
        pr: {
          url: 'https://github.com/org/repo/pull/1',
          number: 1,
          status: PrStatus.Open,
          ciStatus: CiStatus.Pending,
        },
      });

      vi.mocked(featureRepo.list).mockResolvedValue([feature]);
      vi.mocked(gitPrService.listPrStatuses).mockResolvedValue([
        {
          number: 1,
          state: PrStatus.Open,
          url: 'https://github.com/org/repo/pull/1',
          headRefName: 'feat/test',
          mergeable: undefined,
        },
      ]);
      vi.mocked(gitPrService.getCiStatus).mockResolvedValue({ status: 'pending' });

      watcher.start();
      await vi.advanceTimersByTimeAsync(0);

      // mergeable is undefined in both tracked state and prStatusInfo — no update
      expect(featureRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('SQLite poll lock', () => {
    function createMockDb() {
      let lockRow: { locked_by: string; expires_at: number } | null = null;
      const runFn = vi.fn((...args: unknown[]) => {
        const processId = args[0] as string;
        const _now = args[1] as number;
        const expiresAt = args[2] as number;
        const checkProcessId = args[3] as string;
        const checkNow = args[4] as number;

        // Simulate the SQL logic
        if (lockRow && lockRow.locked_by !== checkProcessId && lockRow.expires_at > checkNow) {
          return { changes: 0 }; // lock held by another process
        }
        lockRow = { locked_by: processId, expires_at: expiresAt };
        return { changes: 1 };
      });

      return {
        prepare: vi.fn().mockReturnValue({ run: runFn }),
        _runFn: runFn,
        _getLockRow: () => lockRow,
        _setLockRow: (row: { locked_by: string; expires_at: number } | null) => {
          lockRow = row;
        },
      };
    }

    it('should acquire lock and proceed with poll when no lock exists', async () => {
      const mockDb = createMockDb();
      vi.mocked(featureRepo.list).mockResolvedValue([]);

      const dbWatcher = new PrSyncWatcherService(
        featureRepo,
        agentRunRepo,
        gitPrService,
        notificationService,
        30_000,
        mockDb as never
      );

      dbWatcher.start();
      await vi.advanceTimersByTimeAsync(0);

      // Lock acquired → poll proceeded (featureRepo.list called twice: Review + AwaitingUpstream)
      expect(featureRepo.list).toHaveBeenCalledTimes(2);
      expect(mockDb.prepare).toHaveBeenCalled();

      dbWatcher.stop();
    });

    it('should skip poll when lock is held by another process', async () => {
      const mockDb = createMockDb();
      // Simulate another process holding a valid lock
      mockDb._setLockRow({ locked_by: 'other-process-999', expires_at: Date.now() + 60_000 });

      const dbWatcher = new PrSyncWatcherService(
        featureRepo,
        agentRunRepo,
        gitPrService,
        notificationService,
        30_000,
        mockDb as never
      );

      dbWatcher.start();
      await vi.advanceTimersByTimeAsync(0);

      // Lock not acquired → poll skipped (featureRepo.list NOT called)
      expect(featureRepo.list).not.toHaveBeenCalled();

      dbWatcher.stop();
    });

    it('should acquire lock when existing lock has expired', async () => {
      const mockDb = createMockDb();
      // Simulate an expired lock from another process
      mockDb._setLockRow({ locked_by: 'other-process-999', expires_at: Date.now() - 1000 });
      vi.mocked(featureRepo.list).mockResolvedValue([]);

      const dbWatcher = new PrSyncWatcherService(
        featureRepo,
        agentRunRepo,
        gitPrService,
        notificationService,
        30_000,
        mockDb as never
      );

      dbWatcher.start();
      await vi.advanceTimersByTimeAsync(0);

      // Expired lock → can acquire → poll proceeds (Review + AwaitingUpstream)
      expect(featureRepo.list).toHaveBeenCalledTimes(2);

      dbWatcher.stop();
    });

    it('should proceed without lock when no DB is provided', async () => {
      // Default watcher has no DB — should always poll
      vi.mocked(featureRepo.list).mockResolvedValue([]);

      watcher.start();
      await vi.advanceTimersByTimeAsync(0);

      // Each poll calls list() twice: once for Review, once for AwaitingUpstream
      expect(featureRepo.list).toHaveBeenCalledTimes(2);
    });
  });

  describe('rate limit backoff', () => {
    it('should skip repository when rate limit error is detected from listPrStatuses', async () => {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const feature = createMockFeature({
        id: 'feat-1',
        repositoryPath: '/repo/path',
        branch: 'feat/test',
        pr: { url: 'https://github.com/org/repo/pull/1', number: 1, status: PrStatus.Open },
      });

      vi.mocked(featureRepo.list).mockResolvedValue([feature]);
      // First poll: rate limit error
      vi.mocked(gitPrService.listPrStatuses).mockRejectedValueOnce(
        new Error('API rate limit exceeded for user')
      );

      watcher.start();
      await vi.advanceTimersByTimeAsync(0);

      // Rate limit triggered — repo should be backed off
      expect(consoleSpy).toHaveBeenCalled();

      // Second poll: should skip the repository entirely
      vi.mocked(gitPrService.listPrStatuses).mockResolvedValue([
        { number: 1, state: PrStatus.Open, url: '', headRefName: '' },
      ]);

      await vi.advanceTimersByTimeAsync(30_000);

      // listPrStatuses should only have been called once (from the first poll)
      expect(gitPrService.listPrStatuses).toHaveBeenCalledTimes(1);

      consoleSpy.mockRestore();
    });

    it('should skip repository when rate limit error is detected from getCiStatus', async () => {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const feature = createMockFeature({
        id: 'feat-1',
        repositoryPath: '/repo/path',
        branch: 'feat/test',
        pr: {
          url: 'https://github.com/org/repo/pull/1',
          number: 1,
          status: PrStatus.Open,
          ciStatus: CiStatus.Pending,
        },
      });

      vi.mocked(featureRepo.list).mockResolvedValue([feature]);
      vi.mocked(gitPrService.listPrStatuses).mockResolvedValue([
        { number: 1, state: PrStatus.Open, url: '', headRefName: '' },
      ]);
      // First poll: getCiStatus triggers rate limit
      vi.mocked(gitPrService.getCiStatus).mockRejectedValueOnce(
        new Error('API rate limit exceeded')
      );

      watcher.start();
      await vi.advanceTimersByTimeAsync(0);

      // Rate limit from getCiStatus should back off the repo
      expect(consoleSpy).toHaveBeenCalled();

      // Second poll: the repo should be skipped
      vi.mocked(gitPrService.listPrStatuses).mockClear();

      await vi.advanceTimersByTimeAsync(30_000);

      // Repo skipped, no call to listPrStatuses on second poll
      expect(gitPrService.listPrStatuses).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should not trigger rate limit backoff for non-rate-limit errors', async () => {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const feature = createMockFeature({
        id: 'feat-1',
        repositoryPath: '/repo/path',
        branch: 'feat/test',
        pr: { url: 'https://github.com/org/repo/pull/1', number: 1, status: PrStatus.Open },
      });

      vi.mocked(featureRepo.list).mockResolvedValue([feature]);
      // First poll: generic error (not rate limit)
      vi.mocked(gitPrService.listPrStatuses)
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValue([{ number: 1, state: PrStatus.Open, url: '', headRefName: '' }]);
      vi.mocked(gitPrService.getCiStatus).mockResolvedValue({ status: 'pending' });

      watcher.start();
      await vi.advanceTimersByTimeAsync(0);

      // Second poll: should NOT be skipped (no rate limit backoff)
      await vi.advanceTimersByTimeAsync(30_000);

      // listPrStatuses called on second poll (not backed off)
      expect(gitPrService.listPrStatuses).toHaveBeenCalledTimes(2);

      consoleSpy.mockRestore();
    });
  });

  describe('exponential backoff for stable features', () => {
    it('should poll feature every cycle when status changes', async () => {
      const feature = createMockFeature({
        id: 'feat-1',
        repositoryPath: '/repo/path',
        branch: 'feat/test',
        pr: {
          url: 'https://github.com/org/repo/pull/1',
          number: 1,
          status: PrStatus.Open,
          ciStatus: CiStatus.Pending,
        },
      });

      vi.mocked(featureRepo.list).mockResolvedValue([feature]);
      vi.mocked(gitPrService.listPrStatuses).mockResolvedValue([
        { number: 1, state: PrStatus.Open, url: '', headRefName: '' },
      ]);
      // CI status changes every poll
      vi.mocked(gitPrService.getCiStatus)
        .mockResolvedValueOnce({ status: 'success' })
        .mockResolvedValueOnce({ status: 'failure' })
        .mockResolvedValueOnce({ status: 'success' });

      watcher.start();

      // Poll 1: Pending→Success (change)
      await vi.advanceTimersByTimeAsync(0);
      expect(featureRepo.update).toHaveBeenCalledTimes(1);

      // Poll 2: Success→Failure (change)
      await vi.advanceTimersByTimeAsync(30_000);
      expect(featureRepo.update).toHaveBeenCalledTimes(2);

      // Poll 3: Failure→Success (change)
      await vi.advanceTimersByTimeAsync(30_000);
      expect(featureRepo.update).toHaveBeenCalledTimes(3);

      // getCiStatus called every poll because unchangedCycles resets
      expect(gitPrService.getCiStatus).toHaveBeenCalledTimes(3);
    });

    it('should skip polling stable feature after 3+ unchanged cycles', async () => {
      const feature = createMockFeature({
        id: 'feat-1',
        repositoryPath: '/repo/path',
        branch: 'feat/test',
        pr: {
          url: 'https://github.com/org/repo/pull/1',
          number: 1,
          status: PrStatus.Open,
          ciStatus: CiStatus.Success,
        },
      });

      vi.mocked(featureRepo.list).mockResolvedValue([feature]);
      vi.mocked(gitPrService.listPrStatuses).mockResolvedValue([
        { number: 1, state: PrStatus.Open, url: '', headRefName: '' },
      ]);
      // CI status stays the same
      vi.mocked(gitPrService.getCiStatus).mockResolvedValue({ status: 'success' });

      watcher.start();

      // Polls 1-3: unchangedCycles 0,1,2 → always polled (poll every cycle)
      await vi.advanceTimersByTimeAsync(0); // poll 1 (cycle 1)
      await vi.advanceTimersByTimeAsync(30_000); // poll 2 (cycle 2)
      await vi.advanceTimersByTimeAsync(30_000); // poll 3 (cycle 3)

      expect(gitPrService.getCiStatus).toHaveBeenCalledTimes(3);

      // Polls 4-5: unchangedCycles 3,4 → poll every 2nd cycle
      // Cycle 4 is even → polled
      await vi.advanceTimersByTimeAsync(30_000); // poll 4 (cycle 4, even → polled)
      expect(gitPrService.getCiStatus).toHaveBeenCalledTimes(4);

      // Cycle 5 is odd → skipped
      await vi.advanceTimersByTimeAsync(30_000); // poll 5 (cycle 5, odd → skipped)
      expect(gitPrService.getCiStatus).toHaveBeenCalledTimes(4); // still 4

      // Cycle 6 is even → polled
      await vi.advanceTimersByTimeAsync(30_000); // poll 6 (cycle 6, even → polled)
      expect(gitPrService.getCiStatus).toHaveBeenCalledTimes(5);
    });

    it('should reset unchanged cycles when feature status changes', async () => {
      const feature = createMockFeature({
        id: 'feat-1',
        repositoryPath: '/repo/path',
        branch: 'feat/test',
        pr: {
          url: 'https://github.com/org/repo/pull/1',
          number: 1,
          status: PrStatus.Open,
          ciStatus: CiStatus.Pending,
        },
      });

      vi.mocked(featureRepo.list).mockResolvedValue([feature]);
      vi.mocked(gitPrService.listPrStatuses).mockResolvedValue([
        { number: 1, state: PrStatus.Open, url: '', headRefName: '' },
      ]);

      // First 4 polls: no change (pending → pending)
      vi.mocked(gitPrService.getCiStatus)
        .mockResolvedValueOnce({ status: 'pending' }) // poll 1
        .mockResolvedValueOnce({ status: 'pending' }) // poll 2
        .mockResolvedValueOnce({ status: 'pending' }) // poll 3
        .mockResolvedValueOnce({ status: 'success' }) // poll 4: change!
        .mockResolvedValue({ status: 'success' }); // subsequent: no change

      watcher.start();

      await vi.advanceTimersByTimeAsync(0); // poll 1
      await vi.advanceTimersByTimeAsync(30_000); // poll 2
      await vi.advanceTimersByTimeAsync(30_000); // poll 3
      await vi.advanceTimersByTimeAsync(30_000); // poll 4: status changes

      expect(featureRepo.update).toHaveBeenCalledTimes(1); // only the change triggered update

      // After the change, unchangedCycles resets to 0
      // So the next polls should all proceed normally
      await vi.advanceTimersByTimeAsync(30_000); // poll 5 (uc=0, always polled)
      await vi.advanceTimersByTimeAsync(30_000); // poll 6 (uc=1, always polled)
      await vi.advanceTimersByTimeAsync(30_000); // poll 7 (uc=2, always polled)

      // All these should have been polled (getCiStatus called)
      expect(gitPrService.getCiStatus).toHaveBeenCalledTimes(7);
    });
  });

  describe('AwaitingUpstream polling', () => {
    it('should poll upstream PR status for features in AwaitingUpstream lifecycle', async () => {
      const reviewFeatures: Feature[] = [];
      const awaitingFeature = createMockFeature({
        id: 'feat-upstream-1',
        name: 'Fork Feature',
        lifecycle: SdlcLifecycle.AwaitingUpstream,
        forkAndPr: true,
        agentRunId: 'run-upstream-1',
        pr: {
          url: 'https://github.com/fork-owner/repo/pull/5',
          number: 5,
          status: PrStatus.Open,
          upstreamPrUrl: 'https://github.com/upstream-owner/repo/pull/42',
          upstreamPrNumber: 42,
          upstreamPrStatus: PrStatus.Open,
        },
      });

      const mockForkService = {
        forkRepository: vi.fn(),
        pushToFork: vi.fn(),
        createUpstreamPr: vi.fn(),
        getUpstreamPrStatus: vi.fn().mockResolvedValue(PrStatus.Open),
      };

      // Return empty for Review, awaiting feature for AwaitingUpstream
      vi.mocked(featureRepo.list).mockImplementation(async (filter) => {
        if ((filter as { lifecycle: SdlcLifecycle }).lifecycle === SdlcLifecycle.Review) {
          return reviewFeatures;
        }
        if ((filter as { lifecycle: SdlcLifecycle }).lifecycle === SdlcLifecycle.AwaitingUpstream) {
          return [awaitingFeature];
        }
        return [];
      });

      const forkWatcher = new PrSyncWatcherService(
        featureRepo,
        agentRunRepo,
        gitPrService,
        notificationService,
        30_000,
        null,
        mockForkService
      );

      forkWatcher.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(mockForkService.getUpstreamPrStatus).toHaveBeenCalledWith('upstream-owner/repo', 42);
      // Still open — no update
      expect(featureRepo.update).not.toHaveBeenCalled();

      forkWatcher.stop();
    });

    it('should transition feature to Maintain when upstream PR is merged', async () => {
      const awaitingFeature = createMockFeature({
        id: 'feat-upstream-2',
        name: 'Merged Fork Feature',
        lifecycle: SdlcLifecycle.AwaitingUpstream,
        forkAndPr: true,
        agentRunId: 'run-upstream-2',
        pr: {
          url: 'https://github.com/fork-owner/repo/pull/5',
          number: 5,
          status: PrStatus.Open,
          upstreamPrUrl: 'https://github.com/upstream-owner/repo/pull/42',
          upstreamPrNumber: 42,
          upstreamPrStatus: PrStatus.Open,
        },
      });

      const mockForkService = {
        forkRepository: vi.fn(),
        pushToFork: vi.fn(),
        createUpstreamPr: vi.fn(),
        getUpstreamPrStatus: vi.fn().mockResolvedValue(PrStatus.Merged),
      };

      vi.mocked(featureRepo.list).mockImplementation(async (filter) => {
        if ((filter as { lifecycle: SdlcLifecycle }).lifecycle === SdlcLifecycle.Review) return [];
        if ((filter as { lifecycle: SdlcLifecycle }).lifecycle === SdlcLifecycle.AwaitingUpstream) {
          return [awaitingFeature];
        }
        return [];
      });

      const forkWatcher = new PrSyncWatcherService(
        featureRepo,
        agentRunRepo,
        gitPrService,
        notificationService,
        30_000,
        null,
        mockForkService
      );

      forkWatcher.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(featureRepo.update).toHaveBeenCalledTimes(1);
      const updated = vi.mocked(featureRepo.update).mock.calls[0][0];
      expect(updated.lifecycle).toBe(SdlcLifecycle.Maintain);
      expect(updated.pr!.upstreamPrStatus).toBe(PrStatus.Merged);

      // Agent run marked complete
      expect(agentRunRepo.updateStatus).toHaveBeenCalledWith(
        'run-upstream-2',
        AgentRunStatus.completed
      );

      // PrMerged notification
      const mergeEvents = notificationService.receivedEvents.filter(
        (e) => e.eventType === NotificationEventType.PrMerged
      );
      expect(mergeEvents).toHaveLength(1);
      expect(mergeEvents[0]!.featureName).toBe('Merged Fork Feature');

      forkWatcher.stop();
    });

    it('should update status to Closed but stay in AwaitingUpstream when PR is closed', async () => {
      const awaitingFeature = createMockFeature({
        id: 'feat-upstream-3',
        name: 'Closed Fork Feature',
        lifecycle: SdlcLifecycle.AwaitingUpstream,
        forkAndPr: true,
        agentRunId: 'run-upstream-3',
        pr: {
          url: 'https://github.com/fork-owner/repo/pull/5',
          number: 5,
          status: PrStatus.Open,
          upstreamPrUrl: 'https://github.com/upstream-owner/repo/pull/42',
          upstreamPrNumber: 42,
          upstreamPrStatus: PrStatus.Open,
        },
      });

      const mockForkService = {
        forkRepository: vi.fn(),
        pushToFork: vi.fn(),
        createUpstreamPr: vi.fn(),
        getUpstreamPrStatus: vi.fn().mockResolvedValue(PrStatus.Closed),
      };

      vi.mocked(featureRepo.list).mockImplementation(async (filter) => {
        if ((filter as { lifecycle: SdlcLifecycle }).lifecycle === SdlcLifecycle.Review) return [];
        if ((filter as { lifecycle: SdlcLifecycle }).lifecycle === SdlcLifecycle.AwaitingUpstream) {
          return [awaitingFeature];
        }
        return [];
      });

      const forkWatcher = new PrSyncWatcherService(
        featureRepo,
        agentRunRepo,
        gitPrService,
        notificationService,
        30_000,
        null,
        mockForkService
      );

      forkWatcher.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(featureRepo.update).toHaveBeenCalledTimes(1);
      const updated = vi.mocked(featureRepo.update).mock.calls[0][0];
      expect(updated.lifecycle).toBe(SdlcLifecycle.AwaitingUpstream); // stays
      expect(updated.pr!.upstreamPrStatus).toBe(PrStatus.Closed);

      // PrClosed notification
      const closeEvents = notificationService.receivedEvents.filter(
        (e) => e.eventType === NotificationEventType.PrClosed
      );
      expect(closeEvents).toHaveLength(1);

      forkWatcher.stop();
    });

    it('should skip AwaitingUpstream polling when no gitForkService is provided', async () => {
      const awaitingFeature = createMockFeature({
        id: 'feat-upstream-4',
        lifecycle: SdlcLifecycle.AwaitingUpstream,
        pr: {
          url: 'https://github.com/fork-owner/repo/pull/5',
          number: 5,
          status: PrStatus.Open,
          upstreamPrUrl: 'https://github.com/upstream-owner/repo/pull/42',
          upstreamPrNumber: 42,
        },
      });

      vi.mocked(featureRepo.list).mockImplementation(async (filter) => {
        if ((filter as { lifecycle: SdlcLifecycle }).lifecycle === SdlcLifecycle.Review) return [];
        if ((filter as { lifecycle: SdlcLifecycle }).lifecycle === SdlcLifecycle.AwaitingUpstream) {
          return [awaitingFeature];
        }
        return [];
      });

      // Default watcher has no fork service
      watcher.start();
      await vi.advanceTimersByTimeAsync(0);

      // No update because fork service is null
      expect(featureRepo.update).not.toHaveBeenCalled();
    });

    it('should skip AwaitingUpstream feature with no upstream PR data', async () => {
      const awaitingFeature = createMockFeature({
        id: 'feat-upstream-5',
        lifecycle: SdlcLifecycle.AwaitingUpstream,
        pr: {
          url: 'https://github.com/fork-owner/repo/pull/5',
          number: 5,
          status: PrStatus.Open,
          // no upstreamPrUrl or upstreamPrNumber
        },
      });

      const mockForkService = {
        forkRepository: vi.fn(),
        pushToFork: vi.fn(),
        createUpstreamPr: vi.fn(),
        getUpstreamPrStatus: vi.fn(),
      };

      vi.mocked(featureRepo.list).mockImplementation(async (filter) => {
        if ((filter as { lifecycle: SdlcLifecycle }).lifecycle === SdlcLifecycle.Review) return [];
        if ((filter as { lifecycle: SdlcLifecycle }).lifecycle === SdlcLifecycle.AwaitingUpstream) {
          return [awaitingFeature];
        }
        return [];
      });

      const forkWatcher = new PrSyncWatcherService(
        featureRepo,
        agentRunRepo,
        gitPrService,
        notificationService,
        30_000,
        null,
        mockForkService
      );

      forkWatcher.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(mockForkService.getUpstreamPrStatus).not.toHaveBeenCalled();
      expect(featureRepo.update).not.toHaveBeenCalled();

      forkWatcher.stop();
    });
  });

  describe('singleton accessors', () => {
    beforeEach(() => {
      resetPrSyncWatcher();
    });

    afterEach(() => {
      resetPrSyncWatcher();
    });

    it('should initialize and return watcher via get', () => {
      initializePrSyncWatcher(featureRepo, agentRunRepo, gitPrService, notificationService);

      expect(hasPrSyncWatcher()).toBe(true);

      const instance = getPrSyncWatcher();
      expect(instance).toBeInstanceOf(PrSyncWatcherService);
    });

    it('should throw when initializing twice', () => {
      initializePrSyncWatcher(featureRepo, agentRunRepo, gitPrService, notificationService);

      expect(() => {
        initializePrSyncWatcher(featureRepo, agentRunRepo, gitPrService, notificationService);
      }).toThrow('PR sync watcher already initialized');
    });

    it('should throw when getting without initialization', () => {
      expect(() => {
        getPrSyncWatcher();
      }).toThrow('PR sync watcher not initialized');
    });

    it('should report false for hasPrSyncWatcher when not initialized', () => {
      expect(hasPrSyncWatcher()).toBe(false);
    });

    it('should stop and clear instance on reset', () => {
      initializePrSyncWatcher(featureRepo, agentRunRepo, gitPrService, notificationService);
      const instance = getPrSyncWatcher();
      vi.mocked(featureRepo.list).mockResolvedValue([]);
      instance.start();

      expect(instance.isRunning()).toBe(true);

      resetPrSyncWatcher();

      expect(instance.isRunning()).toBe(false);
      expect(hasPrSyncWatcher()).toBe(false);
    });
  });
});
