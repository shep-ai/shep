/**
 * computeQuestionDeltas Unit Tests (spec 093, task 18).
 *
 * Pure helper that converts new {@link AgentQuestion} rows and observed
 * status transitions into {@link AgentQuestionStreamEvent} entries while
 * honoring a per-id status cache so already-seen rows are NOT re-emitted.
 */

import { describe, it, expect } from 'vitest';

import { computeQuestionDeltas } from '@/application/use-cases/agents/stream-agent-events/compute-question-deltas.js';
import type { CachedAgentQuestionState } from '@/application/use-cases/agents/stream-agent-events/compute-question-deltas.js';
import type { AgentQuestion } from '@/domain/generated/output.js';
import {
  AgentQuestionAnswerer,
  AgentQuestionKind,
  AgentQuestionStatus,
} from '@/domain/generated/output.js';

function makeQuestion(overrides: Partial<AgentQuestion> = {}): AgentQuestion {
  const now = new Date('2026-04-01T10:00:00Z');
  return {
    id: 'q-1',
    appId: 'app-1',
    featureId: undefined,
    agentRunId: 'run-1',
    kind: AgentQuestionKind.question,
    prompt: '?',
    optionsJson: undefined,
    defaultAnswer: undefined,
    answerer: AgentQuestionAnswerer.user,
    status: AgentQuestionStatus.pending,
    answer: undefined,
    answeredBy: undefined,
    answeredAt: undefined,
    expiresAt: undefined,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as AgentQuestion;
}

function emptyCache(): CachedAgentQuestionState {
  return { lastSeenAt: 0, lastStatus: new Map() };
}

describe('computeQuestionDeltas', () => {
  it('emits one event per pending row on first sighting', () => {
    const cache = emptyCache();
    const events = computeQuestionDeltas({
      questions: [
        makeQuestion({ id: 'a', createdAt: new Date('2026-04-01T10:00:00Z') }),
        makeQuestion({ id: 'b', createdAt: new Date('2026-04-01T10:00:01Z') }),
      ],
      cache,
    });

    expect(events).toHaveLength(2);
    expect(events.every((e) => e.kind === 'agent_question')).toBe(true);
    expect(cache.lastStatus.get('a')).toBe(AgentQuestionStatus.pending);
    expect(cache.lastStatus.get('b')).toBe(AgentQuestionStatus.pending);
  });

  it('does not re-emit rows whose status has not changed', () => {
    const cache = emptyCache();
    const row = makeQuestion({ id: 'a', createdAt: new Date('2026-04-01T10:00:00Z') });

    expect(computeQuestionDeltas({ questions: [row], cache })).toHaveLength(1);
    const second = computeQuestionDeltas({ questions: [row], cache });
    expect(second).toHaveLength(0);
  });

  it('emits a transition event when status changes from pending to answered', () => {
    const cache = emptyCache();
    const pending = makeQuestion({ id: 'a' });
    computeQuestionDeltas({ questions: [pending], cache });

    const answered = makeQuestion({
      id: 'a',
      status: AgentQuestionStatus.answered,
      answer: 'go',
      answeredBy: 'user:tester',
      answeredAt: new Date('2026-04-01T10:00:05Z'),
    });
    const events = computeQuestionDeltas({ questions: [answered], cache });

    expect(events).toHaveLength(1);
    const ev = events[0];
    if (ev.kind !== 'agent_question') throw new Error('expected agent_question event');
    expect(ev.transition).toBe('status');
    expect(ev.status).toBe(AgentQuestionStatus.answered);
    expect(ev.answer).toBe('go');
    expect(ev.answeredBy).toBe('user:tester');
    expect(typeof ev.answeredAt).toBe('string');
  });

  it('exposes core fields on the event envelope', () => {
    const cache = emptyCache();
    const created = new Date('2026-04-01T10:00:05Z');
    const events = computeQuestionDeltas({
      questions: [
        makeQuestion({
          id: 'q-x',
          appId: 'app-7',
          featureId: 'feat-3',
          agentRunId: 'run-9',
          kind: AgentQuestionKind.blocking,
          prompt: 'approve?',
          optionsJson: '["yes","no"]',
          answerer: AgentQuestionAnswerer.either,
          status: AgentQuestionStatus.pending,
          createdAt: created,
        }),
      ],
      cache,
    });

    expect(events).toHaveLength(1);
    const ev = events[0];
    if (ev.kind !== 'agent_question') throw new Error('expected agent_question event');
    expect(ev.questionId).toBe('q-x');
    expect(ev.appId).toBe('app-7');
    expect(ev.featureId).toBe('feat-3');
    expect(ev.agentRunId).toBe('run-9');
    expect(ev.questionKind).toBe(AgentQuestionKind.blocking);
    expect(ev.answerer).toBe(AgentQuestionAnswerer.either);
    expect(ev.status).toBe(AgentQuestionStatus.pending);
    expect(ev.optionsJson).toBe('["yes","no"]');
    expect(ev.transition).toBe('new');
    expect(ev.createdAt).toBe(created.toISOString());
  });

  it('returns zero events for an empty input', () => {
    const cache = emptyCache();
    expect(computeQuestionDeltas({ questions: [], cache })).toEqual([]);
  });

  // Spec 116: questions are re-listed in full each poll (no cursor), so the
  // per-id status map only needs the ids of that listing; an id that left it
  // (deleted or pruned) must not pin memory for the life of the connection.
  it('forgets ids that are no longer listed, without re-emitting the rest', () => {
    const cache: CachedAgentQuestionState = { lastSeenAt: 0, lastStatus: new Map() };
    const q1 = makeQuestion({ id: 'q-1' });
    const q2 = makeQuestion({ id: 'q-2' });

    computeQuestionDeltas({ questions: [q1, q2], cache });
    const second = computeQuestionDeltas({ questions: [q2], cache });

    expect(second).toEqual([]);
    expect([...cache.lastStatus.keys()]).toEqual(['q-2']);
  });
});
