/**
 * SQLiteAgentQuestionRepository — integration tests (spec 093).
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteAgentQuestionRepository } from '@/infrastructure/repositories/sqlite-agent-question.repository.js';
import type { AgentQuestion } from '@/domain/generated/output.js';
import {
  AgentQuestionAnswerer,
  AgentQuestionKind,
  AgentQuestionStatus,
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

describe('SQLiteAgentQuestionRepository', () => {
  let db: Database.Database;
  let repo: SQLiteAgentQuestionRepository;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    repo = new SQLiteAgentQuestionRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('create + findById round-trips a question', async () => {
    await repo.create(
      makeQuestion({
        id: 'q1',
        optionsJson: '["yes","no"]',
        defaultAnswer: 'no',
      })
    );
    const found = await repo.findById('app-1', 'q1');
    expect(found?.id).toBe('q1');
    expect(found?.optionsJson).toBe('["yes","no"]');
    expect(found?.defaultAnswer).toBe('no');
  });

  it('findById is app-scoped', async () => {
    await repo.create(makeQuestion({ id: 'q1', appId: 'app-1' }));
    expect(await repo.findById('app-2', 'q1')).toBeNull();
  });

  it('listByScope filters by app, feature, and status', async () => {
    await repo.create(makeQuestion({ id: 'q1', featureId: 'f1' }));
    await repo.create(
      makeQuestion({ id: 'q2', featureId: 'f1', status: AgentQuestionStatus.answered })
    );
    await repo.create(makeQuestion({ id: 'q3', featureId: 'f2' }));
    await repo.create(makeQuestion({ id: 'q4', appId: 'app-2' }));

    const f1Pending = await repo.listByScope('app-1', 'f1', {
      status: AgentQuestionStatus.pending,
    });
    expect(f1Pending.map((q) => q.id)).toEqual(['q1']);

    const allApp1 = await repo.listByScope('app-1', undefined);
    expect(allApp1.map((q) => q.id).sort()).toEqual(['q1', 'q2', 'q3']);
  });

  it('listByAgentRun is app-scoped and filters by run id', async () => {
    await repo.create(makeQuestion({ id: 'q1', agentRunId: 'run-1' }));
    await repo.create(makeQuestion({ id: 'q2', agentRunId: 'run-2' }));
    await repo.create(makeQuestion({ id: 'q3', appId: 'app-2', agentRunId: 'run-1' }));

    const result = await repo.listByAgentRun('app-1', 'run-1');
    expect(result.map((q) => q.id)).toEqual(['q1']);
  });

  it('updateStatus persists answer fields', async () => {
    await repo.create(makeQuestion({ id: 'q1' }));
    const answeredAt = new Date();
    await repo.updateStatus('app-1', 'q1', AgentQuestionStatus.answered, {
      answer: '42',
      answeredBy: 'user:alice',
      answeredAt,
    });

    const after = await repo.findById('app-1', 'q1');
    expect(after?.status).toBe(AgentQuestionStatus.answered);
    expect(after?.answer).toBe('42');
    expect(after?.answeredBy).toBe('user:alice');
    expect(after?.answeredAt?.getTime()).toBe(answeredAt.getTime());
  });

  it('updateStatus is a no-op for cross-app calls', async () => {
    await repo.create(makeQuestion({ id: 'q1', appId: 'app-1' }));
    await repo.updateStatus('app-2', 'q1', AgentQuestionStatus.answered);
    const after = await repo.findById('app-1', 'q1');
    expect(after?.status).toBe(AgentQuestionStatus.pending);
  });

  it('settlePending is a single conditional write: only a pending row changes, once', async () => {
    await repo.create(makeQuestion({ id: 'q1' }));
    const answeredAt = new Date();
    expect(
      await repo.settlePending('app-1', 'q1', AgentQuestionStatus.answered, {
        answer: 'first',
        answeredBy: 'user:cli',
        answeredAt,
      })
    ).toBe(true);
    expect(
      await repo.settlePending('app-1', 'q1', AgentQuestionStatus.answered, {
        answer: 'second',
        answeredBy: 'user:web',
        answeredAt,
      })
    ).toBe(false);
    expect(await repo.settlePending('app-2', 'q1', AgentQuestionStatus.cancelled)).toBe(false);

    const after = await repo.findById('app-1', 'q1');
    expect(after?.answer).toBe('first');
    expect(after?.answeredBy).toBe('user:cli');
  });

  it('findExpired returns pending rows whose expires_at is at or before the cutoff', async () => {
    await repo.create(makeQuestion({ id: 'expired-1', expiresAt: new Date(2026, 0, 1) }));
    await repo.create(makeQuestion({ id: 'expired-2', expiresAt: new Date(2026, 0, 2) }));
    await repo.create(makeQuestion({ id: 'fresh', expiresAt: new Date(2027, 0, 1) }));
    await repo.create(makeQuestion({ id: 'no-expiry' }));

    const result = await repo.findExpired(new Date(2026, 0, 2));
    expect(result.map((q) => q.id).sort()).toEqual(['expired-1', 'expired-2']);
  });
});
