# Graph State Transition Tests — Guide

## What This Suite Tests

End-to-end LangGraph interrupt/checkpoint/resume cycles using the **real feature-agent graph** with a stubbed executor (no AI calls). These tests catch bugs that unit tests miss because they mock away LangGraph internals.

## Architecture

```
Real LangGraph graph + Real SQLite checkpointer + Stub executor + Real feature.yaml on disk
```

- **Graph**: `createFeatureAgentGraph()` from production code
- **Checkpointer**: In-memory SQLite (`:memory:`) — real checkpoint/resume behavior
- **Executor**: `StubExecutor` or `ControllableExecutor` — records calls, returns canned results
- **File I/O**: Real `feature.yaml` + `spec.yaml` in a temp dir
- **Isolation**: Each test gets a unique `thread_id` so checkpoints don't leak

## Test Files

| File                                  | Purpose                                                                    |
| ------------------------------------- | -------------------------------------------------------------------------- |
| `setup.ts`                            | `createTestContext()`, `StubExecutor`, `createStubMergeNodeDeps()`         |
| `fixtures.ts`                         | Valid YAML strings for spec, research, plan, tasks                         |
| `helpers.ts`                          | `expectInterruptAt()`, `approveCommand()`, `rejectCommand()`, gate presets |
| `approve-flow.test.ts`                | Approval paths — node skips re-execution on resume                         |
| `reject-flow.test.ts`                 | Rejection iteration — re-execute, re-interrupt cycles                      |
| `reject-feedback-propagation.test.ts` | Rejection feedback stored per-phase, propagated to prompts                 |
| `gate-configuration.test.ts`          | `ApprovalGates` combinations — which nodes interrupt                       |
| `feedback-and-timing.test.ts`         | Feedback in prompts, timing iteration names                                |
| `merge-flow.test.ts`                  | Merge node gate tests (interrupt, approve, reject at merge)                |
| `evidence-flow.test.ts`               | Evidence sub-agent collection within implement node                        |
| `resume-after-error.test.ts`          | Resume from failed non-merge nodes with persistent checkpointer            |
| `resume-after-error-merge.test.ts`    | Resume from failed merge — reject/approve/retry paths                      |
| `resume-feedback-propagation.test.ts` | User feedback propagated to retried node's prompt after failure            |
| `learned-harness-flow.test.ts`        | Learned harness (spec 150) reaches every agent call; no-op when none adopted |

## How to Run

```bash
# All graph state transition tests
pnpm vitest run --changed tests/integration/infrastructure/services/agents/graph-state-transitions/

# Single file
pnpm vitest run tests/integration/infrastructure/services/agents/graph-state-transitions/resume-after-error.test.ts
```

## Two Test Patterns

### Pattern 1: TestContext (approval/rejection/gate tests)

For tests involving interrupt/approve/reject cycles on interruptible nodes. Uses `createTestContext()` from `setup.ts`.

```typescript
import { createTestContext, type TestContext } from './setup.js';
import { expectInterruptAt, approveCommand, rejectCommand, ALL_GATES_DISABLED } from './helpers.js';

describe('Your Category', () => {
  let ctx: TestContext;
  let output: { restore: () => void };

  beforeAll(() => {
    ctx = createTestContext(); // or createTestContext({ withMerge: true })
    ctx.init();
    output = ctx.suppressOutput();
  });
  beforeEach(() => ctx.reset());
  afterAll(() => {
    output.restore();
    ctx.cleanup();
  });

  it('should interrupt and resume', async () => {
    const config = ctx.newConfig();
    const state = ctx.initialState(ALL_GATES_DISABLED);

    const r1 = await ctx.graph.invoke(state, config);
    expectInterruptAt(r1, 'requirements');

    const r2 = await ctx.graph.invoke(approveCommand(), config);
    expectInterruptAt(r2, 'plan');
  });
});
```

Key points:

- `ctx.reset()` in `beforeEach` creates fresh executor + graph + resets `feature.yaml`
- `ctx.newConfig()` gives unique `thread_id` per test
- `approveCommand()` / `rejectCommand(feedback)` are LangGraph `Command` wrappers
- Use `{ withMerge: true }` to include the merge node in the graph

### Pattern 2: ControllableExecutor + persistent checkpointer (resume-after-error tests)

For tests involving node failures and resume. The key difference: the **same checkpointer instance** persists across invocations to simulate real resume.

