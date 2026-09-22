/**
 * InMemoryAgentQuestionRepository — unit tests
 *
 * Verifies create, scope isolation, status transitions, and the
 * findExpired sweep query.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAgentQuestionRepository } from '@/infrastructure/adapters/in-memory/in-memory-agent-question-repository.js';
import type { AgentQuestion } from '@/domain/generated/output.js';
import {
  AgentQuestionStatus,
  AgentQuestionKind,
  AgentQuestionAnswerer,
} from '@/domain/generated/output.js';

function makeQuestion(overrides: Partial<AgentQuestion> = {}): AgentQuestion {
  const now = new Date();
  return {
    id: overrides.id ?? `q-${Math.random().toString(36).slice(2, 9)}`,
    appId: 'app-1',
    featureId: undefined,
    agentRunId: 'run-1',
    kind: AgentQuestionKind.blocking,
    prompt: 'continue?',
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

describe('InMemoryAgentQuestionRepository', () => {
  let repo: InMemoryAgentQuestionRepository;

  beforeEach(() => {
    repo = new InMemoryAgentQuestionRepository();
  });

  it('create + findById round-trips', async () => {
    await repo.create(makeQuestion({ id: 'q1' }));
    const found = await repo.findById('app-1', 'q1');
    expect(found?.id).toBe('q1');
  });

  it('findById is app-scoped', async () => {
    await repo.create(makeQuestion({ id: 'q1', appId: 'app-1' }));
    expect(await repo.findById('app-2', 'q1')).toBeNull();
  });

  it('listByScope filters by appId, featureId, and status', async () => {
    await repo.create(
      makeQuestion({
        id: 'q1',
        appId: 'app-1',
        featureId: 'f1',
        status: AgentQuestionStatus.pending,
      })
    );
    await repo.create(
      makeQuestion({
        id: 'q2',
        appId: 'app-1',
        featureId: 'f1',
        status: AgentQuestionStatus.answered,
      })
    );
    await repo.create(
      makeQuestion({
        id: 'q3',
        appId: 'app-1',
        featureId: 'f2',
        status: AgentQuestionStatus.pending,
      })
    );
    await repo.create(
      makeQuestion({
        id: 'q4',
        appId: 'app-2',
        featureId: 'f1',
        status: AgentQuestionStatus.pending,
      })
    );

    const f1Pending = await repo.listByScope('app-1', 'f1', {
      status: AgentQuestionStatus.pending,
    });
    expect(f1Pending.map((q) => q.id)).toEqual(['q1']);

    const allApp1 = await repo.listByScope('app-1', undefined);
    expect(allApp1.map((q) => q.id).sort()).toEqual(['q1', 'q2', 'q3']);
  });

  it('listByScope returns descending by createdAt', async () => {
    await repo.create(
      makeQuestion({ id: 'q1', createdAt: new Date(2026, 0, 1), updatedAt: new Date(2026, 0, 1) })
    );
    await repo.create(
      makeQuestion({ id: 'q2', createdAt: new Date(2026, 1, 1), updatedAt: new Date(2026, 1, 1) })
    );
    const result = await repo.listByScope('app-1', undefined);
    expect(result.map((q) => q.id)).toEqual(['q2', 'q1']);
  });

  it('listByAgentRun returns questions for a single run, app-scoped', async () => {
    await repo.create(makeQuestion({ id: 'q1', agentRunId: 'run-1' }));
    await repo.create(makeQuestion({ id: 'q2', agentRunId: 'run-2' }));
    const result = await repo.listByAgentRun('app-1', 'run-1');
    expect(result.map((q) => q.id)).toEqual(['q1']);
  });

  it('updateStatus updates status and answer fields', async () => {
    await repo.create(makeQuestion({ id: 'q1' }));
    const answeredAt = new Date();
    await repo.updateStatus('app-1', 'q1', AgentQuestionStatus.answered, {
      answer: '42',
      answeredBy: 'user:alice',
      answeredAt,
    });
    const after = await repo.findById('app-1', 'q1');
    expect(after?.status).toBe('answered');
    expect(after?.answer).toBe('42');
    expect(after?.answeredBy).toBe('user:alice');
    expect(after?.answeredAt).toBe(answeredAt);
  });

  it('updateStatus is a no-op for cross-app calls', async () => {
    await repo.create(makeQuestion({ id: 'q1', appId: 'app-1' }));
    await repo.updateStatus('app-2', 'q1', AgentQuestionStatus.answered);
    const after = await repo.findById('app-1', 'q1');
    expect(after?.status).toBe('pending');
  });

  it('settlePending moves a pending row once and refuses a second settle', async () => {
    await repo.create(makeQuestion({ id: 'q1' }));
    const fields = { answer: 'a', answeredBy: 'user:a', answeredAt: new Date() };
    expect(await repo.settlePending('app-1', 'q1', AgentQuestionStatus.answered, fields)).toBe(
      true
    );
    expect(
      await repo.settlePending('app-1', 'q1', AgentQuestionStatus.cancelled, { answer: 'b' })
    ).toBe(false);
    const after = await repo.findById('app-1', 'q1');
    expect(after?.status).toBe(AgentQuestionStatus.answered);
    expect(after?.answer).toBe('a');
    expect(await repo.settlePending('app-2', 'q1', AgentQuestionStatus.answered)).toBe(false);
  });

  it('findExpired returns pending questions whose expiresAt is at or before the cutoff', async () => {
    await repo.create(makeQuestion({ id: 'expired-1', expiresAt: new Date(2026, 0, 1) }));
    await repo.create(makeQuestion({ id: 'expired-2', expiresAt: new Date(2026, 0, 2) }));
    await repo.create(makeQuestion({ id: 'fresh', expiresAt: new Date(2027, 0, 1) }));
    await repo.create(
      makeQuestion({
        id: 'no-expiry',
        expiresAt: undefined,
      })
    );

    const result = await repo.findExpired(new Date(2026, 0, 2));
    expect(result.map((q) => q.id).sort()).toEqual(['expired-1', 'expired-2']);
  });

  it('findExpired excludes non-pending rows', async () => {
    await repo.create(
      makeQuestion({
        id: 'answered-old',
        status: AgentQuestionStatus.answered,
        expiresAt: new Date(2026, 0, 1),
      })
    );
    const result = await repo.findExpired(new Date(2027, 0, 1));
    expect(result).toHaveLength(0);
  });
});
