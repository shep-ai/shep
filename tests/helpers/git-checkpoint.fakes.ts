/**
 * Test doubles for the two git checkpoint ports (spec 135).
 *
 * The repository fake keeps rows in memory and enforces UNIQUE(feature_id,
 * sequence) like the SQL does. The service double returns whatever tree the
 * test sets with `setTree`, so a use-case test can say "the worktree changed"
 * or "it did not" without git.
 */

import { vi, type Mock } from 'vitest';
import type { IGitCheckpointRepository } from '@/application/ports/output/repositories/git-checkpoint-repository.interface.js';
import type { IGitCheckpointService } from '@/application/ports/output/services/git-checkpoint-service.interface.js';
import type { GitCheckpoint } from '@/domain/generated/output.js';

export type FakeGitCheckpointRepository = { [K in keyof IGitCheckpointRepository]: Mock } & {
  rows: GitCheckpoint[];
};

export function createFakeGitCheckpointRepository(
  initial: GitCheckpoint[] = []
): FakeGitCheckpointRepository {
  const rows = [...initial];
  return {
    rows,
    create: vi.fn(async (checkpoint: GitCheckpoint) => {
      if (
        rows.some((r) => r.featureId === checkpoint.featureId && r.sequence === checkpoint.sequence)
      ) {
        throw new Error(
          'UNIQUE constraint failed: git_checkpoints.feature_id, git_checkpoints.sequence'
        );
      }
      rows.push(checkpoint);
    }),
    listByFeatureId: vi.fn(async (featureId: string) =>
      rows.filter((r) => r.featureId === featureId).sort((a, b) => a.sequence - b.sequence)
    ),
    deleteByFeatureId: vi.fn(async (featureId: string) => {
      const before = rows.length;
      for (let i = rows.length - 1; i >= 0; i--)
        if (rows[i].featureId === featureId) rows.splice(i, 1);
      return before - rows.length;
    }),
  };
}

export type MockGitCheckpointService = { [K in keyof IGitCheckpointService]: Mock } & {
  /** Set the tree the next snapshots return. */
  setTree(treeSha: string): void;
};

export function createMockGitCheckpointService(): MockGitCheckpointService {
  let tree = 'aaaa0001';
  let commits = 0;
  return {
    setTree: (t: string) => {
      tree = t;
    },
    snapshotWorktree: vi.fn(async () => ({ treeSha: tree, headSha: 'cafe0001' })),
    commitCheckpoint: vi.fn(async () =>
      `c0mm17${String(++commits).padStart(2, '0')}`.replace(/[^0-9a-f]/g, 'c')
    ),
    diffStat: vi.fn(async () => ({ filesChanged: 2, additions: 10, deletions: 3 })),
    diff: vi.fn(async () => []),
    restoreWorktree: vi.fn(async () => undefined),
    isLinkedWorktree: vi.fn(async () => true),
    deleteRefs: vi.fn(async () => 0),
  };
}
