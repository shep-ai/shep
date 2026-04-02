/**
 * FeatureContextBuilder Unit Tests
 *
 * TDD: RED → GREEN → REFACTOR
 */

import { describe, it, expect, vi } from 'vitest';

// Mock execFileSync to avoid slow shep CLI calls that cause timeouts in full suite.
// The builder calls shep --version and shep --help which are slow in CI.
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn((cmd: string, args: string[]) => {
    if (cmd === 'shep' && args[0] === '--version') return '0.0.0-test';
    if (cmd === 'shep' && args[0] === '--help')
      return 'Usage: shep [command]\n  feat  Manage features\n  ui    Launch UI';
    if (cmd === 'shep' && args[1] === '--help') return `shep ${args[0]} help text`;
    return '';
  }),
}));

import { FeatureContextBuilder } from '@/infrastructure/services/interactive/feature-context.builder.js';
import type { Feature, Task } from '@/domain/generated/output.js';
import { SdlcLifecycle, TaskState, FeatureMode } from '@/domain/generated/output.js';

function makeTask(overrides?: Partial<Task>): Task {
  return {
    id: 'task-1',
    title: 'Implement feature',
    description: 'Do the work',
    dependsOn: [],
    actionItems: [],
    baseBranch: 'main',
    state: TaskState.Todo,
    branch: 'feat/task-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeFeature(overrides?: Partial<Feature>): Feature {
  return {
    id: 'feat-1',
    name: 'My Awesome Feature',
    userQuery: 'I want an awesome feature',
    slug: 'my-awesome-feature',
    description: 'A one-liner description of the feature',
    repositoryPath: '/repo',
    branch: 'feat/my-awesome-feature',
    lifecycle: SdlcLifecycle.Implementation,
    messages: [],
    plan: {
      id: 'plan-1',
      overview: 'Build it',
      requirements: [],
      artifacts: [],
      tasks: [makeTask({ title: 'Task A', state: TaskState.Done })],
      state: 'Ready' as any,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    relatedArtifacts: [],
    mode: FeatureMode.Regular,
    push: false,
    openPr: false,
    forkAndPr: false,
    commitSpecs: false,
    ciWatchEnabled: false,
    approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
    worktreePath: '/repo/.worktrees/feat-my-awesome-feature',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Feature;
}

describe('FeatureContextBuilder', () => {
  const builder = new FeatureContextBuilder();

  it('includes the feature name in the output', () => {
    const feature = makeFeature({ name: 'Payment Gateway' });
    const ctx = builder.buildContext(feature, '/wt/path', []);
    expect(ctx).toContain('Payment Gateway');
  });

  it('includes the lifecycle phase in the output', () => {
    const feature = makeFeature({ lifecycle: SdlcLifecycle.Research });
    const ctx = builder.buildContext(feature, '/wt/path', []);
    expect(ctx).toContain('Research');
  });

  it('includes the git branch in the output', () => {
    const feature = makeFeature({ branch: 'feat/payment-gateway' });
    const ctx = builder.buildContext(feature, '/wt/path', []);
    expect(ctx).toContain('feat/payment-gateway');
  });

  it('includes the worktree path in the output', () => {
    const feature = makeFeature();
    const ctx = builder.buildContext(feature, '/absolute/worktree/path', []);
    expect(ctx).toContain('/absolute/worktree/path');
  });

  it('includes plan tasks with their statuses', () => {
    const feature = makeFeature({
      plan: {
        id: 'plan-1',
        overview: 'Build it',
        requirements: [],
        artifacts: [],
        tasks: [
          makeTask({ title: 'Setup DB', state: TaskState.Done }),
          makeTask({ id: 'task-2', title: 'Add routes', state: TaskState.WIP }),
        ],
        state: 'Ready' as any,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    const ctx = builder.buildContext(feature, '/wt', []);
    expect(ctx).toContain('Setup DB');
    expect(ctx).toContain('Add routes');
    expect(ctx).toContain(TaskState.Done);
    expect(ctx).toContain(TaskState.WIP);
  });

  it('returns non-empty string even when feature has no plan', () => {
    const feature = makeFeature({ plan: undefined });
    const ctx = builder.buildContext(feature, '/wt', []);
    expect(ctx.trim().length).toBeGreaterThan(0);
    expect(ctx).toContain('My Awesome Feature');
  });

  it('truncates tasks to 30 when feature has more than 30 tasks', () => {
    const tasks = Array.from({ length: 40 }, (_, i) =>
      makeTask({ id: `task-${i}`, title: `Task ${i}` })
    );
    const feature = makeFeature({
      plan: {
        id: 'plan-1',
        overview: 'Big plan',
        requirements: [],
        artifacts: [],
        tasks,
        state: 'Ready' as any,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    const ctx = builder.buildContext(feature, '/wt', []);
    // Should contain Task 0–29 but not Task 30–39
    expect(ctx).toContain('Task 0');
    expect(ctx).toContain('Task 29');
    expect(ctx).not.toContain('Task 30');
  });

  it('includes open PR URLs when provided', () => {
    const feature = makeFeature();
    const ctx = builder.buildContext(feature, '/wt', ['https://github.com/org/repo/pull/42']);
    expect(ctx).toContain('https://github.com/org/repo/pull/42');
  });

  it('produces output under approximately 15000 characters (2500 token budget for full system prompt)', () => {
    const tasks = Array.from({ length: 30 }, (_, i) =>
      makeTask({ id: `task-${i}`, title: `Task number ${i} with some description text` })
    );
    const feature = makeFeature({
      plan: {
        id: 'plan-1',
        overview: 'Large plan',
        requirements: [],
        artifacts: [],
        tasks,
        state: 'Ready' as any,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    const ctx = builder.buildContext(feature, '/very/long/worktree/path', [
      'https://github.com/org/repo/pull/1',
      'https://github.com/org/repo/pull/2',
    ]);
    // The builder now produces a full system prompt (identity, behavior, CLI reference,
    // and feature context). ~6 chars per token heuristic; 2500 tokens ≈ 15000 chars.
    expect(ctx.length).toBeLessThanOrEqual(15000);
  });

  it('includes the feature description/one-liner', () => {
    const feature = makeFeature({ description: 'Enable users to pay via card' });
    const ctx = builder.buildContext(feature, '/wt', []);
    expect(ctx).toContain('Enable users to pay via card');
  });
});
