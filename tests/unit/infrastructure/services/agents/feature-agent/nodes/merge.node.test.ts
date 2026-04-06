/**
 * Merge Node Unit Tests (Agent-Driven)
 *
 * Tests for the rewritten merge node which uses IAgentExecutor
 * instead of IGitPrService for commit/push/PR/merge operations.
 *
 * Covers:
 * - Two agent executor calls with correct prompts
 * - Conditional push/PR logic
 * - Approval gate behavior (interrupt when !allowMerge)
 * - Feature lifecycle update after merge
 * - Error handling (re-throw for LangGraph checkpoint/resume)
 *
 * TDD Phase: RED → GREEN
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Suppress logger output
vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

const {
  mockInterrupt,
  mockShouldInterrupt,
  mockGetCompletedPhases,
  mockClearCompletedPhase,
  mockMarkPhaseComplete,
  mockRecordPhaseStart,
  mockRecordPhaseEnd,
  mockRecordApprovalWaitStart,
  mockBuildCommitPushPrPrompt,
  mockBuildLocalSquashMergePrompt,
  mockParseCommitHash,
  mockParsePrUrl,
  mockCleanupExecute,
} = vi.hoisted(() => ({
  mockInterrupt: vi.fn(),
  mockShouldInterrupt: vi.fn().mockReturnValue(false),
  mockGetCompletedPhases: vi.fn().mockReturnValue([]),
  mockClearCompletedPhase: vi.fn(),
  mockMarkPhaseComplete: vi.fn(),
  mockRecordPhaseStart: vi.fn().mockResolvedValue('timing-123'),
  mockRecordPhaseEnd: vi.fn().mockResolvedValue(undefined),
  mockRecordApprovalWaitStart: vi.fn().mockResolvedValue(undefined),
  mockBuildCommitPushPrPrompt: vi.fn().mockReturnValue('commit-push-pr prompt'),
  mockBuildLocalSquashMergePrompt: vi.fn().mockReturnValue('local-squash-merge-conflict prompt'),
  mockParseCommitHash: vi.fn().mockReturnValue('abc1234'),
  mockParsePrUrl: vi
    .fn()
    .mockReturnValue({ url: 'https://github.com/test/repo/pull/42', number: 42 }),
  mockCleanupExecute: vi.fn().mockResolvedValue(undefined),
}));

// Mock LangGraph interrupt
vi.mock('@langchain/langgraph', () => ({
  interrupt: mockInterrupt,
  isGraphBubbleUp: vi.fn().mockReturnValue(false),
}));

// Mock node-helpers
vi.mock('@/infrastructure/services/agents/feature-agent/nodes/node-helpers.js', () => ({
  createNodeLogger: () => ({
    activate: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  }),
  readSpecFile: vi.fn().mockReturnValue('name: Test Feature\ndescription: A test\n'),
  shouldInterrupt: mockShouldInterrupt,
  getCompletedPhases: mockGetCompletedPhases,
  clearCompletedPhase: mockClearCompletedPhase,
  markPhaseComplete: mockMarkPhaseComplete,
  retryExecute: vi
    .fn()
    .mockImplementation(
      async (executor: { execute: (p: string) => Promise<unknown> }, prompt: string) => {
        return executor.execute(prompt);
      }
    ),
  buildExecutorOptions: vi.fn().mockReturnValue({ cwd: '/tmp/worktree', maxTurns: 50 }),
}));

// Mock heartbeat
vi.mock('@/infrastructure/services/agents/feature-agent/heartbeat.js', () => ({
  reportNodeStart: vi.fn(),
}));

// Mock phase timing
vi.mock('@/infrastructure/services/agents/feature-agent/phase-timing-context.js', () => ({
  recordPhaseStart: mockRecordPhaseStart,
  recordPhaseEnd: mockRecordPhaseEnd,
  recordApprovalWaitStart: mockRecordApprovalWaitStart,
  updatePhasePrompt: vi.fn().mockResolvedValue(undefined),
}));

// Mock lifecycle context
vi.mock('@/infrastructure/services/agents/feature-agent/lifecycle-context.js', () => ({
  updateNodeLifecycle: vi.fn().mockResolvedValue(undefined),
}));

// Mock prompt builders
vi.mock('@/infrastructure/services/agents/feature-agent/nodes/prompts/merge-prompts.js', () => ({
  buildCommitPushPrPrompt: mockBuildCommitPushPrPrompt,
  buildLocalSquashMergePrompt: mockBuildLocalSquashMergePrompt,
}));

// Mock output parser
vi.mock(
  '@/infrastructure/services/agents/feature-agent/nodes/merge/merge-output-parser.js',
  () => ({
    parseCommitHash: mockParseCommitHash,
    parsePrUrl: mockParsePrUrl,
  })
);

// Mock settings service — required by CI watch/fix loop when push || openPr is true
vi.mock('@/infrastructure/services/settings.service.js', () => ({
  getSettings: vi.fn().mockReturnValue({
    workflow: { ciMaxFixAttempts: 3, ciWatchTimeoutMs: 600_000, ciLogMaxChars: 50_000 },
  }),
}));

import {
  createMergeNode,
  type MergeNodeDeps,
} from '@/infrastructure/services/agents/feature-agent/nodes/merge/merge.node.js';
import type { FeatureAgentState } from '@/infrastructure/services/agents/feature-agent/state.js';
import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import {
  GitPrError,
  GitPrErrorCode,
  type DiffSummary,
} from '@/application/ports/output/services/git-pr-service.interface.js';

function createMockExecutor(): IAgentExecutor {
  return {
    agentType: 'claude-code' as never,
    execute: vi.fn().mockResolvedValue({ result: 'Agent completed all operations successfully' }),
    executeStream: vi.fn(),
    supportsFeature: vi.fn().mockReturnValue(false),
  };
}

function createMockFeatureRepo(): MergeNodeDeps['featureRepository'] {
  let current: Record<string, unknown> = {
    id: 'feat-001',
    lifecycle: 'Implementation',
    branch: 'feat/test',
  };
  return {
    findById: vi.fn(async () => ({ ...current })),
    update: vi.fn(async (data: Record<string, unknown>) => {
      current = { ...current, ...data };
    }),
  } as any;
}

function createMockGetDiffSummary(): MergeNodeDeps['getDiffSummary'] {
  return vi.fn().mockResolvedValue({
    filesChanged: 5,
    additions: 100,
    deletions: 20,
    commitCount: 3,
  } satisfies DiffSummary);
}

function baseDeps(overrides?: Partial<MergeNodeDeps>): MergeNodeDeps {
  return {
    executor: createMockExecutor(),
    getDiffSummary: createMockGetDiffSummary(),
    hasRemote: vi.fn().mockResolvedValue(true),
    getDefaultBranch: vi.fn().mockResolvedValue('main'),
    featureRepository: createMockFeatureRepo(),
    verifyMerge: vi.fn().mockResolvedValue(true),
    revParse: vi.fn().mockResolvedValue('premerge-sha-abc'),
    localMergeSquash: vi.fn().mockResolvedValue(undefined),
    gitPrService: {
      getCiStatus: vi.fn().mockResolvedValue({ status: 'success', runUrl: null }),
      watchCi: vi.fn().mockResolvedValue({ status: 'success' }),
      getFailureLogs: vi.fn().mockResolvedValue(''),
      mergePr: vi.fn().mockResolvedValue(undefined),
      getRemoteUrl: vi.fn().mockResolvedValue('https://github.com/test-owner/test-repo'),
      listPrStatuses: vi.fn().mockResolvedValue([
        {
          number: 42,
          state: 'Open',
          url: 'https://github.com/test/repo/pull/42',
          headRefName: 'feat/test',
        },
      ]),
      getMergeableStatus: vi.fn().mockResolvedValue(undefined),
    } as any,
    cleanupFeatureWorktreeUseCase: { execute: mockCleanupExecute } as any,
    ...overrides,
  };
}

function baseState(overrides: Partial<FeatureAgentState> = {}): FeatureAgentState {
  return {
    featureId: 'feat-001',
    repositoryPath: '/tmp/repo',
    worktreePath: '/tmp/worktree',
    specDir: '/tmp/specs',
    currentNode: 'implement',
    error: null,
    messages: [],
    approvalGates: undefined,
    validationRetries: 0,
    lastValidationTarget: '',
    lastValidationErrors: [],
    prUrl: null,
    prNumber: null,
    commitHash: null,
    ciStatus: null,
    push: false,
    openPr: false,
    ...overrides,
  } as FeatureAgentState;
}

describe('createMergeNode (agent-driven)', () => {
  let deps: MergeNodeDeps;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = baseDeps();
  });

  // --- Agent executor calls ---
  describe('agent executor calls', () => {
    it('should make first agent call with commit-push-pr prompt', async () => {
      const node = createMergeNode(deps);
      const state = baseState();
      await node(state);

      expect(mockBuildCommitPushPrPrompt).toHaveBeenCalledWith(
        expect.objectContaining({ featureId: 'feat-001' }),
        expect.any(String),
        'main',
        'https://github.com/test-owner/test-repo'
      );
      // retryExecute wraps executor.execute — verify it was called via the mock
      expect(deps.executor.execute).toHaveBeenCalledWith('commit-push-pr prompt');
    });

    it('should parse commit hash and PR URL from first agent call result', async () => {
      const node = createMergeNode(deps);
      const state = baseState();
      const result = await node(state);

      expect(mockParseCommitHash).toHaveBeenCalledWith(
        'Agent completed all operations successfully'
      );
      expect(result.commitHash).toBe('abc1234');
    });

    it('should parse PR URL from first call when openPr=true', async () => {
      const node = createMergeNode(deps);
      const state = baseState({ openPr: true });
      const result = await node(state);

      expect(mockParsePrUrl).toHaveBeenCalled();
      expect(result.prUrl).toBe('https://github.com/test/repo/pull/42');
      expect(result.prNumber).toBe(42);
    });

    it('should cross-validate agent-parsed PR URL against listPrStatuses and use authoritative data', async () => {
      // Agent outputs a hallucinated/wrong PR URL
      mockParsePrUrl.mockReturnValueOnce({
        url: 'https://github.com/wrong-org/wrong-repo/pull/699',
        number: 699,
      });

      // gitPrService.listPrStatuses returns the real PR for this branch
      const depsWithPrList = baseDeps({
        gitPrService: {
          ...deps.gitPrService,
          listPrStatuses: vi.fn().mockResolvedValue([
            {
              number: 333,
              state: 'Open',
              url: 'https://github.com/test-owner/test-repo/pull/333',
              headRefName: 'feat/test',
            },
          ]),
        } as any,
      });

      const node = createMergeNode(depsWithPrList);
      const state = baseState({ openPr: true });
      const result = await node(state);

      // Should use the authoritative PR data, NOT the agent-parsed URL
      expect(result.prUrl).toBe('https://github.com/test-owner/test-repo/pull/333');
      expect(result.prNumber).toBe(333);
    });

    it('should fall back to agent-parsed PR URL when listPrStatuses finds no matching PR', async () => {
      // gitPrService.listPrStatuses returns PRs but none match the branch
      const depsWithEmptyPrList = baseDeps({
        gitPrService: {
          ...deps.gitPrService,
          listPrStatuses: vi.fn().mockResolvedValue([
            {
              number: 100,
              state: 'Open',
              url: 'https://github.com/test-owner/test-repo/pull/100',
              headRefName: 'feat/other-branch',
            },
          ]),
        } as any,
      });

      const node = createMergeNode(depsWithEmptyPrList);
      const state = baseState({ openPr: true });
      const result = await node(state);

      // No matching PR found — fall back to agent-parsed URL
      expect(result.prUrl).toBe('https://github.com/test/repo/pull/42');
      expect(result.prNumber).toBe(42);
    });

    it('should fall back to agent-parsed PR URL when listPrStatuses throws', async () => {
      // gitPrService.listPrStatuses fails (e.g., gh not installed)
      const depsWithFailingPrList = baseDeps({
        gitPrService: {
          ...deps.gitPrService,
          listPrStatuses: vi.fn().mockRejectedValue(new Error('gh: command not found')),
        } as any,
      });

      const node = createMergeNode(depsWithFailingPrList);
      const state = baseState({ openPr: true });
      const result = await node(state);

      // Should gracefully fall back to agent-parsed URL
      expect(result.prUrl).toBe('https://github.com/test/repo/pull/42');
      expect(result.prNumber).toBe(42);
    });

    it('should use gitPrService.mergePr when PR exists and allowMerge=true', async () => {
      const node = createMergeNode(deps);
      const state = baseState({
        openPr: true,
        prUrl: 'https://github.com/test/repo/pull/42',
        prNumber: 42,
        approvalGates: { allowPrd: false, allowPlan: false, allowMerge: true },
      });
      await node(state);

      // PR merge via service — no local merge needed
      expect(deps.gitPrService.mergePr).toHaveBeenCalledWith('/tmp/worktree', 42, 'squash');
      expect(deps.localMergeSquash).not.toHaveBeenCalled();
      // Only one executor call for commit/push/PR
      expect(deps.executor.execute).toHaveBeenCalledTimes(1);
    });

    it('should use programmatic localMergeSquash when no PR and allowMerge=true', async () => {
      // openPr defaults to false → parsePrUrl is never called → prUrl stays null → local merge path
      const node = createMergeNode(deps);
      const state = baseState({
        approvalGates: { allowPrd: false, allowPlan: false, allowMerge: true },
      });
      await node(state);

      expect(deps.localMergeSquash).toHaveBeenCalledWith(
        '/tmp/repo',
        'feat/test',
        'main',
        expect.stringContaining('squash merge'),
        true
      );
      // Only one executor call for commit/push/PR — local merge is programmatic
      expect(deps.executor.execute).toHaveBeenCalledTimes(1);
    });

    it('should NOT make second agent call when allowMerge is not true', async () => {
      const node = createMergeNode(deps);
      const state = baseState();
      await node(state);

      // Only one call for commit/push/PR
      expect(deps.executor.execute).toHaveBeenCalledTimes(1);
      expect(deps.localMergeSquash).not.toHaveBeenCalled();
    });

    it('should pass hasRemote=false to localMergeSquash when no remote configured', async () => {
      mockParsePrUrl.mockReturnValueOnce(null);
      const noRemoteDeps = baseDeps({ hasRemote: vi.fn().mockResolvedValue(false) });
      const node = createMergeNode(noRemoteDeps);
      const state = baseState({
        push: true,
        openPr: true,
        approvalGates: { allowPrd: false, allowPlan: false, allowMerge: true },
      });
      await node(state);

      expect(noRemoteDeps.localMergeSquash).toHaveBeenCalledWith(
        '/tmp/repo',
        expect.any(String),
        'main',
        expect.any(String),
        false
      );
    });

    it('should pass hasRemote=true to localMergeSquash when remote is configured', async () => {
      // openPr defaults to false → parsePrUrl is never called → prUrl stays null → local merge path
      const node = createMergeNode(deps);
      const state = baseState({
        approvalGates: { allowPrd: false, allowPlan: false, allowMerge: true },
      });
      await node(state);

      expect(deps.localMergeSquash).toHaveBeenCalledWith(
        '/tmp/repo',
        expect.any(String),
        'main',
        expect.any(String),
        true
      );
    });
  });

  // --- Conditional push/PR logic ---
  describe('conditional push/PR logic', () => {
    it('should pass push=false state to prompt builder when push=false and openPr=false', async () => {
      const node = createMergeNode(deps);
      const state = baseState({ push: false, openPr: false });
      await node(state);

      expect(mockBuildCommitPushPrPrompt).toHaveBeenCalledWith(
        expect.objectContaining({ push: false, openPr: false }),
        expect.any(String),
        'main',
        'https://github.com/test-owner/test-repo'
      );
    });

    it('should pass push=true state to prompt builder when push=true', async () => {
      const node = createMergeNode(deps);
      const state = baseState({ push: true });
      await node(state);

      expect(mockBuildCommitPushPrPrompt).toHaveBeenCalledWith(
        expect.objectContaining({ push: true }),
        expect.any(String),
        'main',
        'https://github.com/test-owner/test-repo'
      );
    });

    it('should pass openPr=true state to prompt builder when openPr=true', async () => {
      const node = createMergeNode(deps);
      const state = baseState({ openPr: true });
      await node(state);

      expect(mockBuildCommitPushPrPrompt).toHaveBeenCalledWith(
        expect.objectContaining({ openPr: true }),
        expect.any(String),
        'main',
        'https://github.com/test-owner/test-repo'
      );
    });

    it('should override push and openPr to false when no remote is configured', async () => {
      const noRemoteDeps = baseDeps({ hasRemote: vi.fn().mockResolvedValue(false) });
      const node = createMergeNode(noRemoteDeps);
      const state = baseState({ push: true, openPr: true });
      await node(state);

      expect(mockBuildCommitPushPrPrompt).toHaveBeenCalledWith(
        expect.objectContaining({ push: false, openPr: false }),
        expect.any(String),
        'main',
        undefined
      );
      expect(mockParsePrUrl).not.toHaveBeenCalled();
    });

    it('should NOT parse prUrl when openPr=false', async () => {
      const node = createMergeNode(deps);
      const state = baseState({ openPr: false });
      const result = await node(state);

      expect(mockParsePrUrl).not.toHaveBeenCalled();
      expect(result.prUrl).toBeNull();
      expect(result.prNumber).toBeNull();
    });
  });

  // --- Approval gate behavior ---
  describe('approval gate (interrupt)', () => {
    it('should interrupt with diff summary when shouldInterrupt returns true', async () => {
      mockShouldInterrupt.mockReturnValueOnce(true);
      const node = createMergeNode(deps);
      const state = baseState({
        approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
      });
      await node(state);

      expect(deps.getDiffSummary).toHaveBeenCalledWith('/tmp/worktree', 'main');
      expect(mockInterrupt).toHaveBeenCalledWith(
        expect.objectContaining({
          node: 'merge',
          diffSummary: expect.objectContaining({ filesChanged: 5 }),
        })
      );
    });

    it('should NOT treat first run as resume when lifecycle was set to Review by updateNodeLifecycle', async () => {
      // BUG REPRO: updateNodeLifecycle('merge') sets lifecycle=Review in DB BEFORE
      // the resume detection check at line 73-76. This causes isResumeAfterInterrupt=true
      // on a first run, bypassing the approval gate entirely.
      //
      // Simulate: feature repo returns lifecycle=Review (as if updateNodeLifecycle just ran)
      const featureRepo = createMockFeatureRepo();
      (featureRepo.update as any)({ lifecycle: 'Review' });
      const depsWithReview = baseDeps({ featureRepository: featureRepo });

      // shouldInterrupt returns true for both calls (resume check + gate check)
      mockShouldInterrupt.mockReturnValue(true);

      const node = createMergeNode(depsWithReview);
      const state = baseState({
        approvalGates: { allowPrd: true, allowPlan: true, allowMerge: false },
        // _approvalAction is null (no resume payload) — this is a first run
        _approvalAction: null as any,
      });

      await node(state);

      // The interrupt MUST fire — this is a first run, not a resume
      expect(mockInterrupt).toHaveBeenCalledWith(expect.objectContaining({ node: 'merge' }));
      // The merge must NOT execute — no approval was given
      expect(depsWithReview.gitPrService.mergePr).not.toHaveBeenCalled();
      expect(depsWithReview.verifyMerge).not.toHaveBeenCalled();
    });

    it('should restore PR data from feature record on resume and merge PR via service', async () => {
      // Simulate resume after interrupt: lifecycle=Review in DB AND shouldInterrupt=true
      mockShouldInterrupt.mockReturnValueOnce(true); // for isResumeAfterInterrupt check

      const featureRepo = createMockFeatureRepo();
      // Set lifecycle to Review and PR data as if first run already completed
      (featureRepo.update as any)({
        lifecycle: 'Review',
        pr: {
          url: 'https://github.com/test/repo/pull/55',
          number: 55,
          commitHash: 'def5678',
          ciStatus: 'success',
          status: 'Open',
        },
      });
      const depsWithPr = baseDeps({ featureRepository: featureRepo });
      const node = createMergeNode(depsWithPr);

      // State has NO prUrl/prNumber (lost across interrupt)
      const state = baseState({
        approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
        _approvalAction: 'approved' as any,
        prUrl: null,
        prNumber: null,
      });
      await node(state);

      // Should have restored PR data and merged via service (not agent)
      expect(depsWithPr.gitPrService.mergePr).toHaveBeenCalledWith('/tmp/worktree', 55, 'squash');
      expect(depsWithPr.executor.execute).not.toHaveBeenCalled(); // No agent calls on resume
      expect(depsWithPr.verifyMerge).not.toHaveBeenCalled(); // No local verification for PR merge
    });

    it('should NOT call getDiffSummary when shouldInterrupt returns false', async () => {
      mockShouldInterrupt.mockReturnValueOnce(false);
      const node = createMergeNode(deps);
      const state = baseState();
      await node(state);

      expect(deps.getDiffSummary).not.toHaveBeenCalled();
    });

    it('should record phase timing before interrupt', async () => {
      mockShouldInterrupt.mockReturnValueOnce(true);
      const node = createMergeNode(deps);
      const state = baseState({
        approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
      });
      await node(state);

      expect(mockRecordPhaseEnd).toHaveBeenCalledWith(
        'timing-123',
        expect.any(Number),
        expect.objectContaining({ exitCode: 'success' })
      );
      expect(mockRecordApprovalWaitStart).toHaveBeenCalledWith('timing-123');
    });
  });

  // --- Feature lifecycle update ---
  describe('lifecycle transition', () => {
    it('should update feature to Review lifecycle when not merged', async () => {
      const node = createMergeNode(deps);
      const state = baseState();
      await node(state);

      expect(deps.featureRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({ lifecycle: 'Review' })
      );
    });

    it('should update feature to Maintain lifecycle when allowMerge=true', async () => {
      const node = createMergeNode(deps);
      const state = baseState({
        approvalGates: { allowPrd: false, allowPlan: false, allowMerge: true },
      });
      await node(state);

      expect(deps.featureRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({ lifecycle: 'Maintain' })
      );
    });

    it('should return messages about merge node completion', async () => {
      const node = createMergeNode(deps);
      const state = baseState();
      const result = await node(state);

      expect(result.messages).toBeDefined();
      expect(result.messages!.length).toBeGreaterThan(0);
      expect(result.currentNode).toBe('merge');
    });

    it('should return commitHash in state', async () => {
      const node = createMergeNode(deps);
      const state = baseState();
      const result = await node(state);

      expect(result.commitHash).toBe('abc1234');
    });

    it('should include PR data in feature update when PR was created', async () => {
      const node = createMergeNode(deps);
      const state = baseState({ openPr: true });
      await node(state);

      expect(deps.featureRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({
          pr: expect.objectContaining({
            url: 'https://github.com/test/repo/pull/42',
            number: 42,
          }),
        })
      );
    });
  });

  // --- Merge verification ---
  describe('merge verification', () => {
    it('should call localMergeSquash for local merge (no PR)', async () => {
      const node = createMergeNode(deps);
      const state = baseState({
        approvalGates: { allowPrd: false, allowPlan: false, allowMerge: true },
      });
      await node(state);

      expect(deps.localMergeSquash).toHaveBeenCalledWith(
        '/tmp/repo',
        'feat/test',
        'main',
        expect.stringContaining('squash merge'),
        true
      );
    });

    it('should throw when localMergeSquash fails with non-conflict error', async () => {
      const failDeps = baseDeps({
        localMergeSquash: vi
          .fn()
          .mockRejectedValue(
            new GitPrError('Local squash merge failed: checkout error', GitPrErrorCode.GIT_ERROR)
          ),
      });
      const node = createMergeNode(failDeps);
      const state = baseState({
        approvalGates: { allowPrd: false, allowPlan: false, allowMerge: true },
      });

      await expect(node(state)).rejects.toThrow('checkout error');
    });

    it('should fall back to agent-based merge when localMergeSquash encounters MERGE_CONFLICT', async () => {
      const conflictDeps = baseDeps({
        localMergeSquash: vi
          .fn()
          .mockRejectedValue(
            new GitPrError(
              'Merge conflict while squash-merging feat/test into main: CONFLICT in .gitignore',
              GitPrErrorCode.MERGE_CONFLICT
            )
          ),
      });
      const node = createMergeNode(conflictDeps);
      const state = baseState({
        approvalGates: { allowPrd: false, allowPlan: false, allowMerge: true },
      });

      const result = await node(state);

      // Agent should have been called twice: once for commit/push/PR, once for conflict resolution
      expect(conflictDeps.executor.execute).toHaveBeenCalledTimes(2);
      expect(mockBuildLocalSquashMergePrompt).toHaveBeenCalledWith(
        '/tmp/repo',
        'feat/test',
        'main',
        expect.stringContaining('squash merge'),
        expect.stringContaining('CONFLICT')
      );
      expect(result.messages).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Conflict detected'),
          expect.stringContaining('Agent resolved conflicts'),
        ])
      );
    });

    it('should skip localMergeSquash when PR exists (remote merge via service)', async () => {
      const node = createMergeNode(deps);
      // PR data already in state (e.g. from a previous commit/push/PR cycle)
      const state = baseState({
        prUrl: 'https://github.com/test/repo/pull/99',
        prNumber: 99,
        approvalGates: { allowPrd: false, allowPlan: false, allowMerge: true },
      });
      await node(state);

      expect(deps.localMergeSquash).not.toHaveBeenCalled();
      expect(deps.gitPrService.mergePr).toHaveBeenCalledWith('/tmp/worktree', 99, 'squash');
    });
  });

  // --- Post-merge cleanup ---
  describe('post-merge cleanup', () => {
    it('should call cleanupFeatureWorktreeUseCase.execute with feature id when merged=true', async () => {
      const node = createMergeNode(deps);
      const state = baseState({
        approvalGates: { allowPrd: false, allowPlan: false, allowMerge: true },
      });
      await node(state);

      expect(mockCleanupExecute).toHaveBeenCalledOnce();
      expect(mockCleanupExecute).toHaveBeenCalledWith('feat-001');
    });

    it('should NOT call cleanupFeatureWorktreeUseCase.execute when merged=false (no allowMerge)', async () => {
      const node = createMergeNode(deps);
      const state = baseState();
      await node(state);

      expect(mockCleanupExecute).not.toHaveBeenCalled();
    });

    it('should call cleanup after featureRepository.update() when merged=true', async () => {
      const callOrder: string[] = [];
      const orderedFeatureRepo = {
        findById: vi
          .fn()
          .mockResolvedValue({ id: 'feat-001', lifecycle: 'Implementation', branch: 'feat/test' }),
        update: vi.fn().mockImplementation(async () => {
          callOrder.push('update');
        }),
      } as any;
      const orderedCleanup = {
        execute: vi.fn().mockImplementation(async () => {
          callOrder.push('cleanup');
        }),
      } as any;
      const node = createMergeNode(
        baseDeps({
          featureRepository: orderedFeatureRepo,
          cleanupFeatureWorktreeUseCase: orderedCleanup,
        })
      );
      const state = baseState({
        approvalGates: { allowPrd: false, allowPlan: false, allowMerge: true },
      });
      await node(state);

      const updateIdx = callOrder.indexOf('update');
      const cleanupIdx = callOrder.indexOf('cleanup');
      expect(updateIdx).toBeGreaterThanOrEqual(0);
      expect(cleanupIdx).toBeGreaterThan(updateIdx);
    });
  });

  // --- Error handling ---
  describe('error handling', () => {
    it('should throw when first executor call fails (allows LangGraph resume)', async () => {
      (deps.executor.execute as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Agent execution failed')
      );
      const node = createMergeNode(deps);
      const state = baseState();

      await expect(node(state)).rejects.toThrow('Agent execution failed');
    });

    it('should throw when localMergeSquash fails with non-conflict error (local merge step, no PR)', async () => {
      const failDeps = baseDeps({
        localMergeSquash: vi
          .fn()
          .mockRejectedValue(
            new GitPrError('Local squash merge failed: git error', GitPrErrorCode.GIT_ERROR)
          ),
      });
      const node = createMergeNode(failDeps);
      const state = baseState({
        approvalGates: { allowPrd: false, allowPlan: false, allowMerge: true },
      });

      await expect(node(state)).rejects.toThrow('git error');
    });

    it('should fall back to agent when localMergeSquash fails with MERGE_CONFLICT (not throw)', async () => {
      const conflictDeps = baseDeps({
        localMergeSquash: vi
          .fn()
          .mockRejectedValue(
            new GitPrError(
              'Merge conflict while squash-merging feat/test into main',
              GitPrErrorCode.MERGE_CONFLICT
            )
          ),
      });
      const node = createMergeNode(conflictDeps);
      const state = baseState({
        approvalGates: { allowPrd: false, allowPlan: false, allowMerge: true },
      });

      // Should NOT throw — agent resolves the conflict
      const result = await node(state);
      expect(result.currentNode).toBe('merge');
      expect(conflictDeps.executor.execute).toHaveBeenCalledTimes(2);
    });

    it('should throw when gitPrService.mergePr fails (PR merge)', async () => {
      (deps.gitPrService.mergePr as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('PR merge failed')
      );
      const node = createMergeNode(deps);
      const state = baseState({
        openPr: true,
        prUrl: 'https://github.com/test/repo/pull/42',
        prNumber: 42,
        approvalGates: { allowPrd: false, allowPlan: false, allowMerge: true },
      });

      await expect(node(state)).rejects.toThrow('PR merge failed');
    });

    it('should record phase timing even when merge fails', async () => {
      (deps.executor.execute as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Failed'));
      const node = createMergeNode(deps);
      const state = baseState();

      await expect(node(state)).rejects.toThrow('Failed');

      expect(mockRecordPhaseStart).toHaveBeenCalledWith(
        'merge',
        expect.objectContaining({ agentType: 'claude-code' })
      );
      expect(mockRecordPhaseEnd).toHaveBeenCalledWith(
        'timing-123',
        expect.any(Number),
        expect.objectContaining({ exitCode: 'error' })
      );
    });
  });
});
