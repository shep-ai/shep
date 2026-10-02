/**
 * Append-only harness event log (spec 119, docs/11).
 *
 * Sequence numbers are allocated by the log, monotonic and gap-free within a
 * session, so an SSE client can resume strictly after the last sequence it saw.
 */
import type { HarnessEvent, HarnessEventType } from '../../../../domain/generated/output.js';

export interface HarnessEventInput {
  sessionId: string;
  taskId?: string;
  type: HarnessEventType;
  payload: Record<string, unknown>;
}

export interface IHarnessEventLog {
  append(event: HarnessEventInput): Promise<HarnessEvent>;
  /** Events of a session with sequence > afterSequence, oldest first. */
  listAfter(sessionId: string, afterSequence: number, limit?: number): Promise<HarnessEvent[]>;
  listByTask(taskId: string): Promise<HarnessEvent[]>;
  lastSequence(sessionId: string): Promise<number>;
}
