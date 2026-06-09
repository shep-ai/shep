/**
 * Graph State Transition Test Setup
 *
 * Shared setup for all graph state transition integration tests.
 * Provides real LangGraph graph with SQLite checkpointer and stubbed executor.
 *
 * Usage:
 *   const ctx = createTestContext();
 *   // in beforeAll: await ctx.init();
 *   // in beforeEach: ctx.reset();
 *   // in afterAll: ctx.cleanup();
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { vi, type Mock } from 'vitest';
import {
  createFeatureAgentGraph,
  type FeatureAgentGraphDeps,
} from '@/infrastructure/services/agents/feature-agent/feature-agent-graph.js';
import type { MergeNodeDeps } from '@/infrastructure/services/agents/feature-agent/nodes/merge/merge.node.js';
import { createCheckpointer } from '@/infrastructure/services/agents/common/checkpointer.js';
import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import type { ApprovalGates, Settings } from '@/domain/generated/output.js';
import {
  initializeSettings,
  hasSettings,
  resetSettings,
} from '@/infrastructure/services/settings.service.js';
import {
  VALID_SPEC_YAML,
  VALID_RESEARCH_YAML,
  VALID_PLAN_YAML,
  VALID_TASKS_YAML,
} from './fixtures.js';

/**
 * Ensure the settings singleton is initialized with evidence enabled.
 * Safe to call multiple times — only initializes once.
 */
function ensureSettingsInitialized(): void {
  if (hasSettings()) return;
  initializeSettings({
    id: 'test',
    createdAt: new Date(),
    updatedAt: new Date(),
    models: { default: 'claude-sonnet-4' },
    user: {},
    environment: { defaultEditor: 'vscode', shellPreference: 'bash' },
    system: { autoUpdate: false, logLevel: 'error' },
    agent: { type: 'claude-code', authMethod: 'session' },
    notifications: {
      inApp: { enabled: false },
      browser: { enabled: false },
      desktop: { enabled: false },
      events: {
        agentStarted: false,
        phaseCompleted: false,
        waitingApproval: false,
        agentCompleted: false,
        agentFailed: false,
        prMerged: false,
        prClosed: false,
        prChecksPassed: false,
        prChecksFailed: false,
      },
    },
    workflow: {
      openPrOnImplementationComplete: false,
      approvalGateDefaults: {
        allowPrd: false,
        allowPlan: false,
        allowMerge: false,
        pushOnImplementationComplete: false,
      },
      enableEvidence: true,
      commitEvidence: false,
    },
    onboardingComplete: true,
  } as Settings);
}

/* ------------------------------------------------------------------ */
/*  Stub Executor                                                     */
/* ------------------------------------------------------------------ */

export interface StubExecutor extends IAgentExecutor {
  /** Total number of execute() calls. */
  callCount: number;
  /** Prompts received in order. */
  prompts: string[];
  /** The underlying vi.fn() mock for execute(). */
  execute: Mock;
}

/**
 * Create a stub executor that records calls and returns canned results.
 * No AI calls are made.
 */
export function createStubExecutor(): StubExecutor {
  let callCount = 0;
  const prompts: string[] = [];

  const executeFn = vi.fn(async (prompt: string) => {
    callCount++;
    prompts.push(prompt);
    return { result: `stub result #${callCount}`, exitCode: 0 };
  });

  const stub: StubExecutor = {
    agentType: 'claude-code' as never,
    execute: executeFn,
    executeStream: vi.fn(),
    supportsFeature: vi.fn().mockReturnValue(false),
    get callCount() {
      return callCount;
    },
    prompts,
  };

  return stub;
}

/* ------------------------------------------------------------------ */
/*  Stub Merge Node Dependencies                                      */
/* ------------------------------------------------------------------ */

/**
 * Create stubbed MergeNodeDeps for testing the merge node in the graph.
 * All external calls are no-ops that return canned data.
 * Returns Omit<MergeNodeDeps, 'executor'> — the graph factory adds the executor.
 */
/**
 * Create a stateful mock feature repository.
 * Tracks updates so that findById returns the latest state.
 */
