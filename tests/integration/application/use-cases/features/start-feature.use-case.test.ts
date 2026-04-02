/**
 * StartFeatureUseCase Integration Tests
 *
 * Uses real SQLite repositories + migrations (no mocks for persistence) to verify
 * the full pending-to-running flow: create a feature in Pending state, verify
 * lifecycle, start it, verify transition and agent spawn.
 *
 * The IFeatureAgentProcessService and IWorktreeService are mocked since they
 * involve external process spawning and git operations.
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
import type { Feature, AgentRun } from '@/domain/generated/output.js';
import {
  SdlcLifecycle,
  AgentRunStatus,
  AgentType,
  FeatureMode,
} from '@/domain/generated/output.js';

function createMockProcessService() {
  return {
    spawn: vi.fn().mockReturnValue(12345),
    isAlive: vi.fn().mockReturnValue(false),
    checkAndMarkCrashed: vi.fn(),
  };
}

function createMockWorktreeService() {
  return {
    create: vi.fn(),
    remove: vi.fn(),
    prune: vi.fn(),
    list: vi.fn(),
    exists: vi.fn(),
    branchExists: vi.fn(),
    remoteBranchExists: vi.fn(),
    getWorktreePath: vi.fn().mockReturnValue('/wt/feat-test'),
    ensureGitRepository: vi.fn(),
    listBranches: vi.fn().mockResolvedValue([]),
  };
}

describe('StartFeatureUseCase (integration)', () => {
  let db: Database.Database;
  let featureRepo: SQLiteFeatureRepository;
  let runRepo: SQLiteAgentRunRepository;
  let processService: ReturnType<typeof createMockProcessService>;
  let worktreeService: ReturnType<typeof createMockWorktreeService>;
  let useCase: StartFeatureUseCase;
  let createdFeatureIds: string[] = [];
  let createdRunIds: string[] = [];

  const testRepoPath = `/integration-tests/start-feature/${randomUUID()}`;

  const createTestFeature = (overrides?: Partial<Feature>): Feature => ({
    id: `feat-${randomUUID()}`,
    name: 'Test Pending Feature',
    slug: `test-pending-${randomUUID()}`,
    description: 'A feature created in pending state',
    userQuery: 'test pending feature',
    repositoryPath: testRepoPath,
    branch: 'feat/test-pending',
    lifecycle: SdlcLifecycle.Pending,
    messages: [],
    relatedArtifacts: [],
    mode: FeatureMode.Regular,
    iterationCount: 0,
    push: false,
    openPr: false,
    forkAndPr: false,
    commitSpecs: true,
    ciWatchEnabled: true,
    enableEvidence: false,
    injectSkills: false,
    commitEvidence: false,
    approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
    specPath: '/wt/feat-test/specs/001-test',
    createdAt: new Date('2026-02-01T00:00:00Z'),
    updatedAt: new Date('2026-02-01T00:00:00Z'),
    ...overrides,
  });

  const createTestRun = (overrides?: Partial<AgentRun>): AgentRun => ({
    id: `run-${randomUUID()}`,
    agentType: AgentType.ClaudeCode,
    agentName: 'feature-agent',
    status: AgentRunStatus.pending,
    prompt: 'Implement the feature',
    threadId: `thread-${randomUUID()}`,
    createdAt: new Date('2026-02-01T00:00:00Z'),
    updatedAt: new Date('2026-02-01T00:00:00Z'),
    ...overrides,
  });

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    featureRepo = new SQLiteFeatureRepository(db);
    runRepo = new SQLiteAgentRunRepository(db);
    processService = createMockProcessService();
    worktreeService = createMockWorktreeService();
    useCase = new StartFeatureUseCase(
      featureRepo,
      runRepo,
      processService as any,
      worktreeService as any
    );
    createdFeatureIds = [];
    createdRunIds = [];
  });

  afterEach(() => {
    db.close();
  });

  // ---------------------------------------------------------------------------
  // Create pending → verify lifecycle is Pending, no agent spawn
  // ---------------------------------------------------------------------------

  it('should persist a Pending feature with no agent spawn', async () => {
    const run = createTestRun();
    const feature = createTestFeature({ agentRunId: run.id });
    createdFeatureIds.push(feature.id);
    createdRunIds.push(run.id);

    await runRepo.create(run);
    await featureRepo.create(feature);

    // Verify feature is persisted with Pending lifecycle
    const persisted = await featureRepo.findById(feature.id);
    expect(persisted).not.toBeNull();
    expect(persisted!.lifecycle).toBe(SdlcLifecycle.Pending);

    // Agent should NOT have been spawned (no one called start yet)
    expect(processService.spawn).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Start pending feature → lifecycle transitions to Requirements, agent spawned
  // ---------------------------------------------------------------------------

  it('should transition Pending feature to Requirements and spawn agent', async () => {
    const run = createTestRun();
    const feature = createTestFeature({ agentRunId: run.id });
    createdFeatureIds.push(feature.id);
    createdRunIds.push(run.id);

    await runRepo.create(run);
    await featureRepo.create(feature);

    const result = await useCase.execute(feature.id);

    // Verify returned feature has updated lifecycle
    expect(result.feature.lifecycle).toBe(SdlcLifecycle.Requirements);
    expect(result.agentRun).toBeDefined();
    expect(result.agentRun.id).toBe(run.id);

    // Verify persisted lifecycle was updated
    const updated = await featureRepo.findById(feature.id);
    expect(updated!.lifecycle).toBe(SdlcLifecycle.Requirements);

    // Verify agent was spawned
    expect(processService.spawn).toHaveBeenCalledOnce();
    expect(processService.spawn).toHaveBeenCalledWith(
      feature.id,
      run.id,
      feature.repositoryPath,
      feature.specPath,
      '/wt/feat-test',
      expect.objectContaining({
        threadId: run.threadId,
        push: false,
        openPr: false,
        agentType: AgentType.ClaudeCode,
      })
    );
  });

  // ---------------------------------------------------------------------------
  // Start pending fast feature → lifecycle transitions to Implementation
  // ---------------------------------------------------------------------------

  it('should transition fast Pending feature to Implementation', async () => {
    const run = createTestRun();
    const feature = createTestFeature({ agentRunId: run.id, mode: FeatureMode.Fast });
    createdFeatureIds.push(feature.id);
    createdRunIds.push(run.id);

    await runRepo.create(run);
    await featureRepo.create(feature);

    const result = await useCase.execute(feature.id);

    expect(result.feature.lifecycle).toBe(SdlcLifecycle.Implementation);

    const updated = await featureRepo.findById(feature.id);
    expect(updated!.lifecycle).toBe(SdlcLifecycle.Implementation);

    expect(processService.spawn).toHaveBeenCalledOnce();
    expect(processService.spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ mode: FeatureMode.Fast })
    );
  });

  // ---------------------------------------------------------------------------
  // Start pending feature with unmet parent → transitions to Blocked
  // ---------------------------------------------------------------------------

  it('should transition to Blocked when parent is not in POST_IMPLEMENTATION', async () => {
    const parentRun = createTestRun();
    const parentFeature = createTestFeature({
      agentRunId: parentRun.id,
      lifecycle: SdlcLifecycle.Requirements,
      name: 'Parent Feature',
    });

    const childRun = createTestRun();
    const childFeature = createTestFeature({
      agentRunId: childRun.id,
      parentId: parentFeature.id,
      name: 'Child Pending Feature',
    });

    createdFeatureIds.push(parentFeature.id, childFeature.id);
    createdRunIds.push(parentRun.id, childRun.id);

    await runRepo.create(parentRun);
    await runRepo.create(childRun);
    await featureRepo.create(parentFeature);
    await featureRepo.create(childFeature);

    const result = await useCase.execute(childFeature.id);

    // Child should be Blocked, not Requirements
    expect(result.feature.lifecycle).toBe(SdlcLifecycle.Blocked);

    const updated = await featureRepo.findById(childFeature.id);
    expect(updated!.lifecycle).toBe(SdlcLifecycle.Blocked);

    // Agent should NOT be spawned for blocked feature
    expect(processService.spawn).not.toHaveBeenCalled();
  });

  it('should transition to Requirements when parent IS in POST_IMPLEMENTATION', async () => {
    const parentRun = createTestRun();
    const parentFeature = createTestFeature({
      agentRunId: parentRun.id,
      lifecycle: SdlcLifecycle.Implementation,
      name: 'Parent Feature',
    });

    const childRun = createTestRun();
    const childFeature = createTestFeature({
      agentRunId: childRun.id,
      parentId: parentFeature.id,
      name: 'Child Pending Feature',
    });

    createdFeatureIds.push(parentFeature.id, childFeature.id);
    createdRunIds.push(parentRun.id, childRun.id);

    await runRepo.create(parentRun);
    await runRepo.create(childRun);
    await featureRepo.create(parentFeature);
    await featureRepo.create(childFeature);

    const result = await useCase.execute(childFeature.id);

    // Parent is in POST_IMPLEMENTATION (Implementation) → child starts normally
    expect(result.feature.lifecycle).toBe(SdlcLifecycle.Requirements);

    const updated = await featureRepo.findById(childFeature.id);
    expect(updated!.lifecycle).toBe(SdlcLifecycle.Requirements);

    expect(processService.spawn).toHaveBeenCalledOnce();
  });

  // ---------------------------------------------------------------------------
  // Start non-pending feature → throws clear error
  // ---------------------------------------------------------------------------

  it('should throw when trying to start a feature in Requirements state', async () => {
    const run = createTestRun();
    const feature = createTestFeature({
      agentRunId: run.id,
      lifecycle: SdlcLifecycle.Requirements,
    });
    createdFeatureIds.push(feature.id);
    createdRunIds.push(run.id);

    await runRepo.create(run);
    await featureRepo.create(feature);

    await expect(useCase.execute(feature.id)).rejects.toThrow(/not in Pending state/i);

    // Lifecycle should not have changed
    const unchanged = await featureRepo.findById(feature.id);
    expect(unchanged!.lifecycle).toBe(SdlcLifecycle.Requirements);

    expect(processService.spawn).not.toHaveBeenCalled();
  });

  it('should throw when trying to start a feature in Blocked state', async () => {
    const run = createTestRun();
    const feature = createTestFeature({
      agentRunId: run.id,
      lifecycle: SdlcLifecycle.Blocked,
    });
    createdFeatureIds.push(feature.id);
    createdRunIds.push(run.id);

    await runRepo.create(run);
    await featureRepo.create(feature);

    await expect(useCase.execute(feature.id)).rejects.toThrow(/not in Pending state/i);
    expect(processService.spawn).not.toHaveBeenCalled();
  });

  it('should throw when trying to start a feature in Implementation state', async () => {
    const run = createTestRun();
    const feature = createTestFeature({
      agentRunId: run.id,
      lifecycle: SdlcLifecycle.Implementation,
    });
    createdFeatureIds.push(feature.id);
    createdRunIds.push(run.id);

    await runRepo.create(run);
    await featureRepo.create(feature);

    await expect(useCase.execute(feature.id)).rejects.toThrow(/not in Pending state/i);
    expect(processService.spawn).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Feature not found
  // ---------------------------------------------------------------------------

  it('should throw when feature ID does not exist', async () => {
    await expect(useCase.execute('nonexistent-id')).rejects.toThrow(/not found/i);
    expect(processService.spawn).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // End-to-end pending-to-running flow
  // ---------------------------------------------------------------------------

  it('should complete the full pending-to-running flow', async () => {
    // 1. Create an AgentRun record (as CreateFeatureUseCase Phase 1 would)
    const run = createTestRun();
    await runRepo.create(run);

    // 2. Create a feature in Pending lifecycle (as CreateFeatureUseCase would with --pending)
    const feature = createTestFeature({
      agentRunId: run.id,
      lifecycle: SdlcLifecycle.Pending,
    });
    await featureRepo.create(feature);

    // 3. Verify initial state: Pending, no spawn
    const initial = await featureRepo.findById(feature.id);
    expect(initial!.lifecycle).toBe(SdlcLifecycle.Pending);
    expect(processService.spawn).not.toHaveBeenCalled();

    // 4. Start the feature (as `shep feat start <fid>` would)
    const result = await useCase.execute(feature.id);

    // 5. Verify transition
    expect(result.feature.lifecycle).toBe(SdlcLifecycle.Requirements);

    // 6. Verify persistence
    const final = await featureRepo.findById(feature.id);
    expect(final!.lifecycle).toBe(SdlcLifecycle.Requirements);
    expect(final!.updatedAt.getTime()).toBeGreaterThan(feature.createdAt.getTime());

    // 7. Verify agent was spawned
    expect(processService.spawn).toHaveBeenCalledOnce();

    // 8. Verify calling start again on the now-started feature fails
    await expect(useCase.execute(feature.id)).rejects.toThrow(/not in Pending state/i);

    // 9. Agent should still have been spawned only once
    expect(processService.spawn).toHaveBeenCalledOnce();
  });
});
