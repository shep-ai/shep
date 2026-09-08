/**
 * Implement Node — adaptive model selection tests.
 *
 * Asserts what actually reaches the executor: how many calls a phase produces,
 * in what order, and which `options.model` each carries. The phase-timing,
 * lifecycle, heartbeat and SDLC-board contexts all no-op when unset, so this
 * exercises the real node with only the filesystem and settings stubbed.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  IAgentExecutor,
  AgentExecutionOptions,
} from '@/application/ports/output/agents/agent-executor.interface.js';
import type { AgentType, Settings } from '@/domain/generated/output.js';
import type { FeatureAgentState } from '@/infrastructure/services/agents/feature-agent/state.js';

const { mockReadFileSync, mockWriteFileSync, mockMkdirSync } = vi.hoisted(() => ({
  mockReadFileSync: vi.fn(),
  mockWriteFileSync: vi.fn(),
  mockMkdirSync: vi.fn(),
}));

vi.mock('node:fs', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      readFileSync: mockReadFileSync,
      writeFileSync: mockWriteFileSync,
      mkdirSync: mockMkdirSync,
    },
    readFileSync: mockReadFileSync,
    writeFileSync: mockWriteFileSync,
    mkdirSync: mockMkdirSync,
  };
});

const { mockHasSettings, mockGetSettings } = vi.hoisted(() => ({
  mockHasSettings: vi.fn().mockReturnValue(false),
  mockGetSettings: vi.fn(),
}));

vi.mock('@/infrastructure/services/settings.service.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, hasSettings: mockHasSettings, getSettings: mockGetSettings };
});

const { createImplementNode } = await import(
  '@/infrastructure/services/agents/feature-agent/nodes/implement.node.js'
);

// ─── Fixtures ───────────────────────────────────────────────────────

const SPEC_DIR = '/repo/specs/001-x';

interface TaskFixture {
  id: string;
  complexity?: string;
}

function tasksYaml(tasks: TaskFixture[]): string {
  const entries = tasks
    .map(
      (t) => `  - id: ${t.id}
    phaseId: phase-1
    title: "Task ${t.id}"
    description: "Does ${t.id}"
    state: Todo${t.complexity ? `\n    complexity: ${t.complexity}` : ''}
    dependencies: []
    acceptanceCriteria:
      - "works"
    tdd: null
    estimatedEffort: "30min"`
    )
    .join('\n');
  return `name: x\ntasks:\n${entries}\n`;
}

function planYaml(parallel: boolean): string {
  return `name: x
phases:
  - id: phase-1
    name: "Phase One"
    description: "does things"
    parallel: ${parallel}
`;
}

/**
 * Route readSpecFile()'s readFileSync calls to the right fixture by filename.
 * `feature.yaml` returns empty so the progress writer no-ops.
 */
function stubSpecFiles(plan: string, tasks: string): void {
  mockReadFileSync.mockImplementation((path: string) => {
    const name = String(path).replace(/\\/g, '/').split('/').pop();
    if (name === 'plan.yaml') return plan;
    if (name === 'tasks.yaml') return tasks;
    if (name === 'feature.yaml') return '';
    if (name === 'spec.yaml' || name === 'research.yaml') return 'name: x\n';
    throw new Error(`ENOENT: ${String(path)}`);
  });
}

function makeState(model?: string): FeatureAgentState {
  return {
    featureId: 'feat-1',
    repositoryPath: '/repo',
    worktreePath: '/repo',
    specDir: SPEC_DIR,
    currentNode: 'implement',
    messages: [],
    enableEvidence: false,
    ...(model ? { model } : {}),
  } as unknown as FeatureAgentState;
}

function makeExecutor(): { executor: IAgentExecutor; calls: AgentExecutionOptions[] } {
  const calls: AgentExecutionOptions[] = [];
  const executor: IAgentExecutor = {
    agentType: 'claude-code' as AgentType,
    execute: vi.fn(async (_prompt: string, options?: AgentExecutionOptions) => {
      calls.push(options ?? {});
      return { result: 'done' };
    }),
    executeStream: vi.fn(),
    supportsFeature: vi.fn().mockReturnValue(true),
  } as unknown as IAgentExecutor;
  return { executor, calls };
}

