/**
 * Learned-harness decisions in the console (spec 150).
 *
 * A candidate harness change the adoption policy did not adopt waits in the
 * unified inbox as a HarnessChange decision. The console reads it from the
 * inbox and answers through AnswerAgentQuestionUseCase — the path the web and
 * CLI inboxes answer through — which adopts or rejects the version and closes
 * the question, so every surface stays in sync.
 */

import type { TFunction } from 'i18next';
import {
  AgentQuestionStatus,
  DecisionKind,
  DecisionSurface,
  type AgentQuestion,
  type DecisionResponse,
} from '@/domain/generated/output.js';
import {
  HARNESS_ADOPT_OPTION_ID,
  HARNESS_QUESTION_PREFIX,
  HARNESS_REJECT_OPTION_ID,
} from '@/domain/harness-learning/harness-decision.js';
import type { FeatureConsoleActionResult } from '@/application/use-cases/feature-console/feature-console.types.js';
import type { ListAgentQuestionInboxUseCase } from '@/application/use-cases/agents/list-agent-question-inbox.use-case.js';
import type { AnswerAgentQuestionUseCase } from '@/application/use-cases/agents/answer-agent-question.use-case.js';
import { NS } from './console-labels.js';

/** Who answered, as the inbox records it. */
export const HARNESS_DECISION_ACTOR = 'user:tui';

/** One waiting harness change, as the console shows and answers it. */
export interface HarnessDecisionItem {
  /** The inbox question. */
  questionId: string;
  /** The scope the question was filed under; answering needs it. */
  appId: string;
  /** The decision's question, which names the candidate version. */
  decisionQuestionId: string;
  featureId?: string;
  /** What changes, in counts, as core wrote it. */
  summary: string;
  /** Each changed component with its new content. */
  preview: string;
}

export interface HarnessAnswer {
  adopt: boolean;
  /** With a reject: why, to steer the next proposal. */
  feedback?: string;
}

export interface HarnessDecisionDeps {
  loadHarnessDecisions: () => Promise<HarnessDecisionItem[]>;
  answerHarnessDecision: (
    item: HarnessDecisionItem,
    answer: HarnessAnswer
  ) => Promise<FeatureConsoleActionResult>;
}

export interface HarnessDecisionUseCases {
  inbox: Pick<ListAgentQuestionInboxUseCase, 'execute'>;
  answer: Pick<AnswerAgentQuestionUseCase, 'execute'>;
}

/** The pending HarnessChange decisions among these questions, in the order given. */
export function harnessDecisionItems(questions: readonly AgentQuestion[]): HarnessDecisionItem[] {
  return questions.flatMap((q) => {
    const decision = q.decision;
    if (q.status !== AgentQuestionStatus.pending || !q.appId) return [];
    if (decision?.kind !== DecisionKind.HarnessChange) return [];
    const asked = decision.questions.find((d) => d.id.startsWith(HARNESS_QUESTION_PREFIX));
    if (!asked) return [];
    const adopt = asked.options.find((o) => o.id === HARNESS_ADOPT_OPTION_ID);
    return [
      {
        questionId: q.id,
        appId: q.appId,
        decisionQuestionId: asked.id,
        ...(q.featureId ? { featureId: q.featureId } : {}),
        summary: q.prompt,
        preview: adopt?.preview ?? '',
      },
    ];
  });
}

/** The decision responses for an answer: the chosen option, and feedback as typed text. */
export function harnessResponses(
  item: HarnessDecisionItem,
  answer: HarnessAnswer
): DecisionResponse[] {
  const feedback = answer.feedback?.trim();
  return [
    {
      questionId: item.decisionQuestionId,
      optionIds: [answer.adopt ? HARNESS_ADOPT_OPTION_ID : HARNESS_REJECT_OPTION_ID],
      ...(!answer.adopt && feedback ? { customText: feedback } : {}),
    },
  ];
}

/** The console's decision dependencies, carried out by the inbox use cases. */
export function harnessDecisionDeps(
  useCases: HarnessDecisionUseCases,
  t: TFunction
): HarnessDecisionDeps {
  return {
    loadHarnessDecisions: async () =>
      harnessDecisionItems(await useCases.inbox.execute({ status: AgentQuestionStatus.pending })),
    answerHarnessDecision: async (item, answer) => {
      try {
        const result = await useCases.answer.execute({
          appId: item.appId,
          questionId: item.questionId,
          responses: harnessResponses(item, answer),
          answeredBy: HARNESS_DECISION_ACTOR,
          // DecisionSurface has no terminal member yet; `other` is its catch-all.
          surface: DecisionSurface.Other,
        });
        if (!result.enabled) return { ok: false, message: t(`${NS}.harness.collaborationOff`) };
        if (result.alreadySettledAs) {
          return { ok: false, message: t(`${NS}.harness.alreadySettled`) };
        }
        return {
          ok: true,
          message: t(`${NS}.harness.${answer.adopt ? 'adopted' : 'rejected'}`),
        };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}
