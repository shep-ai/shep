import { describe, it, expect } from 'vitest';
import { TaskComplexity } from '@shepai/core/domain/generated/output';
import {
  normalizeTaskComplexity,
  classifyTaskComplexity,
  getModelTierInfo,
  resolveModelForComplexity,
  resolveAdaptiveTierPlan,
  isAdaptiveModelSelectionEnabled,
  tierOverridesFrom,
  type ClassifiableTask,
} from '@shepai/core/domain/shared/model-tier';

const CLAUDE_CODE_CATALOG = [
  'claude-fable-5',
  'claude-opus-5',
  'claude-opus-4-8',
  'claude-sonnet-5',
  'claude-sonnet-4-6',
  'claude-haiku-4-5',
  'glm-5.2',
];

/** Cursor's catalog deliberately has no Haiku-class Claude model. */
const CURSOR_CATALOG = [
  'claude-opus-5',
  'claude-sonnet-5',
  'claude-sonnet-4-6',
  'gpt-5.4-high',
  'gemini-3.1-pro-preview',
  'composer-1.5',
];

const GEMINI_CATALOG = [
  'gemini-3.1-pro-preview',
  'gemini-3-flash-preview',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
];

describe('normalizeTaskComplexity', () => {
  it('accepts the canonical capitalized values', () => {
    expect(normalizeTaskComplexity('High')).toBe(TaskComplexity.High);
    expect(normalizeTaskComplexity('Medium')).toBe(TaskComplexity.Medium);
    expect(normalizeTaskComplexity('Low')).toBe(TaskComplexity.Low);
  });

  it('accepts loose casing and surrounding whitespace from LLM-authored YAML', () => {
    expect(normalizeTaskComplexity('  high ')).toBe(TaskComplexity.High);
    expect(normalizeTaskComplexity('LOW')).toBe(TaskComplexity.Low);
  });

  it('maps common synonyms an agent may emit instead of the enum', () => {
    expect(normalizeTaskComplexity('complex')).toBe(TaskComplexity.High);
    expect(normalizeTaskComplexity('hard')).toBe(TaskComplexity.High);
    expect(normalizeTaskComplexity('moderate')).toBe(TaskComplexity.Medium);
    expect(normalizeTaskComplexity('simple')).toBe(TaskComplexity.Low);
    expect(normalizeTaskComplexity('trivial')).toBe(TaskComplexity.Low);
  });

  it('returns undefined for absent or unrecognized values', () => {
    expect(normalizeTaskComplexity(undefined)).toBeUndefined();
    expect(normalizeTaskComplexity(null)).toBeUndefined();
    expect(normalizeTaskComplexity('')).toBeUndefined();
    expect(normalizeTaskComplexity('banana')).toBeUndefined();
    expect(normalizeTaskComplexity(42)).toBeUndefined();
  });
});

describe('classifyTaskComplexity', () => {
  const base: ClassifiableTask = {
    title: 'Do the thing',
    description: 'Does the thing.',
    acceptanceCriteria: ['it works'],
    tdd: null,
    estimatedEffort: '30min',
  };

  it('prefers an explicitly declared complexity over the heuristic', () => {
    expect(classifyTaskComplexity({ ...base, complexity: TaskComplexity.High })).toBe(
      TaskComplexity.High
    );
  });

  it('normalizes a loosely-spelled declared complexity', () => {
    expect(classifyTaskComplexity({ ...base, complexity: 'simple' })).toBe(TaskComplexity.Low);
  });

  it('classifies a short mechanical task with no TDD cycle as Low', () => {
    expect(
      classifyTaskComplexity({
        ...base,
        title: 'Add translation keys to all nine locale files',
        description: 'Copy the English keys into each locale file.',
        estimatedEffort: '15min',
      })
    ).toBe(TaskComplexity.Low);
  });

  it('classifies long, multi-criteria design work with a TDD cycle as High', () => {
    expect(
      classifyTaskComplexity({
        ...base,
        title: 'Design and implement the tier resolution architecture',
        description:
          'Introduce a new cross-cutting resolver that every surface funnels through, ' +
          'including a migration path for existing rows and a concurrency-safe cache.',
        acceptanceCriteria: ['a', 'b', 'c', 'd', 'e'],
        tdd: { red: ['x'], green: ['y'], refactor: ['z'] },
        estimatedEffort: '4h',
      })
    ).toBe(TaskComplexity.High);
  });

  it('classifies ordinary pattern-following work as Medium', () => {
    expect(
      classifyTaskComplexity({
        ...base,
        title: 'Add a settings section component',
        description: 'Follow the existing worktree settings section pattern.',
        acceptanceCriteria: ['renders', 'persists'],
        tdd: { red: ['x'], green: ['y'], refactor: [] },
        estimatedEffort: '1h',
      })
    ).toBe(TaskComplexity.Medium);
  });

  it('is deterministic — the same task always classifies the same way', () => {
    const task: ClassifiableTask = { ...base, estimatedEffort: '2h' };
    const first = classifyTaskComplexity(task);
    for (let i = 0; i < 5; i++) expect(classifyTaskComplexity(task)).toBe(first);
  });
});

