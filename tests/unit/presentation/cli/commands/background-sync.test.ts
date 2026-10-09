/**
 * startBackgroundSync: the daemon (`_serve`) and `shep ui` keep the same
 * background sync running — retention, tracker sync, knowledge sync
 * (spec 125), PR status, PR comments (spec 124) and outcomes (spec 130) —
 * and stop all of it on shutdown.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { tasks, prSync, resolved } = vi.hoisted(() => ({
  tasks: {
    retention: { start: vi.fn(), stop: vi.fn() },
    trackers: { start: vi.fn(), stop: vi.fn() },
    knowledge: { start: vi.fn(), stop: vi.fn() },
    discovery: { start: vi.fn(), stop: vi.fn() },
    comments: { start: vi.fn(), stop: vi.fn() },
    outcomes: { start: vi.fn(), stop: vi.fn() },
    autopilot: { start: vi.fn(), stop: vi.fn() },
  },
  prSync: { start: vi.fn(), stop: vi.fn() },
  resolved: {
    runDue: vi.fn(async () => ({})),
    run: vi.fn(async () => ({})),
    runAll: vi.fn(async () => []),
  },
}));

const jobs: Record<string, () => Promise<unknown>> = {};
/** Due-work jobs in creation order: tracker rules, knowledge sources, discovery. */
const dueJobs: ((now: Date) => Promise<unknown>)[] = [];

vi.mock('@/infrastructure/di/container.js', () => ({
  container: { resolve: vi.fn(() => resolved) },
}));
vi.mock('@/infrastructure/services/maintenance/retention-scheduler.js', () => ({
  RetentionScheduler: vi.fn(function () {
    return tasks.retention;
  }),
}));
vi.mock('@/infrastructure/services/scheduling/due-work-watcher.js', () => ({
  createDueWorkWatcher: vi.fn((job: (now: Date) => Promise<unknown>) => {
    dueJobs.push(job);
    return [tasks.trackers, tasks.knowledge, tasks.discovery][dueJobs.length - 1];
  }),
}));
vi.mock('@/infrastructure/services/pr-sync/pr-comment-watcher.js', () => ({
  createPrCommentWatcher: vi.fn((job: () => Promise<unknown>) => {
    jobs.comments = job;
    return tasks.comments;
  }),
}));
/** Hourly jobs in creation order: outcomes (spec 130), autopilot (spec 132). */
const hourlyJobs: (() => Promise<unknown>)[] = [];
vi.mock('@/infrastructure/services/scheduling/hourly-watcher.js', () => ({
  createHourlyWatcher: vi.fn((job: () => Promise<unknown>) => {
    hourlyJobs.push(job);
    return [tasks.outcomes, tasks.autopilot][hourlyJobs.length - 1];
  }),
}));
vi.mock('@/infrastructure/services/pr-sync/pr-sync-watcher.service.js', () => ({
  initializePrSyncWatcher: vi.fn(),
  getPrSyncWatcher: vi.fn(() => prSync),
}));
vi.mock('@/infrastructure/persistence/sqlite/connection.js', () => ({
  getExistingConnection: vi.fn(() => ({})),
}));
const flagState = vi.hoisted(() => ({ off: new Set<string>() }));
vi.mock('../../../../../src/presentation/cli/commands/feature-flag-gate.js', () => ({
  isFeatureFlagOn: (flag: string) => !flagState.off.has(flag),
}));
vi.mock('@/application/use-cases/maintenance/prune-retained-data.use-case.js', () => ({
  PruneRetainedDataUseCase: vi.fn(),
}));

import { startBackgroundSync } from '../../../../../src/presentation/cli/commands/background-sync.js';
import { container } from '@/infrastructure/di/container.js';

describe('startBackgroundSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dueJobs.length = 0;
    hourlyJobs.length = 0;
    flagState.off.clear();
  });

  it('skips the passes of software-factory areas whose flag is off (spec 135)', async () => {
    flagState.off = new Set(['trackers', 'knowledge', 'discovery', 'outcomes', 'autopilot']);
    startBackgroundSync('test');
    vi.mocked(container.resolve).mockClear();
    const now = new Date('2026-10-04T12:00:00Z');
    for (const job of dueJobs) await job(now);
    for (const job of hourlyJobs) await job();
    expect(container.resolve).not.toHaveBeenCalled();
  });

  it('starts every sync and stops it all', () => {
    const sync = startBackgroundSync('test');
    for (const task of [
      tasks.retention,
      tasks.trackers,
      tasks.knowledge,
      tasks.discovery,
      tasks.comments,
      tasks.outcomes,
      tasks.autopilot,
      prSync,
    ]) {
      expect(task.start).toHaveBeenCalledTimes(1);
    }
    sync.stop();
    for (const task of [
      tasks.retention,
      tasks.trackers,
      tasks.knowledge,
      tasks.discovery,
      tasks.comments,
      tasks.outcomes,
      tasks.autopilot,
      prSync,
    ]) {
      expect(task.stop).toHaveBeenCalledTimes(1);
    }
  });

  it('runs the PR comment pass through its use case', async () => {
    startBackgroundSync('test');
    await jobs.comments();
    expect(container.resolve).toHaveBeenCalledWith('SyncPrCommentsUseCase');
    expect(resolved.runDue).toHaveBeenCalled();
  });

  it('runs outcome tracking (spec 130) and autopilot (spec 132) hourly through their use cases', async () => {
    startBackgroundSync('test');
    const [outcomeJob, autopilotJob] = hourlyJobs;
    await outcomeJob();
    expect(container.resolve).toHaveBeenCalledWith('TrackOutcomesUseCase');
    expect(resolved.run).toHaveBeenCalled();
    await autopilotJob();
    expect(container.resolve).toHaveBeenCalledWith('RunAutopilotUseCase');
    expect(resolved.runAll).toHaveBeenCalled();
  });

  it('runs due tracker rules, knowledge sources and discovery through their use cases', async () => {
    startBackgroundSync('test');
    const now = new Date('2026-10-04T12:00:00Z');
    const [trackerJob, knowledgeJob, discoveryJob] = dueJobs;
    await trackerJob(now);
    expect(container.resolve).toHaveBeenCalledWith('SyncTrackerRulesUseCase');
    await knowledgeJob(now);
    expect(container.resolve).toHaveBeenCalledWith('SyncKnowledgeSourcesUseCase');
    await discoveryJob(now);
    expect(container.resolve).toHaveBeenCalledWith('SyncDiscoveryUseCase');
    expect(resolved.runDue).toHaveBeenCalledWith(now);
  });
});
