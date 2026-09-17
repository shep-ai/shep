/**
 * Implement Node — Merge-Rejection Redo Tests
 *
 * When the user rejects the merge with feedback, the graph routes back to
 * `implement`. Every phase is already in completedPhases at that point, so
 * without special handling the normal per-phase loop would silently skip
 * everything and never call the executor — the feedback would be ignored.
 *
 * Covers the redo branch that runs one focused pass to address the
 * feedback instead, and confirms it is bypassed on a normal first run.
 *
 * TDD Phase: RED → GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import { SecurityMode } from '@/domain/generated/output.js';
import type { AgentType } from '@/domain/generated/output.js';
import type { FeatureAgentState } from '@/infrastructure/services/agents/feature-agent/state.js';

// ─── Mocks ──────────────────────────────────────────────────────────

const { mockReadFileSync, mockWriteFileSync } = vi.hoisted(() => ({
  mockReadFileSync: vi.fn(),
  mockWriteFileSync: vi.fn(),
}));

vi.mock('node:fs', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    default: { ...actual, readFileSync: mockReadFileSync, writeFileSync: mockWriteFileSync },
    readFileSync: mockReadFileSync,
    writeFileSync: mockWriteFileSync,
  };
});

const { mockGetCompletedPhases, mockMarkPhaseComplete } = vi.hoisted(() => ({
  mockGetCompletedPhases: vi.fn().mockReturnValue([]),
  mockMarkPhaseComplete: vi.fn(),
}));

vi.mock(
  '@/infrastructure/services/agents/feature-agent/nodes/node-helpers.js',
  async (importOriginal) => {
    const actual = (await importOriginal()) as Record<string, unknown>;
    return {
      ...actual,
      getCompletedPhases: mockGetCompletedPhases,
      markPhaseComplete: mockMarkPhaseComplete,
    };
  }
);

vi.mock('@/infrastructure/services/agents/feature-agent/heartbeat.js', () => ({
  reportNodeStart: vi.fn(),
}));

vi.mock('@/infrastructure/services/agents/feature-agent/lifecycle-context.js', () => ({
  updateNodeLifecycle: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/infrastructure/services/agents/feature-agent/phase-timing-context.js', () => ({
  recordPhaseStart: vi.fn().mockResolvedValue('timing-id'),
  recordPhaseEnd: vi.fn().mockResolvedValue(undefined),
  recordApprovalWaitStart: vi.fn().mockResolvedValue(undefined),
  updatePhasePrompt: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/infrastructure/services/settings.service.js', () => ({
  hasSettings: vi.fn().mockReturnValue(true),
  getSettings: vi.fn().mockReturnValue({
    workflow: { enableEvidence: false, commitEvidence: false },
  }),
}));

import { createImplementNode } from '@/infrastructure/services/agents/feature-agent/nodes/implement.node.js';

// ─── Helpers ────────────────────────────────────────────────────────

const MOCK_SPEC_YAML_NO_FEEDBACK = `name: test
summary: Test feature
`;

const MOCK_SPEC_YAML_WITH_MERGE_REJECTION = `name: test
summary: Test feature
rejectionFeedback:
  - iteration: 1
    message: "Please also update the changelog before merging"
    phase: merge
    timestamp: "2026-01-01T00:00:00.000Z"
`;

const MOCK_RESEARCH_YAML = `name: test\nsummary: research\ncontent: research content\ndecisions: []\n`;

const MOCK_PLAN_YAML = `content: Plan content
phases:
  - id: phase-1
    name: 'Test Phase'
    parallel: false
    taskIds:
      - task-1
`;

const MOCK_TASKS_YAML = `name: test
tasks:
  - id: task-1
    title: Test Task
    description: A test task
    state: Todo
    phaseId: phase-1
    dependencies: []
    acceptanceCriteria:
      - It works
    tdd: null
    estimatedEffort: 15min
`;

function setupFileMocks(specYaml: string): void {
  mockReadFileSync.mockImplementation((path: string) => {
    if (typeof path === 'string') {
      if (path.endsWith('spec.yaml')) return specYaml;
      if (path.endsWith('research.yaml')) return MOCK_RESEARCH_YAML;
      if (path.endsWith('plan.yaml')) return MOCK_PLAN_YAML;
      if (path.endsWith('tasks.yaml')) return MOCK_TASKS_YAML;
      if (path.endsWith('feature.yaml')) return 'feature:\n  id: test\nstatus: {}\n';
    }
    throw new Error(`ENOENT: no such file: ${path}`);
  });
}

function createMockState(overrides?: Partial<FeatureAgentState>): FeatureAgentState {
  return {
    featureId: 'feat-123',
    repositoryPath: '/test/repo',
    specDir: '/test/specs/001-test',
    worktreePath: '/test/worktree',
    currentNode: '',
    error: null,
    approvalGates: undefined,
    messages: [],
    validationRetries: 0,
    lastValidationTarget: '',
    lastValidationErrors: [],
    _approvalAction: null,
    _rejectionFeedback: null,
    _needsReexecution: false,
    prUrl: null,
    prNumber: null,
    commitHash: null,
    ciStatus: null,
    merged: false,
    projectMemory: undefined,
    push: false,
    openPr: false,
    ciFixAttempts: 0,
    ciFixHistory: [],
    ciFixStatus: 'idle',
    evidence: [],
    evidenceRetries: 0,
    model: undefined,
    resumeReason: undefined,
    forkAndPr: false,
    commitSpecs: true,
    ciWatchEnabled: true,
    enableEvidence: false,
    commitEvidence: false,
    securityMode: SecurityMode.Disabled,
    securityActionDispositions: {},
    mcpConfigPath: undefined,
    iterationCount: 0,
    maxIterations: 10,
    feedbackHistory: [],
    explorationStatus: undefined,
    ...overrides,
  };
}

function createMockExecutor(): IAgentExecutor {
  return {
    agentType: 'claude-code' as AgentType,
    execute: vi.fn().mockResolvedValue({ result: 'Mock executor result' }),
    executeStream: vi.fn(),
    supportsFeature: vi.fn().mockReturnValue(false),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('createImplementNode — merge-rejection redo', () => {
  let mockExecutor: IAgentExecutor;

  beforeEach(() => {
    mockReadFileSync.mockReset();
    mockWriteFileSync.mockReset();
    mockGetCompletedPhases.mockReset();
    mockMarkPhaseComplete.mockReset();
    mockExecutor = createMockExecutor();
  });

  it('runs one focused executor pass addressing the feedback instead of skipping every completed phase', async () => {
    setupFileMocks(MOCK_SPEC_YAML_WITH_MERGE_REJECTION);
    // All phases already completed from the initial run.
    mockGetCompletedPhases.mockReturnValue(['phase-1']);
    const node = createImplementNode(mockExecutor);
    const state = createMockState({ _needsReexecution: true });

    const result = await node(state);

    expect(mockExecutor.execute).toHaveBeenCalledTimes(1);
    const [prompt] = (mockExecutor.execute as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(prompt).toContain('Please also update the changelog before merging');
    expect(prompt).toContain('User Rejection Feedback');
    expect(result.currentNode).toBe('implement');
    expect(result._needsReexecution).toBe(false);
  });

  it('falls through to the normal phase walk when _needsReexecution is true but no feedback is found', async () => {
    setupFileMocks(MOCK_SPEC_YAML_NO_FEEDBACK);
    mockGetCompletedPhases.mockReturnValue(['phase-1']);
    const node = createImplementNode(mockExecutor);
    const state = createMockState({ _needsReexecution: true });

    const result = await node(state);

    // No feedback to act on — the (already-completed) phase loop runs and
    // skips, so the executor is never called.
    expect(mockExecutor.execute).not.toHaveBeenCalled();
    expect(result.currentNode).toBe('implement');
  });

  it('does not take the redo branch on a normal first run', async () => {
    setupFileMocks(MOCK_SPEC_YAML_WITH_MERGE_REJECTION);
    mockGetCompletedPhases.mockReturnValue([]);
    const node = createImplementNode(mockExecutor);
    const state = createMockState({ _needsReexecution: false });

    const result = await node(state);

    // Normal phase loop executes phase-1 via the per-phase prompt, not the
    // rejection-fix prompt.
    expect(mockExecutor.execute).toHaveBeenCalledTimes(1);
    const [prompt] = (mockExecutor.execute as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(prompt).not.toContain('User Rejection Feedback');
    expect(prompt).toContain('Test Task');
    expect(result.currentNode).toBe('implement');
  });
});
