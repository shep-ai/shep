/**
 * Prototype-Generate Prompt Builder Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FeatureAgentState } from '@/infrastructure/services/agents/feature-agent/state.js';

const { mockReadFileSync, mockReaddirSync, mockStatSync } = vi.hoisted(() => ({
  mockReadFileSync: vi.fn(),
  mockReaddirSync: vi.fn(),
  mockStatSync: vi.fn(),
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
    },
    readFileSync: mockReadFileSync,
    readdirSync: mockReaddirSync,
    statSync: mockStatSync,
  };
});

import {
  buildPrototypeGeneratePrompt,
  buildFeedbackHistorySection,
} from '@/infrastructure/services/agents/feature-agent/nodes/prompts/prototype-generate.prompt.js';

const MOCK_SPEC_YAML = `name: workspace-grouping
userQuery: >
  Add workspace grouping to organize repos
summary: Group repos into workspaces
phase: Analysis
`;

const MOCK_FEATURE_YAML = `feature:
  id: test
  description: Add workspace grouping
status:
  phase: exploring
  completedPhases: []
`;

function createState(overrides?: Partial<FeatureAgentState>): FeatureAgentState {
  return {
    featureId: 'feat-explore-1',
    repositoryPath: '/test/repo',
    specDir: '/test/specs/082-explore',
    worktreePath: '/test/worktree',
    currentNode: 'prototype-generate',
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
    enableEvidence: false,
    commitEvidence: false,
    iterationCount: 0,
    maxIterations: 10,
    feedbackHistory: [],
    explorationStatus: 'generating',
    ...overrides,
  };
}

function setupFileMocks(): void {
  mockReadFileSync.mockImplementation((path: string) => {
    if (typeof path === 'string') {
      if (path.endsWith('spec.yaml')) return MOCK_SPEC_YAML;
      if (path.endsWith('feature.yaml')) return MOCK_FEATURE_YAML;
      if (path.endsWith('CLAUDE.md')) return '# Project\nUse TypeScript.';
    }
    throw new Error(`ENOENT: ${path}`);
  });

  mockReaddirSync.mockReturnValue(['src', 'package.json']);
  mockStatSync.mockImplementation((path: string) => {
    const name = path.split('/').pop() ?? '';
    return { isDirectory: () => !name.includes('.') };
  });
}

describe('buildPrototypeGeneratePrompt', () => {
  beforeEach(() => {
    mockReadFileSync.mockReset();
    mockReaddirSync.mockReset();
    mockStatSync.mockReset();
  });

  it('includes user query in output', () => {
    setupFileMocks();
    const state = createState();
    const prompt = buildPrototypeGeneratePrompt(state);

    expect(prompt).toContain('Add workspace grouping to organize repos');
  });

  it('includes exploration mode instructions', () => {
    setupFileMocks();
    const state = createState();
    const prompt = buildPrototypeGeneratePrompt(state);

    expect(prompt).toContain('EXPLORATION MODE');
    expect(prompt).toContain('SPEED over quality');
    expect(prompt).toContain('throwaway code');
  });

  it('on iteration 0 has no feedback context', () => {
    setupFileMocks();
    const state = createState({ iterationCount: 0, feedbackHistory: [] });
    const prompt = buildPrototypeGeneratePrompt(state);

    expect(prompt).not.toContain('Feedback History');
    expect(prompt).not.toContain('Current Iteration');
    expect(prompt).toContain("User's Idea");
  });

  it('on iteration 3 includes feedback history', () => {
    setupFileMocks();
    const state = createState({
      iterationCount: 3,
      feedbackHistory: ['make it blue', 'add a sidebar', 'the sidebar should be collapsible'],
    });
    const prompt = buildPrototypeGeneratePrompt(state);

    expect(prompt).toContain('Feedback History');
    expect(prompt).toContain('make it blue');
    expect(prompt).toContain('add a sidebar');
    expect(prompt).toContain('the sidebar should be collapsible');
    expect(prompt).toContain('Current Iteration: 4');
  });

  it('on iteration 5+ summarizes older feedback', () => {
    setupFileMocks();
    const state = createState({
      iterationCount: 5,
      feedbackHistory: [
        'first change',
        'second change',
        'third change - this is a very long piece of feedback that goes on and on and on and beyond the 100 character limit for summarization',
        'fourth change',
        'fifth change',
      ],
    });
    const prompt = buildPrototypeGeneratePrompt(state);

    // Older entries (first 2) should be summarized
    expect(prompt).toContain('Earlier feedback (summarized)');
    // Recent entries (last 3) should be in full
    expect(prompt).toContain('Recent feedback (act on these)');
    expect(prompt).toContain('fourth change');
    expect(prompt).toContain('fifth change');
  });

  it('includes CLAUDE.md content when present', () => {
    setupFileMocks();
    const state = createState();
    const prompt = buildPrototypeGeneratePrompt(state);

    expect(prompt).toContain('Project Guidelines');
    expect(prompt).toContain('Use TypeScript.');
  });

  it('includes working directory path', () => {
    setupFileMocks();
    const state = createState({ worktreePath: '/custom/worktree' });
    const prompt = buildPrototypeGeneratePrompt(state);

    expect(prompt).toContain('/custom/worktree');
  });

  it('instructs not to write tests', () => {
    setupFileMocks();
    const state = createState();
    const prompt = buildPrototypeGeneratePrompt(state);

    expect(prompt).toContain('Do NOT write tests');
  });

  it('instructs not to push to remote', () => {
    setupFileMocks();
    const state = createState();
    const prompt = buildPrototypeGeneratePrompt(state);

    expect(prompt).toContain('Do NOT push to remote');
  });

  it('falls back to feature.yaml when spec.yaml has no content', () => {
    mockReadFileSync.mockImplementation((path: string) => {
      if (typeof path === 'string') {
        if (path.endsWith('spec.yaml')) throw new Error('ENOENT');
        if (path.endsWith('feature.yaml')) return MOCK_FEATURE_YAML;
      }
      throw new Error(`ENOENT: ${path}`);
    });
    mockReaddirSync.mockReturnValue([]);
    mockStatSync.mockReturnValue({ isDirectory: () => false });

    const state = createState();
    const prompt = buildPrototypeGeneratePrompt(state);

    expect(prompt).toContain('Add workspace grouping');
  });
});

describe('buildFeedbackHistorySection', () => {
  it('returns empty string for empty history', () => {
    expect(buildFeedbackHistorySection([])).toBe('');
  });

  it('includes single feedback entry', () => {
    const result = buildFeedbackHistorySection(['make it blue']);
    expect(result).toContain('make it blue');
    expect(result).toContain('Iteration 1');
  });

  it('includes multiple feedback entries', () => {
    const result = buildFeedbackHistorySection(['change A', 'change B', 'change C']);
    expect(result).toContain('change A');
    expect(result).toContain('change B');
    expect(result).toContain('change C');
  });

  it('summarizes entries beyond the recent 3', () => {
    const history = ['first', 'second', 'third', 'fourth', 'fifth'];
    const result = buildFeedbackHistorySection(history);

    expect(result).toContain('Earlier feedback (summarized)');
    expect(result).toContain('Recent feedback (act on these)');
    // First two should be summarized, last three in full
    expect(result).toContain('Iteration 1: first');
    expect(result).toContain('Iteration 2: second');
  });

  it('truncates long older feedback entries', () => {
    const longFeedback = 'x'.repeat(200);
    const history = [longFeedback, 'recent-1', 'recent-2', 'recent-3'];
    const result = buildFeedbackHistorySection(history);

    // The long entry should be truncated in the summarized section
    expect(result).toContain('...');
    // But recent entries should be in full
    expect(result).toContain('recent-1');
    expect(result).toContain('recent-2');
    expect(result).toContain('recent-3');
  });
});
