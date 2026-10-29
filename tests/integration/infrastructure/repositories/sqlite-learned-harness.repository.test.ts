/**
 * SQLite learned-harness repositories (spec 150): every field round-trips,
 * exactly one version per scope is adopted, and reads never cross a scope.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteLearnedHarnessRepository } from '@/infrastructure/repositories/sqlite-learned-harness.repository.js';
import { SQLiteHarnessRefinementRepository } from '@/infrastructure/repositories/sqlite-harness-refinement.repository.js';
import {
  HarnessComponentKind,
  HarnessEditDimension,
  HarnessEditVerdict,
  HarnessOrigin,
  HarnessRecursion,
  HarnessRefinementStatus,
  LearnedHarnessStatus,
  LearningMode,
  LessonConfidence,
  MemoryScope,
  type HarnessEditRecord,
  type HarnessLesson,
  type HarnessRefinementRun,
  type HarnessVersionOutcome,
  type LearnedHarnessVersion,
} from '@/domain/generated/output.js';

const T0 = new Date('2026-10-01T10:00:00.000Z');
const REPO = '/repos/app';

function version(over: Partial<LearnedHarnessVersion> = {}): LearnedHarnessVersion {
  return {
    id: 'v1',
    scope: MemoryScope.Project,
    repositoryPath: REPO,
    spaceId: 'space-1',
    productLineId: 'line-1',
    status: LearnedHarnessStatus.Candidate,
    origin: HarnessOrigin.Reflect,
    components: [
      {
        kind: HarnessComponentKind.Skill,
        path: 'skills/db/SKILL.md',
        content: '---\nname: db\n---',
        sha256: 'abc',
      },
    ],
    notes: 'kept -> skills/db -> base runs forgot the down migration in 2/2',
    sourceFeatureId: 'feat-1',
    refinementRunId: 'run-1',
    createdAt: T0,
    updatedAt: T0,
    ...over,
  };
}

describe('SQLiteLearnedHarnessRepository', () => {
  let db: Database.Database;
  let repo: SQLiteLearnedHarnessRepository;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    repo = new SQLiteLearnedHarnessRepository(db);
  });

  afterEach(() => db.close());

  it('round-trips every version field', async () => {
    const v = version({ parentVersionId: 'v0', statusReason: 'r' });
    await repo.createVersion(v);
    expect(await repo.findVersion('v1')).toEqual(v);
    expect(await repo.findVersion('missing')).toBeNull();
  });

  it('round-trips a version without optional fields', async () => {
    const v = version({
      spaceId: undefined,
      productLineId: undefined,
      notes: undefined,
      sourceFeatureId: undefined,
      refinementRunId: undefined,
    });
    await repo.createVersion(v);
    expect(await repo.findVersion('v1')).toEqual(v);
  });

  it('keeps exactly one adopted version per scope placement', async () => {
    await repo.createVersion(version({ id: 'v1' }));
    await repo.createVersion(version({ id: 'v2', parentVersionId: 'v1' }));
    await repo.adopt('v1');
    await repo.adopt('v2');
    expect((await repo.findVersion('v1'))?.status).toBe(LearnedHarnessStatus.Superseded);
    expect((await repo.findVersion('v2'))?.status).toBe(LearnedHarnessStatus.Adopted);
    expect((await repo.findAdopted({ repositoryPath: REPO }))?.id).toBe('v2');
  });

  it('prefers the repository version, then the product line, then the space', async () => {
    await repo.createVersion(
      version({ id: 'space', scope: MemoryScope.Space, repositoryPath: '/other' })
    );
    await repo.createVersion(
      version({ id: 'line', scope: MemoryScope.ProductLine, repositoryPath: '/other2' })
    );
    await repo.adopt('space');
    await repo.adopt('line');
    const scope = { repositoryPath: REPO, spaceId: 'space-1', productLineId: 'line-1' };
    expect((await repo.findAdopted(scope))?.id).toBe('line');
    await repo.createVersion(version({ id: 'own' }));
    await repo.adopt('own');
    expect((await repo.findAdopted(scope))?.id).toBe('own');
    expect((await repo.findAdopted({ repositoryPath: REPO }))?.id).toBe('own');
  });

  it('never returns another space or repository', async () => {
    await repo.createVersion(version({ id: 'v1', scope: MemoryScope.Space }));
    await repo.adopt('v1');
    expect(await repo.findAdopted({ repositoryPath: '/elsewhere', spaceId: 'space-2' })).toBeNull();
    await repo.createVersion(version({ id: 'v2', repositoryPath: '/repos/b' }));
    await repo.adopt('v2');
    expect((await repo.findAdopted({ repositoryPath: REPO }))?.id).toBeUndefined();
  });

  it('updates status with a reason and lists versions newest first', async () => {
    await repo.createVersion(version({ id: 'old', createdAt: T0 }));
    await repo.createVersion(version({ id: 'new', createdAt: new Date(T0.getTime() + 1000) }));
    await repo.updateStatus('old', LearnedHarnessStatus.Rejected, 'too much always-on text');
    const old = await repo.findVersion('old');
    expect(old?.status).toBe(LearnedHarnessStatus.Rejected);
    expect(old?.statusReason).toBe('too much always-on text');
    expect((await repo.listVersions(REPO)).map((v) => v.id)).toEqual(['new', 'old']);
    expect((await repo.listVersions(REPO, 1)).map((v) => v.id)).toEqual(['new']);
  });

  it('round-trips edit records and lessons, scoped', async () => {
    const edit: HarnessEditRecord = {
      id: 'e1',
      versionId: 'v1',
      refinementRunId: 'run-1',
      dimension: HarnessEditDimension.Inv,
      componentPath: 'skills/db/SKILL.md',
      change: 'added a checklist',
      observed: 'untested',
      verdict: HarnessEditVerdict.Untested,
      createdAt: T0,
      updatedAt: T0,
    };
    await repo.createEditRecords([edit]);
    expect(await repo.listEditRecords('v1')).toEqual([edit]);

    const lesson: HarnessLesson = {
      id: 'l1',
      scope: MemoryScope.Project,
      repositoryPath: REPO,
      spaceId: 'space-1',
      cue: 'a migration adds a NOT NULL column',
      lesson: 'add a skill writing the backfill first',
      evidence: 'row e1',
      confidence: LessonConfidence.Low,
      sourceFeatureId: 'feat-1',
      versionId: 'v1',
      createdAt: T0,
      updatedAt: T0,
    };
    await repo.createLesson(lesson);
    await repo.createLesson({
      ...lesson,
      id: 'l2',
      scope: MemoryScope.Space,
      repositoryPath: '/repos/b',
    });
    await repo.createLesson({
      ...lesson,
      id: 'l3',
      repositoryPath: '/repos/c',
      spaceId: 'space-9',
    });
    const ids = (await repo.listLessons({ repositoryPath: REPO, spaceId: 'space-1' })).map(
      (l) => l.id
    );
    expect(ids.sort()).toEqual(['l1', 'l2']);
    expect((await repo.listLessons({ repositoryPath: REPO }))[0]).toEqual(lesson);
  });
});

describe('SQLiteHarnessRefinementRepository', () => {
  let db: Database.Database;
  let repo: SQLiteHarnessRefinementRepository;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    repo = new SQLiteHarnessRefinementRepository(db);
  });

  afterEach(() => db.close());

  const run: HarnessRefinementRun = {
    id: 'run-1',
    featureId: 'feat-1',
    repositoryPath: REPO,
    mode: LearningMode.Explore,
    recursion: HarnessRecursion.Parallel,
    k: 1,
    rollouts: 0,
    sessions: 0,
    costUsd: 0,
    status: HarnessRefinementStatus.Running,
    createdAt: T0,
    updatedAt: T0,
  };

  it('round-trips and updates a run', async () => {
    await repo.createRun(run);
    expect(await repo.findRun('run-1')).toEqual(run);
    const done: HarnessRefinementRun = {
      ...run,
      rollouts: 4,
      sessions: 3,
      costUsd: 3.25,
      status: HarnessRefinementStatus.Proposed,
      candidateVersionId: 'v1',
      chosenLabel: 'agg1',
      selectionReason: 'single final',
      error: 'none',
    };
    await repo.updateRun(done);
    const found = await repo.findRun('run-1');
    expect({ ...found, updatedAt: T0 }).toEqual(done);
    expect((await repo.listRunsByFeature('feat-1')).map((r) => r.id)).toEqual(['run-1']);
  });

  it('upserts one outcome per version and feature', async () => {
    const outcome: HarnessVersionOutcome = {
      id: 'o1',
      versionId: 'v1',
      featureId: 'feat-1',
      ciFixAttempts: 2,
      gateRejections: 1,
      validationRepairs: 0,
      numTurns: 30,
      costUsd: 1.5,
      merged: true,
      createdAt: T0,
      updatedAt: T0,
    };
    await repo.upsertOutcome(outcome);
    await repo.upsertOutcome({ ...outcome, id: 'o2', ciFixAttempts: 0, merged: false });
    const rows = await repo.listOutcomes('v1');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'o1', ciFixAttempts: 0, merged: false });
  });
});
