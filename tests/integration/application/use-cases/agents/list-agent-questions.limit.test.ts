/**
 * ListAgentQuestionsUseCase over the real SQLite repository — page limit.
 *
 * `shep agent questions ls --limit <n>` forwards the flag as a number. SQLite
 * accepts only an integer in `LIMIT ?`: NaN, ±Infinity and a fractional value
 * such as 2.5 all raise `datatype mismatch`. The in-memory repository slices
 * with `Array.prototype.slice`, which tolerates all three, so only the real
 * repository can show the crash.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteAgentQuestionRepository } from '@/infrastructure/repositories/sqlite-agent-question.repository.js';
import { ListAgentQuestionsUseCase } from '@/application/use-cases/agents/list-agent-questions.use-case.js';
import type { AgentQuestion } from '@/domain/generated/output.js';
import {
  AgentQuestionAnswerer,
  AgentQuestionKind,
  AgentQuestionStatus,
} from '@/domain/generated/output.js';

const QUESTION_COUNT = 3;

function makeQuestion(id: string): AgentQuestion {
  const now = new Date();
  return {
    id,
    appId: 'app-1',
    agentRunId: 'run-1',
    kind: AgentQuestionKind.blocking,
    prompt: 'continue?',
    answerer: AgentQuestionAnswerer.user,
    status: AgentQuestionStatus.pending,
    createdAt: now,
    updatedAt: now,
  } as AgentQuestion;
}

describe('ListAgentQuestionsUseCase limit (SQLite)', () => {
  let db: Database.Database;
  let useCase: ListAgentQuestionsUseCase;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    const repo = new SQLiteAgentQuestionRepository(db);
    for (let i = 0; i < QUESTION_COUNT; i++) {
      await repo.create(makeQuestion(`q${i}`));
    }
    useCase = new ListAgentQuestionsUseCase(repo);
  });

  afterEach(() => {
    db.close();
  });

  it('applies an integer limit', async () => {
    const rows = await useCase.execute({ appId: 'app-1', limit: 2 });
    expect(rows).toHaveLength(2);
  });

  it.each([
    ['fractional', 2.5],
    ['NaN', Number('abc')],
    ['Infinity', Number('1e999')],
  ])('ignores a %s limit instead of crashing on LIMIT ?', async (_label, limit) => {
    const rows = await useCase.execute({ appId: 'app-1', limit });
    expect(rows).toHaveLength(QUESTION_COUNT);
  });
});