export function createStatefulFeatureRepo(featureId?: string): MergeNodeDeps['featureRepository'] {
  let current: Record<string, unknown> = {
    id: featureId ?? 'feat-test',
    name: 'Test Feature',
    slug: 'test-feature',
    branch: 'feat/test',
    repositoryPath: '/tmp',
  };
  return {
    findById: vi.fn(async () => ({ ...current })),
    update: vi.fn(async (data: Record<string, unknown>) => {
      current = { ...current, ...data };
    }),
  } as unknown as MergeNodeDeps['featureRepository'];
}

export function createStubMergeNodeDeps(featureId?: string): Omit<MergeNodeDeps, 'executor'> {
  return {
    getDiffSummary: vi.fn().mockResolvedValue({
      filesChanged: 3,
      additions: 50,
      deletions: 10,
      commitCount: 2,
    }),
    hasRemote: vi.fn().mockResolvedValue(true),
    getDefaultBranch: vi.fn().mockResolvedValue('main'),
    verifyMerge: vi.fn().mockResolvedValue(true),
    revParse: vi.fn().mockResolvedValue('premerge-sha-mock'),
    localMergeSquash: vi.fn().mockResolvedValue(undefined),
    featureRepository: createStatefulFeatureRepo(featureId),
    gitPrService: {
      hasRemote: vi.fn().mockResolvedValue(true),
      getRemoteUrl: vi.fn().mockResolvedValue('https://github.com/test/repo'),
      createGitHubRepo: vi.fn(),
      addRemote: vi.fn(),
      pull: vi.fn().mockResolvedValue(undefined),
      getDefaultBranch: vi.fn().mockResolvedValue('main'),
      hasUncommittedChanges: vi.fn().mockResolvedValue(false),
      commitAll: vi.fn().mockResolvedValue('abc1234'),
      push: vi.fn().mockResolvedValue(undefined),
      createPr: vi
        .fn()
        .mockResolvedValue({ url: 'https://github.com/test/repo/pull/1', number: 1 }),
      mergePr: vi.fn().mockResolvedValue(undefined),
      mergeBranch: vi.fn().mockResolvedValue(undefined),
      getCiStatus: vi.fn().mockResolvedValue({ status: 'success', runId: undefined }),
      watchCi: vi.fn().mockResolvedValue({ status: 'success', runId: undefined }),
      deleteBranch: vi.fn().mockResolvedValue(undefined),
      getPrDiffSummary: vi
        .fn()
        .mockResolvedValue({ filesChanged: 0, additions: 0, deletions: 0, commitCount: 0 }),
      getFailureLogs: vi.fn().mockResolvedValue(''),
      getFileDiffs: vi.fn().mockResolvedValue([]),
      listPrStatuses: vi.fn().mockResolvedValue([]),
      verifyMerge: vi.fn().mockResolvedValue(true),
      getMergeableStatus: vi.fn().mockResolvedValue(true),
      revParse: vi.fn().mockResolvedValue('mock-sha'),
      localMergeSquash: vi.fn().mockResolvedValue(undefined),
      syncMain: vi.fn().mockResolvedValue(undefined),
      rebaseOnMain: vi.fn().mockResolvedValue(undefined),
      rebaseOnBranch: vi.fn().mockResolvedValue(undefined),
      getConflictedFiles: vi.fn().mockResolvedValue([]),
      stageFiles: vi.fn().mockResolvedValue(undefined),
      rebaseContinue: vi.fn().mockResolvedValue(undefined),
      rebaseAbort: vi.fn().mockResolvedValue(undefined),
      getBranchSyncStatus: vi.fn().mockResolvedValue({ ahead: 0, behind: 0 }),
      stash: vi.fn().mockResolvedValue(false),
      stashPop: vi.fn().mockResolvedValue(undefined),
      stashDrop: vi.fn().mockResolvedValue(undefined),
    },
    cleanupFeatureWorktreeUseCase: { execute: vi.fn().mockResolvedValue(undefined) } as any,
  };
}

/* ------------------------------------------------------------------ */
/*  Test Context                                                      */
/* ------------------------------------------------------------------ */

export interface TestContextOptions {
  /** When true, wire up the merge node with stubbed deps. Default: false. */
  withMerge?: boolean;
}