describe('getModelTierInfo', () => {
  it('classifies known Claude models into family and tier', () => {
    expect(getModelTierInfo('claude-opus-5')).toEqual({
      family: 'claude',
      tier: TaskComplexity.High,
    });
    expect(getModelTierInfo('claude-sonnet-5')).toEqual({
      family: 'claude',
      tier: TaskComplexity.Medium,
    });
    expect(getModelTierInfo('claude-haiku-4-5')).toEqual({
      family: 'claude',
      tier: TaskComplexity.Low,
    });
  });

  it('treats the dotted Copilot spelling as the same family', () => {
    expect(getModelTierInfo('claude-haiku-4.5')).toEqual({
      family: 'claude',
      tier: TaskComplexity.Low,
    });
  });

  it('returns undefined for a model it does not know', () => {
    expect(getModelTierInfo('nvidia/nemotron-3-super-120b-a12b:free')).toBeUndefined();
  });
});

describe('resolveModelForComplexity', () => {
  it('degrades a High pin down to the low tier for a Low task', () => {
    expect(
      resolveModelForComplexity({
        baseModel: 'claude-opus-5',
        complexity: TaskComplexity.Low,
        availableModels: CLAUDE_CODE_CATALOG,
      })
    ).toBe('claude-haiku-4-5');
  });

  it('degrades a High pin to the medium tier for a Medium task', () => {
    expect(
      resolveModelForComplexity({
        baseModel: 'claude-opus-5',
        complexity: TaskComplexity.Medium,
        availableModels: CLAUDE_CODE_CATALOG,
      })
    ).toBe('claude-sonnet-5');
  });

  it('keeps the pinned model for a High task', () => {
    expect(
      resolveModelForComplexity({
        baseModel: 'claude-opus-5',
        complexity: TaskComplexity.High,
        availableModels: CLAUDE_CODE_CATALOG,
      })
    ).toBe('claude-opus-5');
  });

  it('never promotes above the pinned model — a Sonnet pin stays Sonnet for High work', () => {
    expect(
      resolveModelForComplexity({
        baseModel: 'claude-sonnet-4-6',
        complexity: TaskComplexity.High,
        availableModels: CLAUDE_CODE_CATALOG,
      })
    ).toBe('claude-sonnet-4-6');
  });

  it('still degrades below a mid-tier pin for Low work', () => {
    expect(
      resolveModelForComplexity({
        baseModel: 'claude-sonnet-4-6',
        complexity: TaskComplexity.Low,
        availableModels: CLAUDE_CODE_CATALOG,
      })
    ).toBe('claude-haiku-4-5');
  });

  it('stays inside the pinned model family — a Gemini pin never yields a Claude id', () => {
    expect(
      resolveModelForComplexity({
        baseModel: 'gemini-3.1-pro-preview',
        complexity: TaskComplexity.Low,
        availableModels: GEMINI_CATALOG,
      })
    ).toBe('gemini-2.5-flash-lite');
  });

  it('falls back toward the pinned model when the target tier is absent from the catalog', () => {
    // Cursor lists no Haiku-class Claude model, so a Low task settles on the
    // best available tier below the pin rather than emitting an unsupported id.
    expect(
      resolveModelForComplexity({
        baseModel: 'claude-opus-5',
        complexity: TaskComplexity.Low,
        availableModels: CURSOR_CATALOG,
      })
    ).toBe('claude-sonnet-5');
  });

  it('returns the pinned model unchanged when it is not in the tier catalog', () => {
    const custom = 'nvidia/nemotron-3-super-120b-a12b:free';
    expect(
      resolveModelForComplexity({
        baseModel: custom,
        complexity: TaskComplexity.Low,
        availableModels: [custom, 'claude-haiku-4-5'],
      })
    ).toBe(custom);
  });

  it('returns the pinned model unchanged when the catalog is empty', () => {
    expect(
      resolveModelForComplexity({
        baseModel: 'claude-opus-5',
        complexity: TaskComplexity.Low,
        availableModels: [],
      })
    ).toBe('claude-opus-5');
  });

  it('honours an explicit per-tier override even across families', () => {
    expect(
      resolveModelForComplexity({
        baseModel: 'claude-opus-5',
        complexity: TaskComplexity.Low,
        availableModels: CLAUDE_CODE_CATALOG,
        overrides: { low: 'glm-5.2' },
      })
    ).toBe('glm-5.2');
  });

  it('ignores a blank override', () => {
    expect(
      resolveModelForComplexity({
        baseModel: 'claude-opus-5',
        complexity: TaskComplexity.Low,
        availableModels: CLAUDE_CODE_CATALOG,
        overrides: { low: '   ' },
      })
    ).toBe('claude-haiku-4-5');
  });
});

