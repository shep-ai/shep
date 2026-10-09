/**
 * ListAgentQuestionInboxUseCase (spec 134) — the inbox reads every scope a
 * question was written under, one scope at a time (NFR-7), newest first.
 */

import 'reflect-metadata';
import { describe, it, expect } from 'vitest';

import { ListAgentQuestionInboxUseCase } from '@/application/use-cases/agents/list-agent-question-inbox.use-case.js';
import { InMemoryAgentQuestionRepository } from '@/infrastructure/adapters/in-memory/in-memory-agent-question-repository.js';
import {
  AgentQuestionAnswerer,
  AgentQuestionKind,
  AgentQuestionStatus,
  type AgentQuestion,
} from '@/domain/generated/output.js';

function q(id: string, appId: string, at: number, status = AgentQuestionStatus.pending) {
  return {
    id,
    appId,
    featureId: 'feat-1',
    agentRunId: 'run-1',
    kind: AgentQuestionKind.question,
    prompt: id,
    answerer: AgentQuestionAnswerer.user,
    status,
    createdAt: new Date(at),
    updatedAt: new Date(at),
  } as AgentQuestion;
}

describe('ListAgentQuestionInboxUseCase', () => {
  it('includes scopes without an Application (repository paths), newest first', async () => {
    const repo = new InMemoryAgentQuestionRepository();
    await repo.create(q('a', 'app-1', 1));
    await repo.create(q('b', '/repos/no-app', 3));
    await repo.create(q('c', 'app-1', 2, AgentQuestionStatus.answered));

    const useCase = new ListAgentQuestionInboxUseCase(repo);

    expect((await useCase.execute({})).map((x) => x.id)).toEqual(['b', 'c', 'a']);
    expect(
      (await useCase.execute({ status: AgentQuestionStatus.pending })).map((x) => x.id)
    ).toEqual(['b', 'a']);
    expect((await useCase.execute({ appId: 'app-1' })).map((x) => x.id)).toEqual(['c', 'a']);
  });
});
