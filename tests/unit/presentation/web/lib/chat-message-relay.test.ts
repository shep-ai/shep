// @vitest-environment node

/**
 * Chat message relay (spec 137): an open chat stream picks up rows another
 * process wrote (an agent's `shep chat block`, an MCP server), which the
 * in-process session subscribers never see.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CHAT_RELAY_INTERVAL_MS,
  startChatMessageRelay,
} from '../../../../../src/presentation/web/lib/chat-message-relay.js';

function row(id: string, at: number) {
  return { id, createdAt: new Date(at) };
}

describe('startChatMessageRelay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(10_000));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('asks for rows newer than the connection time, then newer than the last row it emitted', async () => {
    const listSince = vi
      .fn()
      .mockResolvedValueOnce([row('a', 11_000), row('b', 12_000)])
      .mockResolvedValueOnce([]);
    const emit = vi.fn();

    const stop = startChatMessageRelay({ listSince, emit });
    await vi.advanceTimersByTimeAsync(CHAT_RELAY_INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(CHAT_RELAY_INTERVAL_MS);
    stop();

    expect(listSince.mock.calls[0][0]).toEqual(new Date(10_000));
    expect(emit.mock.calls.map(([m]) => m.id)).toEqual(['a', 'b']);
    expect(listSince.mock.calls[1][0]).toEqual(new Date(12_000));
  });

  it('does not poll before the interval has passed, nor after it is stopped', async () => {
    const listSince = vi.fn().mockResolvedValue([]);
    const stop = startChatMessageRelay({ listSince, emit: vi.fn() });

    await vi.advanceTimersByTimeAsync(CHAT_RELAY_INTERVAL_MS - 1);
    expect(listSince).not.toHaveBeenCalled();
    stop();
    await vi.advanceTimersByTimeAsync(CHAT_RELAY_INTERVAL_MS * 3);
    expect(listSince).not.toHaveBeenCalled();
  });

  it('skips a tick while the previous read is still running', async () => {
    let release: (rows: never[]) => void = () => undefined;
    const listSince = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    const stop = startChatMessageRelay({ listSince, emit: vi.fn() });

    await vi.advanceTimersByTimeAsync(CHAT_RELAY_INTERVAL_MS * 3);
    expect(listSince).toHaveBeenCalledTimes(1);
    release([]);
    stop();
  });

  it('keeps relaying after a failed read', async () => {
    const listSince = vi
      .fn()
      .mockRejectedValueOnce(new Error('SQLITE_BUSY'))
      .mockResolvedValueOnce([row('a', 11_000)]);
    const emit = vi.fn();
    const stop = startChatMessageRelay({ listSince, emit });

    await vi.advanceTimersByTimeAsync(CHAT_RELAY_INTERVAL_MS * 2);
    stop();

    expect(emit).toHaveBeenCalledTimes(1);
  });
});
