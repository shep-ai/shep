/**
 * FeatureAgentGateQuestionPublisher — unit tests (spec 093, task 20).
 *
 * Verifies:
 *  - With flag ON, every waiting_approval emit produces ONE
 *    agent_questions row of kind=blocking, scoped to the resolved appId.
 *  - With flag OFF, no row is written (NFR-14 default behavior).
 *  - The row is linked to the AgentRun via agentRunId.
 *  - The publisher swallows AskAgentQuestion errors so a publisher
 *    failure cannot crash the feature-agent worker.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { FeatureAgentGateQuestionPublisher } from '@/infrastructure/services/agents/feature-agent/feature-agent-gate-question-publisher.js';
import { AskAgentQuestionUseCase } from '@/application/use-cases/agents/ask-agent-question.use-case.js';
import { InMemoryAgentQuestionRepository } from '@/infrastructure/adapters/in-memory/in-memory-agent-question-repository.js';
import { DeferredQuestionRegistry } from '@/infrastructure/services/agents/agent-question-service/deferred-question-registry.js';
import type { ISettingsRepository } from '@/application/ports/output/repositories/settings.repository.interface.js';
import type { IApplicationRepository } from '@/application/ports/output/repositories/application-repository.interface.js';
import {
  AgentQuestionKind,
  DecisionKind,
  type Application,
  type Settings,
} from '@/domain/generated/output.js';

function makeSettingsRepo(collaboration: boolean): ISettingsRepository {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    load: vi.fn().mockResolvedValue({ featureFlags: { collaboration } } as unknown as Settings),
    update: vi.fn().mockResolvedValue(undefined),
  };
}

function makeAppRepo(app: Partial<Application> | null): IApplicationRepository {
  return {
    findByPath: vi.fn().mockResolvedValue(app),
    list: vi.fn().mockResolvedValue([]),
  } as unknown as IApplicationRepository;
}

describe('FeatureAgentGateQuestionPublisher', () => {
  let repo: InMemoryAgentQuestionRepository;
  let registry: DeferredQuestionRegistry;

  beforeEach(() => {
    repo = new InMemoryAgentQuestionRepository();
    registry = new DeferredQuestionRegistry();
  });

  it('writes one blocking AgentQuestion when collaboration is on', async () => {
    const ask = new AskAgentQuestionUseCase(
      repo,
      registry,
      makeSettingsRepo(true),
      {
        routeIfApplicable: vi.fn().mockResolvedValue({ evaluated: false, answered: false }),
      } as any,
      { execute: vi.fn().mockResolvedValue({ escalated: false }) } as any
    );
    const publisher = new FeatureAgentGateQuestionPublisher(ask, makeAppRepo({ id: 'app-1' }));

    await publisher.publishWaitingApproval({
      runId: 'run-1',
      featureId: 'feat-1',
      repositoryPath: '/tmp/repo',
      interruptNode: 'plan',
    });

    const stored = await repo.listByScope('app-1', 'feat-1');
    expect(stored).toHaveLength(1);
    expect(stored[0].kind).toBe(AgentQuestionKind.blocking);
    expect(stored[0].agentRunId).toBe('run-1');
    expect(stored[0].appId).toBe('app-1');
    // Spec 134: a readable sentence and an approval-gate decision, never JSON.
    expect(stored[0].prompt).toBe('The implementation plan is ready for review');
    expect(stored[0].decision?.kind).toBe(DecisionKind.ApprovalGate);
    expect(stored[0].decision?.questions[0].options.map((o) => o.id)).toEqual([
      'approve',
      'reject',
    ]);
    // The awaiter is registered by AskAgentQuestion but the publisher
    // attaches a no-op catch so the test does not see an unhandled
    // rejection when the registry is torn down.
  });

  it('writes nothing when collaboration is off (NFR-14)', async () => {
    const ask = new AskAgentQuestionUseCase(
      repo,
      registry,
      makeSettingsRepo(false),
      {
        routeIfApplicable: vi.fn().mockResolvedValue({ evaluated: false, answered: false }),
      } as any,
      { execute: vi.fn().mockResolvedValue({ escalated: false }) } as any
    );
    const publisher = new FeatureAgentGateQuestionPublisher(ask, makeAppRepo({ id: 'app-1' }));

    await publisher.publishWaitingApproval({
      runId: 'run-1',
      featureId: 'feat-1',
      repositoryPath: '/tmp/repo',
    });

    expect(await repo.listByScope('app-1', 'feat-1')).toHaveLength(0);
  });

  it('falls back to the repository path when no Application is registered', async () => {
    const ask = new AskAgentQuestionUseCase(
      repo,
      registry,
      makeSettingsRepo(true),
      {
        routeIfApplicable: vi.fn().mockResolvedValue({ evaluated: false, answered: false }),
      } as any,
      { execute: vi.fn().mockResolvedValue({ escalated: false }) } as any
    );
    const publisher = new FeatureAgentGateQuestionPublisher(ask, makeAppRepo(null));

    await publisher.publishWaitingApproval({
      runId: 'run-1',
      featureId: 'feat-1',
      repositoryPath: '/tmp/repo',
    });

    const stored = await repo.listByScope('/tmp/repo', 'feat-1');
    expect(stored).toHaveLength(1);
  });

  it('swallows AskAgentQuestion errors so the worker is not crashed', async () => {
    const ask = {
      execute: vi.fn().mockRejectedValue(new Error('db unreachable')),
    } as unknown as AskAgentQuestionUseCase;
    const publisher = new FeatureAgentGateQuestionPublisher(ask, makeAppRepo({ id: 'app-1' }));

    await expect(
      publisher.publishWaitingApproval({
        runId: 'run-1',
        featureId: 'feat-1',
        repositoryPath: '/tmp/repo',
      })
    ).resolves.toBeUndefined();
  });
});
