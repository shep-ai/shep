/**
 * Fast-Implement Node & Prompt Builder Tests
 *
 * Tests for the fast-implement prompt builder and node factory.
 * Covers prompt assembly, context inclusion, executor invocation,
 * lifecycle tracking, and error handling.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import type { AgentType } from '@/domain/generated/output.js';
import type { FeatureAgentState } from '@/infrastructure/services/agents/feature-agent/state.js';

// ─── Mocks ──────────────────────────────────────────────────────────

const {
  mockReadFileSync,
  mockReaddirSync,
  mockStatSync,
  mockExecSync,
  mockMkdirSync,
  mockWriteFileSync,
} = vi.hoisted(() => ({
  mockReadFileSync: vi.fn(),
  mockReaddirSync: vi.fn(),
  mockStatSync: vi.fn(),
  mockExecSync: vi.fn(),
  mockMkdirSync: vi.fn(),
  mockWriteFileSync: vi.fn(),
}));

vi.mock('node:fs', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      readFileSync: mockReadFileSync,
      readdirSync: mockReaddirSync,
      statSync: mockStatSync,
      mkdirSync: mockMkdirSync,
      writeFileSync: mockWriteFileSync,
    },
    readFileSync: mockReadFileSync,
    readdirSync: mockReaddirSync,
    statSync: mockStatSync,
    mkdirSync: mockMkdirSync,
    writeFileSync: mockWriteFileSync,
  };
});

vi.mock('node:child_process', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    execSync: mockExecSync,
  };
});

// Mock node-helpers (getCompletedPhases / markPhaseComplete)
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

// Mock heartbeat, lifecycle, and phase-timing contexts (module-level singletons)
vi.mock('@/infrastructure/services/agents/feature-agent/heartbeat.js', () => ({
  reportNodeStart: vi.fn(),
}));

vi.mock('@/infrastructure/services/agents/feature-agent/lifecycle-context.js', () => ({
  updateNodeLifecycle: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/infrastructure/services/agents/feature-agent/phase-timing-context.js', () => ({
  recordPhaseStart: vi.fn().mockResolvedValue('timing-id'),
  recordPhaseEnd: vi.fn().mockResolvedValue(undefined),
}));

// Mock settings service — evidence enabled by default in tests
vi.mock('@/infrastructure/services/settings.service.js', () => ({
  hasSettings: vi.fn().mockReturnValue(true),
  getSettings: vi.fn().mockReturnValue({
    workflow: { enableEvidence: true, commitEvidence: false },
  }),
}));

import { buildFastImplementPrompt } from '@/infrastructure/services/agents/feature-agent/nodes/prompts/fast-implement.prompt.js';
import { createFastImplementNode } from '@/infrastructure/services/agents/feature-agent/nodes/fast-implement.node.js';

// ─── Helpers ────────────────────────────────────────────────────────

const MOCK_SPEC_YAML = `name: quick-fix
userQuery: >
  Fix the typo in the README
summary: Fix typo
phase: Analysis
`;

const MOCK_CLAUDE_MD = `# Project Guidelines
Use TypeScript and follow Clean Architecture.
`;

const MOCK_PACKAGE_JSON = `{
  "name": "test-project",
  "version": "1.0.0",
  "scripts": {
    "test": "vitest",
    "build": "tsc"
  }
}`;

function createMockState(overrides?: Partial<FeatureAgentState>): FeatureAgentState {
  return {
    featureId: 'feat-123',
    repositoryPath: '/test/repo',
    specDir: '/test/specs/001-quick-fix',
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
    enableEvidence: true,
    commitEvidence: false,
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

function setupFileMocks(opts?: {
  specYaml?: string | null;
  claudeMd?: string | null;
  packageJson?: string | null;
  dirEntries?: string[];
}): void {
  const specYaml = opts?.specYaml !== undefined ? opts.specYaml : MOCK_SPEC_YAML;
  const claudeMd = opts?.claudeMd !== undefined ? opts.claudeMd : MOCK_CLAUDE_MD;
  const packageJson = opts?.packageJson !== undefined ? opts.packageJson : MOCK_PACKAGE_JSON;
  const dirEntries = opts?.dirEntries ?? ['src', 'tests', 'package.json', 'README.md'];

  mockReadFileSync.mockImplementation((path: string) => {
    if (typeof path === 'string') {
      if (path.endsWith('spec.yaml')) {
        if (specYaml === null) throw new Error('ENOENT');
        return specYaml;
      }
      if (path.endsWith('CLAUDE.md')) {
        if (claudeMd === null) throw new Error('ENOENT');
        return claudeMd;
      }
      if (path.endsWith('package.json')) {
        if (packageJson === null) throw new Error('ENOENT');
        return packageJson;
      }
      if (path.endsWith('feature.yaml')) {
        return 'feature:\n  id: test\n';
      }
    }
    throw new Error(`ENOENT: no such file: ${path}`);
  });

  mockReaddirSync.mockImplementation(() => dirEntries);

  mockStatSync.mockImplementation((path: string) => {
    const name = path.split('/').pop() ?? '';
    // Directories don't have extensions
    const isDir = !name.includes('.');
    return { isDirectory: () => isDir };
  });
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('buildFastImplementPrompt', () => {
  beforeEach(() => {
    mockReadFileSync.mockReset();
    mockReaddirSync.mockReset();
    mockStatSync.mockReset();
  });

  it('should include user query in output', () => {
    setupFileMocks();
    const state = createMockState();

    const prompt = buildFastImplementPrompt(state);

    expect(prompt).toContain('Fix the typo in the README');
  });

  it('should include CLAUDE.md content when file exists', () => {
    setupFileMocks();
    const state = createMockState();

    const prompt = buildFastImplementPrompt(state);

    expect(prompt).toContain('Project Guidelines');
    expect(prompt).toContain('Use TypeScript and follow Clean Architecture');
  });

  it('should omit CLAUDE.md section when file is missing', () => {
    setupFileMocks({ claudeMd: null });
    const state = createMockState();

    const prompt = buildFastImplementPrompt(state);

    expect(prompt).not.toContain('Project Guidelines (CLAUDE.md)');
    // Should still have the user query
    expect(prompt).toContain('Fix the typo in the README');
  });

  it('should include package.json content when available', () => {
    setupFileMocks();
    const state = createMockState();

    const prompt = buildFastImplementPrompt(state);

    expect(prompt).toContain('test-project');
    expect(prompt).toContain('Package Configuration');
  });

  it('should omit package.json section when file is missing', () => {
    setupFileMocks({ packageJson: null });
    const state = createMockState();

    const prompt = buildFastImplementPrompt(state);

    expect(prompt).not.toContain('Package Configuration');
  });

  it('should include shallow directory listing', () => {
    setupFileMocks({ dirEntries: ['src', 'tests', 'package.json', 'README.md'] });
    const state = createMockState();

    const prompt = buildFastImplementPrompt(state);

    expect(prompt).toContain('Project Structure');
    expect(prompt).toContain('src/');
  });

  it('should include instruction to commit incrementally', () => {
    setupFileMocks();
    const state = createMockState();

    const prompt = buildFastImplementPrompt(state);

    expect(prompt).toContain('Commit your work with descriptive conventional commit messages');
    expect(prompt).toContain('Commit incrementally');
  });

  it('should include push instruction when push=true', () => {
    setupFileMocks();
    const state = createMockState({ push: true });

    const prompt = buildFastImplementPrompt(state);

    expect(prompt).toContain('Push to remote after committing');
    expect(prompt).toContain('git push -u origin HEAD');
  });

  it('should NOT include push instruction when push=false', () => {
    setupFileMocks();
    const state = createMockState({ push: false });

    const prompt = buildFastImplementPrompt(state);

    expect(prompt).not.toContain('Push to remote after committing');
  });

  it('should output under 10,000 chars with typical inputs', () => {
    setupFileMocks();
    const state = createMockState();

    const prompt = buildFastImplementPrompt(state);

    expect(prompt.length).toBeLessThan(10_000);
  });

  it('should use worktreePath for working directory', () => {
    setupFileMocks();
    const state = createMockState({ worktreePath: '/custom/worktree' });

    const prompt = buildFastImplementPrompt(state);

    expect(prompt).toContain('/custom/worktree');
  });

  it('should fall back to repositoryPath when worktreePath is empty', () => {
    setupFileMocks();
    const state = createMockState({ worktreePath: '' });

    const prompt = buildFastImplementPrompt(state);

    expect(prompt).toContain('/test/repo');
  });

  it('should truncate large package.json', () => {
    const largePackageJson = JSON.stringify({
      name: 'big-project',
      dependencies: Object.fromEntries(
        Array.from({ length: 200 }, (_, i) => [`dep-${i}`, `^${i}.0.0`])
      ),
    });
    setupFileMocks({ packageJson: largePackageJson });
    const state = createMockState();

    const prompt = buildFastImplementPrompt(state);

    expect(prompt).toContain('...(truncated)');
  });

  it('should handle missing spec.yaml gracefully', () => {
    setupFileMocks({ specYaml: null });
    const state = createMockState();

    const prompt = buildFastImplementPrompt(state);

    // Should still produce a valid prompt
    expect(prompt).toContain('User Request');
    expect(prompt).toContain('Implementation Instructions');
  });

  it('should skip node_modules and .git in directory listing', () => {
    setupFileMocks({
      dirEntries: ['src', 'node_modules', '.git', 'package.json'],
    });
    const state = createMockState();

    const prompt = buildFastImplementPrompt(state);

    expect(prompt).toContain('src/');
    expect(prompt).not.toContain('node_modules');
    expect(prompt).not.toContain('.git');
  });

  it('should forbid entering plan mode', () => {
    setupFileMocks();
    const state = createMockState();

    const prompt = buildFastImplementPrompt(state);

    expect(prompt.toLowerCase()).toContain('do not enter plan mode');
  });

  it('should forbid asking user questions', () => {
    setupFileMocks();
    const state = createMockState();

    const prompt = buildFastImplementPrompt(state);

    expect(prompt.toLowerCase()).toContain('do not ask');
  });

  it('should require producing actual code files', () => {
    setupFileMocks();
    const state = createMockState();

    const prompt = buildFastImplementPrompt(state);

    expect(prompt.toLowerCase()).toContain('must create or modify');
  });
});

describe('createFastImplementNode', () => {
  let mockExecutor: IAgentExecutor;

  beforeEach(() => {
    mockReadFileSync.mockReset();
    mockReaddirSync.mockReset();
    mockStatSync.mockReset();
    mockExecSync.mockReset();
    // Default: git status reports changes exist (happy path)
    mockExecSync.mockReturnValue('M  src/index.ts\n');
    mockGetCompletedPhases.mockReset().mockReturnValue([]);
    mockMarkPhaseComplete.mockReset();
    mockExecutor = createMockExecutor();
  });

  it('should return a valid LangGraph node function', () => {
    const node = createFastImplementNode(mockExecutor);
    expect(typeof node).toBe('function');
  });

  it('should call executor.execute with prompt containing user query', async () => {
    setupFileMocks();
    const node = createFastImplementNode(mockExecutor);
    const state = createMockState();

    await node(state);

    // 1 implementation call + 1 evidence sub-agent call = 2
    expect(mockExecutor.execute).toHaveBeenCalledTimes(2);
    const [prompt] = (mockExecutor.execute as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(prompt).toContain('Fix the typo in the README');
  });

  it('should return state with currentNode="fast-implement"', async () => {
    setupFileMocks();
    const node = createFastImplementNode(mockExecutor);
    const state = createMockState();

    const result = await node(state);

    expect(result.currentNode).toBe('fast-implement');
  });

  it('should include messages with completion info', async () => {
    setupFileMocks();
    const node = createFastImplementNode(mockExecutor);
    const state = createMockState();

    const result = await node(state);

    expect(result.messages).toBeDefined();
    expect(result.messages!.length).toBeGreaterThan(0);
    expect(result.messages![0]).toContain('[fast-implement]');
  });

  it('should use buildExecutorOptions for cwd configuration', async () => {
    setupFileMocks();
    const node = createFastImplementNode(mockExecutor);
    const state = createMockState({ worktreePath: '/custom/wt' });

    await node(state);

    const [, options] = (mockExecutor.execute as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(options.cwd).toBe('/custom/wt');
  });

  it('should propagate executor errors by throwing', async () => {
    setupFileMocks();
    // Use a non-retryable error (Process exited) so retryExecute throws immediately
    (mockExecutor.execute as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Process exited with code 1')
    );
    const node = createFastImplementNode(mockExecutor);
    const state = createMockState();

    await expect(node(state)).rejects.toThrow('Process exited with code 1');
  });

  it('should throw when executor produces no file changes', async () => {
    setupFileMocks();
    // git status --porcelain returns empty string = no changes
    mockExecSync.mockReturnValue('');
    const node = createFastImplementNode(mockExecutor);
    const state = createMockState();

    await expect(node(state)).rejects.toThrow('no file changes');
  });

  it('should succeed when executor produces file changes', async () => {
    setupFileMocks();
    // git status --porcelain returns modified files
    mockExecSync.mockReturnValue('M  src/index.ts\n?? src/new-file.ts\n');
    const node = createFastImplementNode(mockExecutor);
    const state = createMockState();

    const result = await node(state);

    expect(result.currentNode).toBe('fast-implement');
    expect(result._needsReexecution).toBe(false);
  });

  it('should skip execution when fast-implement is already in completedPhases', async () => {
    setupFileMocks();
    mockGetCompletedPhases.mockReturnValue(['fast-implement']);
    const node = createFastImplementNode(mockExecutor);
    const state = createMockState();

    const result = await node(state);

    expect(mockExecutor.execute).not.toHaveBeenCalled();
    expect(result.currentNode).toBe('fast-implement');
    expect(result.messages![0]).toContain('already completed');
  });

  it('should call markPhaseComplete after successful execution', async () => {
    setupFileMocks();
    mockGetCompletedPhases.mockReturnValue([]);
    const node = createFastImplementNode(mockExecutor);
    const state = createMockState();

    await node(state);

    expect(mockMarkPhaseComplete).toHaveBeenCalledWith(
      state.specDir,
      'fast-implement',
      expect.anything()
    );
  });

  it('should NOT call markPhaseComplete when execution fails', async () => {
    setupFileMocks();
    mockGetCompletedPhases.mockReturnValue([]);
    (mockExecutor.execute as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Process exited with code 1')
    );
    const node = createFastImplementNode(mockExecutor);
    const state = createMockState();

    await expect(node(state)).rejects.toThrow();
    expect(mockMarkPhaseComplete).not.toHaveBeenCalled();
  });
});
