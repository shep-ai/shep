/**
 * ListHarnessEventsUseCase (spec 119): a session's append-only events after a
 * sequence number — what live views (the web SSE stream) follow.
 */
import { inject, injectable } from 'tsyringe';
import type { HarnessEvent } from '../../../domain/generated/output.js';
import { HARNESS_TOKENS, type IHarnessEventLog } from '../../ports/output/harness/index.js';

export interface ListHarnessEventsInput {
  sessionId: string;
  afterSequence?: number;
  limit?: number;
}

const DEFAULT_LIMIT = 200;

@injectable()
export class ListHarnessEventsUseCase {
  constructor(@inject(HARNESS_TOKENS.EventLog) private readonly events: IHarnessEventLog) {}

  execute(input: ListHarnessEventsInput): Promise<HarnessEvent[]> {
    return this.events.listAfter(
      input.sessionId,
      input.afterSequence ?? 0,
      input.limit ?? DEFAULT_LIMIT
    );
  }
}
