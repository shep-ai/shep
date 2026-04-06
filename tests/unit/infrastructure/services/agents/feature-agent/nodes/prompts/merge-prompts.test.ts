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
  buildCommitPushPrPrompt,
  buildLocalSquashMergePrompt,
} from '@/infrastructure/services/agents/feature-agent/nodes/prompts/merge-prompts.js';
import { PR_BRANDING } from '@/infrastructure/services/git/pr-branding.js';
import { readSpecFile } from '@/infrastructure/services/agents/feature-agent/nodes/node-helpers.js';
import type { FeatureAgentState } from '@/infrastructure/services/agents/feature-agent/state.js';

function baseState(overrides: Partial<FeatureAgentState> = {}): FeatureAgentState {
  return {
    featureId: 'feat-001',
    repositoryPath: '/tmp/repo',
    worktreePath: '/tmp/worktree',
    specDir: '/tmp/specs',
    currentNode: 'merge',
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

describe('buildCommitPushPrPrompt', () => {
  it('should always include commit instructions', () => {
    const prompt = buildCommitPushPrPrompt(
      baseState({ push: false, openPr: false }),
      'feat/test',
      'main'
    );
    expect(prompt).toContain('commit');
    // Should include conventional commit guidance
    expect(prompt.toLowerCase()).toMatch(/conventional commit/i);
  });

  it('should include push instructions when push=true', () => {
    const prompt = buildCommitPushPrPrompt(
      baseState({ push: true, openPr: false }),
      'feat/test',
      'main'
    );
    expect(prompt.toLowerCase()).toContain('push');
  });

  it('should include push instructions when openPr=true (implied push)', () => {
    const prompt = buildCommitPushPrPrompt(
      baseState({ push: false, openPr: true }),
      'feat/test',
      'main'
    );
    expect(prompt.toLowerCase()).toContain('push');
  });

  it('should include PR creation instructions when openPr=true', () => {
    const prompt = buildCommitPushPrPrompt(baseState({ openPr: true }), 'feat/test', 'main');
    expect(prompt.toLowerCase()).toContain('pull request');
    expect(prompt).toContain('gh pr create');
  });

  it('should NOT include push instructions when push=false and openPr=false', () => {
    const prompt = buildCommitPushPrPrompt(
      baseState({ push: false, openPr: false }),
      'feat/test',
      'main'
    );
    // Should explicitly say commit only, or not include push step
    expect(prompt).not.toContain('git push');
    expect(prompt).not.toContain('gh pr create');
  });

  it('should NOT include PR instructions when openPr=false', () => {
    const prompt = buildCommitPushPrPrompt(
      baseState({ push: true, openPr: false }),
      'feat/test',
      'main'
    );
    expect(prompt).not.toContain('gh pr create');
  });

  it('should include spec context', () => {
    const prompt = buildCommitPushPrPrompt(baseState(), 'feat/test', 'main');
    // readSpecFile is mocked to return 'name: Test Feature...'
    expect(prompt).toContain('Test Feature');
  });

  it('should include branch names', () => {
    const prompt = buildCommitPushPrPrompt(baseState(), 'feat/my-branch', 'main');
    expect(prompt).toContain('feat/my-branch');
    expect(prompt).toContain('main');
  });

  it('should instruct agent to write commit message from diff', () => {
    const prompt = buildCommitPushPrPrompt(baseState(), 'feat/test', 'main');
    expect(prompt.toLowerCase()).toMatch(/diff|changes/);
  });

  it('should not instruct agent to update feature.yaml (PR data persisted via DB)', () => {
    const prompt = buildCommitPushPrPrompt(baseState({ openPr: true }), 'feat/test', 'main');
    expect(prompt).not.toContain('feature.yaml');
  });

  it('should include local verification step before pushing when push=true', () => {
    const prompt = buildCommitPushPrPrompt(
      baseState({ push: true, openPr: false }),
      'feat/test',
      'main'
    );
    expect(prompt).toContain('Build the project');
    expect(prompt).toContain('Run the test suite');
    expect(prompt).toContain('Run the linter');
    // Verification must come BEFORE push in the prompt
    const verifyIndex = prompt.indexOf('Build the project');
    const pushIndex = prompt.indexOf('git push');
    expect(verifyIndex).toBeLessThan(pushIndex);
  });

  it('should NOT include local verification step when not pushing', () => {
    const prompt = buildCommitPushPrPrompt(
      baseState({ push: false, openPr: false }),
      'feat/test',
      'main'
    );
    expect(prompt).not.toContain('Build the project');
    expect(prompt).not.toContain('Run the test suite');
    expect(prompt).not.toContain('Run the linter');
  });

  it('should forbid git pull and rebase before pushing', () => {
    const prompt = buildCommitPushPrPrompt(
      baseState({ push: true, openPr: false }),
      'feat/test',
      'main'
    );
    expect(prompt).toContain('Do NOT run `git pull`');
    expect(prompt).toContain('git rebase');
    expect(prompt).toContain('git merge');
  });

  it('should be deterministic (same input = same output)', () => {
    const state = baseState({ push: true, openPr: true });
    const prompt1 = buildCommitPushPrPrompt(state, 'feat/test', 'main');
    const prompt2 = buildCommitPushPrPrompt(state, 'feat/test', 'main');
    expect(prompt1).toBe(prompt2);
  });

  it('should forbid source code modification when no rejection feedback', () => {
    const prompt = buildCommitPushPrPrompt(baseState(), 'feat/test', 'main');
    expect(prompt).toContain('Do NOT modify any source code files');
    expect(prompt).not.toContain('MUST modify source code');
  });

  it('should include Shep branding instruction when openPr=true', () => {
    const prompt = buildCommitPushPrPrompt(baseState({ openPr: true }), 'feat/test', 'main');
    expect(prompt).toContain(PR_BRANDING);
    expect(prompt).toContain('Do NOT include any other attribution footer');
  });

  it('should NOT include branding instruction when openPr=false', () => {
    const prompt = buildCommitPushPrPrompt(
      baseState({ push: true, openPr: false }),
      'feat/test',
      'main'
    );
    expect(prompt).not.toContain(PR_BRANDING);
  });

  it('should instruct agent to modify source code when rejection feedback exists', () => {
    const specWithRejection = [
      'name: Test Feature',
      'rejectionFeedback:',
      '  - iteration: 1',
      '    message: rename the phase name',
      '    phase: merge',
      '    timestamp: "2026-01-01T00:00:00Z"',
    ].join('\n');
    vi.mocked(readSpecFile).mockReturnValueOnce(specWithRejection);
    const prompt = buildCommitPushPrPrompt(baseState(), 'feat/test', 'main');
    expect(prompt).toContain('MUST modify source code');
    expect(prompt).not.toContain('Do NOT modify any source code files');
    expect(prompt).toContain('rename the phase name');
  });
});

describe('buildLocalSquashMergePrompt', () => {
  it('should include repository path', () => {
    const prompt = buildLocalSquashMergePrompt(
      '/tmp/repo',
      'feat/test',
      'main',
      'feat: squash merge feat/test into main',
      'CONFLICT in .gitignore'
    );
    expect(prompt).toContain('/tmp/repo');
  });

  it('should include branch names', () => {
    const prompt = buildLocalSquashMergePrompt(
      '/tmp/repo',
      'feat/my-branch',
      'develop',
      'feat: squash merge',
      'CONFLICT'
    );
    expect(prompt).toContain('feat/my-branch');
    expect(prompt).toContain('develop');
  });

  it('should include conflict details', () => {
    const conflictDetails =
      'CONFLICT (content): Merge conflict in .gitignore\nCONFLICT (content): Merge conflict in package.json';
    const prompt = buildLocalSquashMergePrompt(
      '/tmp/repo',
      'feat/test',
      'main',
      'feat: squash merge',
      conflictDetails
    );
    expect(prompt).toContain('CONFLICT (content): Merge conflict in .gitignore');
    expect(prompt).toContain('CONFLICT (content): Merge conflict in package.json');
  });

  it('should include commit message', () => {
    const prompt = buildLocalSquashMergePrompt(
      '/tmp/repo',
      'feat/test',
      'main',
      'feat: squash merge feat/test into main',
      'CONFLICT'
    );
    expect(prompt).toContain('feat: squash merge feat/test into main');
  });

  it('should instruct checkout, merge, and conflict resolution steps', () => {
    const prompt = buildLocalSquashMergePrompt(
      '/tmp/repo',
      'feat/test',
      'main',
      'feat: squash merge',
      'CONFLICT'
    );
    expect(prompt).toContain('git checkout main');
    expect(prompt).toContain('git merge --squash feat/test');
    expect(prompt).toContain('git commit');
    expect(prompt).toContain('git branch -d feat/test');
  });

  it('should forbid pushing', () => {
    const prompt = buildLocalSquashMergePrompt(
      '/tmp/repo',
      'feat/test',
      'main',
      'feat: squash merge',
      'CONFLICT'
    );
    expect(prompt).toContain('Do NOT push');
  });

  it('should be deterministic (same input = same output)', () => {
    const args = [
      '/tmp/repo',
      'feat/test',
      'main',
      'feat: squash merge',
      'CONFLICT in .gitignore',
    ] as const;
    const prompt1 = buildLocalSquashMergePrompt(...args);
    const prompt2 = buildLocalSquashMergePrompt(...args);
    expect(prompt1).toBe(prompt2);
  });
});
