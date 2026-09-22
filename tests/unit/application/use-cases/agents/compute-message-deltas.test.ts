/**
 * computeMessageDeltas Unit Tests (spec 093, task 13).
 *
 * Pure helper that converts new {@link AgentMessage} rows into
 * {@link AgentMessageStreamEvent} entries while honoring a since cursor so
 * already-seen messages are NOT re-emitted across poll cycles.
 */

import { describe, it, expect } from 'vitest';
import { computeMessageDeltas } from '@/application/use-cases/agents/stream-agent-events/compute-message-deltas.js';
import type { AgentMessage } from '@/domain/generated/output.js';
import { AgentMessageKind } from '@/domain/generated/output.js';

function makeMessage(overrides: Partial<AgentMessage> = {}): AgentMessage {
  const now = new Date('2026-04-01T10:00:00Z');
  return {
    id: 'm-1',
    appId: 'app-1',
    featureId: undefined,
    fromAgentRunId: 'run-1',
    fromActor: 'agent:run-1',
    toTarget: 'broadcast',
    toKind: 'broadcast',
    messageKind: AgentMessageKind.status,
    payload: '{}',
    correlationId: undefined,
    deliveredAt: undefined,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as AgentMessage;
}

describe('computeMessageDeltas', () => {
  it('returns one event per message when no messages have been seen yet', () => {
    const cache = { lastSeenAt: 0, deliveredIds: new Set<string>() };
    const events = computeMessageDeltas({
      messages: [
        makeMessage({ id: 'a', createdAt: new Date('2026-04-01T10:00:00Z') }),
        makeMessage({ id: 'b', createdAt: new Date('2026-04-01T10:00:01Z') }),
      ],
      cache,
    });

    expect(events).toHaveLength(2);
    expect(events.map((e) => e.kind)).toEqual(['agent_message', 'agent_message']);
    // Only the ids AT the cursor are kept: `a` is older than the cursor, so a
    // `created_at >= cursor` read can never return it again (spec 116).
    expect(cache.deliveredIds.has('a')).toBe(false);
    expect(cache.deliveredIds.has('b')).toBe(true);
    expect(cache.lastSeenAt).toBe(new Date('2026-04-01T10:00:01Z').getTime());
  });

  it('does not re-emit already-seen messages on subsequent calls', () => {
    const cache = { lastSeenAt: 0, deliveredIds: new Set<string>() };
    const message = makeMessage({ id: 'a', createdAt: new Date('2026-04-01T10:00:00Z') });

    computeMessageDeltas({ messages: [message], cache });
    const second = computeMessageDeltas({ messages: [message], cache });

    expect(second).toHaveLength(0);
  });

  it('exposes id, scope, kind, and createdAt on the produced event', () => {
    const cache = { lastSeenAt: 0, deliveredIds: new Set<string>() };
    const created = new Date('2026-04-01T10:00:05Z');

    const events = computeMessageDeltas({
      messages: [
        makeMessage({
          id: 'msg-x',
          appId: 'app-7',
          featureId: 'feat-3',
          fromActor: 'agent:run-9',
          fromAgentRunId: 'run-9',
          toKind: 'supervisor',
          toTarget: 'supervisor',
          messageKind: AgentMessageKind.blocked,
          payload: '{"reason":"need help"}',
          correlationId: 'corr-42',
          createdAt: created,
        }),
      ],
      cache,
    });

    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event.kind).toBe('agent_message');
    if (event.kind !== 'agent_message') return;
    expect(event.messageId).toBe('msg-x');
    expect(event.appId).toBe('app-7');
    expect(event.featureId).toBe('feat-3');
    expect(event.fromActor).toBe('agent:run-9');
    expect(event.fromAgentRunId).toBe('run-9');
    expect(event.toKind).toBe('supervisor');
    expect(event.messageKind).toBe(AgentMessageKind.blocked);
    expect(event.payload).toBe('{"reason":"need help"}');
    expect(event.correlationId).toBe('corr-42');
    expect(event.createdAt).toBe(created.toISOString());
  });

  it('handles string and number createdAt values', () => {
    const cache = { lastSeenAt: 0, deliveredIds: new Set<string>() };
    const messages = [
      makeMessage({ id: 'a', createdAt: '2026-04-01T10:00:00Z' as unknown as Date }),
      makeMessage({ id: 'b', createdAt: 1700000001000 as unknown as Date }),
    ];
    const events = computeMessageDeltas({ messages, cache });
    expect(events).toHaveLength(2);
  });

  it('returns zero events when no messages are passed', () => {
    const cache = { lastSeenAt: 0, deliveredIds: new Set<string>() };
    expect(computeMessageDeltas({ messages: [], cache })).toEqual([]);
  });

  // Spec 116: deliveredIds grew by one id per message for the life of an SSE
  // connection. It is now trimmed to the ids sharing the cursor millisecond;
  // the `since` cursor (inclusive, as every repository implements it) is what
  // makes re-emitting an evicted id impossible.
  it('stays bounded across polls and never re-emits an evicted id', () => {
    const BASE_MS = new Date('2026-04-01T10:00:00Z').getTime();
    const TOTAL = 200;
    const PER_POLL = 7;
    const table = Array.from({ length: TOTAL }, (_, i) =>
      makeMessage({ id: `m${i}`, createdAt: new Date(BASE_MS + Math.floor(i / 2)) })
    );
    const cache = { lastSeenAt: 0, deliveredIds: new Set<string>() };
    const emitted: string[] = [];
    let visible = 0;
    let maxRemembered = 0;

    while (visible < TOTAL) {
      visible = Math.min(TOTAL, visible + PER_POLL);
      // What the repository returns for `since = lastSeenAt` (created_at >= ?).
      const since = cache.lastSeenAt;
      const rows = table.slice(0, visible).filter((m) => (m.createdAt as Date).getTime() >= since);
      for (const e of computeMessageDeltas({ messages: rows, cache })) {
        if (e.kind === 'agent_message') emitted.push(e.messageId);
      }
      maxRemembered = Math.max(maxRemembered, cache.deliveredIds.size);
    }

    expect(emitted).toEqual(table.map((m) => m.id));
    // Two messages share each millisecond in this table.
    expect(maxRemembered).toBeLessThanOrEqual(2);
  });
});
