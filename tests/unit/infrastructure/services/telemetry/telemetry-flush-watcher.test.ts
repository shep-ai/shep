import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TELEMETRY_FLUSH_TICK_MS,
  createTelemetryFlushWatcher,
} from '@/infrastructure/services/telemetry/telemetry-flush-watcher.js';

describe('createTelemetryFlushWatcher', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('records the heartbeat before flushing, every minute', async () => {
    const calls: string[] = [];
    const watcher = createTelemetryFlushWatcher(
      {
        heartbeat: vi.fn(async () => void calls.push('heartbeat')),
        flush: vi.fn(async () => void calls.push('flush')),
      },
      vi.fn()
    );

    watcher.start();
    await vi.advanceTimersByTimeAsync(TELEMETRY_FLUSH_TICK_MS);
    expect(calls).toEqual(['heartbeat', 'flush']);
    await vi.advanceTimersByTimeAsync(TELEMETRY_FLUSH_TICK_MS);
    expect(calls).toHaveLength(4);
    watcher.stop();
    expect(TELEMETRY_FLUSH_TICK_MS).toBe(60_000);
  });

  it('still flushes when the heartbeat fails, and reports the failure', async () => {
    const flush = vi.fn(async () => undefined);
    const onError = vi.fn();
    const watcher = createTelemetryFlushWatcher(
      { heartbeat: vi.fn().mockRejectedValue(new Error('db busy')), flush },
      onError
    );

    watcher.start();
    await vi.advanceTimersByTimeAsync(TELEMETRY_FLUSH_TICK_MS);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'db busy' }));
    watcher.stop();
  });

  it('stops ticking after stop()', async () => {
    const flush = vi.fn(async () => undefined);
    const watcher = createTelemetryFlushWatcher(
      { heartbeat: vi.fn(async () => false), flush },
      vi.fn()
    );
    watcher.start();
    watcher.stop();
    await vi.advanceTimersByTimeAsync(TELEMETRY_FLUSH_TICK_MS * 2);
    expect(flush).not.toHaveBeenCalled();
    expect(watcher.isRunning()).toBe(false);
  });
});
