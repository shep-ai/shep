/**
 * AskAgentDecisionUseCase (spec 134, part 2)
 *
 * A background (headless) agent that is genuinely blocked asks the user a
 * question — always with one recommended option and a deadline. The question
 * is recorded as an Async decision (inbox + notifications) and this call waits:
 *  - answered in time → the person's answer;
 *  - deadline passed → the recommended option. The question is settled as
 *    `expired`, answered by `system:deadline` with the recommendation — the
 *    record the feature's Activity tab shows as "proceeded with the
 *    recommended option";
 *  - cancelled → the recommended option (the agent must not wait forever);
 *  - collaboration off → nobody can answer, so the recommendation applies now.
 *
 * A deadline default records the `decision.defaulted` usage event (spec 135).
 */

import { inject, injectable } from 'tsyringe';
import { randomUUID } from 'node:crypto';

import type { IAgentQuestionRepository } from '../../ports/output/repositories/agent-question-repository.interface.js';
import type { ISettingsRepository } from '../../ports/output/repositories/settings.repository.interface.js';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import type { IApplicationRepository } from '../../ports/output/repositories/application-repository.interface.js';
import { AgentQuestionTimeoutError } from '../../ports/output/agents/agent-question-service.interface.js';
import type { ITelemetry } from '../../ports/output/services/telemetry.interface.js';
import {
  AgentQuestionAnswerer,
  AgentQuestionKind,
  AgentQuestionStatus,
  DecisionOutcome,
  TelemetryEvent,
  type Decision,
  type DecisionResponse,
} from '../../../domain/generated/output.js';
import {
  recommendedResponses,
  responsesPickedRecommended,
  summariseResponses,
} from '../../../domain/shared/decision.js';
import {
  DECISION_DEADLINE_ACTOR,
  decisionDeadline,
  decisionFromAgentAsk,
  resolveDecisionTimeoutMinutes,
  type AgentAskOption,
} from '../../../domain/shared/decision-deadline.js';
import { toDurationBucket } from '../../../domain/shared/telemetry/telemetry-delivery.js';
import { AskAgentQuestionUseCase } from './ask-agent-question.use-case.js';
import { questionScopeForPath } from './question-scope.js';

export interface AskAgentDecisionInput {
  featureId: string;
  agentRunId: string;
  question: string;
  header?: string;
  options: AgentAskOption[];
  multiSelect?: boolean;
  allowCustom?: boolean;
  /** Overrides the configured default deadline. */
  timeoutMinutes?: number;
}

/** What the asking agent gets back — never `pending`: the call waits until it is settled. */
export type AskAgentDecisionOutcome = Exclude<DecisionOutcome, DecisionOutcome.Pending>;

const MINUTE_MS = 60_000;

export interface AskAgentDecisionResult {
  outcome: AskAgentDecisionOutcome;
  /** Readable answer to act on. */
  answer: string;
  responses: DecisionResponse[];
  pickedRecommended: boolean;
  answeredBy?: string;
  questionId?: string;
}

@injectable()
export class AskAgentDecisionUseCase {
  constructor(
    @inject(AskAgentQuestionUseCase) private readonly askQuestion: AskAgentQuestionUseCase,
    @inject('IAgentQuestionRepository') private readonly questions: IAgentQuestionRepository,
    @inject('ISettingsRepository') private readonly settings: ISettingsRepository,
    @inject('IFeatureRepository') private readonly features: IFeatureRepository,
    @inject('IApplicationRepository') private readonly applications: IApplicationRepository,
    @inject('ITelemetry') private readonly telemetry: ITelemetry
  ) {}

  async execute(input: AskAgentDecisionInput): Promise<AskAgentDecisionResult> {
    const settings = await this.settings.load();
    const minutes = resolveDecisionTimeoutMinutes(
      input.timeoutMinutes,
      settings?.workflow?.decisionDefaultTimeoutMinutes
    );
    const draft = decisionFromAgentAsk(randomUUID(), {
      question: input.question,
      header: input.header,
      options: input.options,
      multiSelect: input.multiSelect,
      allowCustom: input.allowCustom,
      defaultAfter: decisionDeadline(new Date(), minutes),
    });
    // decisionFromAgentAsk guarantees a recommendation.
    const recommended = recommendedResponses(draft) ?? [];

    const appId = await this.scopeFor(input.featureId);
    const asked = await this.askQuestion.execute({
      appId,
      featureId: input.featureId,
      agentRunId: input.agentRunId,
      kind: AgentQuestionKind.blocking,
      prompt: draft.questions[0].question,
      decision: draft,
      answerer: AgentQuestionAnswerer.either,
    });
    if (!asked.enabled || !asked.question || !asked.awaiter) {
      return this.result(DecisionOutcome.Disabled, draft, recommended);
    }
    const question = asked.question;
    const decision = question.decision ?? draft;

    try {
      await asked.awaiter;
    } catch (error) {
      if (error instanceof AgentQuestionTimeoutError) {
        return this.applyRecommendation(appId, question.id, decision, recommended, minutes);
      }
      return {
        ...this.result(DecisionOutcome.Cancelled, decision, recommended),
        questionId: question.id,
      };
    }

    const answered = await this.questions.findById(appId, question.id);
    const responses = answered?.responses ?? recommended;
    return {
      outcome: DecisionOutcome.Answered,
      answer: answered?.answer ?? summariseResponses(decision, responses),
      responses,
      pickedRecommended: responsesPickedRecommended(decision, responses),
      answeredBy: answered?.answeredBy,
      questionId: question.id,
    };
  }

  /** Deadline passed: settle the question with the recommendation. */
  private async applyRecommendation(
    appId: string,
    questionId: string,
    decision: Decision,
    recommended: DecisionResponse[],
    timeoutMinutes: number
  ): Promise<AskAgentDecisionResult> {
    const answer = summariseResponses(decision, recommended);
    const now = new Date();
    const settled = await this.questions.settlePending(
      appId,
      questionId,
      AgentQuestionStatus.expired,
      { answer, responses: recommended, answeredBy: DECISION_DEADLINE_ACTOR, answeredAt: now }
    );
    if (settled) {
      this.telemetry.record(TelemetryEvent.DecisionDefaulted, {
        kind: decision.kind,
        timeout: toDurationBucket(timeoutMinutes * MINUTE_MS),
      });
    } else {
      // Someone answered at the deadline — their answer wins.
      const current = await this.questions.findById(appId, questionId);
      if (current?.status === AgentQuestionStatus.answered && current.responses) {
        return {
          outcome: DecisionOutcome.Answered,
          answer: current.answer ?? summariseResponses(decision, current.responses),
          responses: current.responses,
          pickedRecommended: responsesPickedRecommended(decision, current.responses),
          answeredBy: current.answeredBy,
          questionId,
        };
      }
    }
    return {
      ...this.result(DecisionOutcome.Defaulted, decision, recommended),
      answeredBy: DECISION_DEADLINE_ACTOR,
      questionId,
    };
  }

  private result(
    outcome: AskAgentDecisionOutcome,
    decision: Decision,
    recommended: DecisionResponse[]
  ): AskAgentDecisionResult {
    return {
      outcome,
      answer: summariseResponses(decision, recommended),
      responses: recommended,
      pickedRecommended: true,
    };
  }

  private async scopeFor(featureId: string): Promise<string> {
    const feature = await this.features.findById(featureId).catch(() => null);
    return feature ? questionScopeForPath(this.applications, feature.repositoryPath) : featureId;
  }
}
