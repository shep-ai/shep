/**
 * BootWatchdog Unit Tests
 *
 * Idle-timer wrapper used during session boot. `start()` arms the timer,
 * `bump()` resets it on each stream event, `stop()` cancels it. The stall
 * handler must fire exactly once if the timer elapses without a bump.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { BootWatchdog } from '@/infrastructure/services/interactive/lifecycle/boot-watchdog.js';

describe('BootWatchdog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('exposes the 120s idle timeout as a static constant', () => {
    expect(BootWatchdog.IDLE_TIMEOUT_MS).toBe(120_000);
  });

  it('fires the stall handler after IDLE_TIMEOUT_MS with no bump', () => {
    const watchdog = new BootWatchdog();
    const onStall = vi.fn();
    watchdog.start(onStall);
    vi.advanceTimersByTime(BootWatchdog.IDLE_TIMEOUT_MS - 1);
    expect(onStall).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onStall).toHaveBeenCalledTimes(1);
  });

  it('bump() resets the timer so a steady stream never trips the stall', () => {
    const watchdog = new BootWatchdog();
    const onStall = vi.fn();
    watchdog.start(onStall);
    for (let i = 0; i < 10; i += 1) {
      vi.advanceTimersByTime(BootWatchdog.IDLE_TIMEOUT_MS - 10);
      watchdog.bump();
    }
    expect(onStall).not.toHaveBeenCalled();
  });

  it('stop() cancels the pending timer so the stall never fires', () => {
    const watchdog = new BootWatchdog();
    const onStall = vi.fn();
    watchdog.start(onStall);
    watchdog.stop();
    vi.advanceTimersByTime(BootWatchdog.IDLE_TIMEOUT_MS * 2);
    expect(onStall).not.toHaveBeenCalled();
  });

  it('stop() is idempotent — calling it twice does not throw', () => {
    const watchdog = new BootWatchdog();
    const onStall = vi.fn();
    watchdog.start(onStall);
    expect(() => {
      watchdog.stop();
      watchdog.stop();
    }).not.toThrow();
  });

  it('bump() before start() is a no-op and does not schedule a stall', () => {
    const watchdog = new BootWatchdog();
    const onStall = vi.fn();
    watchdog.bump();
    vi.advanceTimersByTime(BootWatchdog.IDLE_TIMEOUT_MS * 2);
    // onStall was never registered so nothing should fire
    expect(onStall).not.toHaveBeenCalled();
  });

  it('the stall handler fires exactly once even if the timer is allowed to elapse twice', () => {
    const watchdog = new BootWatchdog();
    const onStall = vi.fn();
    watchdog.start(onStall);
    vi.advanceTimersByTime(BootWatchdog.IDLE_TIMEOUT_MS);
    vi.advanceTimersByTime(BootWatchdog.IDLE_TIMEOUT_MS);
    expect(onStall).toHaveBeenCalledTimes(1);
  });
});
