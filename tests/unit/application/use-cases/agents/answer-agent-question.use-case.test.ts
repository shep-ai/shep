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
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
import type { ITelemetry } from '@/application/ports/output/services/telemetry.interface.js';
import {
  AgentQuestionAnswerer,
  AgentQuestionKind,
  AgentQuestionStatus,
  AgentRunStatus,
  DecisionKind,
  DecisionResponseMode,
  DecisionSurface,
  TelemetryEvent,
  type AgentRun,
  type Decision,
  type Settings,
} from '@/domain/generated/output.js';
import { buildApprovalGateDecision } from '@/domain/shared/decision-builders.js';
import { toDurationBucket } from '@/domain/shared/telemetry/telemetry-delivery.js';
import { buildHarnessChangeDecision } from '@/domain/harness-learning/harness-decision.js';

type TelemetryDouble = ITelemetry & { record: ReturnType<typeof vi.fn> };

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
  let telemetry: TelemetryDouble;

  beforeEach(() => {
    repo = new InMemoryAgentQuestionRepository();
    registry = new DeferredQuestionRegistry();
    telemetry = { record: vi.fn() } as TelemetryDouble;
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
      makeRejectUseCase(),
      telemetry
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
      makeRejectUseCase(),
      telemetry
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
      makeRejectUseCase(),
      telemetry
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
        makeRejectUseCase(),
        telemetry
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
      makeRejectUseCase(),
      telemetry
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
      makeRejectUseCase(),
      telemetry
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
      reject,
      telemetry
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
      reject,
      telemetry
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
      reject,
      telemetry
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

  describe('decisions (spec 134)', () => {
    const chatDecision: Decision = {
      id: 'x',
      kind: DecisionKind.ChatQuestion,
      responseMode: DecisionResponseMode.Live,
      questions: [
        {
          id: 'q1',
          header: 'Store',
          question: 'Which store?',
          multiSelect: false,
          allowCustom: true,
          options: [
            { id: 'o1', label: 'Redis', description: '' },
            { id: 'o2', label: 'Memory', description: '' },
          ],
        },
      ],
    };

    async function askWith(decision: Decision, runStatus = AgentRunStatus.running) {
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
      const { question, awaiter } = await ask.execute({
        appId: 'app-1',
        agentRunId: 'run-1',
        kind: AgentQuestionKind.blocking,
        prompt: 'Which store?',
        decision,
        answerer: AgentQuestionAnswerer.either,
      });
      awaiter?.catch(() => undefined);
      const approve = makeApproveUseCase();
      const reject = makeRejectUseCase();
      const useCase = new AnswerAgentQuestionUseCase(
        repo,
        registry,
        settings,
        makeAgentRunRepo({ id: 'run-1', status: runStatus }),
        approve,
        reject,
        telemetry
      );
      return { question: question!, awaiter, useCase, approve, reject };
    }

    it('records responses and a readable summary as the answer', async () => {
      const { question, awaiter, useCase } = await askWith(chatDecision);
      const result = await useCase.execute({
        appId: 'app-1',
        questionId: question.id,
        responses: [{ questionId: 'q1', optionIds: ['o1'] }],
        answeredBy: 'user:web',
      });
      expect(result.question?.answer).toBe('Redis');
      expect(result.question?.responses).toEqual([{ questionId: 'q1', optionIds: ['o1'] }]);
      await expect(awaiter).resolves.toBe('Redis');
    });

    it('resolves a typed answer against the decision options', async () => {
      const { question, useCase } = await askWith(chatDecision);
      const result = await useCase.execute({
        appId: 'app-1',
        questionId: question.id,
        answer: 'memory',
        answeredBy: 'user:cli',
      });
      expect(result.question?.responses).toEqual([{ questionId: 'q1', optionIds: ['o2'] }]);
      expect(result.question?.answer).toBe('Memory');
    });

    it('refuses responses that do not fit the decision and records nothing', async () => {
      const { question, useCase } = await askWith(chatDecision);
      await expect(
        useCase.execute({
          appId: 'app-1',
          questionId: question.id,
          responses: [{ questionId: 'q1', optionIds: ['o1', 'o2'] }],
          answeredBy: 'user:web',
        })
      ).rejects.toThrow(/single option/);
      expect((await repo.findById('app-1', question.id))?.status).toBe(AgentQuestionStatus.pending);
    });

    it('never forwards a non-gate decision to the approval gate, even when it says approve', async () => {
      const decision: Decision = {
        ...chatDecision,
        questions: [
          {
            ...chatDecision.questions[0],
            options: [{ id: 'approve', label: 'approve', description: '' }],
          },
        ],
      };
      const { question, useCase, approve } = await askWith(
        decision,
        AgentRunStatus.waitingApproval
      );
      const result = await useCase.execute({
        appId: 'app-1',
        questionId: question.id,
        responses: [{ questionId: 'q1', optionIds: ['approve'] }],
        answeredBy: 'user:web',
      });
      expect(result.forwardedToGate).toBe(false);
      expect(approve.execute).not.toHaveBeenCalled();
    });

    it('forwards a gate decision by the selected option id', async () => {
      const { question, useCase, approve } = await askWith(
        buildApprovalGateDecision('g', 'plan'),
        AgentRunStatus.waitingApproval
      );
      const result = await useCase.execute({
        appId: 'app-1',
        questionId: question.id,
        responses: [{ questionId: 'gate', optionIds: ['approve'] }],
        answeredBy: 'user:web',
      });
      expect(result.forwardedToGate).toBe(true);
      expect(approve.execute).toHaveBeenCalledWith('run-1');
    });

    it('treats a typed note on a gate as a rejection carrying that feedback', async () => {
      const { question, useCase, reject } = await askWith(
        buildApprovalGateDecision('g', 'merge'),
        AgentRunStatus.waitingApproval
      );
      await useCase.execute({
        appId: 'app-1',
        questionId: question.id,
        responses: [{ questionId: 'gate', optionIds: ['approve'], customText: 'Split the PR' }],
        answeredBy: 'user:web',
      });
      expect(reject.execute).toHaveBeenCalledWith('run-1', 'Split the PR');
    });

    it('forwards a learned-harness answer to the harness decision resolver (spec 150)', async () => {
      const { question, useCase } = await askWith(
        buildHarnessChangeDecision('x', 'v9', 'Adopt?', 'diff')
      );
      const harnessDecisions = { execute: vi.fn().mockResolvedValue(true) };
      Object.assign(useCase, { harnessDecisions });
      const responses = [{ questionId: 'harness-change:v9', optionIds: ['adopt'] }];
      await useCase.execute({
        appId: 'app-1',
        questionId: question.id,
        responses,
        answeredBy: 'user:web',
      });
      expect(harnessDecisions.execute).toHaveBeenCalledWith(responses, 'user:web');
    });

    it('does not call the harness resolver for other decisions', async () => {
      const { question, awaiter, useCase } = await askWith(chatDecision);
      const harnessDecisions = { execute: vi.fn() };
      Object.assign(useCase, { harnessDecisions });
      await useCase.execute({
        appId: 'app-1',
        questionId: question.id,
        responses: [{ questionId: 'q1', optionIds: ['o1'] }],
        answeredBy: 'user:web',
      });
      await awaiter;
      expect(harnessDecisions.execute).not.toHaveBeenCalled();
    });
  });

  describe('decision.answered telemetry (spec 136)', () => {
    const MINUTE_MS = 60_000;
    const decision: Decision = {
      id: 'x',
      kind: DecisionKind.AgentAsk,
      responseMode: DecisionResponseMode.Async,
      questions: [
        {
          id: 'q1',
          header: 'Store',
          question: 'Which store?',
          multiSelect: false,
          allowCustom: true,
          options: [
            { id: 'o1', label: 'Redis', description: '', recommended: true },
            { id: 'o2', label: 'Memory', description: '' },
          ],
        },
      ],
    };

    afterEach(() => vi.useRealTimers());

    async function ask(withDecision: Decision | undefined, collaboration = true) {
      const settings = makeSettingsRepo(collaboration);
      const asker = new AskAgentQuestionUseCase(
        repo,
        registry,
        makeSettingsRepo(true),
        {
          routeIfApplicable: vi.fn().mockResolvedValue({ evaluated: false, answered: false }),
        } as any,
        { execute: vi.fn().mockResolvedValue({ escalated: false }) } as any
      );
      const { question, awaiter } = await asker.execute({
        appId: 'app-1',
        agentRunId: 'run-1',
        kind: AgentQuestionKind.blocking,
        prompt: 'Which store?',
        ...(withDecision ? { decision: withDecision } : { options: ['Redis', 'Memory'] }),
        answerer: AgentQuestionAnswerer.either,
      });
      awaiter?.catch(() => undefined);
      const useCase = new AnswerAgentQuestionUseCase(
        repo,
        registry,
        settings,
        makeAgentRunRepo(null),
        makeApproveUseCase(),
        makeRejectUseCase(),
        telemetry
      );
      return { question: question!, useCase };
    }

    it('records kind, surface, latency bucket and that the recommendation was picked', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-11T10:00:00Z'));
      const { question, useCase } = await ask(decision);
      vi.setSystemTime(new Date(Date.parse('2026-10-11T10:00:00Z') + 3 * MINUTE_MS));

      await useCase.execute({
        appId: 'app-1',
        questionId: question.id,
        responses: [{ questionId: 'q1', optionIds: ['o1'] }],
        answeredBy: 'user:web',
        surface: DecisionSurface.Web,
      });

      expect(telemetry.record).toHaveBeenCalledTimes(1);
      expect(telemetry.record).toHaveBeenCalledWith(TelemetryEvent.DecisionAnswered, {
        kind: DecisionKind.AgentAsk,
        surface: DecisionSurface.Web,
        latency: toDurationBucket(3 * MINUTE_MS),
        pickedRecommended: true,
      });
    });

    it('reports a different option or typed text as not the recommendation', async () => {
      const { question, useCase } = await ask(decision);
      await useCase.execute({
        appId: 'app-1',
        questionId: question.id,
        answer: 'Postgres',
        answeredBy: 'user:cli',
        surface: DecisionSurface.Cli,
      });
      expect(telemetry.record).toHaveBeenCalledWith(
        TelemetryEvent.DecisionAnswered,
        expect.objectContaining({ surface: DecisionSurface.Cli, pickedRecommended: false })
      );
    });

    it('reports a pre-134 question as Legacy and an unnamed caller as Other', async () => {
      const { question, useCase } = await ask(undefined);
      await useCase.execute({
        appId: 'app-1',
        questionId: question.id,
        answer: 'Redis',
        answeredBy: 'user:x',
      });
      expect(telemetry.record).toHaveBeenCalledWith(
        TelemetryEvent.DecisionAnswered,
        expect.objectContaining({
          kind: DecisionKind.Legacy,
          surface: DecisionSurface.Other,
          pickedRecommended: false,
        })
      );
    });

    it('records nothing when the question was already settled', async () => {
      const { question, useCase } = await ask(decision);
      const input = {
        appId: 'app-1',
        questionId: question.id,
        responses: [{ questionId: 'q1', optionIds: ['o2'] }],
        answeredBy: 'user:web',
        surface: DecisionSurface.Web,
      };
      await useCase.execute(input);
      await useCase.execute(input);
      expect(telemetry.record).toHaveBeenCalledTimes(1);
    });

    it('records nothing when agent questions are off or the answer is refused', async () => {
      const off = await ask(decision, false);
      await off.useCase.execute({
        appId: 'app-1',
        questionId: off.question.id,
        answer: 'Redis',
        answeredBy: 'user:web',
      });
      const on = await ask(decision);
      await expect(
        on.useCase.execute({
          appId: 'app-1',
          questionId: on.question.id,
          responses: [{ questionId: 'q1', optionIds: ['o1', 'o2'] }],
          answeredBy: 'user:web',
        })
      ).rejects.toThrow();
      expect(telemetry.record).not.toHaveBeenCalled();
    });
  });
});
