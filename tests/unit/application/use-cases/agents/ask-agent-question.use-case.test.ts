/**
 * AskAgentQuestionUseCase — unit tests (spec 093, task 17).
 *
 * Verifies:
 *  - Flag-off short-circuit (no persist, no register, returns enabled=false).
 *  - Flag-on persist + return of the row for non-blocking kinds (no awaiter).
 *  - Flag-on persist + register awaiter for blocking kinds (awaiter resolves).
 *  - The persisted row stores options as JSON when supplied.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { AskAgentQuestionUseCase } from '@/application/use-cases/agents/ask-agent-question.use-case.js';
import type { EscalateToUserUseCase } from '@/application/use-cases/agents/escalate-to-user.use-case.js';
import { InMemoryAgentQuestionRepository } from '@/infrastructure/adapters/in-memory/in-memory-agent-question-repository.js';
import { DeferredQuestionRegistry } from '@/infrastructure/services/agents/agent-question-service/deferred-question-registry.js';
import type { ISettingsRepository } from '@/application/ports/output/repositories/settings.repository.interface.js';
import {
  AgentQuestionAnswerer,
  AgentQuestionKind,
  AgentQuestionStatus,
  type Settings,
} from '@/domain/generated/output.js';
import { buildApprovalGateDecision } from '@/domain/shared/decision-builders.js';

function makeSettingsRepo(collaboration: boolean): ISettingsRepository {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    load: vi.fn().mockResolvedValue({ featureFlags: { collaboration } } as unknown as Settings),
    update: vi.fn().mockResolvedValue(undefined),
  };
}

function makeEscalateToUserStub(): EscalateToUserUseCase {
  return {
    execute: vi.fn().mockResolvedValue({ escalated: false }),
  } as unknown as EscalateToUserUseCase;
}

describe('AskAgentQuestionUseCase', () => {
  let repo: InMemoryAgentQuestionRepository;
  let registry: DeferredQuestionRegistry;

  beforeEach(() => {
    repo = new InMemoryAgentQuestionRepository();
    registry = new DeferredQuestionRegistry();
  });

  it('returns enabled=false and persists nothing when feature flag is off', async () => {
    const useCase = new AskAgentQuestionUseCase(
      repo,
      registry,
      makeSettingsRepo(false),
      {
        routeIfApplicable: vi.fn().mockResolvedValue({ evaluated: false, answered: false }),
      } as any,
      makeEscalateToUserStub()
    );

    const result = await useCase.execute({
      appId: 'app-1',
      agentRunId: 'run-1',
      kind: AgentQuestionKind.question,
      prompt: 'Which library?',
      answerer: AgentQuestionAnswerer.user,
    });

    expect(result.enabled).toBe(false);
    expect(result.question).toBeUndefined();
    expect(await repo.listByScope('app-1', undefined)).toHaveLength(0);
  });

  it('persists a non-blocking question and does NOT return an awaiter', async () => {
    const useCase = new AskAgentQuestionUseCase(
      repo,
      registry,
      makeSettingsRepo(true),
      {
        routeIfApplicable: vi.fn().mockResolvedValue({ evaluated: false, answered: false }),
      } as any,
      makeEscalateToUserStub()
    );

    const result = await useCase.execute({
      appId: 'app-1',
      agentRunId: 'run-1',
      kind: AgentQuestionKind.question,
      prompt: 'Which library?',
      answerer: AgentQuestionAnswerer.user,
      options: ['lib-a', 'lib-b'],
    });

    expect(result.enabled).toBe(true);
    expect(result.question).toBeDefined();
    expect(result.awaiter).toBeUndefined();
    expect(result.question?.status).toBe(AgentQuestionStatus.pending);
    expect(result.question?.optionsJson).toBe('["lib-a","lib-b"]');

    const stored = await repo.listByScope('app-1', undefined);
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe(result.question?.id);
  });

  it('persists a blocking question AND registers an awaiter that resolves on registry.resolve', async () => {
    const useCase = new AskAgentQuestionUseCase(
      repo,
      registry,
      makeSettingsRepo(true),
      {
        routeIfApplicable: vi.fn().mockResolvedValue({ evaluated: false, answered: false }),
      } as any,
      makeEscalateToUserStub()
    );

    const result = await useCase.execute({
      appId: 'app-1',
      agentRunId: 'run-1',
      kind: AgentQuestionKind.blocking,
      prompt: 'Approve merge?',
      answerer: AgentQuestionAnswerer.user,
    });

    expect(result.enabled).toBe(true);
    expect(result.awaiter).toBeDefined();
    expect(registry.has(result.question!.id)).toBe(true);

    registry.resolve(result.question!.id, 'approve');
    await expect(result.awaiter).resolves.toBe('approve');
  });

  it('escalates blocking questions with AgentQuestionBlocking notification kind', async () => {
    const escalate = makeEscalateToUserStub();
    const useCase = new AskAgentQuestionUseCase(
      repo,
      registry,
      makeSettingsRepo(true),
      {
        routeIfApplicable: vi.fn().mockResolvedValue({ evaluated: false, answered: false }),
      } as any,
      escalate
    );

    await useCase.execute({
      appId: 'app-1',
      agentRunId: 'run-1',
      kind: AgentQuestionKind.blocking,
      prompt: 'Approve merge?',
      answerer: AgentQuestionAnswerer.user,
    });

    expect(escalate.execute).toHaveBeenCalledTimes(1);
    const call = (escalate.execute as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.eventType).toBe('agent_question_blocking');
    expect(call.severity).toBe('warning');
    expect(call.message).toBe('Approve merge?');
  });

  it('escalates non-blocking questions with AgentQuestionPending notification kind', async () => {
    const escalate = makeEscalateToUserStub();
    const useCase = new AskAgentQuestionUseCase(
      repo,
      registry,
      makeSettingsRepo(true),
      {
        routeIfApplicable: vi.fn().mockResolvedValue({ evaluated: false, answered: false }),
      } as any,
      escalate
    );

    await useCase.execute({
      appId: 'app-1',
      agentRunId: 'run-1',
      kind: AgentQuestionKind.question,
      prompt: 'Which library?',
      answerer: AgentQuestionAnswerer.user,
    });

    expect(escalate.execute).toHaveBeenCalledTimes(1);
    const call = (escalate.execute as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.eventType).toBe('agent_question_pending');
    expect(call.severity).toBe('info');
  });

  it('does not escalate info-tier questions', async () => {
    const escalate = makeEscalateToUserStub();
    const useCase = new AskAgentQuestionUseCase(
      repo,
      registry,
      makeSettingsRepo(true),
      {
        routeIfApplicable: vi.fn().mockResolvedValue({ evaluated: false, answered: false }),
      } as any,
      escalate
    );

    await useCase.execute({
      appId: 'app-1',
      agentRunId: 'run-1',
      kind: AgentQuestionKind.info,
      prompt: 'FYI: switching branches',
      answerer: AgentQuestionAnswerer.user,
    });

    expect(escalate.execute).not.toHaveBeenCalled();
  });

  it('stores a decision and takes its deadline and recommended answer (spec 134)', async () => {
    const useCase = new AskAgentQuestionUseCase(
      repo,
      registry,
      makeSettingsRepo(true),
      {
        routeIfApplicable: vi.fn().mockResolvedValue({ evaluated: false, answered: false }),
      } as any,
      makeEscalateToUserStub()
    );
    const defaultAfter = new Date(Date.now() + 60_000);
    const decision = { ...buildApprovalGateDecision('ignored', 'plan'), defaultAfter };

    const result = await useCase.execute({
      appId: 'app-1',
      agentRunId: 'run-1',
      kind: AgentQuestionKind.question,
      prompt: decision.title!,
      decision,
      answerer: AgentQuestionAnswerer.user,
    });

    const stored = await repo.findById('app-1', result.question!.id);
    expect(stored?.decision).toEqual({ ...decision, id: result.question!.id });
    expect(stored?.expiresAt).toEqual(defaultAfter);
    expect(stored?.defaultAnswer).toBe('Approve');
    expect(stored?.optionsJson).toBeUndefined();
  });
});
