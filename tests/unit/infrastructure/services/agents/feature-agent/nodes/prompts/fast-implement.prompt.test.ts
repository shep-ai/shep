import { describe, it, expect, vi } from 'vitest';

// Mock node:fs so the prompt builder doesn't hit real filesystem
vi.mock('node:fs', () => ({
  readFileSync: vi.fn((path: string) => {
    if (path.endsWith('CLAUDE.md')) return '# Test Project';
    if (path.endsWith('package.json')) return '{"name": "test"}';
    throw new Error(`ENOENT: ${path}`);
  }),
  readdirSync: vi.fn(() => []),
  statSync: vi.fn(() => ({ isDirectory: () => false })),
}));

// Mock readSpecFile from node-helpers
vi.mock(
  '@/infrastructure/services/agents/feature-agent/nodes/node-helpers.js',
  async (importOriginal) => {
    const actual = (await importOriginal()) as Record<string, unknown>;
    return {
      ...actual,
      readSpecFile: vi
        .fn()
        .mockReturnValue('name: Test Feature\nuserQuery: Add dark mode\nsummary: A test feature\n'),
    };
  }
);

import { buildFastImplementPrompt } from '@/infrastructure/services/agents/feature-agent/nodes/prompts/fast-implement.prompt.js';
import { COMMIT_CO_AUTHOR } from '@/infrastructure/services/git/pr-branding.js';
import type { FeatureAgentState } from '@/infrastructure/services/agents/feature-agent/state.js';

function baseState(overrides: Partial<FeatureAgentState> = {}): FeatureAgentState {
  return {
    featureId: 'feat-001',
    repositoryPath: '/tmp/repo',
    worktreePath: '/tmp/worktree',
    specDir: '/tmp/specs',
    currentNode: 'fast-implement',
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

describe('buildFastImplementPrompt — co-author branding', () => {
  it('should include Shep Bot co-author trailer in commit instructions', () => {
    const prompt = buildFastImplementPrompt(baseState());
    expect(prompt).toContain(COMMIT_CO_AUTHOR);
    expect(prompt).toContain('Shep Bot');
  });

  it('should instruct NOT to include Claude co-author trailer', () => {
    const prompt = buildFastImplementPrompt(baseState());
    expect(prompt).toContain('Do NOT include any other Co-Authored-By trailer');
    expect(prompt).toContain('Claude');
  });

  it('should include co-author trailer when push=true', () => {
    const prompt = buildFastImplementPrompt(baseState({ push: true }));
    expect(prompt).toContain(COMMIT_CO_AUTHOR);
  });
});