describe('isAdaptiveModelSelectionEnabled', () => {
  it('reads absent config as disabled — every pre-migration installation', () => {
    expect(isAdaptiveModelSelectionEnabled(undefined)).toBe(false);
    expect(isAdaptiveModelSelectionEnabled({ adaptive: undefined })).toBe(false);
  });

  it('reads a present-but-disabled config as disabled', () => {
    expect(isAdaptiveModelSelectionEnabled({ adaptive: { enabled: false, low: 'x' } })).toBe(false);
  });

  it('reads an enabled config as enabled', () => {
    expect(isAdaptiveModelSelectionEnabled({ adaptive: { enabled: true } })).toBe(true);
  });
});

describe('tierOverridesFrom', () => {
  it('returns undefined when there is no adaptive config', () => {
    expect(tierOverridesFrom(undefined)).toBeUndefined();
  });

  it('lifts the three tier fields out of the config', () => {
    expect(tierOverridesFrom({ enabled: true, low: 'claude-haiku-4-5' })).toEqual({
      high: undefined,
      medium: undefined,
      low: 'claude-haiku-4-5',
    });
  });
});

describe('resolveAdaptiveTierPlan', () => {
  it('returns one model per tier for a flagship pin', () => {
    expect(
      resolveAdaptiveTierPlan({
        baseModel: 'claude-opus-5',
        availableModels: CLAUDE_CODE_CATALOG,
      })
    ).toEqual({
      high: 'claude-opus-5',
      medium: 'claude-sonnet-5',
      low: 'claude-haiku-4-5',
    });
  });

  it('collapses every tier onto the pin when the pin is the lowest tier', () => {
    expect(
      resolveAdaptiveTierPlan({
        baseModel: 'claude-haiku-4-5',
        availableModels: CLAUDE_CODE_CATALOG,
      })
    ).toEqual({
      high: 'claude-haiku-4-5',
      medium: 'claude-haiku-4-5',
      low: 'claude-haiku-4-5',
    });
  });

  it('collapses every tier onto an unknown pin', () => {
    expect(
      resolveAdaptiveTierPlan({
        baseModel: 'my-local-model',
        availableModels: ['my-local-model'],
      })
    ).toEqual({
      high: 'my-local-model',
      medium: 'my-local-model',
      low: 'my-local-model',
    });
  });
});
