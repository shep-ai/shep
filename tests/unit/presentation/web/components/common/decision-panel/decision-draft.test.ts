/**
 * Decision draft (spec 134) — the pure state behind DecisionPanel, mirroring
 * T3 Code's pendingUserInput.ts over Shep's Decision model.
 */

import { describe, it, expect } from 'vitest';
import {
  DecisionKind,
  DecisionResponseMode,
  type Decision,
} from '@shepai/core/domain/generated/output';
import {
  buildDecisionResponses,
  carryDisplacedText,
  deriveDecisionProgress,
  initialDecisionDraft,
  selectDecisionOption,
  setDecisionCustomText,
} from '@/components/common/decision-panel/decision-draft';

const decision: Decision = {
  id: 'd1',
  kind: DecisionKind.ChatQuestion,
  responseMode: DecisionResponseMode.Live,
  questions: [
    {
      id: 'q1',
      header: 'Store',
      question: 'Which store?',
      multiSelect: false,
      allowCustom: true,
      options: [
        { id: 'redis', label: 'Redis', description: '', recommended: true },
        { id: 'memory', label: 'Memory', description: '' },
      ],
    },
    {
      id: 'q2',
      header: 'Platforms',
      question: 'Which platforms?',
      multiSelect: true,
      allowCustom: false,
      options: [
        { id: 'web', label: 'Web', description: '' },
        { id: 'ios', label: 'iOS', description: '' },
      ],
    },
  ],
};
const [single, multi] = decision.questions;

describe('initialDecisionDraft', () => {
  it('preselects each question’s recommended option', () => {
    expect(initialDecisionDraft(decision)).toEqual({ q1: { selectedOptionIds: ['redis'] } });
  });
});

describe('selectDecisionOption', () => {
  it('replaces the selection on a single-select question', () => {
    expect(selectDecisionOption(single, { selectedOptionIds: ['redis'] }, 'memory')).toEqual({
      answer: { selectedOptionIds: ['memory'] },
    });
  });

  it('toggles options on a multi-select question', () => {
    const once = selectDecisionOption(multi, undefined, 'web').answer;
    const twice = selectDecisionOption(multi, once, 'ios').answer;
    expect(twice.selectedOptionIds).toEqual(['web', 'ios']);
    expect(selectDecisionOption(multi, twice, 'web').answer.selectedOptionIds).toEqual(['ios']);
  });

  it('hands typed text back to the host instead of dropping it', () => {
    expect(
      selectDecisionOption(single, { selectedOptionIds: [], customText: ' Postgres ' }, 'redis')
    ).toEqual({ answer: { selectedOptionIds: ['redis'] }, displacedText: 'Postgres' });
  });
});

describe('setDecisionCustomText / progress', () => {
  it('lets typed text outrank the selection', () => {
    const answer = setDecisionCustomText({ selectedOptionIds: ['redis'] }, 'SQLite');
    const progress = deriveDecisionProgress(decision, { q1: answer }, 0);
    expect(progress.usingCustomText).toBe(true);
    expect(progress.selectedOptionIds).toEqual([]);
    expect(progress.response).toEqual({ questionId: 'q1', optionIds: [], customText: 'SQLite' });
  });

  it('restores the selection when the typed text is cleared', () => {
    const answer = setDecisionCustomText(
      setDecisionCustomText({ selectedOptionIds: ['redis'] }, 'x'),
      ''
    );
    expect(deriveDecisionProgress(decision, { q1: answer }, 0).selectedOptionIds).toEqual([
      'redis',
    ]);
  });

  it('ignores typed text where custom answers are not allowed', () => {
    const progress = deriveDecisionProgress(decision, { q2: { customText: 'Android' } }, 1);
    expect(progress.canAdvance).toBe(false);
  });

  it('reports position, last question and completeness', () => {
    const draft = { q1: { selectedOptionIds: ['redis'] } };
    const first = deriveDecisionProgress(decision, draft, 0);
    expect(first).toMatchObject({ index: 0, total: 2, isLast: false, canAdvance: true });
    expect(first.isComplete).toBe(false);
    const done = deriveDecisionProgress(
      decision,
      { ...draft, q2: { selectedOptionIds: ['web'] } },
      9
    );
    expect(done).toMatchObject({ index: 1, isLast: true, isComplete: true, answeredCount: 2 });
  });
});

describe('buildDecisionResponses', () => {
  it('returns null until every question is answered', () => {
    expect(buildDecisionResponses(decision, { q1: { selectedOptionIds: ['redis'] } })).toBeNull();
  });

  it('builds one response per question', () => {
    expect(
      buildDecisionResponses(decision, {
        q1: { customText: 'Postgres' },
        q2: { selectedOptionIds: ['web', 'ios'] },
      })
    ).toEqual([
      { questionId: 'q1', optionIds: [], customText: 'Postgres' },
      { questionId: 'q2', optionIds: ['web', 'ios'] },
    ]);
  });
});

describe('carryDisplacedText', () => {
  it('appends displaced text after the existing draft', () => {
    expect(carryDisplacedText('', 'Postgres')).toBe('Postgres');
    expect(carryDisplacedText('note  ', 'Postgres')).toBe('note\n\nPostgres');
    expect(carryDisplacedText('note', undefined)).toBe('note');
  });
});