function settingsWithAdaptive(adaptive: Settings['models']['adaptive']): void {
  mockHasSettings.mockReturnValue(true);
  mockGetSettings.mockReturnValue({
    models: { default: 'claude-sonnet-4-6', adaptive },
    workflow: {},
  } as unknown as Settings);
}

describe('implement node — adaptive model selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasSettings.mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('makes exactly one executor call per sequential phase when adaptive is OFF', async () => {
    settingsWithAdaptive(undefined);
    stubSpecFiles(
      planYaml(false),
      tasksYaml([
        { id: 'task-1', complexity: 'High' },
        { id: 'task-2', complexity: 'Low' },
      ])
    );

    const { executor, calls } = makeExecutor();
    await createImplementNode(executor)(makeState('claude-opus-5'));

    expect(calls).toHaveLength(1);
    expect(calls[0].model).toBe('claude-opus-5');
  });

  it('runs a Low-complexity task on the low-tier model when adaptive is ON', async () => {
    settingsWithAdaptive({ enabled: true });
    stubSpecFiles(planYaml(false), tasksYaml([{ id: 'task-1', complexity: 'Low' }]));

    const { executor, calls } = makeExecutor();
    await createImplementNode(executor)(makeState('claude-opus-5'));

    expect(calls).toHaveLength(1);
    expect(calls[0].model).toBe('claude-haiku-4-5');
  });

  it('batches consecutive same-model tasks and preserves declared order', async () => {
    settingsWithAdaptive({ enabled: true });
    stubSpecFiles(
      planYaml(false),
      tasksYaml([
        { id: 'task-1', complexity: 'High' },
        { id: 'task-2', complexity: 'High' },
        { id: 'task-3', complexity: 'Low' },
        { id: 'task-4', complexity: 'Low' },
        { id: 'task-5', complexity: 'High' },
      ])
    );

    const { executor, calls } = makeExecutor();
    await createImplementNode(executor)(makeState('claude-opus-5'));

    expect(calls.map((c) => c.model)).toEqual([
      'claude-opus-5',
      'claude-haiku-4-5',
      'claude-opus-5',
    ]);
  });

  it('gives each task in a parallel phase its own resolved model', async () => {
    settingsWithAdaptive({ enabled: true });
    stubSpecFiles(
      planYaml(true),
      tasksYaml([
        { id: 'task-1', complexity: 'High' },
        { id: 'task-2', complexity: 'Low' },
      ])
    );

    const { executor, calls } = makeExecutor();
    await createImplementNode(executor)(makeState('claude-opus-5'));

    expect(calls).toHaveLength(2);
    expect(calls.map((c) => c.model).sort()).toEqual(['claude-haiku-4-5', 'claude-opus-5']);
  });

  it('honours the pinned model as a ceiling — a Sonnet pin never yields Opus', async () => {
    settingsWithAdaptive({ enabled: true });
    stubSpecFiles(planYaml(false), tasksYaml([{ id: 'task-1', complexity: 'High' }]));

    const { executor, calls } = makeExecutor();
    await createImplementNode(executor)(makeState('claude-sonnet-4-6'));

    expect(calls[0].model).toBe('claude-sonnet-4-6');
  });

  it('classifies unlabelled tasks rather than leaving them on the pinned model', async () => {
    settingsWithAdaptive({ enabled: true });
    stubSpecFiles(planYaml(false), tasksYaml([{ id: 'task-1' }]));

    const { executor, calls } = makeExecutor();
    await createImplementNode(executor)(makeState('claude-opus-5'));

    // The fixture task is short, has one criterion, no TDD cycle and a 30min
    // estimate — the heuristic reads that as Low.
    expect(calls[0].model).toBe('claude-haiku-4-5');
  });

  it('stays on the pinned model when no model is pinned for the run', async () => {
    settingsWithAdaptive({ enabled: true });
    stubSpecFiles(planYaml(false), tasksYaml([{ id: 'task-1', complexity: 'Low' }]));

    const { executor, calls } = makeExecutor();
    await createImplementNode(executor)(makeState(undefined));

    expect(calls).toHaveLength(1);
    expect(calls[0].model).toBeUndefined();
  });
});
