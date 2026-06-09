import { describe, it, expect, vi } from 'vitest';

// Mock readSpecFile from node-helpers
vi.mock(
  '@/infrastructure/services/agents/feature-agent/nodes/node-helpers.js',
  async (importOriginal) => {
    const actual = (await importOriginal()) as Record<string, unknown>;
    return {
      ...actual,
      readSpecFile: vi.fn().mockReturnValue('name: Test Feature\nsummary: A test feature\n'),
    };
  }
);

import {
  buildImplementPhasePrompt,
  type PlanPhase,
  type PhaseTask,
} from '@/infrastructure/services/agents/feature-agent/nodes/prompts/implement.prompt.js';
import { COMMIT_CO_AUTHOR } from '@/infrastructure/services/git/pr-branding.js';
import type { FeatureAgentState } from '@/infrastructure/services/agents/feature-agent/state.js';

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

const samplePhase: PlanPhase = {
  id: 'phase-1',
  name: 'Core Implementation',
  description: 'Implement the core logic',
  parallel: false,
};

const sampleTask: PhaseTask = {
  id: 'task-1',
  phaseId: 'phase-1',
  title: 'Add branding function',
  description: 'Create a function that applies branding',
  state: 'pending',
  dependencies: [],
  acceptanceCriteria: ['Function exists', 'Tests pass'],
  tdd: null,
  estimatedEffort: 'S',
};

describe('buildImplementPhasePrompt — project memory', () => {
  it('injects the project-memory section when present', () => {
    const prompt = buildImplementPhasePrompt(
      baseState({ projectMemory: '### Conventions\n- Always TDD.' }),
      samplePhase,
      [sampleTask],
      { isLastPhase: false, phaseIndex: 0, totalPhases: 1 }
    );
    expect(prompt).toContain('Project Memory (read-only reference)');
    expect(prompt).toContain('Always TDD.');
  });

  it('omits the section when no memory is present', () => {
    const prompt = buildImplementPhasePrompt(baseState(), samplePhase, [sampleTask], {
      isLastPhase: false,
      phaseIndex: 0,
      totalPhases: 1,
    });
    expect(prompt).not.toContain('Project Memory (read-only reference)');
  });
});

describe('buildImplementPhasePrompt — co-author branding', () => {
  it('should include Shep Bot co-author trailer in commit instructions', () => {
    const prompt = buildImplementPhasePrompt(baseState(), samplePhase, [sampleTask], {
      isLastPhase: false,
      phaseIndex: 0,
      totalPhases: 1,
    });
    expect(prompt).toContain(COMMIT_CO_AUTHOR);
    expect(prompt).toContain('Shep Bot');
  });

  it('should instruct NOT to include Claude co-author trailer', () => {
    const prompt = buildImplementPhasePrompt(baseState(), samplePhase, [sampleTask], {
      isLastPhase: false,
      phaseIndex: 0,
      totalPhases: 1,
    });
    expect(prompt).toContain('Do NOT include any other Co-Authored-By trailer');
    expect(prompt).toContain('Claude');
  });

  it('should include co-author trailer in last phase too', () => {
    const prompt = buildImplementPhasePrompt(baseState(), samplePhase, [sampleTask], {
      isLastPhase: true,
      phaseIndex: 0,
      totalPhases: 1,
    });
    expect(prompt).toContain(COMMIT_CO_AUTHOR);
  });

  it('should include co-author trailer when push=true', () => {
    const prompt = buildImplementPhasePrompt(baseState({ push: true }), samplePhase, [sampleTask], {
      isLastPhase: false,
      phaseIndex: 0,
      totalPhases: 1,
    });
    expect(prompt).toContain(COMMIT_CO_AUTHOR);
  });
});
