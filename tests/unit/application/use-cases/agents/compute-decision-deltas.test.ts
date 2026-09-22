/**
 * computeDecisionDeltas Unit Tests (spec 093, task 30).
 *
 * Pure helper that converts new {@link SupervisorDecision} rows into
 * {@link SupervisorDecisionStreamEvent} entries while honoring a
 * `deliveredIds` cache so already-emitted decisions are NOT re-emitted
 * across poll cycles.
 *
 * Mirrors the existing computeMessageDeltas / computeQuestionDeltas
 * shape exactly (caller owns the cache; helper is pure beyond mutating
 * that cache; never queries repositories).
 */

import { describe, it, expect } from 'vitest';

import { computeDecisionDeltas } from '@/application/use-cases/agents/stream-agent-events/compute-decision-deltas.js';
import type { SupervisorDecision } from '@/domain/generated/output.js';
import { SupervisorVerdict } from '@/domain/generated/output.js';

function makeDecision(overrides: Partial<SupervisorDecision> = {}): SupervisorDecision {
  const now = new Date('2026-04-01T10:00:00Z');
  return {
    id: 'd-1',
    scopeType: 'app',
    scopeId: 'app-1',
    featureId: undefined,
    supervisorRunId: 'sup-run-1',
    sourceEventKind: 'gate',
    sourceEventId: 'gate-1',
    verdict: SupervisorVerdict.advise,
    rationale: 'looks reasonable',
    modelId: 'stub-model',
    promptVersion: 'v1',
    ruleRef: undefined,
    confidence: undefined,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as SupervisorDecision;
}

describe('computeDecisionDeltas', () => {
  it('emits exactly one event per decision on first sighting', () => {
    const cache = { lastSeenAt: 0, deliveredIds: new Set<string>() };
    const events = computeDecisionDeltas({
      decisions: [
        makeDecision({ id: 'a', createdAt: new Date('2026-04-01T10:00:00Z') }),
        makeDecision({ id: 'b', createdAt: new Date('2026-04-01T10:00:01Z') }),
      ],
      cache,
    });

    expect(events).toHaveLength(2);
    expect(events.every((e) => e.kind === 'supervisor_decision')).toBe(true);
    // Only ids AT the cursor are kept; `a` is older and cannot be re-read.
    expect(cache.deliveredIds.has('a')).toBe(false);
    expect(cache.deliveredIds.has('b')).toBe(true);
    expect(cache.lastSeenAt).toBe(new Date('2026-04-01T10:00:01Z').getTime());
  });

  it('does not re-emit already-seen decisions on subsequent calls', () => {
    const cache = { lastSeenAt: 0, deliveredIds: new Set<string>() };
    const decision = makeDecision({ id: 'a' });

    expect(computeDecisionDeltas({ decisions: [decision], cache })).toHaveLength(1);
    const second = computeDecisionDeltas({ decisions: [decision], cache });
    expect(second).toHaveLength(0);
  });

  it('exposes id, scope, verdict, rationale and audit metadata on the event', () => {
    const cache = { lastSeenAt: 0, deliveredIds: new Set<string>() };
    const created = new Date('2026-04-01T10:00:05Z');
    const events = computeDecisionDeltas({
      decisions: [
        makeDecision({
          id: 'd-x',
          scopeType: 'app',
          scopeId: 'app-7',
          featureId: 'feat-3',
          supervisorRunId: 'sup-9',
          sourceEventKind: 'question',
          sourceEventId: 'q-42',
          verdict: SupervisorVerdict.escalate,
          rationale: 'needs human review',
          modelId: 'sonnet-4-6',
          promptVersion: 'v3',
          ruleRef: 'rule-merge-strict',
          confidence: 0.91,
          createdAt: created,
        }),
      ],
      cache,
    });

    expect(events).toHaveLength(1);
    const ev = events[0];
    if (ev.kind !== 'supervisor_decision') throw new Error('expected supervisor_decision event');
    expect(ev.decisionId).toBe('d-x');
    expect(ev.scopeType).toBe('app');
    expect(ev.scopeId).toBe('app-7');
    expect(ev.featureId).toBe('feat-3');
    expect(ev.supervisorRunId).toBe('sup-9');
    expect(ev.sourceEventKind).toBe('question');
    expect(ev.sourceEventId).toBe('q-42');
    expect(ev.verdict).toBe(SupervisorVerdict.escalate);
    expect(ev.rationale).toBe('needs human review');
    expect(ev.modelId).toBe('sonnet-4-6');
    expect(ev.promptVersion).toBe('v3');
    expect(ev.ruleRef).toBe('rule-merge-strict');
    expect(ev.confidence).toBe(0.91);
    expect(ev.createdAt).toBe(created.toISOString());
  });

  it('handles string and number createdAt values', () => {
    const cache = { lastSeenAt: 0, deliveredIds: new Set<string>() };
    const events = computeDecisionDeltas({
      decisions: [
        makeDecision({ id: 'a', createdAt: '2026-04-01T10:00:00Z' as unknown as Date }),
        makeDecision({ id: 'b', createdAt: 1700000001000 as unknown as Date }),
      ],
      cache,
    });
    expect(events).toHaveLength(2);
  });

  it('returns zero events for an empty input', () => {
    const cache = { lastSeenAt: 0, deliveredIds: new Set<string>() };
    expect(computeDecisionDeltas({ decisions: [], cache })).toEqual([]);
  });

  // Spec 116: same bound as the message stream — see compute-message-deltas.
  it('stays bounded across polls and never re-emits an evicted id', () => {
    const BASE_MS = new Date('2026-04-01T10:00:00Z').getTime();
    const TOTAL = 120;
    const PER_POLL = 5;
    const table = Array.from({ length: TOTAL }, (_, i) =>
      makeDecision({ id: `d${i}`, createdAt: new Date(BASE_MS + i) })
    );
    const cache = { lastSeenAt: 0, deliveredIds: new Set<string>() };
    const emitted: string[] = [];
    let visible = 0;
    let maxRemembered = 0;

    while (visible < TOTAL) {
      visible = Math.min(TOTAL, visible + PER_POLL);
      const since = cache.lastSeenAt;
      const rows = table.slice(0, visible).filter((d) => (d.createdAt as Date).getTime() >= since);
      for (const e of computeDecisionDeltas({ decisions: rows, cache })) {
        if (e.kind === 'supervisor_decision') emitted.push(e.decisionId);
      }
      maxRemembered = Math.max(maxRemembered, cache.deliveredIds.size);
    }

    expect(emitted).toEqual(table.map((d) => d.id));
    expect(maxRemembered).toBe(1);
  });
});
