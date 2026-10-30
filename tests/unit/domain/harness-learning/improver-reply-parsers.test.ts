import { describe, it, expect } from 'vitest';
import {
  capLessonConfidence,
  isKeepBase,
  parseChoice,
  parseEditRows,
  parseExperience,
  parseNotes,
} from '@/domain/harness-learning/improver-reply-parsers.js';
import { HarnessEditVerdict, LessonConfidence } from '@/domain/generated/output.js';

describe('parseNotes / isKeepBase', () => {
  it('reads the notes block, or the whole reply when there is none', () => {
    expect(parseNotes('x <notes>\n kept -> a\n</notes> y')).toBe('kept -> a');
    expect(parseNotes('  plain reply ')).toBe('plain reply');
  });

  it('detects KEEP_BASE', () => {
    expect(isKeepBase('<notes>KEEP_BASE — nothing argued for a change</notes>')).toBe(true);
    expect(isKeepBase('<notes>added a skill</notes>')).toBe(false);
  });
});

describe('parseChoice', () => {
  const ids = ['A', 'B', 'C'];

  it('reads the last choice block and the reason', () => {
    const reply = '<why>B kept every column</why>\n```choice\nB\n```';
    expect(parseChoice(reply, ids)).toEqual({ ok: true, id: 'B', why: 'B kept every column' });
  });

  it.each([
    ['no block', 'I pick B'],
    ['unknown id', '```choice\nZ\n```'],
    ['empty block', '```choice\n\n```'],
    ['two different choices', '```choice\nA\n```\n```choice\nB\n```'],
  ])('fails closed on %s', (_label, reply) => {
    const result = parseChoice(reply, ids);
    expect(result.ok).toBe(false);
  });
});

describe('parseEditRows', () => {
  it('reads five-line rows and validates verdicts', () => {
    const reply = `<edits>
component: skills/db-migration/SKILL.md
candidates: inv1, agg1
change: added a migration checklist
observed: inv1 wrote the down() migration; base runs did not
verdict: helped
component: guardrails.md
candidates: dom1
change: added a rule
observed: no difference
verdict: maybe
</edits>`;
    const rows = parseEditRows(reply);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      component: 'skills/db-migration/SKILL.md',
      candidates: ['inv1', 'agg1'],
      change: 'added a migration checklist',
      observed: 'inv1 wrote the down() migration; base runs did not',
      verdict: HarnessEditVerdict.Helped,
    });
    expect(rows[1].verdict).toBe(HarnessEditVerdict.Confounded);
  });

  it('returns no rows when the block is missing', () => {
    expect(parseEditRows('nothing')).toEqual([]);
  });
});

describe('parseExperience', () => {
  it('reads a complete entry', () => {
    const reply = `<experience>
cue: a migration adds a NOT NULL column
lesson: add a skill that writes the backfill before the constraint
evidence: row 1 helped in inv1
confidence: medium
</experience>`;
    expect(parseExperience(reply)).toEqual({
      ok: true,
      experience: {
        cue: 'a migration adds a NOT NULL column',
        lesson: 'add a skill that writes the backfill before the constraint',
        evidence: 'row 1 helped in inv1',
        confidence: LessonConfidence.Medium,
      },
    });
  });

  it('declines on NO_ENTRY, a missing block or a missing field', () => {
    expect(parseExperience('NO_ENTRY')).toEqual({ ok: false, reason: 'no-entry' });
    expect(parseExperience('nothing')).toEqual({ ok: false, reason: 'missing-block' });
    expect(parseExperience('<experience>\ncue: x\nlesson: y\n</experience>')).toEqual({
      ok: false,
      reason: 'missing-field',
    });
  });

  it('defaults an unknown confidence to low', () => {
    const r = parseExperience(
      '<experience>\ncue: a\nlesson: b\nevidence: c\nconfidence: huge\n</experience>'
    );
    expect(r.ok && r.experience.confidence).toBe(LessonConfidence.Low);
  });
});

describe('capLessonConfidence', () => {
  it('caps at low when every row is untested or there are no rows', () => {
    expect(capLessonConfidence(LessonConfidence.High, [HarnessEditVerdict.Untested])).toBe(
      LessonConfidence.Low
    );
    expect(capLessonConfidence(LessonConfidence.High, [])).toBe(LessonConfidence.Low);
  });

  it('caps at low when only confounded rows support it', () => {
    expect(capLessonConfidence(LessonConfidence.High, [HarnessEditVerdict.Confounded])).toBe(
      LessonConfidence.Low
    );
  });

  it('keeps the stated confidence when a row has a real verdict', () => {
    expect(
      capLessonConfidence(LessonConfidence.High, [
        HarnessEditVerdict.Confounded,
        HarnessEditVerdict.Helped,
      ])
    ).toBe(LessonConfidence.High);
  });
});