```typescript
function createControllableExecutor() {
  let callCount = 0;
  const prompts: string[] = [];
  let throwFromCall: number | null = null;

  const executeFn = vi.fn(async (prompt: string) => {
    callCount++;
    prompts.push(prompt);
    if (throwFromCall !== null && callCount >= throwFromCall) {
      throw new Error('Process exited with code 1: simulated failure');
    }
    return { result: `stub result #${callCount}`, exitCode: 0 };
  });

  return {
    agentType: 'claude-code' as never,
    execute: executeFn,
    executeStream: vi.fn(),
    supportsFeature: vi.fn().mockReturnValue(false),
    get callCount() {
      return callCount;
    },
    prompts,
    throwFromCall(n: number) {
      throwFromCall = n;
    },
    clearThrow() {
      throwFromCall = null;
    },
    resetCounts() {
      callCount = 0;
      prompts.length = 0;
      executeFn.mockClear();
    },
  };
}
```

Usage pattern for resume tests:

```typescript
function createResumableGraph(executor: ControllableExecutor) {
  const checkpointer = createCheckpointer(':memory:');
  const deps: FeatureAgentGraphDeps = { executor: executor as unknown as IAgentExecutor };
  const graph = createFeatureAgentGraph(deps, checkpointer);
  const config = { configurable: { thread_id: `test-${randomUUID()}` } };
  const initialState = {
    featureId: '...',
    repositoryPath: tempDir,
    worktreePath: tempDir,
    specDir,
    approvalGates: ALL_GATES_ENABLED,
  };
  return { graph, config, initialState };
}

it('should resume from failed node', async () => {
  const executor = createControllableExecutor();
  executor.throwFromCall(5); // Fail at implement (5th executor call)

  const { graph, config, initialState } = createResumableGraph(executor);

  // Invocation #1: fails at implement
  await expect(graph.invoke(initialState, config)).rejects.toThrow();

  executor.clearThrow();
  executor.resetCounts();

  // Invocation #2: resumes from implement (same config = same thread_id + checkpointer)
  const result = await graph.invoke(initialState, config);
  expectNoInterrupts(result);
  expect(getExecutedNodes(executor.prompts)).toEqual(['implement']);
});
```

**Error message must be non-retryable** — `retryExecute()` checks for `"Process exited with code"` and throws immediately. Without this prefix, the error gets retried internally and the test behavior is unpredictable.

For merge resume tests, use `createResumableGraphWithMerge()` which adds `createStubMergeNodeDeps()`.

## Feedback Propagation

Two mechanisms for getting user feedback into a retried node's prompt:

### 1. `appendRejectionFeedback()` — spec.yaml based

Simulates what `RejectAgentRunUseCase` does: writes a `rejectionFeedback` entry to `spec.yaml` which the node's prompt builder reads.

```typescript
function appendRejectionFeedback(specDir: string, message: string, phase: string): void {
  const spec = yaml.load(readFileSync(join(specDir, 'spec.yaml'), 'utf-8'));
  const existing = Array.isArray(spec.rejectionFeedback) ? spec.rejectionFeedback : [];
  spec.rejectionFeedback = [
    ...existing,
    { iteration: existing.length + 1, message, phase, timestamp: new Date().toISOString() },
  ];
  writeFileSync(join(specDir, 'spec.yaml'), yaml.dump(spec));
}
```

### 2. `resumeReason` state field

Pass `resumeReason: 'failed'` in state to tell the node it is a resumed run. The prompt builder includes a `RESUMED` marker.

```typescript
const result = await graph.invoke({ ...initialState, resumeReason: 'failed' }, config);
```

### 3. `Command({update})` — LangGraph state channels

For reject/approve on failed features, use Command to set `_approvalAction` and `_rejectionFeedback` state channels:

```typescript
await graph.invoke(
  new Command({
    resume: { rejected: true, feedback: 'fix the PR' },
    update: { _approvalAction: 'rejected', _rejectionFeedback: 'fix the PR' },
  }),
  config
);
```

## Node Execution Order

Producer nodes call the executor in this order:

1. `analyze` — prompt contains "ANALYSIS phase"
2. `requirements` — prompt contains "REQUIREMENTS phase"
3. `research` — prompt contains "RESEARCH phase"
4. `plan` — prompt contains "PLANNING phase"
5. `implement` — prompt contains "autonomous implementation"
6. `evidence` (sub-agent, +1 executor call after implement)
7. `merge` — prompt contains "MERGE phase" (only with `withMerge: true`)

Use `PROMPT_NODE_MARKERS` to identify which nodes ran via `getExecutedNodes(executor.prompts)`.

## Rules for New Tests

1. **Every node can fail and needs resume tests** — not just interruptible nodes. `analyze`, `research`, `implement`, and `merge` can all throw errors.

2. **Resume tests must verify no earlier nodes re-execute** — assert `getExecutedNodes()` does NOT contain earlier node names.

3. **Use non-retryable error messages** — prefix with `'Process exited with code 1:'` so `retryExecute()` does not absorb the error.

4. **Persistent checkpointer for resume tests** — the same `createCheckpointer(':memory:')` instance must be shared across invocations. Do NOT use `createTestContext()` for resume tests (it creates a new graph per `reset()`).

5. **Gate presets** — use constants from `helpers.ts`: `ALL_GATES_DISABLED`, `ALL_GATES_ENABLED`, `PRD_ALLOWED`, `PRD_PLAN_ALLOWED`.

6. **Suppress output** — all test suites must suppress stdout/stderr to avoid noisy test runs.