export interface TestContext {
  /** Temporary directory root for this test suite. */
  tempDir: string;
  /** Path to the spec directory inside tempDir. */
  specDir: string;
  /** The stub executor used by the graph. */
  executor: StubExecutor;
  /** The compiled LangGraph graph. */
  graph: ReturnType<typeof createFeatureAgentGraph>;
  /** Stubbed merge node deps (only available when withMerge=true). */
  mergeNodeDeps?: Omit<MergeNodeDeps, 'executor'>;
  /** Generate a unique graph config with isolated thread_id. */
  newConfig: () => { configurable: { thread_id: string } };
  /** Build initial state for graph.invoke(). */
  initialState: (gates?: ApprovalGates) => Record<string, unknown>;
  /** Reset feature.yaml to empty completedPhases (call in beforeEach). */
  reset: () => void;
  /** Initialize temp directory and write fixture files (call in beforeAll). */
  init: () => void;
  /** Clean up temp directory (call in afterAll). */
  cleanup: () => void;
  /** Suppress stdout/stderr (call in beforeAll, restore in afterAll). */
  suppressOutput: () => { restore: () => void };
}

/**
 * Create a test context for graph state transition tests.
 *
 * Encapsulates:
 * - Temp directory creation with valid spec YAML fixtures
 * - Real LangGraph graph with in-memory SQLite checkpointer
 * - Stub executor (no AI calls)
 * - Unique thread_id generation for checkpoint isolation
 */
export function createTestContext(options?: TestContextOptions): TestContext {
  const withMerge = options?.withMerge ?? false;
  let tempDir = '';
  let specDir = '';
  let executor: StubExecutor;
  let mergeNodeDeps: Omit<MergeNodeDeps, 'executor'> | undefined;
  let graph: ReturnType<typeof createFeatureAgentGraph>;

  function buildGraph(): void {
    executor = createStubExecutor();
    if (withMerge) {
      mergeNodeDeps = createStubMergeNodeDeps();
      const deps: FeatureAgentGraphDeps = { executor, mergeNodeDeps };
      graph = createFeatureAgentGraph(deps, createCheckpointer(':memory:'));
    } else {
      graph = createFeatureAgentGraph(executor, createCheckpointer(':memory:'));
    }
  }

  const ctx: TestContext = {
    get tempDir() {
      return tempDir;
    },
    get specDir() {
      return specDir;
    },
    get executor() {
      return executor;
    },
    get graph() {
      return graph;
    },
    get mergeNodeDeps() {
      return mergeNodeDeps;
    },

    newConfig: () => ({
      configurable: { thread_id: `test-${randomUUID()}` },
    }),

    initialState: (gates?: ApprovalGates) => ({
      featureId: `feat-${randomUUID().slice(0, 8)}`,
      repositoryPath: tempDir,
      worktreePath: tempDir,
      specDir,
      enableEvidence: true,
      commitEvidence: false,
      ...(gates ? { approvalGates: gates } : {}),
    }),

    reset: () => {
      writeFileSync(join(specDir, 'feature.yaml'), 'status:\n  completedPhases: []\n');
      buildGraph();
    },

    init: () => {
      ensureSettingsInitialized();
      tempDir = mkdtempSync(join(tmpdir(), 'shep-gst-'));
      specDir = join(tempDir, 'specs', '001-test');
      mkdirSync(specDir, { recursive: true });

      writeFileSync(join(specDir, 'spec.yaml'), VALID_SPEC_YAML);
      writeFileSync(join(specDir, 'research.yaml'), VALID_RESEARCH_YAML);
      writeFileSync(join(specDir, 'plan.yaml'), VALID_PLAN_YAML);
      writeFileSync(join(specDir, 'tasks.yaml'), VALID_TASKS_YAML);
      writeFileSync(join(specDir, 'feature.yaml'), 'status:\n  completedPhases: []\n');

      buildGraph();
    },

    cleanup: () => {
      if (tempDir) rmSync(tempDir, { recursive: true, force: true });
      resetSettings();
    },

    suppressOutput: () => {
      const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      return {
        restore: () => {
          stdoutSpy.mockRestore();
          stderrSpy.mockRestore();
        },
      };
    },
  };

  return ctx;
}
