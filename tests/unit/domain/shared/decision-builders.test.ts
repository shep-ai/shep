/**
 * Decision builders (spec 134) — every producer's shape becomes one Decision.
 */

import { describe, it, expect } from 'vitest';
import {
  AgentQuestionAnswerer,
  AgentQuestionKind,
  AgentQuestionStatus,
  DecisionKind,
  DecisionResponseMode,
  type AgentQuestion,
} from '@/domain/generated/output.js';
import {
  GATE_APPROVE_OPTION_ID,
  GATE_QUESTION_ID,
  GATE_REJECT_OPTION_ID,
  buildApprovalGateDecision,
  decisionForQuestion,
  decisionFromLegacyOptions,
  decisionFromPrdQuestionnaire,
  decisionFromUserQuestions,
  gateVerdictFromResponses,
} from '@/domain/shared/decision-builders.js';

describe('decisionFromUserQuestions', () => {
  it('keeps label, description and preview, and allows a typed answer', () => {
    const decision = decisionFromUserQuestions(
      'tool-1',
      [
        {
          question: 'Which layout?',
          header: 'Layout',
          multiSelect: false,
          options: [
            { label: 'Grid', description: 'Cards in a grid', preview: '[ ][ ]\n[ ][ ]' },
            { label: 'List', description: 'One per row' },
          ],
        },
      ],
      DecisionResponseMode.Live
    );
    expect(decision).toEqual({
      id: 'tool-1',
      kind: DecisionKind.ChatQuestion,
      responseMode: DecisionResponseMode.Live,
      questions: [
        {
          id: 'q1',
          header: 'Layout',
          question: 'Which layout?',
          multiSelect: false,
          allowCustom: true,
          options: [
            { id: 'o1', label: 'Grid', description: 'Cards in a grid', preview: '[ ][ ]\n[ ][ ]' },
            { id: 'o2', label: 'List', description: 'One per row' },
          ],
        },
      ],
    });
  });
});

describe('decisionFromPrdQuestionnaire', () => {
  it('maps rationale to description and keeps ids and recommendations', () => {
    const decision = decisionFromPrdQuestionnaire('prd-f1', {
      question: 'Refine requirements',
      context: 'ctx',
      finalAction: { id: 'approve', label: 'Approve', description: '' },
      questions: [
        {
          id: 'scope',
          question: 'Scope?',
          type: 'select',
          options: [
            { id: 'mvp', label: 'MVP', rationale: 'Ship fast', recommended: true },
            { id: 'full', label: 'Full', rationale: 'Everything' },
          ],
        },
      ],
    });
    expect(decision.kind).toBe(DecisionKind.PrdQuestionnaire);
    // The questionnaire shows its own header; the decision carries no title.
    expect(decision.title).toBeUndefined();
    expect(decision.questions[0]).toEqual({
      id: 'scope',
      header: 'Scope?',
      question: 'Scope?',
      multiSelect: false,
      allowCustom: false,
      options: [
        { id: 'mvp', label: 'MVP', description: 'Ship fast', recommended: true },
        { id: 'full', label: 'Full', description: 'Everything' },
      ],
    });
  });
});

describe('buildApprovalGateDecision', () => {
  it('asks a sentence, not JSON, with Approve recommended and a typed note allowed', () => {
    const decision = buildApprovalGateDecision('run-1', 'merge');
    expect(decision.kind).toBe(DecisionKind.ApprovalGate);
    expect(decision.title).toBe('The pull request is ready to merge');
    const question = decision.questions[0];
    expect(question.id).toBe(GATE_QUESTION_ID);
    expect(question.allowCustom).toBe(true);
    expect(question.options.map((o) => [o.id, o.recommended === true])).toEqual([
      [GATE_APPROVE_OPTION_ID, true],
      [GATE_REJECT_OPTION_ID, false],
    ]);
    expect(question.question).not.toContain('{');
  });

  it('names an unknown step instead of printing it raw', () => {
    expect(buildApprovalGateDecision('run-1', 'prototype-generate').title).toBe(
      'The prototype-generate step is waiting for your approval'
    );
    expect(buildApprovalGateDecision('run-1', undefined).title).toBe(
      'A step is waiting for your approval'
    );
  });
});

describe('gateVerdictFromResponses', () => {
  it('reads approve and reject from the selected option', () => {
    expect(
      gateVerdictFromResponses([
        { questionId: GATE_QUESTION_ID, optionIds: [GATE_APPROVE_OPTION_ID] },
      ])
    ).toEqual({ verdict: 'approve' });
    expect(
      gateVerdictFromResponses([
        { questionId: GATE_QUESTION_ID, optionIds: [GATE_REJECT_OPTION_ID] },
      ])
    ).toEqual({ verdict: 'reject' });
  });

  it('treats a typed note as a rejection carrying that feedback', () => {
    expect(
      gateVerdictFromResponses([
        { questionId: GATE_QUESTION_ID, optionIds: [], customText: 'Split the migration' },
      ])
    ).toEqual({ verdict: 'reject', feedback: 'Split the migration' });
  });
});

describe('decisionFromLegacyOptions / decisionForQuestion', () => {
  const base: AgentQuestion = {
    id: 'aq-1',
    agentRunId: 'run-1',
    kind: AgentQuestionKind.question,
    prompt: 'Deploy now?',
    answerer: AgentQuestionAnswerer.user,
    status: AgentQuestionStatus.pending,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };

  it('uses each legacy string as both id and label so old answers still match', () => {
    const decision = decisionFromLegacyOptions('aq-1', 'Deploy now?', ['yes', 'no']);
    expect(decision.questions[0].options).toEqual([
      { id: 'yes', label: 'yes', description: '' },
      { id: 'no', label: 'no', description: '' },
    ]);
    expect(decision.questions[0].allowCustom).toBe(false);
  });

  it('builds a free-text question when there are no options', () => {
    const decision = decisionFromLegacyOptions('aq-1', 'Why?', []);
    expect(decision.questions[0].options).toEqual([]);
    expect(decision.questions[0].allowCustom).toBe(true);
  });

  it('prefers the stored decision', () => {
    const stored = buildApprovalGateDecision('run-1', 'plan');
    expect(decisionForQuestion({ ...base, decision: stored })).toBe(stored);
  });

  it('builds a legacy decision from optionsJson for rows written before spec 134', () => {
    const decision = decisionForQuestion({ ...base, optionsJson: '["approve","reject"]' });
    expect(decision.kind).toBe(DecisionKind.Legacy);
    expect(decision.questions[0].options.map((o) => o.id)).toEqual(['approve', 'reject']);
  });

  it('reads a pre-134 gate prompt as an approval gate instead of showing JSON', () => {
    const decision = decisionForQuestion({
      ...base,
      prompt: JSON.stringify({ event: 'waiting_approval', node: 'plan', runId: 'run-1' }),
      optionsJson: '["approve","reject"]',
    });
    expect(decision.kind).toBe(DecisionKind.ApprovalGate);
    expect(decision.title).toBe('The implementation plan is ready for review');
  });

  it('marks a closed question not resumable', () => {
    const decision = decisionForQuestion({ ...base, status: AgentQuestionStatus.cancelled });
    expect(decision.responseMode).toBe(DecisionResponseMode.NotResumable);
  });
});
