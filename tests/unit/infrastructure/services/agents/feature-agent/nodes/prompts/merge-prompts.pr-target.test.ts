import { describe, it, expect, vi } from 'vitest';

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

import { buildCommitPushPrPrompt } from '@/infrastructure/services/agents/feature-agent/nodes/prompts/merge-prompts.js';
import type { PrTarget } from '@/application/services/pr-target-resolution.js';
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
    openPr: true,
    evidence: [],
    ...overrides,
  } as FeatureAgentState;
}

const upstreamTarget: PrTarget = {
  targetRepo: 'shep-ai/shep',
  baseBranch: 'main',
  headRef: 'kevinnguyenhoang91:fix/pr_upstream',
};

describe('buildCommitPushPrPrompt — PR target resolution', () => {
  it('instructs PR creation on upstream when a target is resolved', () => {
    const prompt = buildCommitPushPrPrompt(
      baseState(),
      'fix/pr_upstream',
      'main',
      undefined,
      upstreamTarget
    );
    expect(prompt).toContain(
      'gh pr create --repo shep-ai/shep --base main --head kevinnguyenhoang91:fix/pr_upstream'
    );
    expect(prompt).toContain('MUST be created on `shep-ai/shep` (upstream)');
    expect(prompt).not.toContain('gh pr create --base main --head fix/pr_upstream ');
  });

  it('keeps the origin instruction byte-identical when no target is resolved', () => {
    const prompt = buildCommitPushPrPrompt(baseState(), 'feat/test', 'main', undefined, null);
    expect(prompt).toContain('gh pr create --base main --head feat/test');
    expect(prompt).not.toContain('--repo');
    expect(prompt).not.toContain('upstream');
  });

  it('preserves current behavior when prTarget argument is omitted entirely', () => {
    const withArg = buildCommitPushPrPrompt(baseState(), 'feat/test', 'main', undefined, null);
    const withoutArg = buildCommitPushPrPrompt(baseState(), 'feat/test', 'main');
    expect(withoutArg).toContain('gh pr create --base main --head feat/test');
    expect(withoutArg).not.toContain('--repo');
    expect(withoutArg).toBe(withArg);
  });
});
