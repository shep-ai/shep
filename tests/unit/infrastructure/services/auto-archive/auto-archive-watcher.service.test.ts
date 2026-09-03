/**
 * AutoArchiveWatcherService Unit Tests
 *
 * Tests for the polling watcher that auto-archives completed features.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AutoArchiveWatcherService,
  initializeAutoArchiveWatcher,
  getAutoArchiveWatcher,
  hasAutoArchiveWatcher,
  resetAutoArchiveWatcher,
} from '@/infrastructure/services/auto-archive/auto-archive-watcher.service.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import { createMockFeatureRepository } from '../../../../helpers/feature-repository.mock.js';

vi.mock('@/infrastructure/services/settings.service.js', () => ({
  getSettings: vi.fn().mockReturnValue({
    workflow: {
      autoArchiveDelayMinutes: 10,
      openPrOnImplementationComplete: false,
      approvalGateDefaults: { allowPrd: false, allowPlan: false, allowMerge: false },
      ciWatchEnabled: true,
      enableEvidence: false,
      commitEvidence: false,
    },
  }),
}));

function createMockFeatureRepo(): IFeatureRepository {
  return createMockFeatureRepository();
}

describe('AutoArchiveWatcherService', () => {
  let mockFeatureRepo: IFeatureRepository;

  beforeEach(() => {
    vi.useFakeTimers();
    mockFeatureRepo = createMockFeatureRepo();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should not be running initially', () => {
    const watcher = new AutoArchiveWatcherService(mockFeatureRepo);
    expect(watcher.isRunning()).toBe(false);
  });

  it('should be running after start()', () => {
    const watcher = new AutoArchiveWatcherService(mockFeatureRepo);
    watcher.start();
    expect(watcher.isRunning()).toBe(true);
    watcher.stop();
  });

  it('should not be running after stop()', () => {
    const watcher = new AutoArchiveWatcherService(mockFeatureRepo);
    watcher.start();
    watcher.stop();
    expect(watcher.isRunning()).toBe(false);
  });

  it('should be idempotent on start()', () => {
    const watcher = new AutoArchiveWatcherService(mockFeatureRepo);
    watcher.start();
    watcher.start(); // Second call should be no-op
    expect(watcher.isRunning()).toBe(true);
    watcher.stop();
  });

  it('should be idempotent on stop()', () => {
    const watcher = new AutoArchiveWatcherService(mockFeatureRepo);
    watcher.stop(); // Should not throw when not running
    expect(watcher.isRunning()).toBe(false);
  });

  it('should poll on start and at interval', async () => {
    const watcher = new AutoArchiveWatcherService(mockFeatureRepo, 1000);
    watcher.start();

    // First poll happens immediately on start
    await vi.advanceTimersByTimeAsync(0);
    expect(mockFeatureRepo.list).toHaveBeenCalledTimes(1);

    // Second poll after interval
    await vi.advanceTimersByTimeAsync(1000);
    expect(mockFeatureRepo.list).toHaveBeenCalledTimes(2);

    watcher.stop();
  });
});

describe('Auto-archive watcher singleton', () => {
  afterEach(() => {
    resetAutoArchiveWatcher();
  });

  it('should not be initialized initially', () => {
    expect(hasAutoArchiveWatcher()).toBe(false);
  });

  it('should be initialized after initializeAutoArchiveWatcher()', () => {
    const repo = createMockFeatureRepo();
    initializeAutoArchiveWatcher(repo);
    expect(hasAutoArchiveWatcher()).toBe(true);
  });

  it('should return the instance after initialization', () => {
    const repo = createMockFeatureRepo();
    initializeAutoArchiveWatcher(repo);
    const watcher = getAutoArchiveWatcher();
    expect(watcher).toBeInstanceOf(AutoArchiveWatcherService);
  });

  it('should throw when getting uninitialized watcher', () => {
    expect(() => getAutoArchiveWatcher()).toThrow(/not initialized/i);
  });

  it('should throw when initializing twice', () => {
    const repo = createMockFeatureRepo();
    initializeAutoArchiveWatcher(repo);
    expect(() => initializeAutoArchiveWatcher(repo)).toThrow(/already initialized/i);
  });

  it('should reset properly', () => {
    const repo = createMockFeatureRepo();
    initializeAutoArchiveWatcher(repo);
    resetAutoArchiveWatcher();
    expect(hasAutoArchiveWatcher()).toBe(false);
  });
});
