/**
 * AnswerAgentQuestionUseCase — unit tests (spec 093, task 17).
 *
 * Verifies:
 *  - Flag-off short-circuit (no mutation).
 *  - Answer transitions status to `answered` and resolves the awaiter.
 *  - Answer is rejected when it does not match the question's options.
 *  - Gate-link forwarding: when the question's agentRun is in
 *    waitingApproval and the answer maps to approve/reject, the matching
 *    use case is invoked.
 *  - No forwarding when the agent run is NOT in waitingApproval.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { AnswerAgentQuestionUseCase } from '@/application/use-cases/agents/answer-agent-question.use-case.js';
import { AskAgentQuestionUseCase } from '@/application/use-cases/agents/ask-agent-question.use-case.js';
import { InMemoryAgentQuestionRepository } from '@/infrastructure/adapters/in-memory/in-memory-agent-question-repository.js';
import {
  DeferredQuestionRegistry,
  QUESTION_ANSWER_POLL_INTERVAL_MS,
} from '@/infrastructure/services/agents/agent-question-service/deferred-question-registry.js';
import type { ISettingsRepository } from '@/application/ports/output/repositories/settings.repository.interface.js';
import type { IAgentRunRepository } from '@/application/ports/output/agents/agent-run-repository.interface.js';
import type { ApproveAgentRunUseCase } from '@/application/use-cases/agents/approve-agent-run.use-case.js';
import type { RejectAgentRunUseCase } from '@/application/use-cases/agents/reject-agent-run.use-case.js';
import {
  AgentQuestionAnswerer,
  AgentQuestionKind,
  AgentQuestionStatus,
  AgentRunStatus,
  type AgentRun,
  type Settings,
} from '@/domain/generated/output.js';

function makeSettingsRepo(collaboration: boolean): ISettingsRepository {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    load: vi.fn().mockResolvedValue({ featureFlags: { collaboration } } as unknown as Settings),
    update: vi.fn().mockResolvedValue(undefined),
  };
}

function makeAgentRunRepo(run: Partial<AgentRun> | null): IAgentRunRepository {
  const findById = vi
    .fn()
    .mockResolvedValue(
      run ? ({ id: 'run-1', status: AgentRunStatus.running, ...run } as AgentRun) : null
    );
  return {
    create: vi.fn(),
    findById,
    findByThreadId: vi.fn(),
    findLatestByFeatureId: vi.fn().mockResolvedValue(null),
    findByPid: vi.fn(),
    findActive: vi.fn(),
    findByFeatureId: vi.fn(),
    list: vi.fn(),
    listByAgentType: vi.fn(),
    update: vi.fn(),
    updateStatus: vi.fn(),
    updateLastHeartbeat: vi.fn(),
    delete: vi.fn(),
  } as unknown as IAgentRunRepository;
}

function makeApproveUseCase(): ApproveAgentRunUseCase {
  return {
    execute: vi.fn().mockResolvedValue({ approved: true, reason: 'ok' }),
  } as unknown as ApproveAgentRunUseCase;
}

function makeRejectUseCase(): RejectAgentRunUseCase {
  return {
    execute: vi.fn().mockResolvedValue({ rejected: true, reason: 'ok' }),
  } as unknown as RejectAgentRunUseCase;
}

describe('AnswerAgentQuestionUseCase', () => {
  let repo: InMemoryAgentQuestionRepository;
  let registry: DeferredQuestionRegistry;

  beforeEach(() => {
    repo = new InMemoryAgentQuestionRepository();
    registry = new DeferredQuestionRegistry();
  });

  it('returns enabled=false when feature flag is off', async () => {
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
    const { question } = await ask.execute({
      appId: 'app-1',
      agentRunId: 'run-1',
      kind: AgentQuestionKind.question,
      prompt: '?',
      answerer: AgentQuestionAnswerer.user,
    });

    const useCase = new AnswerAgentQuestionUseCase(
      repo,
      registry,
      makeSettingsRepo(false),
      makeAgentRunRepo(null),
      makeApproveUseCase(),
      makeRejectUseCase()
    );

    const result = await useCase.execute({
      appId: 'app-1',
      questionId: question!.id,
      answer: 'a',
      answeredBy: 'user:tester',
    });

    expect(result.enabled).toBe(false);
    const stored = await repo.findById('app-1', question!.id);
    expect(stored?.status).toBe(AgentQuestionStatus.pending);
  });

  it('answers a non-blocking question and transitions status to answered', async () => {
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
    const { question } = await ask.execute({
      appId: 'app-1',
      agentRunId: 'run-1',
      kind: AgentQuestionKind.question,
      prompt: '?',
      options: ['a', 'b'],
      answerer: AgentQuestionAnswerer.user,
    });

    const useCase = new AnswerAgentQuestionUseCase(
      repo,
      registry,
      settings,
      makeAgentRunRepo(null),
      makeApproveUseCase(),
      makeRejectUseCase()
    );

    const result = await useCase.execute({
      appId: 'app-1',
      questionId: question!.id,
      answer: 'a',
      answeredBy: 'user:tester',
    });

    expect(result.enabled).toBe(true);
    expect(result.question?.status).toBe(AgentQuestionStatus.answered);
    expect(result.question?.answer).toBe('a');
    expect(result.question?.answeredBy).toBe('user:tester');
  });

  it('blocking round-trip: register awaiter, then answer resolves it', async () => {
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
    const result = await ask.execute({
      appId: 'app-1',
      agentRunId: 'run-1',
      kind: AgentQuestionKind.blocking,
      prompt: '?',
      answerer: AgentQuestionAnswerer.user,
    });

    const answer = new AnswerAgentQuestionUseCase(
      repo,
      registry,
      settings,
      makeAgentRunRepo(null),
      makeApproveUseCase(),
      makeRejectUseCase()
    );

    await answer.execute({
      appId: 'app-1',
      questionId: result.question!.id,
      answer: 'go',
      answeredBy: 'user:tester',
    });

    await expect(result.awaiter).resolves.toBe('go');
  });

  it("cross-process: an answer recorded by another process resolves this process's awaiter", async () => {
    vi.useFakeTimers();
    try {
      const settings = makeSettingsRepo(true);
      // The awaiting process (daemon) and the answering process (CLI) share
      // only the database — each has its own in-memory registry.
      const daemonRegistry = new DeferredQuestionRegistry(repo);
      const cliRegistry = new DeferredQuestionRegistry(repo);
      const ask = new AskAgentQuestionUseCase(
        repo,
        daemonRegistry,
        settings,
        {
          routeIfApplicable: vi.fn().mockResolvedValue({ evaluated: false, answered: false }),
        } as any,
        { execute: vi.fn().mockResolvedValue({ escalated: false }) } as any
      );
      const result = await ask.execute({
        appId: 'app-1',
        agentRunId: 'run-1',
        kind: AgentQuestionKind.blocking,
        prompt: '?',
        answerer: AgentQuestionAnswerer.user,
      });

      await new AnswerAgentQuestionUseCase(
        repo,
        cliRegistry,
        settings,
        makeAgentRunRepo(null),
        makeApproveUseCase(),
        makeRejectUseCase()
      ).execute({
        appId: 'app-1',
        questionId: result.question!.id,
        answer: 'from-cli',
        answeredBy: 'user:tester',
      });

      await vi.advanceTimersByTimeAsync(QUESTION_ANSWER_POLL_INTERVAL_MS);
      await expect(result.awaiter).resolves.toBe('from-cli');
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('two concurrent answers (CLI + web) record exactly one; the loser reports the settled status', async () => {
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
    const { question } = await ask.execute({
      appId: 'app-1',
      agentRunId: 'run-1',
      kind: AgentQuestionKind.question,
      prompt: '?',
      answerer: AgentQuestionAnswerer.user,
    });
    const approve = makeApproveUseCase();
    const useCase = new AnswerAgentQuestionUseCase(
      repo,
      registry,
      settings,
      makeAgentRunRepo({ status: AgentRunStatus.waitingApproval }),
      approve,
      makeRejectUseCase()
    );

    const [fromCli, fromWeb] = await Promise.all([
      useCase.execute({
        appId: 'app-1',
        questionId: question!.id,
        answer: 'approve',
        answeredBy: 'user:cli',
      }),
      useCase.execute({
        appId: 'app-1',
        questionId: question!.id,
        answer: 'approve',
        answeredBy: 'user:web',
      }),
    ]);

    const stored = await repo.findById('app-1', question!.id);
    expect(stored?.answeredBy).toBe('user:cli');
    expect(fromCli.alreadySettledAs).toBeUndefined();
    expect(fromWeb.alreadySettledAs).toBe(AgentQuestionStatus.answered);
    expect(fromWeb.forwardedToGate).toBe(false);
    expect(approve.execute).toHaveBeenCalledTimes(1);
  });

  it('rejects an answer that does not match provided options', async () => {
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
    const { question } = await ask.execute({
      appId: 'app-1',
      agentRunId: 'run-1',
      kind: AgentQuestionKind.question,
      prompt: '?',
      options: ['yes', 'no'],
      answerer: AgentQuestionAnswerer.user,
    });

    const useCase = new AnswerAgentQuestionUseCase(
      repo,
      registry,
      settings,
      makeAgentRunRepo(null),
      makeApproveUseCase(),
      makeRejectUseCase()
    );

    await expect(
      useCase.execute({
        appId: 'app-1',
        questionId: question!.id,
        answer: 'maybe',
        answeredBy: 'user:tester',
      })
    ).rejects.toThrow(/not one of the allowed options/);

    const stored = await repo.findById('app-1', question!.id);
    expect(stored?.status).toBe(AgentQuestionStatus.pending);
  });

  it('forwards approve answer to ApproveAgentRunUseCase when the run is waiting_approval', async () => {
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
    const { question } = await ask.execute({
      appId: 'app-1',
      agentRunId: 'run-1',
      kind: AgentQuestionKind.blocking,
      prompt: 'approve?',
      answerer: AgentQuestionAnswerer.user,
    });

    const approve = makeApproveUseCase();
    const reject = makeRejectUseCase();
    const useCase = new AnswerAgentQuestionUseCase(
      repo,
      registry,
      settings,
      makeAgentRunRepo({ id: 'run-1', status: AgentRunStatus.waitingApproval }),
      approve,
      reject
    );

    const result = await useCase.execute({
      appId: 'app-1',
      questionId: question!.id,
      answer: 'approve',
      answeredBy: 'user:tester',
    });

    expect(result.forwardedToGate).toBe(true);
    expect(approve.execute).toHaveBeenCalledWith('run-1');
    expect(reject.execute).not.toHaveBeenCalled();
  });

  it('forwards reject answer to RejectAgentRunUseCase when the run is waiting_approval', async () => {
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
    const { question } = await ask.execute({
      appId: 'app-1',
      agentRunId: 'run-1',
      kind: AgentQuestionKind.blocking,
      prompt: 'merge?',
      answerer: AgentQuestionAnswerer.user,
    });

    const approve = makeApproveUseCase();
    const reject = makeRejectUseCase();
    const useCase = new AnswerAgentQuestionUseCase(
      repo,
      registry,
      settings,
      makeAgentRunRepo({ id: 'run-1', status: AgentRunStatus.waitingApproval }),
      approve,
      reject
    );

    const result = await useCase.execute({
      appId: 'app-1',
      questionId: question!.id,
      answer: 'reject',
      answeredBy: 'user:tester',
    });

    expect(result.forwardedToGate).toBe(true);
    expect(reject.execute).toHaveBeenCalledWith('run-1', 'reject');
    expect(approve.execute).not.toHaveBeenCalled();
  });

  it('does NOT forward when the agent run is not waiting_approval', async () => {
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
    const { question } = await ask.execute({
      appId: 'app-1',
      agentRunId: 'run-1',
      kind: AgentQuestionKind.question,
      prompt: '?',
      answerer: AgentQuestionAnswerer.user,
    });

    const approve = makeApproveUseCase();
    const reject = makeRejectUseCase();
    const useCase = new AnswerAgentQuestionUseCase(
      repo,
      registry,
      settings,
      makeAgentRunRepo({ id: 'run-1', status: AgentRunStatus.running }),
      approve,
      reject
    );

    const result = await useCase.execute({
      appId: 'app-1',
      questionId: question!.id,
      answer: 'approve',
      answeredBy: 'user:tester',
    });

    expect(result.forwardedToGate).toBe(false);
    expect(approve.execute).not.toHaveBeenCalled();
    expect(reject.execute).not.toHaveBeenCalled();
  });
});
