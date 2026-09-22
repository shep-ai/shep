/**
 * RetentionScheduler — re-runs data retention inside a long-lived process.
 *
 * Retention used to run only on process start, so a daemon that stayed up
 * for weeks never pruned the tables it kept writing to (spec 116).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  RetentionScheduler,
  RETENTION_CHECK_INTERVAL_MS,
} from '@/infrastructure/services/maintenance/retention-scheduler.js';

describe('RetentionScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs retention once per interval, not at start (process start already did)', async () => {
    const prune = vi.fn().mockResolvedValue(undefined);
    const scheduler = new RetentionScheduler(prune);

    scheduler.start();
    await vi.advanceTimersByTimeAsync(RETENTION_CHECK_INTERVAL_MS - 1);
    expect(prune).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(prune).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(RETENTION_CHECK_INTERVAL_MS);
    expect(prune).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  it('does not keep the process alive', () => {
    const scheduler = new RetentionScheduler(vi.fn().mockResolvedValue(undefined));
    const unref = vi.fn();
    const setIntervalSpy = vi
      .spyOn(globalThis, 'setInterval')
      .mockReturnValue({ unref } as unknown as ReturnType<typeof setInterval>);

    scheduler.start();

    expect(unref).toHaveBeenCalled();
    setIntervalSpy.mockRestore();
  });

  it('stops firing after stop()', async () => {
    const prune = vi.fn().mockResolvedValue(undefined);
    const scheduler = new RetentionScheduler(prune);

    scheduler.start();
    scheduler.stop();
    await vi.advanceTimersByTimeAsync(RETENTION_CHECK_INTERVAL_MS * 3);

    expect(prune).not.toHaveBeenCalled();
    expect(scheduler.isRunning()).toBe(false);
  });

  it('reports a failed prune and keeps the schedule alive', async () => {
    const onError = vi.fn();
    const prune = vi
      .fn()
      .mockRejectedValueOnce(new Error('SQLITE_BUSY'))
      .mockResolvedValue(undefined);
    const scheduler = new RetentionScheduler(prune, onError);

    scheduler.start();
    await vi.advanceTimersByTimeAsync(RETENTION_CHECK_INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(RETENTION_CHECK_INTERVAL_MS);

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'SQLITE_BUSY' }));
    expect(prune).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  it('skips a tick while the previous prune is still running', async () => {
    let finish: () => void = () => undefined;
    const prune = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const scheduler = new RetentionScheduler(prune);

    scheduler.start();
    await vi.advanceTimersByTimeAsync(RETENTION_CHECK_INTERVAL_MS * 2);
    expect(prune).toHaveBeenCalledTimes(1);

    finish();
    await vi.advanceTimersByTimeAsync(RETENTION_CHECK_INTERVAL_MS);
    expect(prune).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });
});
