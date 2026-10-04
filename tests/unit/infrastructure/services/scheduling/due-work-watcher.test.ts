import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DUE_WORK_TICK_MS,
  createDueWorkWatcher,
} from '@/infrastructure/services/scheduling/due-work-watcher.js';

describe('createDueWorkWatcher', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('asks for due work every tick with the current time', async () => {
    vi.setSystemTime(new Date('2026-10-01T12:00:00Z'));
    const runDue = vi.fn().mockResolvedValue([]);
    const watcher = createDueWorkWatcher(runDue, vi.fn());

    watcher.start();
    await vi.advanceTimersByTimeAsync(DUE_WORK_TICK_MS);

    expect(runDue).toHaveBeenCalledTimes(1);
    expect(runDue.mock.calls[0][0]).toEqual(new Date('2026-10-01T12:01:00Z'));
    watcher.stop();
  });

  it('never starts a run while the previous one is still going', async () => {
    let finish: () => void = () => undefined;
    const runDue = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const watcher = createDueWorkWatcher(runDue, vi.fn());

    watcher.start();
    await vi.advanceTimersByTimeAsync(DUE_WORK_TICK_MS * 3);
    expect(runDue).toHaveBeenCalledTimes(1);

    finish();
    await vi.advanceTimersByTimeAsync(DUE_WORK_TICK_MS);
    expect(runDue).toHaveBeenCalledTimes(2);
    watcher.stop();
  });

  it('reports a failing run and keeps ticking', async () => {
    const runDue = vi.fn().mockRejectedValueOnce(new Error('db locked')).mockResolvedValue([]);
    const onError = vi.fn();
    const watcher = createDueWorkWatcher(runDue, onError);

    watcher.start();
    await vi.advanceTimersByTimeAsync(DUE_WORK_TICK_MS * 2);

    expect(onError).toHaveBeenCalledWith(new Error('db locked'));
    expect(runDue).toHaveBeenCalledTimes(2);
    watcher.stop();
    expect(watcher.isRunning()).toBe(false);
  });
});
