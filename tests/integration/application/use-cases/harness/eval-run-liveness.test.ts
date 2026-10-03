/**
 * Eval runs (spec 119) record the process running them, and a run whose
 * process exited is reported as failed instead of "running" forever.
 */
import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  HarnessEvalRunStatus,
  HarnessMode,
  type HarnessEvalRun,
} from '@/domain/generated/output.js';
import { ListHarnessEvalRunsUseCase } from '@/application/use-cases/harness/harness-eval-report.use-cases.js';
import { RunHarnessEvalUseCase } from '@/application/use-cases/harness/run-harness-eval.use-case.js';
import { YamlHarnessEvalSuiteSource } from '@/infrastructure/services/harness/evals/yaml-eval-suite-source.js';
import {
  createHarnessTestStore,
  type HarnessTestStore,
} from '../../../../helpers/harness/harness-test-store.js';

const DEAD_PID = 999_999;
const liveness = { isProcessAlive: (pid: number) => pid === process.pid };
const noSuites = { list: async () => [], load: async () => undefined } as never;

function run(ownerPid: number, status = HarnessEvalRunStatus.Running): HarnessEvalRun {
  const now = new Date();
  return {
    id: `run-${ownerPid}`,
    suite: 'smoke',
    variants: [HarnessMode.Baseline, HarnessMode.QueryAware],
    repeats: 1,
    status,
    ownerPid,
    createdAt: now,
    updatedAt: now,
  };
}

describe('eval run liveness', () => {
  let store: HarnessTestStore;
  beforeEach(async () => {
    store = await createHarnessTestStore();
  });
  afterEach(() => store.close());

  it('reports a running eval whose process exited as failed', async () => {
    await store.evals.putRun(run(DEAD_PID));
    const { runs } = await new ListHarnessEvalRunsUseCase(
      store.evals,
      noSuites,
      liveness
    ).execute();
    expect(runs[0]).toMatchObject({
      status: HarnessEvalRunStatus.Failed,
      error: 'The process running this eval exited before it finished',
    });
    expect((await store.evals.getRun(`run-${DEAD_PID}`))?.status).toBe(HarnessEvalRunStatus.Failed);
  });

  it('leaves a run alone while its process is alive', async () => {
    await store.evals.putRun(run(process.pid));
    const { runs } = await new ListHarnessEvalRunsUseCase(
      store.evals,
      noSuites,
      liveness
    ).execute();
    expect(runs[0].status).toBe(HarnessEvalRunStatus.Running);
  });

  it('records the process that starts a run', async () => {
    const runner = new RunHarnessEvalUseCase(
      {} as never,
      new YamlHarnessEvalSuiteSource(),
      {} as never,
      store.evals,
      store.execution,
      store.context,
      process.pid
    );
    const started = await runner.start({ suite: 'smoke' });
    expect(started.ownerPid).toBe(process.pid);
  });
});
