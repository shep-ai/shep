/**
 * Fixture data for the checkpoint components (spec 138): stories, the
 * Storybook action mock and unit tests share it.
 */

import { GitCheckpointKind, type GitCheckpoint } from '@shepai/core/domain/generated/output';
import type { FeatureCheckpointList } from '@shepai/core/application/use-cases/features/checkpoints/list-feature-checkpoints.use-case';
import type { FeatureCheckpointDiff } from '@shepai/core/application/use-cases/features/checkpoints/get-feature-checkpoint-diff.use-case';

const FEATURE_ID = 'feat-1';
const START = Date.parse('2026-10-11T09:00:00Z');
const MINUTE_MS = 60_000;

function checkpoint(
  sequence: number,
  node: string,
  kind: GitCheckpointKind,
  changes: [files: number, additions: number, deletions: number]
): GitCheckpoint {
  const at = new Date(START + sequence * 7 * MINUTE_MS);
  const label = `${String(sequence).padStart(4, '0')}-${node}`;
  return {
    id: `cp-${sequence}`,
    featureId: FEATURE_ID,
    agentRunId: 'run-1',
    sequence,
    kind,
    node,
    ref: `refs/shep/checkpoints/${FEATURE_ID}/${label}`,
    commitSha: `${sequence}a1b2c3d4e5f60718293a4b5c6d7e8f9012345678`.slice(0, 40),
    treeSha: `${sequence}f9e8d7c6b5a40312`,
    headSha: 'c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00',
    filesChanged: changes[0],
    additions: changes[1],
    deletions: changes[2],
    createdAt: at,
    updatedAt: at,
  };
}

export const fixtureCheckpoints: GitCheckpoint[] = [
  checkpoint(0, 'baseline', GitCheckpointKind.Baseline, [0, 0, 0]),
  checkpoint(1, 'analyze', GitCheckpointKind.Step, [2, 48, 0]),
  checkpoint(2, 'plan', GitCheckpointKind.Step, [3, 120, 6]),
  checkpoint(3, 'implement', GitCheckpointKind.Step, [9, 412, 37]),
  checkpoint(4, 'repair_research', GitCheckpointKind.Step, [1, 3, 2]),
];

export const fixtureCheckpointList: FeatureCheckpointList = {
  featureId: FEATURE_ID,
  featureName: 'Login page',
  checkpoints: fixtureCheckpoints,
};

export const fixtureCheckpointDiff: FeatureCheckpointDiff = {
  from: fixtureCheckpoints[3],
  to: fixtureCheckpoints[4],
  files: [
    {
      path: 'src/login.ts',
      status: 'modified',
      additions: 2,
      deletions: 1,
      hunks: [
        {
          header: '@@ -10,4 +10,5 @@ export function login(user: User) {',
          lines: [
            {
              type: 'context',
              content: '  const session = createSession(user);',
              oldNumber: 10,
              newNumber: 10,
            },
            { type: 'removed', content: '  return session;', oldNumber: 11 },
            { type: 'added', content: '  audit(user.id);', newNumber: 11 },
            { type: 'added', content: '  return session;', newNumber: 12 },
            { type: 'context', content: '}', oldNumber: 12, newNumber: 13 },
          ],
        },
      ],
    },
    {
      path: 'specs/042-login/research.yaml',
      status: 'modified',
      additions: 1,
      deletions: 1,
      hunks: [
        {
          header: '@@ -1,2 +1,2 @@',
          lines: [
            { type: 'removed', content: 'name: login', oldNumber: 1 },
            { type: 'added', content: 'name: login-page', newNumber: 1 },
            { type: 'context', content: 'decisions: []', oldNumber: 2, newNumber: 2 },
          ],
        },
      ],
    },
  ],
  filesChanged: 2,
  additions: 3,
  deletions: 2,
};
