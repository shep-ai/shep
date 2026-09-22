/**
 * CancelAgentQuestionUseCase — unit tests (spec 093, task 17).
 *
 * Verifies:
 *  - Flag-off short-circuit (no mutation).
 *  - Status transitions to `cancelled` and the deferred awaiter is rejected.
 *  - Cancelling an already-cancelled or already-answered question is a no-op.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { AskAgentQuestionUseCase } from '@/application/use-cases/agents/ask-agent-question.use-case.js';
import { CancelAgentQuestionUseCase } from '@/application/use-cases/agents/cancel-agent-question.use-case.js';
import { InMemoryAgentQuestionRepository } from '@/infrastructure/adapters/in-memory/in-memory-agent-question-repository.js';
import { DeferredQuestionRegistry } from '@/infrastructure/services/agents/agent-question-service/deferred-question-registry.js';
import {
  AgentQuestionAnswerer,
  AgentQuestionKind,
  AgentQuestionStatus,
  type Settings,
} from '@/domain/generated/output.js';
import { AgentQuestionCancelledError } from '@/application/ports/output/agents/agent-question-service.interface.js';
import type { ISettingsRepository } from '@/application/ports/output/repositories/settings.repository.interface.js';

function makeSettingsRepo(collaboration: boolean): ISettingsRepository {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    load: vi.fn().mockResolvedValue({ featureFlags: { collaboration } } as unknown as Settings),
    update: vi.fn().mockResolvedValue(undefined),
  };
}

describe('CancelAgentQuestionUseCase', () => {
  let repo: InMemoryAgentQuestionRepository;
  let registry: DeferredQuestionRegistry;

  beforeEach(() => {
    repo = new InMemoryAgentQuestionRepository();
    registry = new DeferredQuestionRegistry();
  });

  it('returns enabled=false when feature flag is off', async () => {
    const useCase = new CancelAgentQuestionUseCase(repo, registry, makeSettingsRepo(false));

    const result = await useCase.execute({
      appId: 'app-1',
      questionId: 'q-not-found',
      cancelledBy: 'user:tester',
    });
    expect(result.enabled).toBe(false);
  });

  it('cancels a pending blocking question and rejects the awaiter', async () => {
    const settings = makeSettingsRepo(true);
    const ask = new AskAgentQuestionUseCase(
      repo,
      registry,
      settings,
      {
        routeIfApplicable: vi.fn().mockResolvedValue({ evaluated: false, answered: false }),
      } as any,
      { execute: vi.fn().mockResolvedValue({ escalated: false }) } as any
    );
    const askResult = await ask.execute({
      appId: 'app-1',
      agentRunId: 'run-1',
      kind: AgentQuestionKind.blocking,
      prompt: '?',
      answerer: AgentQuestionAnswerer.user,
    });

    const useCase = new CancelAgentQuestionUseCase(repo, registry, settings);

    const expectation = expect(askResult.awaiter).rejects.toBeInstanceOf(
      AgentQuestionCancelledError
    );

    await useCase.execute({
      appId: 'app-1',
      questionId: askResult.question!.id,
      cancelledBy: 'user:tester',
      reason: 'changed mind',
    });

    await expectation;
    const stored = await repo.findById('app-1', askResult.question!.id);
    expect(stored?.status).toBe(AgentQuestionStatus.cancelled);
    expect(stored?.answer).toBe('changed mind');
    expect(stored?.answeredBy).toBe('user:tester');
  });

  it('is a no-op when the question is already cancelled', async () => {
    const settings = makeSettingsRepo(true);
    const ask = new AskAgentQuestionUseCase(
      repo,
      registry,
      settings,
      {
        routeIfApplicable: vi.fn().mockResolvedValue({ evaluated: false, answered: false }),
      } as any,
      { execute: vi.fn().mockResolvedValue({ escalated: false }) } as any
    );
    const askResult = await ask.execute({
      appId: 'app-1',
      agentRunId: 'run-1',
      kind: AgentQuestionKind.question,
      prompt: '?',
      answerer: AgentQuestionAnswerer.user,
    });

    const useCase = new CancelAgentQuestionUseCase(repo, registry, settings);
    await useCase.execute({
      appId: 'app-1',
      questionId: askResult.question!.id,
      cancelledBy: 'user:tester',
    });

    const second = await useCase.execute({
      appId: 'app-1',
      questionId: askResult.question!.id,
      cancelledBy: 'user:tester',
    });
    expect(second.question?.status).toBe(AgentQuestionStatus.cancelled);
  });

  it('is a no-op when the question id does not exist', async () => {
    const settings = makeSettingsRepo(true);
    const useCase = new CancelAgentQuestionUseCase(repo, registry, settings);
    const result = await useCase.execute({
      appId: 'app-1',
      questionId: 'does-not-exist',
      cancelledBy: 'user:tester',
    });
    expect(result.enabled).toBe(true);
    expect(result.question).toBeUndefined();
  });

  it('a cancel racing an answer never overwrites the recorded answer', async () => {
    const settings = makeSettingsRepo(true);
    await repo.create({
      id: 'q-race',
      appId: 'app-1',
      agentRunId: 'run-1',
      kind: AgentQuestionKind.question,
      prompt: '?',
      answerer: AgentQuestionAnswerer.user,
      status: AgentQuestionStatus.pending,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    const cancel = new CancelAgentQuestionUseCase(repo, registry, settings);

    // The answer lands between the cancel's read and its write.
    const findById = repo.findById.bind(repo);
    vi.spyOn(repo, 'findById').mockImplementationOnce(async (appId, id) => {
      const snapshot = await findById(appId, id);
      await repo.updateStatus(appId, id, AgentQuestionStatus.answered, {
        answer: 'yes',
        answeredBy: 'user:web',
        answeredAt: new Date(),
      });
      return snapshot;
    });

    const result = await cancel.execute({
      appId: 'app-1',
      questionId: 'q-race',
      cancelledBy: 'user:cli',
    });

    const stored = await repo.findById('app-1', 'q-race');
    expect(stored?.status).toBe(AgentQuestionStatus.answered);
    expect(stored?.answer).toBe('yes');
    expect(result.alreadySettledAs).toBe(AgentQuestionStatus.answered);
  });
});
