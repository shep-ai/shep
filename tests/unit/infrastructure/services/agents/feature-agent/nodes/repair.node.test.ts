import { describe, it, expect, vi, beforeEach } from 'vitest';

// Suppress logger output
vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

// Mock readSpecFile to avoid real filesystem access
vi.mock(
  '@/infrastructure/services/agents/feature-agent/nodes/node-helpers.js',
  async (importOriginal) => {
    const actual = (await importOriginal()) as Record<string, unknown>;
    return {
      ...actual,
      readSpecFile: vi.fn().mockReturnValue('name: \n'),
    };
  }
);

import {
  createRepairNode,
  buildRepairPrompt,
} from '@/infrastructure/services/agents/feature-agent/nodes/repair.node.js';
import type { FeatureAgentState } from '@/infrastructure/services/agents/feature-agent/state.js';
import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';

function createMockExecutor(): IAgentExecutor {
  return {
    agentType: 'claude-code' as never,
    execute: vi.fn().mockResolvedValue({ result: 'Fixed YAML content' }),
    executeStream: vi.fn(),
    supportsFeature: vi.fn().mockReturnValue(false),
  };
}

function baseState(_overrides: Partial<FeatureAgentState> = {}): FeatureAgentState {
  return {
    featureId: 'test-feat',
    repositoryPath: '/tmp/test',
    worktreePath: '/tmp/test',
    specDir: '/tmp/test/specs',
    currentNode: '',
    error: null,
    messages: [],
    approvalGates: undefined,
    validationRetries: 1,
    lastValidationTarget: 'spec.yaml',
    lastValidationErrors: ["Missing required string field 'name'"],
    prUrl: null,
    prNumber: null,
    commitHash: null,
    ciStatus: null,
    push: false,
    openPr: false,
    _approvalAction: null,
    _rejectionFeedback: null,
    _needsReexecution: false,
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
    injectSkills: false,
    commitEvidence: false,
    iterationCount: 0,
    maxIterations: 10,
    feedbackHistory: [],
    explorationStatus: undefined,
  } as FeatureAgentState;
}

describe('buildRepairPrompt', () => {
  it('includes validation errors in prompt', () => {
    const prompt = buildRepairPrompt(
      'spec.yaml',
      'name: \n',
      ["Missing required string field 'name'"],
      '/tmp/test/specs'
    );
    expect(prompt).toContain("Missing required string field 'name'");
    expect(prompt).toContain('spec.yaml');
    expect(prompt).toContain('name: \n');
  });

  it('includes file path for executor to write', () => {
    const prompt = buildRepairPrompt('spec.yaml', 'content', ['error'], '/tmp/specs');
    expect(prompt).toContain('/tmp/specs/spec.yaml');
  });

  it('handles multi-file repair (array of filenames)', () => {
    const prompt = buildRepairPrompt(
      ['plan.yaml', 'tasks.yaml'],
      'plan:\n  phases: []\ntasks:\n  tasks: []',
      ['Empty phases array', 'Empty tasks array'],
      '/tmp/specs'
    );
    expect(prompt).toContain('plan.yaml');
    expect(prompt).toContain('tasks.yaml');
    expect(prompt).toContain('/tmp/specs/plan.yaml');
    expect(prompt).toContain('/tmp/specs/tasks.yaml');
  });
});

describe('createRepairNode', () => {
  let executor: IAgentExecutor;

  beforeEach(() => {
    executor = createMockExecutor();
  });

  it('calls executor with constrained options', async () => {
    const node = createRepairNode('spec.yaml', executor);
    const state = baseState();
    await node(state);

    expect(executor.execute).toHaveBeenCalledTimes(1);
    const [, options] = (executor.execute as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(options.maxTurns).toBe(5);
    expect(options.disableMcp).toBe(true);
    expect(options.allowedTools).toEqual(['write']);
  });

  it('returns messages about repair attempt', async () => {
    const node = createRepairNode('spec.yaml', executor);
    const state = baseState();
    const result = await node(state);

    expect(result.messages).toBeDefined();
    expect(result.messages!.length).toBeGreaterThan(0);
    expect(result.messages![0]).toContain('repair');
  });

  it('handles multi-file repair', async () => {
    const node = createRepairNode(['plan.yaml', 'tasks.yaml'], executor);
    const state = baseState({
      lastValidationTarget: 'plan.yaml',
      lastValidationErrors: ['Empty phases', 'Missing tasks'],
    });
    await node(state);

    expect(executor.execute).toHaveBeenCalledTimes(1);
    const [prompt] = (executor.execute as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(prompt).toContain('plan.yaml');
    expect(prompt).toContain('tasks.yaml');
  });

  it('returns error message when executor throws', async () => {
    (executor.execute as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Agent crashed')
    );
    const node = createRepairNode('spec.yaml', executor);
    const state = baseState();
    const result = await node(state);

    expect(result.messages).toBeDefined();
    expect(result.messages![0]).toContain('Repair failed');
    expect(result.messages![0]).toContain('Agent crashed');
  });
});
