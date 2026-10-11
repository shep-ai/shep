// @vitest-environment node

/**
 * Git checkpoint domain helpers (spec 135).
 *
 * Every hidden ref name is built here, so these tests are the guard that a
 * node name or feature id can never smuggle an option, a path separator or a
 * `..` into a git argument.
 *
 * TDD Phase: RED → GREEN
 */

import { describe, it, expect } from 'vitest';
import {
  CHECKPOINT_REF_ROOT,
  buildCheckpointRef,
  featureCheckpointRefPrefix,
  checkpointLabel,
  resolveCheckpointSelector,
  previousCheckpoint,
} from '@/domain/shared/git-checkpoint.js';
import {
  GitCheckpointNotFoundError,
  InvalidCheckpointNameError,
} from '@/domain/errors/git-checkpoint-errors.js';
import { GitCheckpointKind, type GitCheckpoint } from '@/domain/generated/output.js';

const FEATURE_ID = '3f0c1d2e-4b5a-4c6d-8e7f-001122334455';

function checkpoint(sequence: number, node: string, overrides: Partial<GitCheckpoint> = {}) {
  return {
    id: `cp-${sequence}`,
    featureId: FEATURE_ID,
    sequence,
    kind: sequence === 0 ? GitCheckpointKind.Baseline : GitCheckpointKind.Step,
    node,
    ref: buildCheckpointRef(FEATURE_ID, sequence, node),
    commitSha: `c${sequence}`,
    treeSha: `t${sequence}`,
    filesChanged: 0,
    additions: 0,
    deletions: 0,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  } satisfies GitCheckpoint;
}

describe('buildCheckpointRef', () => {
  it('zero-pads the sequence so refs sort in step order', () => {
    expect(buildCheckpointRef(FEATURE_ID, 3, 'implement')).toBe(
      `${CHECKPOINT_REF_ROOT}/${FEATURE_ID}/0003-implement`
    );
  });

  it('accepts graph node names with hyphens and underscores', () => {
    expect(buildCheckpointRef(FEATURE_ID, 12, 'repair_spec_analyze')).toMatch(
      /\/0012-repair_spec_analyze$/
    );
    expect(buildCheckpointRef(FEATURE_ID, 1, 'fast-implement')).toMatch(/\/0001-fast-implement$/);
  });

  it.each(['', '-x', 'a/b', 'a..b', 'with space', 'Implement', 'a\\b', 'x.lock', 'a~1'])(
    'rejects node name %j',
    (node) => {
      expect(() => buildCheckpointRef(FEATURE_ID, 1, node)).toThrow(InvalidCheckpointNameError);
    }
  );

  it.each(['', '-upload-pack', '../other', 'a/b', 'id with space'])(
    'rejects feature id %j',
    (featureId) => {
      expect(() => buildCheckpointRef(featureId, 1, 'implement')).toThrow(
        InvalidCheckpointNameError
      );
    }
  );

  it('rejects a negative or fractional sequence', () => {
    expect(() => buildCheckpointRef(FEATURE_ID, -1, 'implement')).toThrow(
      InvalidCheckpointNameError
    );
    expect(() => buildCheckpointRef(FEATURE_ID, 1.5, 'implement')).toThrow(
      InvalidCheckpointNameError
    );
  });
});

describe('featureCheckpointRefPrefix', () => {
  it('ends with a slash so one feature never matches another with a longer id', () => {
    expect(featureCheckpointRefPrefix(FEATURE_ID)).toBe(`${CHECKPOINT_REF_ROOT}/${FEATURE_ID}/`);
  });
});

describe('checkpointLabel', () => {
  it('is the last ref component', () => {
    expect(checkpointLabel(checkpoint(4, 'merge'))).toBe('0004-merge');
  });
});

describe('resolveCheckpointSelector', () => {
  const list = [
    checkpoint(0, 'baseline'),
    checkpoint(1, 'implement'),
    checkpoint(2, 'repair_research'),
    checkpoint(3, 'implement'),
  ];

  it('resolves a sequence number', () => {
    expect(resolveCheckpointSelector(list, '2').sequence).toBe(2);
    expect(resolveCheckpointSelector(list, '0').node).toBe('baseline');
  });

  it('resolves a node name to its latest checkpoint', () => {
    expect(resolveCheckpointSelector(list, 'implement').sequence).toBe(3);
  });

  it('resolves a label, padded or not', () => {
    expect(resolveCheckpointSelector(list, '0001-implement').sequence).toBe(1);
    expect(resolveCheckpointSelector(list, '1-implement').sequence).toBe(1);
  });

  it('trims surrounding whitespace', () => {
    expect(resolveCheckpointSelector(list, ' 2 ').sequence).toBe(2);
  });

  it.each(['9', 'merge', '0002-implement', ''])('throws for unknown selector %j', (selector) => {
    expect(() => resolveCheckpointSelector(list, selector)).toThrow(GitCheckpointNotFoundError);
  });
});

describe('previousCheckpoint', () => {
  const list = [checkpoint(0, 'baseline'), checkpoint(1, 'plan'), checkpoint(2, 'implement')];

  it('returns the checkpoint with the next-lower sequence', () => {
    expect(previousCheckpoint(list, list[2])?.sequence).toBe(1);
  });

  it('returns undefined for the first checkpoint', () => {
    expect(previousCheckpoint(list, list[0])).toBeUndefined();
  });

  it('does not depend on list order', () => {
    expect(previousCheckpoint([...list].reverse(), list[2])?.sequence).toBe(1);
  });
});
