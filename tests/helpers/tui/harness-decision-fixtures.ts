/**
 * A pending HarnessChange inbox question (spec 150), as OfferHarnessCandidateUseCase files it,
 * for the console's decision tests.
 */

import {
  AgentQuestionAnswerer,
  AgentQuestionKind,
  AgentQuestionStatus,
  DecisionKind,
  type AgentQuestion,
} from '@/domain/generated/output.js';
import { buildHarnessChangeDecision } from '@/domain/harness-learning/harness-decision.js';

export const HARNESS_SUMMARY =
  'Shep learned from "Billing UI" and proposes a harness change for this repository: 1 added, 0 changed, 0 removed always-on text +120 characters. Adopt it, or reject it with feedback?';
export const HARNESS_PREVIEW = '+ skills/testing/SKILL.md\nRun the unit tests before committing.';

export function harnessQuestion(
  versionId: string,
  overrides: Partial<AgentQuestion> = {}
): AgentQuestion {
  return {
    id: `q-${versionId}`,
    appId: '/work/acme-web',
    featureId: 'feat-1',
    agentRunId: 'run-1',
    kind: AgentQuestionKind.question,
    prompt: HARNESS_SUMMARY,
    answerer: AgentQuestionAnswerer.user,
    status: AgentQuestionStatus.pending,
    decision: buildHarnessChangeDecision('pending', versionId, HARNESS_SUMMARY, HARNESS_PREVIEW),
    createdAt: new Date('2026-10-28T10:00:00Z'),
    updatedAt: new Date('2026-10-28T10:00:00Z'),
    ...overrides,
  };
}

/** An ordinary decision in the same inbox, which the harness view must not show. */
export function otherDecisionQuestion(): AgentQuestion {
  const base = harnessQuestion('x');
  return {
    ...base,
    id: 'q-other',
    prompt: 'Which database?',
    decision: { ...base.decision!, kind: DecisionKind.AgentAsk },
  };
}
