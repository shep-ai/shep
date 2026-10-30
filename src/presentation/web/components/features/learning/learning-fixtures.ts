/** Fixtures for Learning page stories and tests (spec 150). */

import {
  HarnessComponentKind,
  HarnessEditDimension,
  HarnessEditVerdict,
  HarnessOrigin,
  HarnessVersionTrend,
  LearnedHarnessStatus,
  LessonConfidence,
  MemoryScope,
  type HarnessEditRecord,
  type HarnessLesson,
  type LearnedHarnessVersion,
} from '@shepai/core/domain/generated/output';
import type {
  HarnessHistory,
  HarnessVersionDetail,
  HarnessVersionEntry,
  LearningRepositoryOption,
} from './learning-types';

const REPO = '/Users/dev/shop';
const T0 = new Date('2026-10-01T10:00:00Z');
const day = (n: number) => new Date(T0.getTime() + n * 86_400_000);

const SKILL =
  '---\nname: migrations\ndescription: Add a database column safely\n---\n1. Backfill first.';

function version(over: Partial<LearnedHarnessVersion>): LearnedHarnessVersion {
  return {
    id: 'v0000000-base',
    scope: MemoryScope.Project,
    repositoryPath: REPO,
    status: LearnedHarnessStatus.Superseded,
    origin: HarnessOrigin.Reflect,
    components: [
      {
        kind: HarnessComponentKind.Guardrails,
        path: 'guardrails.md',
        content: 'Never edit generated files; regenerate them.',
        sha256: 'a',
      },
    ],
    createdAt: day(0),
    updatedAt: day(0),
    ...over,
  };
}

const edit = (versionId: string, verdict: HarnessEditVerdict): HarnessEditRecord => ({
  id: `e-${versionId}-${verdict}`,
  versionId,
  refinementRunId: 'run-1',
  dimension: HarnessEditDimension.Dom,
  componentPath: 'skills/migrations/SKILL.md',
  change: 'Added a migration checklist skill',
  observed: 'CI-fix attempt 2 failed on a missing backfill',
  verdict,
  createdAt: day(2),
  updatedAt: day(2),
});

const METRICS = {
  count: 6,
  mergeRate: 0.83,
  meanCiFixAttempts: 0.5,
  meanGateRejections: 0.2,
  meanValidationRepairs: 0,
  meanNumTurns: 42,
  meanCostUsd: 3.1,
};

export const ADOPTED = version({
  id: 'b1f2c3d4-adopted',
  status: LearnedHarnessStatus.Adopted,
  origin: HarnessOrigin.Explore,
  parentVersionId: 'v0000000-base',
  components: [
    ...version({}).components,
    {
      kind: HarnessComponentKind.Skill,
      path: 'skills/migrations/SKILL.md',
      content: SKILL,
      sha256: 'b',
    },
  ],
  notes: 'Kept agg1: the migrations skill fixed the backfill failures.',
  createdAt: day(2),
  updatedAt: day(3),
});

export const CANDIDATE = version({
  id: 'c9d8e7f6-candidate',
  status: LearnedHarnessStatus.Candidate,
  origin: HarnessOrigin.Reflect,
  parentVersionId: ADOPTED.id,
  components: [
    ...ADOPTED.components,
    {
      kind: HarnessComponentKind.Script,
      path: 'scripts/check_migrations.sh',
      content: 'pnpm db:check',
      sha256: 'c',
    },
  ],
  createdAt: day(5),
  updatedAt: day(5),
});

const entry = (
  v: LearnedHarnessVersion,
  trend: HarnessVersionTrend,
  edits: HarnessEditRecord[] = []
): HarnessVersionEntry => ({ version: v, metrics: METRICS, trend, relativeChange: -0.2, edits });

export const LESSON: HarnessLesson = {
  id: 'l1',
  scope: MemoryScope.Project,
  repositoryPath: REPO,
  cue: 'A feature adds a NOT NULL column',
  lesson: 'Add a skill that writes the backfill before the constraint',
  evidence: 'Explore run on feature "Audit log": agg1 passed, base1 failed CI twice',
  confidence: LessonConfidence.Medium,
  sourceFeatureId: 'feat-1',
  versionId: ADOPTED.id,
  createdAt: day(3),
  updatedAt: day(3),
};

export const HISTORY: HarnessHistory = {
  repositoryPath: REPO,
  currentVersionId: ADOPTED.id,
  versions: [
    entry(CANDIDATE, HarnessVersionTrend.InsufficientData, [
      edit(CANDIDATE.id, HarnessEditVerdict.Untested),
    ]),
    entry(ADOPTED, HarnessVersionTrend.Improved, [edit(ADOPTED.id, HarnessEditVerdict.Helped)]),
    entry(version({}), HarnessVersionTrend.Regressed),
  ],
  lessons: [LESSON],
};

export const EMPTY_HISTORY: HarnessHistory = { repositoryPath: REPO, versions: [], lessons: [] };

export const CANDIDATE_DETAIL: HarnessVersionDetail = {
  version: CANDIDATE,
  base: ADOPTED,
  diff: {
    added: ['scripts/check_migrations.sh'],
    removed: [],
    modified: [],
    kept: ['guardrails.md', 'skills/migrations/SKILL.md'],
  },
  diffText: '+ scripts/check_migrations.sh\npnpm db:check',
  edits: [edit(CANDIDATE.id, HarnessEditVerdict.Untested)],
};

export const REPOSITORIES: LearningRepositoryOption[] = [
  { path: REPO, name: 'shop' },
  { path: '/Users/dev/api', name: 'api' },
];
