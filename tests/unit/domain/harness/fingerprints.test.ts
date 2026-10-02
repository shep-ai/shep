import { describe, it, expect } from 'vitest';
import { HarnessTaskType } from '@/domain/generated/output.js';
import {
  canonicalJson,
  dedupeKey,
  estimateTokens,
  normalizeGoal,
  queryFingerprint,
  sha256Hex,
} from '@/domain/harness/fingerprints.js';

const base = {
  query: 'Fix the  refresh token',
  goal: 'Fix auth',
  repoSnapshotId: 'snap-1',
  rendererVersions: ['file@1', 'diff@1'],
  instructionIds: ['claude-md'],
};

describe('fingerprints', () => {
  it('normalizes case and whitespace', () => {
    expect(normalizeGoal('  Fix   the\nRefresh  Token ')).toBe('fix the refresh token');
  });

  it('gives the same query fingerprint for whitespace/case variants', () => {
    expect(queryFingerprint(base)).toBe(
      queryFingerprint({ ...base, query: 'fix the refresh   TOKEN' })
    );
  });

  it('changes the fingerprint when the snapshot changes', () => {
    expect(queryFingerprint(base)).not.toBe(
      queryFingerprint({ ...base, repoSnapshotId: 'snap-2' })
    );
  });

  it('ignores the order of renderer versions and instruction ids', () => {
    expect(queryFingerprint(base)).toBe(
      queryFingerprint({ ...base, rendererVersions: ['diff@1', 'file@1'] })
    );
  });

  it('builds a dedupe key from goal, scope, snapshot and type', () => {
    const a = dedupeKey({
      goal: 'Find refresh logic',
      scope: ['src/**'],
      repoSnapshotId: 's',
      type: HarnessTaskType.ReadOnly,
    });
    const b = dedupeKey({
      goal: ' find REFRESH logic',
      scope: ['src/**'],
      repoSnapshotId: 's',
      type: HarnessTaskType.ReadOnly,
    });
    const c = dedupeKey({
      goal: 'Find refresh logic',
      scope: ['src/**'],
      repoSnapshotId: 's',
      type: HarnessTaskType.Write,
    });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('hashes with sha256 hex', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });

  it('serializes JSON with sorted keys', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { f: 1, e: 0 }] } })).toBe(
      '{"a":{"c":[3,{"e":0,"f":1}],"d":2},"b":1}'
    );
  });

  it('estimates tokens as ceil(chars / 4)', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
  });
});
