/**
 * startBackgroundSync: the daemon (`_serve`) and `shep ui` keep the same
 * background sync running — retention, tracker sync, PR status and PR
 * comments (spec 124) — and stop all of it on shutdown.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { tasks, prSync, resolved } = vi.hoisted(() => ({
  tasks: {
    retention: { start: vi.fn(), stop: vi.fn() },
    trackers: { start: vi.fn(), stop: vi.fn() },
    comments: { start: vi.fn(), stop: vi.fn() },
  },
  prSync: { start: vi.fn(), stop: vi.fn() },
  resolved: { runDue: vi.fn(async () => ({})) },
}));

const jobs: Record<string, () => Promise<unknown>> = {};

vi.mock('@/infrastructure/di/container.js', () => ({
  container: { resolve: vi.fn(() => resolved) },
}));
vi.mock('@/infrastructure/services/maintenance/retention-scheduler.js', () => ({
  RetentionScheduler: vi.fn(function () {
    return tasks.retention;
  }),
}));
vi.mock('@/infrastructure/services/trackers/tracker-sync-watcher.js', () => ({
  createTrackerSyncWatcher: vi.fn(() => tasks.trackers),
}));
vi.mock('@/infrastructure/services/pr-sync/pr-comment-watcher.js', () => ({
  createPrCommentWatcher: vi.fn((job: () => Promise<unknown>) => {
    jobs.comments = job;
    return tasks.comments;
  }),
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

describe('startBackgroundSync', () => {
  beforeEach(() => vi.clearAllMocks());

  it('starts every sync and stops it all', () => {
    const sync = startBackgroundSync('test');
    for (const task of [tasks.retention, tasks.trackers, tasks.comments, prSync]) {
      expect(task.start).toHaveBeenCalledTimes(1);
    }
    sync.stop();
    for (const task of [tasks.retention, tasks.trackers, tasks.comments, prSync]) {
      expect(task.stop).toHaveBeenCalledTimes(1);
    }
  });

  it('runs the PR comment pass through its use case', async () => {
    startBackgroundSync('test');
    await jobs.comments();
    expect(container.resolve).toHaveBeenCalledWith('SyncPrCommentsUseCase');
    expect(resolved.runDue).toHaveBeenCalled();
  });
});
