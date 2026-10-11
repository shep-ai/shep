/**
 * AskAgentDecisionUseCase (spec 134, part 2) — a background agent asks with a
 * recommendation and a deadline; at the deadline it proceeds with the
 * recommendation, and the question records that it did.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { AskAgentDecisionUseCase } from '@/application/use-cases/agents/ask-agent-decision.use-case.js';
import { AskAgentQuestionUseCase } from '@/application/use-cases/agents/ask-agent-question.use-case.js';
import { AnswerAgentQuestionUseCase } from '@/application/use-cases/agents/answer-agent-question.use-case.js';
import { InMemoryAgentQuestionRepository } from '@/infrastructure/adapters/in-memory/in-memory-agent-question-repository.js';
import { DeferredQuestionRegistry } from '@/infrastructure/services/agents/agent-question-service/deferred-question-registry.js';
import type { ISettingsRepository } from '@/application/ports/output/repositories/settings.repository.interface.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import type { IApplicationRepository } from '@/application/ports/output/repositories/application-repository.interface.js';
import type { IAgentRunRepository } from '@/application/ports/output/agents/agent-run-repository.interface.js';
import { AgentQuestionStatus, DecisionKind, type Settings } from '@/domain/generated/output.js';
import { DECISION_DEADLINE_ACTOR } from '@/domain/shared/decision-deadline.js';

const MINUTE = 60_000;

function settingsRepo(collaboration: boolean, timeoutMinutes?: number): ISettingsRepository {
  return {
    initialize: vi.fn(),
    load: vi.fn().mockResolvedValue({
      featureFlags: { collaboration },
      workflow: { decisionDefaultTimeoutMinutes: timeoutMinutes },
    } as unknown as Settings),
    update: vi.fn(),
  };
}

const ASK = {
  featureId: 'feat-1',
  agentRunId: 'run-1',
  header: 'Migration',
  question: 'The users table has 40M rows. How should the column be added?',
  options: [
    { label: 'Online, nullable column', description: 'No lock', recommended: true },
    { label: 'Column with a default', description: 'Rewrites the table' },
  ],
};

describe('AskAgentDecisionUseCase', () => {
  let repo: InMemoryAgentQuestionRepository;
  let registry: DeferredQuestionRegistry;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-09T10:00:00Z'));
    repo = new InMemoryAgentQuestionRepository();
    registry = new DeferredQuestionRegistry(repo);
  });
  afterEach(() => vi.useRealTimers());

  function build(collaboration = true, timeoutMinutes?: number) {
    const settings = settingsRepo(collaboration, timeoutMinutes);
    const ask = new AskAgentQuestionUseCase(
      repo,
      registry,
      settings,
      {
        routeIfApplicable: vi.fn().mockResolvedValue({ evaluated: false, answered: false }),
      } as any,
      { execute: vi.fn().mockResolvedValue({ escalated: true }) } as any
    );
    const features = {
      findById: vi.fn().mockResolvedValue({ id: 'feat-1', repositoryPath: '/repo' }),
    } as unknown as IFeatureRepository;
    const applications = {
      findByPath: vi.fn().mockResolvedValue({ id: 'app-1' }),
    } as unknown as IApplicationRepository;
    const useCase = new AskAgentDecisionUseCase(ask, repo, settings, features, applications);
    const answer = new AnswerAgentQuestionUseCase(
      repo,
      registry,
      settings,
      { findById: vi.fn().mockResolvedValue(null) } as unknown as IAgentRunRepository,
      { execute: vi.fn() } as any,
      { execute: vi.fn() } as any
    );
    return { useCase, answer };
  }

  it('records an agent-ask decision with a deadline from the setting and returns the answer', async () => {
    const { useCase, answer } = build(true, 45);
    const pending = useCase.execute(ASK);
    await vi.advanceTimersByTimeAsync(0);

    const [stored] = await repo.listByScope('app-1', 'feat-1');
    expect(stored.decision?.kind).toBe(DecisionKind.AgentAsk);
    expect(stored.expiresAt).toEqual(new Date('2026-10-09T10:45:00Z'));
    expect(stored.defaultAnswer).toBe('Online, nullable column');

    await answer.execute({
      appId: 'app-1',
      questionId: stored.id,
      responses: [{ questionId: 'q1', optionIds: ['o2'] }],
      answeredBy: 'user:web',
    });

    await expect(pending).resolves.toMatchObject({
      outcome: 'answered',
      answer: 'Column with a default',
      answeredBy: 'user:web',
      pickedRecommended: false,
    });
  });

  it('proceeds with the recommendation at the deadline and records that it did', async () => {
    const { useCase } = build(true);
    const pending = useCase.execute({ ...ASK, timeoutMinutes: 10 });
    await vi.advanceTimersByTimeAsync(10 * MINUTE);

    await expect(pending).resolves.toMatchObject({
      outcome: 'defaulted',
      answer: 'Online, nullable column',
      pickedRecommended: true,
    });
    const [stored] = await repo.listByScope('app-1', 'feat-1');
    expect(stored.status).toBe(AgentQuestionStatus.expired);
    expect(stored.responses).toEqual([{ questionId: 'q1', optionIds: ['o1'] }]);
    expect(stored.answeredBy).toBe(DECISION_DEADLINE_ACTOR);
    expect(stored.answer).toBe('Online, nullable column');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a cancelled question also proceeds with the recommendation', async () => {
    const { useCase } = build(true);
    const pending = useCase.execute(ASK);
    await vi.advanceTimersByTimeAsync(0);
    const [stored] = await repo.listByScope('app-1', 'feat-1');
    registry.reject(stored.id, 'stopped');

    await expect(pending).resolves.toMatchObject({
      outcome: 'cancelled',
      answer: 'Online, nullable column',
    });
  });

  it('with collaboration off nobody is asked and the recommendation applies at once', async () => {
    const { useCase } = build(false);
    await expect(useCase.execute(ASK)).resolves.toMatchObject({
      outcome: 'disabled',
      answer: 'Online, nullable column',
    });
    expect(await repo.listAppIds()).toEqual([]);
  });

  it('rejects a question without exactly one recommendation', async () => {
    const { useCase } = build(true);
    await expect(
      useCase.execute({
        ...ASK,
        options: ASK.options.map((o) => ({ ...o, recommended: false })),
      })
    ).rejects.toThrow(/exactly one/);
  });
});
