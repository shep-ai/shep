/**
 * Plan Prompt Tests
 *
 * The plan phase is the only place task complexity is authored, so the rubric
 * and the field must both survive edits to this prompt — without them the
 * implement node falls back to the heuristic for every task.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock(
  '@/infrastructure/services/agents/feature-agent/nodes/node-helpers.js',
  async (importOriginal) => {
    const actual = (await importOriginal()) as Record<string, unknown>;
    return {
      ...actual,
      readSpecFile: vi.fn().mockReturnValue('name: Test Feature\n'),
    };
  }
);

import { buildPlanPrompt } from '@/infrastructure/services/agents/feature-agent/nodes/prompts/plan.prompt.js';
import type { FeatureAgentState } from '@/infrastructure/services/agents/feature-agent/state.js';

function baseState(overrides: Partial<FeatureAgentState> = {}): FeatureAgentState {
  return {
    featureId: 'feat-001',
    repositoryPath: '/tmp/repo',
    worktreePath: '/tmp/worktree',
    specDir: '/tmp/specs/001-x',
    currentNode: 'plan',
    error: null,
    messages: [],
    commitSpecs: false,
    push: false,
    ...overrides,
  } as FeatureAgentState;
}

describe('buildPlanPrompt', () => {
  it('includes the complexity rubric with all three tiers', () => {
    const prompt = buildPlanPrompt(baseState());
    expect(prompt).toContain('Task Complexity Rubric');
    expect(prompt).toContain('`High`');
    expect(prompt).toContain('`Medium`');
    expect(prompt).toContain('`Low`');
  });

  it('puts the complexity field in the tasks.yaml template', () => {
    const prompt = buildPlanPrompt(baseState());
    expect(prompt).toContain('complexity: (High | Medium | Low');
  });

  it('lists the complexity requirement as a hard constraint', () => {
    const prompt = buildPlanPrompt(baseState());
    expect(prompt).toContain('Every task MUST carry a complexity of High, Medium, or Low');
  });

  it('still writes both plan.yaml and tasks.yaml into the spec dir', () => {
    const prompt = buildPlanPrompt(baseState({ specDir: '/tmp/specs/042-y' }));
    expect(prompt).toContain('/tmp/specs/042-y/plan.yaml');
    expect(prompt).toContain('/tmp/specs/042-y/tasks.yaml');
  });

  it('keeps the YAML output rules that guard against unparseable spec files', () => {
    const prompt = buildPlanPrompt(baseState());
    expect(prompt).toContain('YAML Output Rules');
  });
});
