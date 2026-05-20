/**
 * Integration tests for the monthly contributor recap watcher.
 *
 * Uses a fake clock to assert that the watcher dispatches the
 * generate + publish use cases exactly once for the previous calendar
 * month per process, even when the poll interval fires multiple times.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  MonthlyRecapWatcherService,
  initializeMonthlyRecapWatcher,
  getMonthlyRecapWatcher,
  hasMonthlyRecapWatcher,
  resetMonthlyRecapWatcher,
  previousYearMonth,
} from '@/infrastructure/services/contributors/monthly-recap-watcher.service.js';
import { RecapChannel } from '@/domain/generated/output.js';

function makeGenerate(yearMonth: string) {
  return {
    execute: vi.fn().mockResolvedValue({
      artifact: {
        recapId: yearMonth,
        title: `Shep — ${yearMonth} contributor recap`,
        body: '# stub',
        periodStartIso: `${yearMonth}-01T00:00:00.000Z`,
      },
      stats: { totalEvents: 0, newContributors: 0, prsRecognized: 0 },
    }),
  };
}

function makePublish() {
  return {
    execute: vi.fn().mockResolvedValue({
      outcomes: [{ channel: RecapChannel.File, status: 'published', reference: '/tmp/recap.md' }],
    }),
  };
}

describe('previousYearMonth helper', () => {
  it('rolls back into the previous month', () => {
    expect(previousYearMonth(new Date('2026-05-15T12:00:00Z'))).toBe('2026-04');
  });

  it('rolls back across year boundary', () => {
    expect(previousYearMonth(new Date('2026-01-01T00:00:00Z'))).toBe('2025-12');
  });
});

describe('MonthlyRecapWatcherService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetMonthlyRecapWatcher();
  });

  it('dispatches generate + publish once per previous month', async () => {
    const generate = makeGenerate('2026-04');
    const publish = makePublish();
    const watcher = new MonthlyRecapWatcherService({
      generate: generate as never,
      publish: publish as never,
      now: () => new Date('2026-05-06T00:00:00Z'),
      pollIntervalMs: 1000,
    });

    watcher.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(generate.execute).toHaveBeenCalledWith({ yearMonth: '2026-04' });
    expect(publish.execute).toHaveBeenCalledTimes(1);

    // A subsequent tick within the same calendar month must not re-publish.
    await vi.advanceTimersByTimeAsync(1000);
    expect(generate.execute).toHaveBeenCalledTimes(1);
    expect(publish.execute).toHaveBeenCalledTimes(1);
    watcher.stop();
  });

  it('does not double-publish when storage reports recap already shipped', async () => {
    const generate = makeGenerate('2026-04');
    const publish = makePublish();
    const watcher = new MonthlyRecapWatcherService({
      generate: generate as never,
      publish: publish as never,
      now: () => new Date('2026-05-06T00:00:00Z'),
      pollIntervalMs: 1000,
      recapAlreadyPublished: vi.fn().mockResolvedValue(true),
    });

    watcher.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(generate.execute).not.toHaveBeenCalled();
    expect(publish.execute).not.toHaveBeenCalled();
    watcher.stop();
  });

  it('isolates failures so subsequent polls still try', async () => {
    const generate = {
      execute: vi
        .fn()
        .mockRejectedValueOnce(new Error('transient'))
        .mockResolvedValueOnce({
          artifact: {
            recapId: '2026-04',
            title: 't',
            body: 'b',
            periodStartIso: '2026-04-01T00:00:00.000Z',
          },
          stats: { totalEvents: 0, newContributors: 0, prsRecognized: 0 },
        }),
    };
    const publish = makePublish();
    const watcher = new MonthlyRecapWatcherService({
      generate: generate as never,
      publish: publish as never,
      now: () => new Date('2026-05-06T00:00:00Z'),
      pollIntervalMs: 1000,
    });

    watcher.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(publish.execute).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(publish.execute).toHaveBeenCalledTimes(1);
    watcher.stop();
  });

  it('stops cleanly', () => {
    const watcher = new MonthlyRecapWatcherService({
      generate: makeGenerate('2026-04') as never,
      publish: makePublish() as never,
      now: () => new Date('2026-05-06T00:00:00Z'),
      pollIntervalMs: 1000,
    });
    watcher.start();
    expect(watcher.isRunning()).toBe(true);
    watcher.stop();
    expect(watcher.isRunning()).toBe(false);
  });
});

describe('Monthly recap watcher singleton', () => {
  afterEach(() => {
    resetMonthlyRecapWatcher();
  });

  it('initializes once', () => {
    initializeMonthlyRecapWatcher({
      generate: makeGenerate('2026-04') as never,
      publish: makePublish() as never,
    });
    expect(hasMonthlyRecapWatcher()).toBe(true);
    expect(getMonthlyRecapWatcher()).toBeInstanceOf(MonthlyRecapWatcherService);
  });

  it('throws on double init', () => {
    initializeMonthlyRecapWatcher({
      generate: makeGenerate('2026-04') as never,
      publish: makePublish() as never,
    });
    expect(() =>
      initializeMonthlyRecapWatcher({
        generate: makeGenerate('2026-04') as never,
        publish: makePublish() as never,
      })
    ).toThrow(/already initialized/i);
  });
});
