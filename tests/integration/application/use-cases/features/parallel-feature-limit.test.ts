/**
 * Parallel-Feature Limit — End-to-End Integration
 *
 * Real SQLite, real repositories, real migrations. Only the process spawn and
 * git worktree are mocked, since those leave the machine.
 *
 * This is the test that proves the feature actually works: with a limit of 2 and
 * three features started, two spawn and the third waits; when a running feature
 * finishes, the third starts on its own with no user action. Mock-based unit
 * tests cannot show that, because the thing being verified is the interaction
 * between admission, persistence, and the drain.
 */

import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteFeatureRepository } from '@/infrastructure/repositories/sqlite-feature.repository.js';
import { SQLiteAgentRunRepository } from '@/infrastructure/repositories/agent-run.repository.js';
import { StartFeatureUseCase } from '@/application/use-cases/features/start-feature.use-case.js';
import { SpawnFeatureAgentUseCase } from '@/application/use-cases/features/spawn-feature-agent.use-case.js';
import { FeatureCapacityService } from '@/application/use-cases/features/capacity/feature-capacity.service.js';
import { AdmitQueuedFeaturesUseCase } from '@/application/use-cases/features/capacity/admit-queued-features.use-case.js';
import { GetParallelCapacityUseCase } from '@/application/use-cases/features/capacity/get-parallel-capacity.use-case.js';
import type { Feature, AgentRun } from '@/domain/generated/output.js';
import { SdlcLifecycle, AgentRunStatus, AgentType, BuildMode } from '@/domain/generated/output.js';

vi.mock('@/infrastructure/services/settings.service.js', () => ({
  getSettings: vi.fn().mockReturnValue({}),
}));

