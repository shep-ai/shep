/**
 * RunHarnessEvalUseCase (spec 119, F9 / task 33): run a suite on each variant
 * (baseline, query-aware) with repeats, every run in a throwaway repository,
 * non-interactively, and record per-run scores.
 */
import { randomUUID } from 'node:crypto';
import { inject, injectable } from 'tsyringe';
import {
  HarnessEvalRunStatus,
  HarnessMode,
  HarnessSessionOrigin,
  HarnessTaskOutcome,
  type HarnessEvalResult,
  type HarnessEvalRun,
} from '../../../domain/generated/output.js';
import {
  HARNESS_TOKENS,
  type HarnessEvalCaseDef,
  type IHarnessContextRepository,
  type IHarnessEvalRepository,
  type IHarnessEvalSuiteSource,
  type IHarnessEvalWorkspaceFactory,
  type IHarnessExecutionRepository,
} from '../../ports/output/harness/index.js';
import type { HarnessTaskService } from '../../services/harness/harness-task-service.js';
import { summarizeUsage } from './harness-metrics.js';
import { evidenceRecall, scoreRun } from './harness-eval-scoring.js';

export interface RunHarnessEvalInput {
  suite: string;
  repoRoot?: string;
  variants?: HarnessMode[];
  repeats?: number;
  modelId?: string;
  /** Per-run time limit. */
  timeoutMs?: number;
  onProgress?: (message: string) => void;
}

const DEFAULT_VARIANTS: readonly HarnessMode[] = [HarnessMode.Baseline, HarnessMode.QueryAware];
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const CHECK_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_REPEATS = 10;

@injectable()
export class RunHarnessEvalUseCase {
  constructor(
    @inject(HARNESS_TOKENS.TaskService) private readonly service: HarnessTaskService,
    @inject(HARNESS_TOKENS.EvalSuiteSource) private readonly suites: IHarnessEvalSuiteSource,
    @inject(HARNESS_TOKENS.EvalWorkspaceFactory)
    private readonly workspaces: IHarnessEvalWorkspaceFactory,
    @inject(HARNESS_TOKENS.EvalRepository) private readonly evals: IHarnessEvalRepository,
    @inject(HARNESS_TOKENS.ExecutionRepository)
    private readonly execution: IHarnessExecutionRepository,
    @inject(HARNESS_TOKENS.ContextRepository) private readonly context: IHarnessContextRepository,
    @inject(HARNESS_TOKENS.ProcessId) private readonly processId: number
  ) {}

  /** Record the run and return it; execute() then fills in results. */
  async start(input: RunHarnessEvalInput): Promise<HarnessEvalRun> {
    const suite = await this.suites.load(input.suite, input.repoRoot);
    const now = new Date();
    const run: HarnessEvalRun = {
      id: randomUUID(),
      suite: suite.id,
      variants:
        input.variants && input.variants.length > 0 ? input.variants : [...DEFAULT_VARIANTS],
      repeats: Math.min(MAX_REPEATS, Math.max(1, input.repeats ?? 1)),
      status: HarnessEvalRunStatus.Pending,
      ownerPid: this.processId,
      ...(input.modelId && { modelId: input.modelId }),
      createdAt: now,
      updatedAt: now,
    };
    await this.evals.putRun(run);
    return run;
  }

  async execute(input: RunHarnessEvalInput, started?: HarnessEvalRun): Promise<HarnessEvalRun> {
    const run = started ?? (await this.start(input));
    const suite = await this.suites.load(input.suite, input.repoRoot);
    await this.evals.putRun({
      ...run,
      status: HarnessEvalRunStatus.Running,
      ownerPid: this.processId,
      updatedAt: new Date(),
    });
    try {
      for (const evalCase of suite.cases) {
        for (const variant of run.variants) {
          for (let repeat = 1; repeat <= run.repeats; repeat++) {
            input.onProgress?.(`${evalCase.id} · ${variant} · ${repeat}/${run.repeats}`);
            await this.evals.putResult(await this.runCase(run, evalCase, variant, repeat, input));
          }
        }
      }
      const done = { ...run, status: HarnessEvalRunStatus.Completed, updatedAt: new Date() };
      await this.evals.putRun(done);
      return done;
    } catch (error) {
      const failed = {
        ...run,
        status: HarnessEvalRunStatus.Failed,
        error: (error as Error).message,
        updatedAt: new Date(),
      };
      await this.evals.putRun(failed);
      return failed;
    }
  }

  private async runCase(
    run: HarnessEvalRun,
    evalCase: HarnessEvalCaseDef,
    variant: HarnessMode,
    repeat: number,
    input: RunHarnessEvalInput
  ): Promise<HarnessEvalResult> {
    const base = {
      id: randomUUID(),
      runId: run.id,
      caseId: evalCase.id,
      variant,
      repeat,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const ws = await this.workspaces.prepare(evalCase);
    try {
      const overrides = { mode: variant };
      const config = await this.service.config(overrides);
      const session = await this.service.createSession(
        {
          origin: HarnessSessionOrigin.Eval,
          repoRoot: ws.root,
          title: `${run.suite}/${evalCase.id} (${variant} #${repeat})`,
          ...(run.modelId && { modelId: run.modelId }),
        },
        config
      );
      const startedAt = Date.now();
      let runError: string | undefined;
      let taskId: string | undefined;
      let result;
      try {
        const out = await this.service.execute({
          sessionId: session.id,
          prompt: evalCase.task,
          cwd: ws.root,
          interactive: false,
          overrides,
          timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          ...(evalCase.testCommand && { testCommand: evalCase.testCommand }),
          ...(run.modelId && { modelId: run.modelId }),
        });
        taskId = out.task.id;
        result = out.result;
      } catch (error) {
        runError = (error as Error).message;
      }
      const wallMs = Date.now() - startedAt;
      const check = evalCase.check
        ? await this.workspaces.runCheck(ws.root, evalCase.check, CHECK_TIMEOUT_MS)
        : undefined;
      const success =
        runError === undefined &&
        (check ? check.passed : result?.status === HarnessTaskOutcome.Success);
      const [modelCalls, toolCalls, plans, chunks] = taskId
        ? await Promise.all([
            this.execution.listModelCalls(taskId),
            this.execution.listToolCalls(taskId),
            this.context.listPlans(taskId),
            this.context.listChunks({ sessionId: session.id, taskId }),
          ])
        : [[], [], [], []];
      return {
        ...base,
        success,
        scores: scoreRun({
          success,
          usage: summarizeUsage(modelCalls, toolCalls, plans),
          wallMs,
          toolCalls,
          recall: evidenceRecall(evalCase.requiredEvidence, result, chunks),
        }),
        sessionId: session.id,
        ...(runError && { error: runError }),
      };
    } finally {
      await ws.cleanup();
    }
  }
}
