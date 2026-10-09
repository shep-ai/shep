/**
 * Agent-asked decisions (spec 134, part 2): the deadline and the shape a
 * background agent may ask in.
 */

import { describe, it, expect } from 'vitest';
import {
  AgentQuestionAnswerer,
  AgentQuestionKind,
  AgentQuestionStatus,
  DecisionKind,
  DecisionOutcome,
  DecisionResponseMode,
  type AgentQuestion,
} from '@/domain/generated/output.js';
import {
  DEFAULT_DECISION_TIMEOUT_MINUTES,
  InvalidAgentDecisionError,
  MAX_DECISION_TIMEOUT_MINUTES,
  DECISION_DEADLINE_ACTOR,
  decisionFromAgentAsk,
  decisionOutcomeOf,
  resolveDecisionTimeoutMinutes,
} from '@/domain/shared/decision-deadline.js';

const options = [
  { label: 'Online column', description: 'No lock', recommended: true },
  { label: 'Default column', description: 'Rewrites the table' },
];

describe('resolveDecisionTimeoutMinutes', () => {
  it('uses the request, then the setting, then 30 minutes, within bounds', () => {
    expect(resolveDecisionTimeoutMinutes(undefined, undefined)).toBe(
      DEFAULT_DECISION_TIMEOUT_MINUTES
    );
    expect(DEFAULT_DECISION_TIMEOUT_MINUTES).toBe(30);
    expect(resolveDecisionTimeoutMinutes(undefined, 45)).toBe(45);
    expect(resolveDecisionTimeoutMinutes(10, 45)).toBe(10);
    expect(resolveDecisionTimeoutMinutes(0, undefined)).toBe(1);
    expect(resolveDecisionTimeoutMinutes(10_000, undefined)).toBe(MAX_DECISION_TIMEOUT_MINUTES);
    expect(resolveDecisionTimeoutMinutes(Number.NaN, 12)).toBe(12);
  });
});

describe('decisionFromAgentAsk', () => {
  const defaultAfter = new Date('2026-10-09T12:00:00Z');

  it('builds an Async agent-ask decision with Shep-generated option ids', () => {
    const decision = decisionFromAgentAsk('q-1', {
      header: 'Migration',
      question: 'How should the column be added?',
      options,
      defaultAfter,
    });
    expect(decision).toMatchObject({
      id: 'q-1',
      kind: DecisionKind.AgentAsk,
      responseMode: DecisionResponseMode.Async,
      defaultAfter,
    });
    expect(decision.questions[0]).toMatchObject({
      header: 'Migration',
      allowCustom: true,
      multiSelect: false,
    });
    expect(decision.questions[0].options.map((o) => [o.id, o.recommended === true])).toEqual([
      ['o1', true],
      ['o2', false],
    ]);
  });

  it('requires exactly one recommended option for a single choice', () => {
    expect(() =>
      decisionFromAgentAsk('q', {
        question: 'Which?',
        options: options.map((o) => ({ ...o, recommended: false })),
        defaultAfter,
      })
    ).toThrow(InvalidAgentDecisionError);
    expect(() =>
      decisionFromAgentAsk('q', {
        question: 'Which?',
        options: options.map((o) => ({ ...o, recommended: true })),
        defaultAfter,
      })
    ).toThrow(/exactly one/);
  });

  it('requires two to nine distinct, non-empty options and a question', () => {
    expect(() =>
      decisionFromAgentAsk('q', { question: 'Which?', options: [options[0]], defaultAfter })
    ).toThrow(InvalidAgentDecisionError);
    expect(() =>
      decisionFromAgentAsk('q', {
        question: 'Which?',
        options: [options[0], { ...options[1], label: 'online column' }],
        defaultAfter,
      })
    ).toThrow(/distinct/);
    expect(() => decisionFromAgentAsk('q', { question: '  ', options, defaultAfter })).toThrow(
      InvalidAgentDecisionError
    );
  });
});

describe('decisionOutcomeOf', () => {
  const q = (status: AgentQuestionStatus, answeredBy?: string): AgentQuestion => ({
    id: 'q',
    agentRunId: 'r',
    kind: AgentQuestionKind.blocking,
    prompt: 'p',
    answerer: AgentQuestionAnswerer.either,
    status,
    answeredBy,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  });

  it('maps each status, and a deadline answer to Defaulted', () => {
    expect(decisionOutcomeOf(q(AgentQuestionStatus.pending))).toBe(DecisionOutcome.Pending);
    expect(decisionOutcomeOf(q(AgentQuestionStatus.answered, 'user:web'))).toBe(
      DecisionOutcome.Answered
    );
    expect(decisionOutcomeOf(q(AgentQuestionStatus.expired, DECISION_DEADLINE_ACTOR))).toBe(
      DecisionOutcome.Defaulted
    );
    expect(decisionOutcomeOf(q(AgentQuestionStatus.expired))).toBe(DecisionOutcome.Defaulted);
    expect(decisionOutcomeOf(q(AgentQuestionStatus.cancelled))).toBe(DecisionOutcome.Cancelled);
  });
});
