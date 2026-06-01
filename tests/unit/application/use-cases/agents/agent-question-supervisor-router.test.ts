/**
 * AgentQuestionSupervisorRouter — unit tests (spec 093, task 31).
 *
 * Verifies the three routing branches called out by the task
 * acceptance criteria:
 *
 *  1. answerer = supervisor + autonomous policy → supervisor answers
 *     the question (verdict approve/reject is forwarded to
 *     AnswerAgentQuestionUseCase as `actor = supervisor:<id>`).
 *  2. answerer = supervisor + advisory policy → decision is recorded
 *     but the question stays pending (user must answer).
 *  3. answerer = user → router is a no-op (question never reaches
 *     the supervisor pipeline).
 *
 * Plus auxiliary safety tests:
 *  - gate-linked questions are skipped (worker handles the gate path).
 *  - no-policy scope is a no-op.
 *  - flag-off short-circuit (delegated to EvaluateSupervisorDecisionUseCase).
 *  - autonomous reject verdict.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { AgentQuestionSupervisorRouter } from '@/application/use-cases/agents/agent-question-supervisor-router.js';
import { AnswerAgentQuestionUseCase } from '@/application/use-cases/agents/answer-agent-question.use-case.js';
import { ConfigureSupervisorUseCase } from '@/application/use-cases/agents/configure-supervisor.use-case.js';
import { EvaluateSupervisorDecisionUseCase } from '@/application/use-cases/agents/evaluate-supervisor-decision.use-case.js';
import { GetSupervisorPolicyUseCase } from '@/application/use-cases/agents/get-supervisor-policy.use-case.js';
import { InMemoryAgentQuestionRepository } from '@/infrastructure/adapters/in-memory/in-memory-agent-question-repository.js';
import { InMemorySupervisorAgent } from '@/infrastructure/adapters/in-memory/in-memory-supervisor-agent.js';
import { InMemorySupervisorDecisionRepository } from '@/infrastructure/adapters/in-memory/in-memory-supervisor-decision-repository.js';
import { InMemorySupervisorPolicyRepository } from '@/infrastructure/adapters/in-memory/in-memory-supervisor-policy-repository.js';
import { DeferredQuestionRegistry } from '@/infrastructure/services/agents/agent-question-service/deferred-question-registry.js';
import {
  AgentQuestionAnswerer,
  AgentQuestionKind,
  AgentQuestionStatus,
  SupervisorAutonomy,
  SupervisorScopeType,
  SupervisorVerdict,
  type ActivityEntry,
  type AgentQuestion,
  type Settings,
} from '@/domain/generated/output.js';
import type { IActivityLogRepository } from '@/application/ports/output/repositories/activity-log-repository.interface.js';
import type { IAgentRunRepository } from '@/application/ports/output/agents/agent-run-repository.interface.js';
import type { ISettingsRepository } from '@/application/ports/output/repositories/settings.repository.interface.js';

class InMemoryActivityLog implements IActivityLogRepository {
  readonly entries: ActivityEntry[] = [];
  async create(entry: ActivityEntry): Promise<void> {
    this.entries.push({ ...entry });
  }
  async listByWorkItem(workItemId: string): Promise<ActivityEntry[]> {
    return this.entries.filter((e) => e.workItemId === workItemId).map((e) => ({ ...e }));
  }
}

function settingsRepo(collaboration: boolean): ISettingsRepository {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    load: vi.fn().mockResolvedValue({ featureFlags: { collaboration } } as unknown as Settings),
    update: vi.fn().mockResolvedValue(undefined),
  };
}

function fakeAgentRunRepo(): IAgentRunRepository {
  // The router never invokes the run repo directly — but
  // AnswerAgentQuestionUseCase does (gate forwarding), so we provide
  // a minimal stub that always returns null (no run ⇒ no gate
  // forwarding).
  return {
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue(null),
    findByThreadId: vi.fn(),
    findLatestByFeatureId: vi.fn().mockResolvedValue(null),
    updateStatus: vi.fn(),
    updatePinnedConfig: vi.fn(),
    findRunningByPid: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
    delete: vi.fn(),
  } as unknown as IAgentRunRepository;
}

function makeQuestion(overrides: Partial<AgentQuestion> = {}): AgentQuestion {
  const now = new Date();
  return {
    id: 'q-1',
    appId: 'app-1',
    featureId: undefined,
    agentRunId: 'run-1',
    kind: AgentQuestionKind.blocking,
    prompt: 'Which library should I use?',
    optionsJson: undefined,
    defaultAnswer: undefined,
    answerer: AgentQuestionAnswerer.supervisor,
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

interface Bundle {
  router: AgentQuestionSupervisorRouter;
  policyRepo: InMemorySupervisorPolicyRepository;
  decisionRepo: InMemorySupervisorDecisionRepository;
  questionRepo: InMemoryAgentQuestionRepository;
  activityLog: InMemoryActivityLog;
  answerSpy: ReturnType<typeof vi.spyOn>;
}

function buildRouter(opts: { collaboration: boolean; verdict: SupervisorVerdict }): Bundle {
  const policyRepo = new InMemorySupervisorPolicyRepository();
  const decisionRepo = new InMemorySupervisorDecisionRepository();
  const questionRepo = new InMemoryAgentQuestionRepository();
  const activityLog = new InMemoryActivityLog();
  const supervisorAgent = new InMemorySupervisorAgent({
    verdicts: {
      gate: { verdict: opts.verdict, rationale: 'stub' },
      question: { verdict: opts.verdict, rationale: 'stub' },
      message: { verdict: opts.verdict, rationale: 'stub' },
    },
  });
  const settings = settingsRepo(opts.collaboration);
  const getPolicy = new GetSupervisorPolicyUseCase(policyRepo);
  const evaluateDecision = new EvaluateSupervisorDecisionUseCase(
    supervisorAgent,
    decisionRepo,
    activityLog,
    settings,
    getPolicy,
    { execute: vi.fn().mockResolvedValue({ escalated: false }) } as any
  );
  const answer = new AnswerAgentQuestionUseCase(
    questionRepo,
    new DeferredQuestionRegistry(),
    settings,
    fakeAgentRunRepo(),
    {
      execute: vi.fn().mockResolvedValue({ approved: true, reason: 'ok' }),
    } as any,
    {
      execute: vi.fn().mockResolvedValue({ rejected: true, reason: 'ok' }),
    } as any
  );
  const answerSpy = vi.spyOn(answer, 'execute');
  const router = new AgentQuestionSupervisorRouter(getPolicy, evaluateDecision, answer);
  return { router, policyRepo, decisionRepo, questionRepo, activityLog, answerSpy };
}

async function configurePolicy(
  policyRepo: InMemorySupervisorPolicyRepository,
  autonomy: SupervisorAutonomy
): Promise<void> {
  const configure = new ConfigureSupervisorUseCase(policyRepo);
  await configure.execute({
    scopeType: SupervisorScopeType.app,
    scopeId: 'app-1',
    autonomyLevel: autonomy,
  });
}

describe('AgentQuestionSupervisorRouter', () => {
  let bundle: Bundle;

  describe('answerer = user', () => {
    it('skips routing entirely (no policy lookup, no evaluation)', async () => {
      bundle = buildRouter({ collaboration: true, verdict: SupervisorVerdict.approve });
      await configurePolicy(bundle.policyRepo, SupervisorAutonomy.autonomous);
      // Seed the question into the repo so AnswerAgentQuestion
      // wouldn't no-op even if it was called.
      const question = makeQuestion({ answerer: AgentQuestionAnswerer.user });
      await bundle.questionRepo.create(question);

      const result = await bundle.router.routeIfApplicable(question);

      expect(result.evaluated).toBe(false);
      expect(result.answered).toBe(false);
      expect(bundle.answerSpy).not.toHaveBeenCalled();
      expect(await bundle.decisionRepo.listByScope('app', 'app-1', undefined)).toHaveLength(0);
    });
  });

  describe('autonomous mode', () => {
    beforeEach(async () => {
      bundle = buildRouter({ collaboration: true, verdict: SupervisorVerdict.approve });
      await configurePolicy(bundle.policyRepo, SupervisorAutonomy.autonomous);
    });

    it('answers a supervisor-targeted question with the verdict', async () => {
      const question = makeQuestion({
        answerer: AgentQuestionAnswerer.supervisor,
        optionsJson: JSON.stringify(['approve', 'reject']),
      });
      await bundle.questionRepo.create(question);

      const result = await bundle.router.routeIfApplicable(question);

      expect(result.evaluated).toBe(true);
      expect(result.answered).toBe(true);
      expect(result.effectiveAutonomy).toBe(SupervisorAutonomy.autonomous);
      expect(result.verdict).toBe(SupervisorVerdict.approve);

      expect(bundle.answerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          appId: 'app-1',
          questionId: question.id,
          answer: 'approve',
          answeredBy: expect.stringMatching(/^supervisor:/),
        })
      );
    });

    it('answers with reject when verdict is reject', async () => {
      bundle = buildRouter({ collaboration: true, verdict: SupervisorVerdict.reject });
      await configurePolicy(bundle.policyRepo, SupervisorAutonomy.autonomous);
      const question = makeQuestion({
        answerer: AgentQuestionAnswerer.either,
        optionsJson: JSON.stringify(['approve', 'reject']),
      });
      await bundle.questionRepo.create(question);

      const result = await bundle.router.routeIfApplicable(question);

      expect(result.evaluated).toBe(true);
      expect(result.answered).toBe(true);
      expect(bundle.answerSpy).toHaveBeenCalledWith(expect.objectContaining({ answer: 'reject' }));
    });

    it('does NOT answer when the question options exclude approve/reject', async () => {
      const question = makeQuestion({
        answerer: AgentQuestionAnswerer.supervisor,
        optionsJson: JSON.stringify(['lib-a', 'lib-b']),
      });
      await bundle.questionRepo.create(question);

      const result = await bundle.router.routeIfApplicable(question);

      // Verdict was recorded but the answer can't fit the question's
      // option set so we leave it pending for the user.
      expect(result.evaluated).toBe(true);
      expect(result.answered).toBe(false);
      expect(bundle.answerSpy).not.toHaveBeenCalled();
    });
  });

  describe('advisory mode', () => {
    it('records a decision but does NOT answer (question stays pending)', async () => {
      bundle = buildRouter({ collaboration: true, verdict: SupervisorVerdict.advise });
      await configurePolicy(bundle.policyRepo, SupervisorAutonomy.advisory);
      const question = makeQuestion({ answerer: AgentQuestionAnswerer.supervisor });
      await bundle.questionRepo.create(question);

      const result = await bundle.router.routeIfApplicable(question);

      expect(result.evaluated).toBe(true);
      expect(result.answered).toBe(false);
      expect(result.effectiveAutonomy).toBe(SupervisorAutonomy.advisory);
      expect(bundle.answerSpy).not.toHaveBeenCalled();
      // The decision was still persisted via EvaluateSupervisorDecisionUseCase.
      const decisions = await bundle.decisionRepo.listByScope('app', 'app-1', undefined);
      expect(decisions).toHaveLength(1);
    });
  });

  describe('co-sign mode', () => {
    it('records a decision but does NOT answer', async () => {
      bundle = buildRouter({ collaboration: true, verdict: SupervisorVerdict.approve });
      await configurePolicy(bundle.policyRepo, SupervisorAutonomy.cosign);
      const question = makeQuestion({ answerer: AgentQuestionAnswerer.either });
      await bundle.questionRepo.create(question);

      const result = await bundle.router.routeIfApplicable(question);

      expect(result.evaluated).toBe(true);
      expect(result.answered).toBe(false);
      expect(bundle.answerSpy).not.toHaveBeenCalled();
    });
  });

  describe('no policy configured', () => {
    it('is a no-op when the scope has no SupervisorPolicy', async () => {
      bundle = buildRouter({ collaboration: true, verdict: SupervisorVerdict.approve });
      // No configurePolicy() call.
      const question = makeQuestion({ answerer: AgentQuestionAnswerer.supervisor });
      await bundle.questionRepo.create(question);

      const result = await bundle.router.routeIfApplicable(question);

      expect(result.evaluated).toBe(false);
      expect(result.answered).toBe(false);
      expect(bundle.answerSpy).not.toHaveBeenCalled();
    });
  });

  describe('gate-linked prompt', () => {
    it('skips routing when the prompt is the gate-question publisher payload', async () => {
      bundle = buildRouter({ collaboration: true, verdict: SupervisorVerdict.approve });
      await configurePolicy(bundle.policyRepo, SupervisorAutonomy.autonomous);
      const gatePrompt = JSON.stringify({
        event: 'waiting_approval',
        node: 'plan',
        runId: 'run-1',
        featureId: 'feat-1',
      });
      const question = makeQuestion({
        answerer: AgentQuestionAnswerer.either,
        prompt: gatePrompt,
      });
      await bundle.questionRepo.create(question);

      const result = await bundle.router.routeIfApplicable(question);

      // Gate-linked questions are routed by the worker, not by the
      // router — so this path returns evaluated=false.
      expect(result.evaluated).toBe(false);
      expect(result.answered).toBe(false);
    });
  });

  describe('flag off', () => {
    it('is a no-op when collaboration flag is off', async () => {
      bundle = buildRouter({ collaboration: false, verdict: SupervisorVerdict.approve });
      await configurePolicy(bundle.policyRepo, SupervisorAutonomy.autonomous);
      const question = makeQuestion({ answerer: AgentQuestionAnswerer.supervisor });
      await bundle.questionRepo.create(question);

      const result = await bundle.router.routeIfApplicable(question);

      expect(result.evaluated).toBe(false);
      expect(result.answered).toBe(false);
      expect(bundle.answerSpy).not.toHaveBeenCalled();
    });
  });
});
