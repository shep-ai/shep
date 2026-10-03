/**
 * ResumeHarnessSessionUseCase (spec 119, F7): run the next task of an existing
 * standalone session — a follow-up instruction, or the last goal again. State
 * is restored from the store (drift check, unknown side effects, pending
 * approvals); no transcript is replayed.
 */
import { inject, injectable } from 'tsyringe';
import { HarnessSessionOrigin, HarnessSessionStatus } from '../../../domain/generated/output.js';
import {
  HARNESS_TOKENS,
  type IHarnessSessionRepository,
} from '../../ports/output/harness/index.js';
import type {
  ExecuteHarnessTaskResult,
  HarnessTaskService,
} from '../../services/harness/harness-task-service.js';
import type { ProgressEvent } from '../../services/harness/turn-context.js';
import { HarnessNotFoundError, HarnessSessionStateError } from './harness-errors.js';

export interface ResumeHarnessSessionInput {
  sessionId: string;
  /** Follow-up instruction; defaults to the last task's goal. */
  task?: string;
  interactive: boolean;
  testCommand?: string;
  abortSignal?: AbortSignal;
  onProgress?: (event: ProgressEvent) => void;
}

@injectable()
export class ResumeHarnessSessionUseCase {
  constructor(
    @inject(HARNESS_TOKENS.TaskService) private readonly service: HarnessTaskService,
    @inject(HARNESS_TOKENS.SessionRepository) private readonly sessions: IHarnessSessionRepository
  ) {}

  async execute(input: ResumeHarnessSessionInput): Promise<ExecuteHarnessTaskResult> {
    const session = await this.sessions.getSession(input.sessionId);
    if (!session) throw new HarnessNotFoundError('session', input.sessionId);
    if (session.origin === HarnessSessionOrigin.Feature) {
      throw new HarnessSessionStateError(
        'Feature sessions resume with the feature (shep feat resume)'
      );
    }
    if (session.status === HarnessSessionStatus.Discarded) {
      throw new HarnessSessionStateError('This session was discarded; start a new task instead');
    }
    const last = (await this.sessions.listTasks(session.id)).at(-1);
    const prompt = input.task?.trim() ? input.task.trim() : last?.goal;
    if (!prompt) throw new HarnessSessionStateError('Nothing to resume: give the next instruction');
    return this.service.execute({
      sessionId: session.id,
      prompt,
      cwd: session.worktreePath ?? session.repoRoot,
      interactive: input.interactive,
      ...(input.testCommand && { testCommand: input.testCommand }),
      ...(input.abortSignal && { abortSignal: input.abortSignal }),
      ...(input.onProgress && { onProgress: input.onProgress }),
    });
  }
}
