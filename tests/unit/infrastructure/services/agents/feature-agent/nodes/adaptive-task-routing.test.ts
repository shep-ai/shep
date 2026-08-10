/**
 * Adaptive task routing tests.
 *
 * Covers the two decisions the implement node delegates: which model a task
 * should run on, and how tasks collapse into executor calls.
 */

import { describe, it, expect } from 'vitest';
import { TaskComplexity } from '@/domain/generated/output.js';
import {
  buildAdaptiveRouting,
  planTaskBatches,
  resolvePhaseModelId,
  summarizeRouting,
  type RoutableTask,
} from '@/infrastructure/services/agents/feature-agent/nodes/adaptive-task-routing.js';

function task(id: string, complexity?: TaskComplexity): RoutableTask {
  return {
    id,
    title: `Task ${id}`,
    description: '',
    acceptanceCriteria: [],
    tdd: null,
    estimatedEffort: '30min',
    ...(complexity ? { complexity } : {}),
  } as RoutableTask;
}

const CLAUDE_CODE = 'claude-code';

describe('buildAdaptiveRouting', () => {
  it('is disabled when the settings toggle is off', () => {
    const routing = buildAdaptiveRouting({
      agentType: CLAUDE_CODE,
      baseModel: 'claude-opus-5',
      adaptive: { enabled: false },
    });
    expect(routing.enabled).toBe(false);
  });

  it('is disabled when there is no adaptive config at all', () => {
    const routing = buildAdaptiveRouting({
      agentType: CLAUDE_CODE,
      baseModel: 'claude-opus-5',
      adaptive: undefined,
    });
    expect(routing.enabled).toBe(false);
  });

  it('is disabled when no model is pinned — there is no ceiling to degrade from', () => {
    const routing = buildAdaptiveRouting({
      agentType: CLAUDE_CODE,
      baseModel: undefined,
      adaptive: { enabled: true },
    });
    expect(routing.enabled).toBe(false);
  });

  it('resolves a Low task onto the low-tier model', () => {
    const routing = buildAdaptiveRouting({
      agentType: CLAUDE_CODE,
      baseModel: 'claude-opus-5',
      adaptive: { enabled: true },
    });
    expect(routing.enabled).toBe(true);
    expect(routing.resolve(task('t1', TaskComplexity.Low))).toEqual({
      complexity: TaskComplexity.Low,
      model: 'claude-haiku-4-5',
    });
  });

  it('keeps a High task on the pinned model', () => {
    const routing = buildAdaptiveRouting({
      agentType: CLAUDE_CODE,
      baseModel: 'claude-opus-5',
      adaptive: { enabled: true },
    });
    expect(routing.resolve(task('t1', TaskComplexity.High)).model).toBe('claude-opus-5');
  });

  it('classifies a task with no declared complexity instead of defaulting to the pin', () => {
    const routing = buildAdaptiveRouting({
      agentType: CLAUDE_CODE,
      baseModel: 'claude-opus-5',
      adaptive: { enabled: true },
    });
    const unlabelled: RoutableTask = {
      id: 't1',
      title: 'Add translation keys to every locale file',
      description: 'Copy the English keys across.',
      acceptanceCriteria: [],
      tdd: null,
      estimatedEffort: '15min',
    } as RoutableTask;

    const resolved = routing.resolve(unlabelled);
    expect(resolved.complexity).toBe(TaskComplexity.Low);
    expect(resolved.model).toBe('claude-haiku-4-5');
  });

  it('applies per-tier overrides from settings', () => {
    const routing = buildAdaptiveRouting({
      agentType: CLAUDE_CODE,
      baseModel: 'claude-opus-5',
      adaptive: { enabled: true, low: 'claude-sonnet-4-6' },
    });
    expect(routing.resolve(task('t1', TaskComplexity.Low)).model).toBe('claude-sonnet-4-6');
  });
});

