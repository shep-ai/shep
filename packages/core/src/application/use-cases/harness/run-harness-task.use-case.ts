/**
 * RunHarnessTaskUseCase (spec 119, F4): a standalone harness task. It always
 * runs in a fresh worktree of the repository — never in the user's checkout —
 * and ends with a structured result the user then applies, promotes or
 * discards.
 */
import { inject, injectable } from 'tsyringe';
import { HarnessSessionOrigin, type HarnessSession } from '../../../domain/generated/output.js';
import { HARNESS_TOKENS, type IHarnessWorkspaceService } from '../../ports/output/harness/index.js';
import {
  deriveGoal,
  type ExecuteHarnessTaskResult,
  type HarnessRunOverrides,
  type HarnessTaskService,
} from '../../services/harness/harness-task-service.js';
import type { ProgressEvent } from '../../services/harness/turn-context.js';

export interface RunHarnessTaskInput {
  repoRoot: string;
  task: string;
  modelId?: string;
  overrides?: HarnessRunOverrides;
  /** false: asks resolve to the configured non-interactive effect (deny). */
  interactive: boolean;
  testCommand?: string;
  abortSignal?: AbortSignal;
  onProgress?: (event: ProgressEvent) => void;
  /** Called once the session and worktree exist, before the first turn. */
  onSession?: (session: HarnessSession) => void;
}

@injectable()
export class RunHarnessTaskUseCase {
  constructor(
    @inject(HARNESS_TOKENS.TaskService) private readonly service: HarnessTaskService,
    @inject(HARNESS_TOKENS.WorkspaceService) private readonly workspaces: IHarnessWorkspaceService
  ) {}

  /** Create the session and its worktree without running anything yet. */
  async prepare(
    input: Pick<RunHarnessTaskInput, 'repoRoot' | 'task' | 'modelId' | 'overrides'>
  ): Promise<HarnessSession> {
    const task = input.task.trim();
    if (!task) throw new Error('Describe the task to run');
    const config = await this.service.config(input.overrides);
    const session = await this.service.createSession(
      {
        origin: HarnessSessionOrigin.Standalone,
        repoRoot: input.repoRoot,
        title: deriveGoal(task),
        sourceRepoPath: input.repoRoot,
        ...(input.modelId && { modelId: input.modelId }),
      },
      config
    );
    const workspace = await this.workspaces.create(input.repoRoot, session.id);
    const withWorkspace: HarnessSession = {
      ...session,
      repoRoot: workspace.path,
      worktreePath: workspace.path,
      worktreeBranch: workspace.branch,
      baseCommit: workspace.baseCommit,
      updatedAt: new Date(),
    };
    await this.service.updateSession(withWorkspace);
    return withWorkspace;
  }

  async execute(input: RunHarnessTaskInput): Promise<ExecuteHarnessTaskResult> {
    const session = await this.prepare(input);
    input.onSession?.(session);
    return this.service.execute({
      sessionId: session.id,
      prompt: input.task,
      goal: deriveGoal(input.task),
      cwd: session.worktreePath ?? session.repoRoot,
      interactive: input.interactive,
      ...(input.modelId && { modelId: input.modelId }),
      ...(input.overrides && { overrides: input.overrides }),
      ...(input.testCommand && { testCommand: input.testCommand }),
      ...(input.abortSignal && { abortSignal: input.abortSignal }),
      ...(input.onProgress && { onProgress: input.onProgress }),
    });
  }
}
