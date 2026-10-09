/**
 * Decision helpers (spec 134) — the one place answer semantics live.
 *
 * Every surface (web, CLI, supervisor, WhatsApp, MCP tool) resolves and
 * validates answers through these functions, so each branch is pinned here.
 */

import { describe, it, expect } from 'vitest';
import { DecisionKind, DecisionResponseMode, type Decision } from '@/domain/generated/output.js';
import {
  InvalidDecisionResponseError,
  answersByQuestionText,
  isDecisionAnswerable,
  normalizeResponses,
  recommendedResponses,
  resolveResponsesFromText,
  responsesPickedRecommended,
  summariseResponses,
  validateResponses,
} from '@/domain/shared/decision.js';

function singleSelect(overrides: Partial<Decision> = {}): Decision {
  return {
    id: 'd1',
    kind: DecisionKind.AgentAsk,
    responseMode: DecisionResponseMode.Async,
    questions: [
      {
        id: 'q1',
        header: 'Storage',
        question: 'Which store should cache sessions?',
        multiSelect: false,
        allowCustom: true,
        options: [
          {
            id: 'redis',
            label: 'Redis',
            description: 'Shared, survives restarts',
            recommended: true,
          },
          { id: 'memory', label: 'In-memory', description: 'Fast, per process' },
        ],
      },
    ],
    ...overrides,
  };
}

function multiSelect(): Decision {
  return {
    id: 'd2',
    kind: DecisionKind.ChatQuestion,
    responseMode: DecisionResponseMode.Live,
    questions: [
      {
        id: 'q1',
        header: 'Platforms',
        question: 'Which platforms?',
        multiSelect: true,
        allowCustom: false,
        options: [
          { id: 'web', label: 'Web', description: '' },
          { id: 'ios', label: 'iOS', description: '' },
          { id: 'android', label: 'Android', description: '' },
        ],
      },
      {
        id: 'q2',
        header: 'Auth',
        question: 'Which auth?',
        multiSelect: false,
        allowCustom: true,
        options: [
          { id: 'oauth', label: 'OAuth', description: '', recommended: true },
          { id: 'magic', label: 'Magic link', description: '' },
        ],
      },
    ],
  };
}

describe('resolveResponsesFromText', () => {
  it('matches an option id', () => {
    expect(resolveResponsesFromText(singleSelect(), 'memory')).toEqual([
      { questionId: 'q1', optionIds: ['memory'] },
    ]);
  });

  it('matches an option label case-insensitively', () => {
    expect(resolveResponsesFromText(singleSelect(), '  in-MEMORY ')).toEqual([
      { questionId: 'q1', optionIds: ['memory'] },
    ]);
  });

  it('treats unmatched text as a custom answer when custom answers are allowed', () => {
    expect(resolveResponsesFromText(singleSelect(), 'SQLite table')).toEqual([
      { questionId: 'q1', optionIds: [], customText: 'SQLite table' },
    ]);
  });

  it('rejects unmatched text when custom answers are not allowed', () => {
    const decision = singleSelect();
    decision.questions[0].allowCustom = false;
    expect(() => resolveResponsesFromText(decision, 'SQLite')).toThrow(
      InvalidDecisionResponseError
    );
  });

  it('splits comma-separated labels for a multi-select question', () => {
    const decision = multiSelect();
    const single = { ...decision, questions: [decision.questions[0]] };
    expect(resolveResponsesFromText(single, 'web, Android')).toEqual([
      { questionId: 'q1', optionIds: ['web', 'android'] },
    ]);
  });

  it('reads a JSON object keyed by question id or question text for several questions', () => {
    expect(
      resolveResponsesFromText(
        multiSelect(),
        JSON.stringify({ q1: 'iOS', 'Which auth?': 'Magic link' })
      )
    ).toEqual([
      { questionId: 'q1', optionIds: ['ios'] },
      { questionId: 'q2', optionIds: ['magic'] },
    ]);
  });

  it('rejects an empty answer', () => {
    expect(() => resolveResponsesFromText(singleSelect(), '   ')).toThrow(
      InvalidDecisionResponseError
    );
  });
});

