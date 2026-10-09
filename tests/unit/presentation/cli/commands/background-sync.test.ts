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
    telemetry: { start: vi.fn(), stop: vi.fn() },
  },
  prSync: { start: vi.fn(), stop: vi.fn() },
  resolved: {
    runDue: vi.fn(async () => ({})),
    run: vi.fn(async () => ({})),
    runAll: vi.fn(async () => []),
    execute: vi.fn(async () => ({})),
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
/** Telemetry flush watcher jobs (spec 133). */
const telemetryJobs: { heartbeat?: () => Promise<unknown>; flush?: () => Promise<unknown> } = {};
vi.mock('@/infrastructure/services/telemetry/telemetry-flush-watcher.js', () => ({
  createTelemetryFlushWatcher: vi.fn(
    (jobs: { heartbeat: () => Promise<unknown>; flush: () => Promise<unknown> }) => {
      Object.assign(telemetryJobs, jobs);
      return tasks.telemetry;
    }
  ),
}));
vi.mock('@/infrastructure/services/telemetry/node-telemetry-runtime.js', () => ({
  setTelemetryProcessKind: vi.fn(),
}));
vi.mock('@/infrastructure/services/pr-sync/pr-sync-watcher.service.js', () => ({
  initializePrSyncWatcher: vi.fn(),
  getPrSyncWatcher: vi.fn(() => prSync),
}));
vi.mock('@/infrastructure/persistence/sqlite/connection.js', () => ({
  getExistingConnection: vi.fn(() => ({})),
}));
vi.mock('@/application/use-cases/maintenance/prune-retained-data.use-case.js', () => ({
  PruneRetainedDataUseCase: vi.fn(),
}));

import { startBackgroundSync } from '../../../../../src/presentation/cli/commands/background-sync.js';
import { container } from '@/infrastructure/di/container.js';
import { setTelemetryProcessKind } from '@/infrastructure/services/telemetry/node-telemetry-runtime.js';
import { TelemetryProcessKind } from '@/domain/generated/output.js';

describe('startBackgroundSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dueJobs.length = 0;
    hourlyJobs.length = 0;
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
      tasks.telemetry,
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
      tasks.telemetry,
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

  it('marks the process as the daemon and flushes telemetry after the daily heartbeat (spec 133)', async () => {
    startBackgroundSync('test');
    expect(setTelemetryProcessKind).toHaveBeenCalledWith(TelemetryProcessKind.Daemon);
    await telemetryJobs.heartbeat?.();
    expect(container.resolve).toHaveBeenCalledWith('RecordInstallHeartbeatUseCase');
    await telemetryJobs.flush?.();
    expect(container.resolve).toHaveBeenCalledWith('FlushTelemetryUseCase');
    expect(resolved.execute).toHaveBeenCalledTimes(2);
  });
});
