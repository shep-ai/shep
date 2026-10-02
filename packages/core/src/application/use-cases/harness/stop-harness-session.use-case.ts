/**
 * StopHarnessSessionUseCase (spec 119): ask a running harness task to stop.
 * Works across processes: the runtime checks before every turn and ends the
 * task as cancelled. A task whose process has exited never reaches another
 * turn, so it is cancelled here at once.
 */
import { inject, injectable } from 'tsyringe';
import {
  HarnessEventType,
  HarnessTaskStatus,
  type HarnessSession,
  type HarnessTask,
} from '../../../domain/generated/output.js';
import { isTerminalHarnessTaskStatus } from '../../../domain/harness/task-state-machine.js';
import {
  HARNESS_TOKENS,
  type IHarnessEventLog,
  type IHarnessSessionRepository,
} from '../../ports/output/harness/index.js';
import type { IProcessLivenessProbe } from '../../ports/output/services/process-liveness.interface.js';
import { HarnessNotFoundError } from './harness-errors.js';

export const ORPHANED_TASK_REASON = 'owner_process_exited';

export interface StopHarnessSessionResult {
  session: HarnessSession;
  /** Tasks cancelled immediately because the process running them had exited. */
  cancelledTaskIds: string[];
}

@injectable()
export class StopHarnessSessionUseCase {
  constructor(
    @inject(HARNESS_TOKENS.SessionRepository) private readonly sessions: IHarnessSessionRepository,
    @inject(HARNESS_TOKENS.EventLog) private readonly events: IHarnessEventLog,
    @inject('IProcessLivenessProbe') private readonly liveness: IProcessLivenessProbe
  ) {}

  async execute(input: { sessionId: string }): Promise<StopHarnessSessionResult> {
    const session = await this.sessions.getSession(input.sessionId);
    if (!session) throw new HarnessNotFoundError('session', input.sessionId);
    const now = new Date();
    const updated: HarnessSession = { ...session, stopRequestedAt: now, updatedAt: now };
    await this.sessions.updateSession(updated);
    const tasks = await this.sessions.listTasks(session.id);
    const latest = tasks.at(-1);
    await this.events.append({
      sessionId: session.id,
      ...(latest && { taskId: latest.id }),
      type: HarnessEventType.TaskStatusChanged,
      payload: { stopRequested: true },
    });
    const cancelledTaskIds: string[] = [];
    for (const task of tasks.filter((t) => this.isOrphaned(t))) {
      await this.cancel(task, now);
      cancelledTaskIds.push(task.id);
    }
    return { session: updated, cancelledTaskIds };
  }

  private isOrphaned(task: HarnessTask): boolean {
    return (
      !isTerminalHarnessTaskStatus(task.status) &&
      task.ownerPid !== undefined &&
      !this.liveness.isProcessAlive(task.ownerPid)
    );
  }

  private async cancel(task: HarnessTask, now: Date): Promise<void> {
    await this.sessions.updateTask({
      ...task,
      status: HarnessTaskStatus.Cancelled,
      stateVersion: task.stateVersion + 1,
      updatedAt: now,
    });
    await this.events.append({
      sessionId: task.sessionId,
      taskId: task.id,
      type: HarnessEventType.TaskStatusChanged,
      payload: { status: HarnessTaskStatus.Cancelled, reason: ORPHANED_TASK_REASON },
    });
  }
}
