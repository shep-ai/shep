import { describe, it, expect } from 'vitest';
import {
  buildHarnessChangeDecision,
  harnessQuestionText,
  harnessVerdictFromResponses,
  memoryFacts,
  renderHarnessDiffText,
  summarizeHarnessChange,
} from '@/domain/harness-learning/harness-decision.js';
import { DecisionKind } from '@/domain/generated/output.js';

describe('harness change decision', () => {
  const before = { 'guardrails.md': 'Run tests.', 'scripts/old.sh': 'echo' };
  const after = { 'guardrails.md': 'Run tests first.', 'skills/db/SKILL.md': 'skill' };

  it('summarises the change and words the question', () => {
    const s = summarizeHarnessChange(before, after, 'Audit log', 2, true);
    expect(s).toMatchObject({ added: 1, modified: 1, removed: 1, alwaysOnDelta: 6 });
    const q = harnessQuestionText(s);
    expect(q).toContain('"Audit log"');
    expect(q).toContain('scripts or hooks');
    expect(q).toContain('flagged 2 line(s)');
  });

  it('previews each changed component', () => {
    const text = renderHarnessDiffText(before, after);
    expect(text).toContain('+ skills/db/SKILL.md\nskill');
    expect(text).toContain('~ guardrails.md\nRun tests first.');
    expect(text).toContain('- scripts/old.sh');
  });

  it('builds a HarnessChange decision carrying the version id', () => {
    const d = buildHarnessChangeDecision('q1', 'v9', 'Adopt?', 'diff');
    expect(d.kind).toBe(DecisionKind.HarnessChange);
    expect(d.questions[0].id).toBe('harness-change:v9');
    expect(d.questions[0].options.map((o) => o.id)).toEqual(['adopt', 'reject']);
    expect(d.questions[0].options.some((o) => o.recommended)).toBe(false);
  });

  it.each([
    [{ optionIds: ['adopt'] }, { versionId: 'v9', verdict: 'adopt' }],
    [{ optionIds: ['reject'] }, { versionId: 'v9', verdict: 'reject' }],
    [
      { optionIds: ['adopt'], customText: ' too long ' },
      { versionId: 'v9', verdict: 'reject', feedback: 'too long' },
    ],
  ])('reads the verdict from %j', (response, expected) => {
    expect(harnessVerdictFromResponses([{ questionId: 'harness-change:v9', ...response }])).toEqual(
      expected
    );
  });

  it('ignores responses to other questions or with no choice', () => {
    expect(
      harnessVerdictFromResponses([{ questionId: 'gate', optionIds: ['approve'] }])
    ).toBeUndefined();
    expect(
      harnessVerdictFromResponses([{ questionId: 'harness-change:v9', optionIds: [] }])
    ).toBeUndefined();
  });

  it('reads memory facts from bullet lines, deduplicated', () => {
    expect(memoryFacts('# Facts\n- uses umzug\n* tests live in tests/\n\n- uses umzug')).toEqual([
      'uses umzug',
      'tests live in tests/',
    ]);
  });
});
