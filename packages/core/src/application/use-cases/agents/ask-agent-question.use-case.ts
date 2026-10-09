/**
 * AskAgentQuestionUseCase
 *
 * Persists a new {@link AgentQuestion} and, for blocking-kind questions,
 * registers an in-process awaiter so the caller (typically the SDK V2
 * `canUseTool` callback) can `await` until {@link AnswerAgentQuestionUseCase}
 * settles it.
 *
 * After persistence, the question is forwarded to the
 * {@link AgentQuestionSupervisorRouter} (spec 093, task 31). The router
 * is a no-op when the question's `answerer` is `user`, when the
 * question is gate-linked (the worker handles the gate path), or when
 * no {@link SupervisorPolicy} is configured for the scope. In
 * autonomous mode the router may settle the question via
 * {@link AnswerAgentQuestionUseCase} before this method returns,
 * which resolves the awaiter for blocking questions in the same tick.
 *
 * Feature-flag short-circuit: with `featureFlags.collaboration` off, the
 * use case returns `{ enabled: false }` without persisting or registering
 * anything (NFR-14 byte-identical default).
 */

import { inject, injectable } from 'tsyringe';
import { randomUUID } from 'node:crypto';

import type { IAgentQuestionRepository } from '../../ports/output/repositories/agent-question-repository.interface.js';
import type { ISettingsRepository } from '../../ports/output/repositories/settings.repository.interface.js';
import type {
  IDeferredQuestionRegistry,
  AskAgentQuestionInput,
} from '../../ports/output/agents/agent-question-service.interface.js';
import { AgentQuestionSupervisorRouter } from './agent-question-supervisor-router.js';
import { EscalateToUserUseCase } from './escalate-to-user.use-case.js';
import {
  AgentQuestionKind,
  AgentQuestionStatus,
  NotificationEventType,
  NotificationSeverity,
  type AgentQuestion,
} from '../../../domain/generated/output.js';
import { recommendedResponses, summariseResponses } from '../../../domain/shared/decision.js';

export interface AskAgentQuestionResult {
  /** True when the collaboration feature flag is on and the question was persisted. */
  enabled: boolean;
  /** The persisted question — populated only when `enabled` is true. */
  question?: AgentQuestion;
  /**
   * Awaiter Promise — populated only for blocking-kind questions when the
   * flag is on. Resolves with the answer string when an
   * {@link AnswerAgentQuestionUseCase} call settles the deferred entry,
   * rejects on cancel/timeout.
   */
  awaiter?: Promise<string>;
}

@injectable()
export class AskAgentQuestionUseCase {
  constructor(
    @inject('IAgentQuestionRepository')
    private readonly questionRepository: IAgentQuestionRepository,
    @inject('IDeferredQuestionRegistry')
    private readonly deferredRegistry: IDeferredQuestionRegistry,
    @inject('ISettingsRepository')
    private readonly settings: ISettingsRepository,
    @inject(AgentQuestionSupervisorRouter)
    private readonly supervisorRouter: AgentQuestionSupervisorRouter,
    @inject(EscalateToUserUseCase)
    private readonly escalateToUser: EscalateToUserUseCase
  ) {}

  async execute(input: AskAgentQuestionInput): Promise<AskAgentQuestionResult> {
    const flagOn = await this.isCollaborationEnabled();
    if (!flagOn) return { enabled: false };

    const now = new Date();
    const id = randomUUID();
    const decision = input.decision ? { ...input.decision, id } : undefined;
    const recommended = decision ? recommendedResponses(decision) : undefined;
    const question: AgentQuestion = {
      id,
      appId: input.appId,
      featureId: input.featureId,
      agentRunId: input.agentRunId,
      kind: input.kind,
      prompt: input.prompt,
      optionsJson:
        input.options && input.options.length > 0 ? JSON.stringify(input.options) : undefined,
      defaultAnswer:
        input.defaultAnswer ??
        (decision && recommended ? summariseResponses(decision, recommended) : undefined),
      answerer: input.answerer,
      status: AgentQuestionStatus.pending,
      answer: undefined,
      answeredBy: undefined,
      answeredAt: undefined,
      expiresAt: input.expiresAt ?? decision?.defaultAfter,
      decision,
      responses: undefined,
      createdAt: now,
      updatedAt: now,
    };

    await this.questionRepository.create(question);

    const result: AskAgentQuestionResult = { enabled: true, question };
    if (input.kind === AgentQuestionKind.blocking) {
      const timeoutMs =
        question.expiresAt instanceof Date
          ? Math.max(question.expiresAt.getTime() - now.getTime(), 1)
          : undefined;
      result.awaiter = this.deferredRegistry.register(
        question.id,
        {
          appId: input.appId,
          featureId: input.featureId,
          agentRunId: input.agentRunId,
        },
        timeoutMs
      );
    }

    // Route through the supervisor (spec 093, task 31). For non-gate
    // questions with answerer ∈ {supervisor, either} and a configured
    // policy, the supervisor evaluates the question. In autonomous
    // mode the router may answer the question before this method
    // returns, which resolves the awaiter for blocking questions in
    // the same tick.
    await this.supervisorRouter.routeIfApplicable(question);

    // Surface the question to the user via the existing notification
    // surface (spec 093, task 34). Three-tier urgency maps to the new
    // NotificationEventType values: blocking interrupts, question goes
    // to the inbox, info skips notification entirely (activity feed
    // only — research decision 11).
    if (question.kind !== AgentQuestionKind.info) {
      const isBlocking = question.kind === AgentQuestionKind.blocking;
      await this.escalateToUser.execute({
        eventType: isBlocking
          ? NotificationEventType.AgentQuestionBlocking
          : NotificationEventType.AgentQuestionPending,
        severity: isBlocking ? NotificationSeverity.Warning : NotificationSeverity.Info,
        message: question.prompt,
        agentRunId: question.agentRunId,
        featureId: question.featureId ?? '',
        featureName: question.featureId ?? '',
        sourceEventId: question.id,
        actorId: 'agent',
        auditField: `agent.question.${question.kind}`,
        timestamp: now,
      });
    }

    return result;
  }

  private async isCollaborationEnabled(): Promise<boolean> {
    const settings = await this.settings.load();
    return settings?.featureFlags?.collaboration === true;
  }
}