describe('planTaskBatches', () => {
  const disabled = buildAdaptiveRouting({
    agentType: CLAUDE_CODE,
    baseModel: 'claude-opus-5',
    adaptive: { enabled: false },
  });
  const enabled = buildAdaptiveRouting({
    agentType: CLAUDE_CODE,
    baseModel: 'claude-opus-5',
    adaptive: { enabled: true },
  });

  it('emits a single model-less batch when routing is disabled', () => {
    const tasks = [task('t1', TaskComplexity.High), task('t2', TaskComplexity.Low)];
    const batches = planTaskBatches(tasks, disabled);

    expect(batches).toHaveLength(1);
    expect(batches[0].model).toBeUndefined();
    expect(batches[0].tasks).toEqual(tasks);
  });

  it('emits no batches for an empty task list', () => {
    expect(planTaskBatches([], enabled)).toEqual([]);
    expect(planTaskBatches([], disabled)).toEqual([]);
  });

  it('collapses consecutive same-model tasks into one batch', () => {
    const tasks = [
      task('t1', TaskComplexity.High),
      task('t2', TaskComplexity.High),
      task('t3', TaskComplexity.Low),
      task('t4', TaskComplexity.Low),
      task('t5', TaskComplexity.High),
    ];

    const batches = planTaskBatches(tasks, enabled);

    expect(batches.map((b) => ({ model: b.model, ids: b.tasks.map((t) => t.id) }))).toEqual([
      { model: 'claude-opus-5', ids: ['t1', 't2'] },
      { model: 'claude-haiku-4-5', ids: ['t3', 't4'] },
      { model: 'claude-opus-5', ids: ['t5'] },
    ]);
  });

  it('never reorders tasks — declared dependency order survives batching', () => {
    const tasks = [
      task('t1', TaskComplexity.Low),
      task('t2', TaskComplexity.High),
      task('t3', TaskComplexity.Low),
    ];

    const flattened = planTaskBatches(tasks, enabled).flatMap((b) => b.tasks.map((t) => t.id));
    expect(flattened).toEqual(['t1', 't2', 't3']);
  });

  it('labels each batch with the highest complexity it contains', () => {
    const tasks = [task('t1', TaskComplexity.High), task('t2', TaskComplexity.Medium)];
    // Both resolve to different models here, so check a same-model pairing:
    // Medium and High both pin to Sonnet when Sonnet is the ceiling.
    const sonnetPinned = buildAdaptiveRouting({
      agentType: CLAUDE_CODE,
      baseModel: 'claude-sonnet-4-6',
      adaptive: { enabled: true },
    });

    const batches = planTaskBatches(tasks, sonnetPinned);
    expect(batches).toHaveLength(1);
    expect(batches[0].complexity).toBe(TaskComplexity.High);
  });
});

describe('summarizeRouting', () => {
  const enabled = buildAdaptiveRouting({
    agentType: CLAUDE_CODE,
    baseModel: 'claude-opus-5',
    adaptive: { enabled: true },
  });

  it('groups the task list by resolved tier and model', () => {
    const tasks = [
      task('t1', TaskComplexity.High),
      task('t2', TaskComplexity.Low),
      task('t3', TaskComplexity.Low),
    ];

    const summary = summarizeRouting(tasks, enabled);

    expect(summary).toContain('1× High → claude-opus-5');
    expect(summary).toContain('2× Low → claude-haiku-4-5');
  });

  it('returns an empty string for an empty task list', () => {
    expect(summarizeRouting([], enabled)).toBe('');
  });
});

describe('resolvePhaseModelId', () => {
  const disabled = buildAdaptiveRouting({
    agentType: CLAUDE_CODE,
    baseModel: 'claude-opus-5',
    adaptive: { enabled: false },
  });
  const enabled = buildAdaptiveRouting({
    agentType: CLAUDE_CODE,
    baseModel: 'claude-opus-5',
    adaptive: { enabled: true },
  });

  it('reports the pinned model when routing is off', () => {
    const tasks = [task('t1', TaskComplexity.Low)];
    expect(resolvePhaseModelId(tasks, disabled, 'claude-opus-5')).toBe('claude-opus-5');
  });

  it('reports the single model a homogeneous phase actually uses', () => {
    const tasks = [task('t1', TaskComplexity.Low), task('t2', TaskComplexity.Low)];
    expect(resolvePhaseModelId(tasks, enabled, 'claude-opus-5')).toBe('claude-haiku-4-5');
  });

  it('reports every model a mixed phase uses', () => {
    const tasks = [task('t1', TaskComplexity.High), task('t2', TaskComplexity.Low)];
    expect(resolvePhaseModelId(tasks, enabled, 'claude-opus-5')).toBe(
      'claude-opus-5, claude-haiku-4-5'
    );
  });

  it('falls back to the pinned model for an empty phase', () => {
    expect(resolvePhaseModelId([], enabled, 'claude-opus-5')).toBe('claude-opus-5');
  });
});