describe('parallel-feature limit (integration)', () => {
  let db: Database.Database;
  let featureRepo: SQLiteFeatureRepository;
  let runRepo: SQLiteAgentRunRepository;
  let spawn: ReturnType<typeof vi.fn>;
  let limit: number;

  let startFeature: StartFeatureUseCase;
  let admitQueued: AdmitQueuedFeaturesUseCase;
  let getCapacity: GetParallelCapacityUseCase;

  const repoPath = `/integration-tests/parallel-limit/${randomUUID()}`;

  const makeRun = (id: string): AgentRun => ({
    id,
    agentType: AgentType.ClaudeCode,
    agentName: 'feature-agent',
    status: AgentRunStatus.pending,
    prompt: 'Implement the feature',
    threadId: `thread-${id}`,
    createdAt: new Date('2026-02-01T00:00:00Z'),
    updatedAt: new Date('2026-02-01T00:00:00Z'),
  });

  const makeFeature = (id: string, overrides?: Partial<Feature>): Feature => ({
    id,
    name: id,
    slug: id,
    description: '',
    userQuery: 'do the thing',
    repositoryPath: repoPath,
    branch: `feat/${id}`,
    lifecycle: SdlcLifecycle.Pending,
    messages: [],
    relatedArtifacts: [],
    buildMode: BuildMode.Application,
    fast: false,
    push: false,
    openPr: false,
    forkAndPr: false,
    commitSpecs: true,
    ciWatchEnabled: true,
    enableEvidence: false,
    injectSkills: false,
    commitEvidence: false,
    approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
    agentRunId: `run-${id}`,
    specPath: `/wt/${id}/specs/001`,
    worktreePath: `/wt/${id}`,
    createdAt: new Date('2026-02-01T00:00:00Z'),
    updatedAt: new Date('2026-02-01T00:00:00Z'),
    ...overrides,
  });

  /** Seed a Pending feature plus its agent run. */
  async function seed(id: string, overrides?: Partial<Feature>): Promise<Feature> {
    await runRepo.create(makeRun(`run-${id}`));
    const feature = makeFeature(id, overrides);
    await featureRepo.create(feature);
    return feature;
  }

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    featureRepo = new SQLiteFeatureRepository(db);
    runRepo = new SQLiteAgentRunRepository(db);
    spawn = vi.fn().mockReturnValue(12345);
    limit = 2;

    // The limit is read through the settings port on every call, so mutating
    // `limit` between acts models a user changing it in Settings.
    const settingsRepository = {
      load: vi.fn(async () => ({ workflow: { maxParallelFeatures: limit } })),
    };
    const capacity = new FeatureCapacityService(featureRepo, settingsRepository as never);
    const spawnFeatureAgent = new SpawnFeatureAgentUseCase(
      featureRepo,
      runRepo,
      { spawn, isAlive: vi.fn(), checkAndMarkCrashed: vi.fn() } as never,
      { getWorktreePath: vi.fn().mockReturnValue('/wt/derived') } as never,
      settingsRepository as never,
      { execute: vi.fn().mockResolvedValue(undefined) } as never
    );

    startFeature = new StartFeatureUseCase(featureRepo, runRepo, spawnFeatureAgent, capacity);
    admitQueued = new AdmitQueuedFeaturesUseCase(featureRepo, capacity, spawnFeatureAgent);
    getCapacity = new GetParallelCapacityUseCase(capacity);
  });

  afterEach(() => {
    db.close();
  });

  it('starts up to the limit and queues the rest', async () => {
    await seed('a');
    await seed('b');
    await seed('c');

    const first = await startFeature.execute('a');
    const second = await startFeature.execute('b');
    const third = await startFeature.execute('c');

    expect(first.queued).toBe(false);
    expect(second.queued).toBe(false);
    expect(third.queued).toBe(true);
    expect(third.queuePosition).toBe(1);
    expect(spawn).toHaveBeenCalledTimes(2);

    const persisted = await featureRepo.findById('c');
    expect(persisted!.lifecycle).toBe(SdlcLifecycle.Pending);
    expect(persisted!.queuedAt).toBeInstanceOf(Date);
  });

  it('admits the queued feature automatically when a running one completes', async () => {
    await seed('a');
    await seed('b');
    await seed('c');
    await startFeature.execute('a');
    await startFeature.execute('b');
    await startFeature.execute('c');
    expect(spawn).toHaveBeenCalledTimes(2);

    // 'a' finishes and its slot frees.
    const a = (await featureRepo.findById('a'))!;
    await featureRepo.update({ ...a, lifecycle: SdlcLifecycle.Maintain, updatedAt: new Date() });

    const result = await admitQueued.execute();

    expect(result.admittedFeatureIds).toEqual(['c']);
    expect(spawn).toHaveBeenCalledTimes(3);

    const admitted = await featureRepo.findById('c');
    expect(admitted!.lifecycle).toBe(SdlcLifecycle.Requirements);
    expect(admitted!.queuedAt).toBeUndefined();
  });

  it('admits in FIFO order across separate start requests', async () => {
    await seed('a');
    await seed('b');
    await seed('queued-first');
    await seed('queued-second');
    await startFeature.execute('a');
    await startFeature.execute('b');
    await startFeature.execute('queued-first');
    await startFeature.execute('queued-second');

    const a = (await featureRepo.findById('a'))!;
    await featureRepo.update({ ...a, lifecycle: SdlcLifecycle.Maintain, updatedAt: new Date() });

    expect((await admitQueued.execute()).admittedFeatureIds).toEqual(['queued-first']);
  });

  it('drains the whole queue when the limit is set to unlimited', async () => {
    await seed('a');
    await seed('b');
    await seed('c');
    await seed('d');
    for (const id of ['a', 'b', 'c', 'd']) {
      await startFeature.execute(id);
    }
    expect((await getCapacity.execute()).queue).toHaveLength(2);

    limit = 0;
    const result = await admitQueued.execute();

    expect(result.admittedFeatureIds).toEqual(['c', 'd']);
    expect((await getCapacity.execute()).queue).toHaveLength(0);
  });

  it('never terminates a running feature when the limit is lowered below it', async () => {
    await seed('a');
    await seed('b');
    await startFeature.execute('a');
    await startFeature.execute('b');

    limit = 1;
    await admitQueued.execute();

    const snapshot = await getCapacity.execute();
    expect(snapshot.running).toBe(2);
    expect(snapshot.available).toBe(0);
    for (const id of ['a', 'b']) {
      expect((await featureRepo.findById(id))!.lifecycle).toBe(SdlcLifecycle.Requirements);
    }
  });

  it('leaves a user-deferred feature alone — it is Pending but not queued', async () => {
    await seed('a');
    await seed('b');
    await seed('deferred');
    await startFeature.execute('a');
    await startFeature.execute('b');
    // 'deferred' was never started: the user created it with --pending.

    const a = (await featureRepo.findById('a'))!;
    await featureRepo.update({ ...a, lifecycle: SdlcLifecycle.Maintain, updatedAt: new Date() });

    expect((await admitQueued.execute()).admittedFeatureIds).toEqual([]);
    expect((await featureRepo.findById('deferred'))!.lifecycle).toBe(SdlcLifecycle.Pending);
  });

  it('does not queue a feature blocked by its parent', async () => {
    await seed('a');
    await seed('b');
    await startFeature.execute('a');
    await startFeature.execute('b');

    const parent = await seed('parent', { lifecycle: SdlcLifecycle.Implementation });
    await seed('child', { parentId: parent.id });

    const result = await startFeature.execute('child');

    expect(result.blocked).toBe(true);
    expect(result.queued).toBe(false);
    expect((await featureRepo.findById('child'))!.queuedAt).toBeUndefined();
  });

  it('keeps a queued child waiting until BOTH gates open', async () => {
    await seed('a');
    await seed('b');
    await startFeature.execute('a');
    await startFeature.execute('b');

    // Parent is done, so the dependency gate is open — only capacity holds the
    // child back, and it queues.
    const parent = await seed('parent', { lifecycle: SdlcLifecycle.Maintain });
    await seed('child', { parentId: parent.id });
    expect((await startFeature.execute('child')).queued).toBe(true);

    // Parent regresses (its PR was reopened): the dependency gate closes again.
    await featureRepo.update({
      ...(await featureRepo.findById('parent'))!,
      lifecycle: SdlcLifecycle.Review,
      updatedAt: new Date(),
    });

    const a = (await featureRepo.findById('a'))!;
    await featureRepo.update({ ...a, lifecycle: SdlcLifecycle.Maintain, updatedAt: new Date() });

    // A slot is free, but the child must not start on an unlanded parent.
    expect((await admitQueued.execute()).admittedFeatureIds).toEqual([]);
    expect((await featureRepo.findById('child'))!.queuedAt).toBeInstanceOf(Date);
  });

  it('reports the capacity snapshot presentation renders from', async () => {
    await seed('a');
    await seed('b');
    await seed('c');
    await startFeature.execute('a');
    await startFeature.execute('b');
    await startFeature.execute('c');

    const snapshot = await getCapacity.execute();

    expect(snapshot).toMatchObject({ limit: 2, unlimited: false, running: 2, available: 0 });
    expect(snapshot.queue).toEqual([{ featureId: 'c', position: 1, queuedAt: expect.any(Date) }]);
  });
});
