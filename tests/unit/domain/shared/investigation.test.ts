import { describe, it, expect } from 'vitest';
import {
  INVESTIGATION_STALE_AFTER_MS,
  MAX_HYPOTHESES,
  isInvestigationActive,
  isInvestigationStale,
  rankHypotheses,
  type RawHypothesis,
} from '@/domain/shared/investigation.js';
import { HypothesisConfidence, InvestigationStatus } from '@/domain/generated/output.js';

const WORKTREE = '/home/me/.shep/inv/abc12345';

function raw(overrides: Partial<RawHypothesis> = {}): RawHypothesis {
  return {
    title: 'Null check missing',
    rootCause: 'The handler reads user.id before the session loads.',
    confidence: 'Medium',
    evidence: [{ file: 'src/handler.ts', line: 12, note: 'reads user.id' }],
    testPlan: 'Call the handler with no session',
    fixPlan: 'Guard the session',
    ...overrides,
  };
}

describe('rankHypotheses', () => {
  it('orders by confidence, keeps the agent order within a level and numbers from 1', () => {
    const ranked = rankHypotheses(
      [
        raw({ title: 'low', confidence: 'Low' }),
        raw({ title: 'high', confidence: 'High' }),
        raw({ title: 'medium-a', confidence: 'Medium' }),
        raw({ title: 'medium-b', confidence: 'medium' }),
      ],
      WORKTREE
    );
    expect(ranked.map((h) => [h.number, h.title, h.confidence])).toEqual([
      [1, 'high', HypothesisConfidence.High],
      [2, 'medium-a', HypothesisConfidence.Medium],
      [3, 'medium-b', HypothesisConfidence.Medium],
      [4, 'low', HypothesisConfidence.Low],
    ]);
  });

  it(`keeps at most ${MAX_HYPOTHESES}`, () => {
    const many = Array.from({ length: MAX_HYPOTHESES + 3 }, (_, i) => raw({ title: `h${i}` }));
    expect(rankHypotheses(many, WORKTREE)).toHaveLength(MAX_HYPOTHESES);
  });

  it('treats an unknown confidence as low', () => {
    expect(rankHypotheses([raw({ confidence: 'certain' })], WORKTREE)[0].confidence).toBe(
      HypothesisConfidence.Low
    );
  });

  it('drops hypotheses without a title or root cause and trims text', () => {
    const ranked = rankHypotheses(
      [raw({ title: '  ' }), raw({ rootCause: '' }), raw({ title: '  Kept  ' })],
      WORKTREE
    );
    expect(ranked.map((h) => h.title)).toEqual(['Kept']);
  });

  it('makes evidence paths repository-relative with forward slashes', () => {
    const [hypothesis] = rankHypotheses(
      [
        raw({
          evidence: [
            { file: `${WORKTREE}/src/a.ts`, note: 'absolute' },
            { file: 'C:\\Users\\me\\.shep\\inv\\abc12345\\src\\b.ts', note: 'windows absolute' },
            { file: './src/c.ts', note: 'dot' },
            { file: 'src\\d.ts', note: 'backslash' },
            { file: '/src/e.ts', note: 'leading slash' },
          ],
        }),
      ],
      'C:\\Users\\me\\.shep\\inv\\abc12345'
    );
    expect(hypothesis.evidence.map((e) => e.file)).toEqual([
      'home/me/.shep/inv/abc12345/src/a.ts',
      'src/b.ts',
      'src/c.ts',
      'src/d.ts',
      'src/e.ts',
    ]);

    const [unix] = rankHypotheses(
      [raw({ evidence: [{ file: `${WORKTREE}/src/a.ts`, note: 'n' }] })],
      WORKTREE
    );
    expect(unix.evidence[0].file).toBe('src/a.ts');
  });

  it('keeps only positive whole line numbers and drops evidence without a file', () => {
    const [hypothesis] = rankHypotheses(
      [
        raw({
          evidence: [
            { file: 'a.ts', line: 0, note: 'zero' },
            { file: 'b.ts', line: 4.5, note: 'fraction' },
            { file: 'c.ts', line: 7, note: 'ok' },
            { file: ' ', note: 'no file' },
          ],
        }),
      ],
      WORKTREE
    );
    expect(hypothesis.evidence).toEqual([
      { file: 'a.ts', note: 'zero' },
      { file: 'b.ts', note: 'fraction' },
      { file: 'c.ts', line: 7, note: 'ok' },
    ]);
  });

  it('accepts a hypothesis with no evidence list', () => {
    const [hypothesis] = rankHypotheses(
      [raw({ evidence: undefined as unknown as RawHypothesis['evidence'] })],
      WORKTREE
    );
    expect(hypothesis.evidence).toEqual([]);
  });
});

describe('investigation activity', () => {
  const now = new Date('2026-10-04T12:00:00Z');
  const recent = new Date(now.getTime() - 60_000);
  const old = new Date(now.getTime() - INVESTIGATION_STALE_AFTER_MS - 1);

  it.each([
    [InvestigationStatus.Pending, recent, true, false],
    [InvestigationStatus.Running, recent, true, false],
    [InvestigationStatus.Running, old, false, true],
    [InvestigationStatus.Pending, old, false, true],
    [InvestigationStatus.Completed, recent, false, false],
    [InvestigationStatus.Failed, old, false, false],
  ])('%s updated at %s: active %s, stale %s', (status, updatedAt, active, stale) => {
    const investigation = { status, updatedAt };
    expect(isInvestigationActive(investigation, now)).toBe(active);
    expect(isInvestigationStale(investigation, now)).toBe(stale);
  });
});
