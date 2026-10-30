/**
 * Harness decisions in the console (spec 150, task-23)
 *
 * The console reads pending HarnessChange decisions from the unified inbox and
 * answers them through AnswerAgentQuestionUseCase — the path every other inbox
 * answers through — so the inbox, the Learned harness page and `shep learn`
 * stay in sync.
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { TFunction } from 'i18next';

import { initI18n } from '@/presentation/tui/i18n.js';
import {
  HARNESS_DECISION_ACTOR,
  harnessDecisionDeps,
  harnessDecisionItems,
  type HarnessDecisionUseCases,
} from '@/presentation/tui/feature-console/harness-decisions.js';
import { AgentQuestionStatus, DecisionSurface } from '@/domain/generated/output.js';
import {
  HARNESS_ADOPT_OPTION_ID,
  HARNESS_QUESTION_PREFIX,
  HARNESS_REJECT_OPTION_ID,
} from '@/domain/harness-learning/harness-decision.js';
import {
  HARNESS_PREVIEW,
  HARNESS_SUMMARY,
  harnessQuestion,
  otherDecisionQuestion,
} from '@tests/helpers/tui/harness-decision-fixtures.js';

const SUMMARY = HARNESS_SUMMARY;
const PREVIEW = HARNESS_PREVIEW;
const otherQuestion = otherDecisionQuestion;

describe('harnessDecisionItems', () => {
  it('keeps pending HarnessChange decisions with their summary and diff preview', () => {
    const items = harnessDecisionItems([harnessQuestion('v1'), otherQuestion()]);

    expect(items).toEqual([
      {
        questionId: 'q-v1',
        appId: '/work/acme-web',
        decisionQuestionId: `${HARNESS_QUESTION_PREFIX}v1`,
        featureId: 'feat-1',
        summary: SUMMARY,
        preview: PREVIEW,
      },
    ]);
  });

  it('drops answered decisions and ones without a scope to answer in', () => {
    expect(
      harnessDecisionItems([
        harnessQuestion('v1', { status: AgentQuestionStatus.answered }),
        harnessQuestion('v2', { appId: undefined }),
      ])
    ).toEqual([]);
  });
});

describe('harnessDecisionDeps', () => {
  let t: TFunction;

  beforeAll(async () => {
    t = (await initI18n('en')).t;
  });

  function useCases(result: Awaited<ReturnType<HarnessDecisionUseCases['answer']['execute']>>) {
    return {
      inbox: { execute: vi.fn(async () => [otherQuestion(), harnessQuestion('v1')]) },
      answer: { execute: vi.fn(async () => result) },
    };
  }

  it('reads pending questions from the inbox and keeps the harness decisions', async () => {
    const cases = useCases({ enabled: true, forwardedToGate: false });
    const items = await harnessDecisionDeps(cases, t).loadHarnessDecisions();

    expect(cases.inbox.execute).toHaveBeenCalledWith({ status: AgentQuestionStatus.pending });
    expect(items.map((i) => i.questionId)).toEqual(['q-v1']);
  });

  it('adopts by answering the inbox question with the Adopt option', async () => {
    const cases = useCases({ enabled: true, forwardedToGate: false });
    const deps = harnessDecisionDeps(cases, t);
    const [item] = await deps.loadHarnessDecisions();

    const result = await deps.answerHarnessDecision(item, { adopt: true });

    expect(cases.answer.execute).toHaveBeenCalledWith({
      appId: '/work/acme-web',
      questionId: 'q-v1',
      responses: [
        { questionId: `${HARNESS_QUESTION_PREFIX}v1`, optionIds: [HARNESS_ADOPT_OPTION_ID] },
      ],
      answeredBy: HARNESS_DECISION_ACTOR,
      surface: DecisionSurface.Other,
    });
    expect(result).toEqual({ ok: true, message: 'Adopted the harness change' });
  });

  it('rejects with the typed feedback as the custom answer', async () => {
    const cases = useCases({ enabled: true, forwardedToGate: false });
    const deps = harnessDecisionDeps(cases, t);
    const [item] = await deps.loadHarnessDecisions();

    const result = await deps.answerHarnessDecision(item, {
      adopt: false,
      feedback: 'Too broad',
    });

    expect(cases.answer.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        responses: [
          {
            questionId: `${HARNESS_QUESTION_PREFIX}v1`,
            optionIds: [HARNESS_REJECT_OPTION_ID],
            customText: 'Too broad',
          },
        ],
      })
    );
    expect(result).toEqual({ ok: true, message: 'Rejected the harness change' });
  });

  it('reports when collaboration is off or the decision was already settled', async () => {
    const off = harnessDecisionDeps(useCases({ enabled: false, forwardedToGate: false }), t);
    const settled = harnessDecisionDeps(
      useCases({
        enabled: true,
        forwardedToGate: false,
        alreadySettledAs: AgentQuestionStatus.answered,
      }),
      t
    );
    const [item] = harnessDecisionItems([harnessQuestion('v1')]);

    expect((await off.answerHarnessDecision(item, { adopt: true })).ok).toBe(false);
    expect(await settled.answerHarnessDecision(item, { adopt: true })).toEqual({
      ok: false,
      message: 'This harness change was already answered elsewhere',
    });
  });
});