describe('normalizeResponses', () => {
  it('lets non-empty custom text outrank selected options', () => {
    expect(
      normalizeResponses([{ questionId: 'q1', optionIds: ['redis'], customText: ' Use Postgres ' }])
    ).toEqual([{ questionId: 'q1', optionIds: [], customText: 'Use Postgres' }]);
  });

  it('drops blank custom text and duplicate option ids', () => {
    expect(
      normalizeResponses([{ questionId: 'q1', optionIds: ['redis', 'redis'], customText: '  ' }])
    ).toEqual([{ questionId: 'q1', optionIds: ['redis'] }]);
  });
});

describe('validateResponses', () => {
  it('accepts one valid response per question', () => {
    expect(() =>
      validateResponses(singleSelect(), [{ questionId: 'q1', optionIds: ['redis'] }])
    ).not.toThrow();
  });

  it('rejects a missing question', () => {
    expect(() =>
      validateResponses(multiSelect(), [{ questionId: 'q1', optionIds: ['web'] }])
    ).toThrow(/Which auth\?/);
  });

  it('rejects an unknown option id', () => {
    expect(() =>
      validateResponses(singleSelect(), [{ questionId: 'q1', optionIds: ['postgres'] }])
    ).toThrow(/postgres/);
  });

  it('rejects two options on a single-select question', () => {
    expect(() =>
      validateResponses(singleSelect(), [{ questionId: 'q1', optionIds: ['redis', 'memory'] }])
    ).toThrow(InvalidDecisionResponseError);
  });

  it('rejects custom text where custom answers are not allowed', () => {
    const decision = singleSelect();
    decision.questions[0].allowCustom = false;
    expect(() =>
      validateResponses(decision, [{ questionId: 'q1', optionIds: [], customText: 'x' }])
    ).toThrow(InvalidDecisionResponseError);
  });

  it('rejects a response with neither an option nor text', () => {
    expect(() => validateResponses(singleSelect(), [{ questionId: 'q1', optionIds: [] }])).toThrow(
      InvalidDecisionResponseError
    );
  });

  it('rejects a response to a question the decision does not have', () => {
    expect(() =>
      validateResponses(singleSelect(), [
        { questionId: 'q1', optionIds: ['redis'] },
        { questionId: 'q9', optionIds: ['redis'] },
      ])
    ).toThrow(/q9/);
  });
});

describe('summariseResponses', () => {
  it('uses the option label for a single question', () => {
    expect(summariseResponses(singleSelect(), [{ questionId: 'q1', optionIds: ['redis'] }])).toBe(
      'Redis'
    );
  });

  it('uses the typed text when it was given', () => {
    expect(
      summariseResponses(singleSelect(), [
        { questionId: 'q1', optionIds: [], customText: 'Postgres' },
      ])
    ).toBe('Postgres');
  });

  it('prefixes each answer with its header for several questions', () => {
    expect(
      summariseResponses(multiSelect(), [
        { questionId: 'q1', optionIds: ['web', 'ios'] },
        { questionId: 'q2', optionIds: ['oauth'] },
      ])
    ).toBe('Platforms: Web, iOS; Auth: OAuth');
  });
});

describe('answersByQuestionText', () => {
  it('keys answers by question text with labels, as AskUserQuestion expects', () => {
    expect(
      answersByQuestionText(multiSelect(), [
        { questionId: 'q1', optionIds: ['web', 'ios'] },
        { questionId: 'q2', optionIds: [], customText: 'Passkeys' },
      ])
    ).toEqual({ 'Which platforms?': 'Web, iOS', 'Which auth?': 'Passkeys' });
  });
});

describe('recommendedResponses / responsesPickedRecommended', () => {
  it('builds a response from each question’s recommended option', () => {
    expect(recommendedResponses(singleSelect())).toEqual([
      { questionId: 'q1', optionIds: ['redis'] },
    ]);
  });

  it('returns undefined when a question has no recommended option', () => {
    expect(recommendedResponses(multiSelect())).toBeUndefined();
  });

  it('tells whether the answer equals the recommendation', () => {
    const decision = singleSelect();
    expect(responsesPickedRecommended(decision, [{ questionId: 'q1', optionIds: ['redis'] }])).toBe(
      true
    );
    expect(
      responsesPickedRecommended(decision, [{ questionId: 'q1', optionIds: ['memory'] }])
    ).toBe(false);
  });
});

describe('isDecisionAnswerable', () => {
  it('is false only for a not-resumable decision', () => {
    expect(isDecisionAnswerable(singleSelect())).toBe(true);
    expect(
      isDecisionAnswerable(singleSelect({ responseMode: DecisionResponseMode.NotResumable }))
    ).toBe(false);
  });
});
