/**
 * Reply To Feature Use Case (spec 148)
 *
 * One way for any caller — an MCP client, an A2A orchestrator — to act on a
 * feature that waits: decide its gate (approve, or reject with feedback),
 * answer its agent's open question, or stop its run. It drives the use cases
 * the console and the question inbox already use, so it refuses exactly what
 * they refuse. Free text never decides a gate. Never throws.
 */

import { inject, injectable } from 'tsyringe';
import {
  DecisionSurface,
  FeatureConsoleAction,
  FeatureReplyOutcome,
} from '../../../domain/generated/output.js';
import type { IApplicationRepository } from '../../ports/output/repositories/application-repository.interface.js';
import { AnswerAgentQuestionUseCase } from '../agents/answer-agent-question.use-case.js';
import { questionScopeForPath } from '../agents/question-scope.js';
import { RunFeatureConsoleActionUseCase } from '../feature-console/run-feature-console-action.use-case.js';
import { GetAgentActivityUseCase } from './get-agent-activity.use-case.js';
import type { AgentActivity } from './agent-activity.types.js';

export interface ReplyToFeatureInput {
  /** Feature id or id prefix. */
  featureId: string;
  /** Approve, Reject (needs `feedback`) or Stop. */
  action?: FeatureConsoleAction;
  feedback?: string;
  /** An answer to the feature's open agent question. */
  answer?: string;
  /** Who replied, e.g. `a2a`, `mcp`, `user:cli`. */
  answeredBy: string;
  surface?: DecisionSurface;
}

export interface ReplyToFeatureResult {
  outcome: FeatureReplyOutcome;
  message: string;
  /** The feature's activity after the reply (before it, when refused). */
  activity?: AgentActivity;
}

@injectable()
export class ReplyToFeatureUseCase {
  constructor(
    @inject(GetAgentActivityUseCase)
    private readonly getActivity: GetAgentActivityUseCase,
    @inject(RunFeatureConsoleActionUseCase)
    private readonly consoleAction: RunFeatureConsoleActionUseCase,
    @inject(AnswerAgentQuestionUseCase)
    private readonly answerQuestion: AnswerAgentQuestionUseCase,
    @inject('IApplicationRepository')
    private readonly applications: IApplicationRepository
  ) {}

  async execute(input: ReplyToFeatureInput): Promise<ReplyToFeatureResult> {
    try {
      const { activities } = await this.getActivity.execute({ featureId: input.featureId });
      if (activities.length === 0) {
        return {
          outcome: FeatureReplyOutcome.NotFound,
          message: `Feature not found: ${input.featureId}`,
        };
      }
      if (activities.length > 1) {
        return {
          outcome: FeatureReplyOutcome.Ambiguous,
          message: `"${input.featureId}" matches ${activities.length} features; use more of the id.`,
        };
      }
      const [feature] = activities;
      const refusal = input.action
        ? await this.act(feature, input)
        : input.answer !== undefined
          ? await this.answer(feature, input.answer, input)
          : 'Nothing to send: give a gate decision or an answer.';
      if (refusal)
        return { outcome: FeatureReplyOutcome.Refused, message: refusal, activity: feature };
      return {
        outcome: FeatureReplyOutcome.Applied,
        message: `Sent to ${feature.name}.`,
        activity: (await this.refreshed(feature)) ?? feature,
      };
    } catch (error) {
      return {
        outcome: FeatureReplyOutcome.Refused,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /** Runs a console action; returns why it was refused, if it was. */
  private async act(
    feature: AgentActivity,
    input: ReplyToFeatureInput
  ): Promise<string | undefined> {
    const action = input.action as FeatureConsoleAction;
    if (action === FeatureConsoleAction.Reject && !input.feedback?.trim()) {
      return 'A rejection needs feedback for the agent to work from.';
    }
    const result = await this.consoleAction.execute({
      featureId: feature.featureId,
      action,
      ...(input.feedback ? { feedback: input.feedback } : {}),
    });
    return result.ok ? undefined : result.message;
  }

  /** Answers the open question; returns why it was not applied, if it was not. */
  private async answer(
    feature: AgentActivity,
    answer: string,
    input: ReplyToFeatureInput
  ): Promise<string | undefined> {
    const question = feature.pendingQuestion;
    if (!question) return `${feature.name} has no open question to answer.`;
    const result = await this.answerQuestion.execute({
      appId:
        question.appId ?? (await questionScopeForPath(this.applications, feature.repositoryPath)),
      questionId: question.id,
      answer,
      answeredBy: input.answeredBy,
      surface: input.surface ?? DecisionSurface.Other,
    });
    if (!result.enabled) return 'Agent questions are turned off (the collaboration feature flag).';
    if (result.alreadySettledAs) return `That question was already ${result.alreadySettledAs}.`;
    return undefined;
  }

  private async refreshed(feature: AgentActivity): Promise<AgentActivity | undefined> {
    const { activities } = await this.getActivity.execute({ featureId: feature.featureId });
    return activities[0];
  }
}
