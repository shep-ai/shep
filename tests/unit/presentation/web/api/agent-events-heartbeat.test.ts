// @vitest-environment node

/**
 * SSE API Route: GET /api/agent-events — heartbeat framing (spec 116, task 11).
 *
 * The keep-alive must be a NAMED event. An SSE comment (`: heartbeat`) is
 * never dispatched by EventSource, so the direct client's watchdog could not
 * see it and reconnected every ~61s on a quiet, healthy stream.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AGENT_EVENTS_HEARTBEAT_EVENT } from '../../../../../src/presentation/web/lib/agent-event-stream.js';

/** Mirrors HEARTBEAT_INTERVAL_MS in app/api/agent-events/route.ts. */
const SERVER_HEARTBEAT_MS = 30_000;

vi.mock('@/lib/server-container', () => ({
  resolve: vi.fn((token: string) =>
    token === 'StreamAgentEventsUseCase'
      ? {
          // A quiet stream: yields nothing and ends when the client disconnects.
          execute: ({ signal }: { signal: AbortSignal }): AsyncIterable<never> => ({
            [Symbol.asyncIterator]: () => ({
              next: () =>
                new Promise<IteratorResult<never>>((done) =>
                  signal.addEventListener('abort', () => done({ done: true, value: undefined }), {
                    once: true,
                  })
                ),
            }),
          }),
        }
      : { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  ),
}));

describe('SSE API Route: GET /api/agent-events heartbeat', () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  let routeModule: typeof import('@/presentation/web/app/api/agent-events/route.js');

  beforeEach(async () => {
    vi.useFakeTimers();
    routeModule = await import('../../../../../src/presentation/web/app/api/agent-events/route.js');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends the heartbeat as a named event the browser dispatches', async () => {
    const controller = new AbortController();
    const response = routeModule.GET(
      new Request('http://localhost:3000/api/agent-events', { signal: controller.signal })
    );
    const reader = response.body!.getReader();

    await vi.advanceTimersByTimeAsync(SERVER_HEARTBEAT_MS);
    const { value } = await reader.read();
    const frame = new TextDecoder().decode(value);

    expect(frame).toBe(`event: ${AGENT_EVENTS_HEARTBEAT_EVENT}\ndata: {}\n\n`);

    controller.abort();
    reader.releaseLock();
  });
});
