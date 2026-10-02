/**
 * StopHarnessSessionUseCase (spec 119): ask a running harness task to stop.
 * Works across processes: the runtime checks before every turn and ends the
 * task as cancelled.
 */
import { inject, injectable } from 'tsyringe';
import { HarnessEventType, type HarnessSession } from '../../../domain/generated/output.js';
import {
  HARNESS_TOKENS,
  type IHarnessEventLog,
  type IHarnessSessionRepository,
} from '../../ports/output/harness/index.js';
import { HarnessNotFoundError } from './harness-errors.js';

@injectable()
export class StopHarnessSessionUseCase {
  constructor(
    @inject(HARNESS_TOKENS.SessionRepository) private readonly sessions: IHarnessSessionRepository,
    @inject(HARNESS_TOKENS.EventLog) private readonly events: IHarnessEventLog
  ) {}

  async execute(input: { sessionId: string }): Promise<HarnessSession> {
    const session = await this.sessions.getSession(input.sessionId);
    if (!session) throw new HarnessNotFoundError('session', input.sessionId);
    const now = new Date();
    const updated: HarnessSession = { ...session, stopRequestedAt: now, updatedAt: now };
    await this.sessions.updateSession(updated);
    const running = (await this.sessions.listTasks(session.id)).at(-1);
    await this.events.append({
      sessionId: session.id,
      ...(running && { taskId: running.id }),
      type: HarnessEventType.TaskStatusChanged,
      payload: { stopRequested: true },
    });
    return updated;
  }
}
