// @vitest-environment node

/** SSE API Route: GET /api/harness-events (spec 119). */
import { afterEach, describe, expect, it, vi } from 'vitest';

const flags = { queryAwareHarness: true };
const events = [
  {
    id: 'e1',
    sessionId: 's1',
    sequence: 1,
    type: 'task.created',
    payload: {},
    createdAt: new Date('2026-10-02T12:00:00Z'),
  },
  {
    id: 'e2',
    sessionId: 's1',
    sequence: 2,
    type: 'context_plan.created',
    taskId: 't1',
    payload: {},
    createdAt: new Date('2026-10-02T12:00:01Z'),
  },
];
const execute = vi.fn(async ({ afterSequence }: { afterSequence: number }) =>
  events.filter((e) => e.sequence > afterSequence)
);

vi.mock('@/lib/feature-flags', () => ({ getFeatureFlags: () => flags }));
vi.mock('@/lib/server-container', () => ({
  resolve: vi.fn((token: string) => {
    if (token !== 'ListHarnessEventsUseCase') throw new Error(`unexpected token ${token}`);
    return { execute };
  }),
}));

import { GET } from '@/app/api/harness-events/route';

async function firstChunk(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  const { value } = await reader.read();
  await reader.cancel();
  return new TextDecoder().decode(value);
}

describe('GET /api/harness-events', () => {
  afterEach(() => {
    flags.queryAwareHarness = true;
    execute.mockClear();
  });

  it('is 404 while the flag is off', () => {
    flags.queryAwareHarness = false;
    expect(GET(new Request('http://x/api/harness-events?sessionId=s1')).status).toBe(404);
  });

  it('requires a session id', () => {
    expect(GET(new Request('http://x/api/harness-events')).status).toBe(400);
  });

  it('streams events after Last-Event-ID as harness SSE events', async () => {
    const controller = new AbortController();
    const res = GET(
      new Request('http://x/api/harness-events?sessionId=s1', {
        headers: { 'last-event-id': '1' },
        signal: controller.signal,
      })
    );
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    const text = await firstChunk(res);
    controller.abort();
    expect(execute).toHaveBeenCalledWith({ sessionId: 's1', afterSequence: 1 });
    expect(text).toContain('id: 2\nevent: harness\n');
    expect(text).toContain('"type":"context_plan.created"');
    expect(text).not.toContain('"sequence":1,');
  });
});
