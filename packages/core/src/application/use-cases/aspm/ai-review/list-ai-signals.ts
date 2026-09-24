/**
 * ListAiSignalsUseCase (feature 098, phase 8, task-50).
 *
 * Returns the AI-review queue — filterable by application, agent session,
 * signal type, and state (defaulting to Open + Acknowledged). Page size
 * defaults to 50 and the implementation orders newest-first by
 * discoveredAt. Backs the `/aspm/ai-review` page (task-51) and the
 * `shep aspm ai-review list` CLI subcommand (phase 10).
 */

import { inject, injectable } from 'tsyringe';
import type {
  AiChangeRiskSignal,
  AiSignalState,
  AiSignalType,
} from '../../../../domain/generated/output.js';
import type {
  AiSignalListFilter,
  IAiChangeRiskSignalRepository,
} from '../../../ports/output/repositories/ai-change-risk-signal-repository.interface.js';

export interface ListAiSignalsInput {
  applicationId?: string;
  agentSessionId?: string;
  states?: AiSignalState[];
  signalTypes?: AiSignalType[];
  limit?: number;
  offset?: number;
}

/**
 * Pass a requested page size / offset through only when it is a usable number.
 *
 * A non-numeric CLI flag (`--limit abc`) arrives here as NaN, and the
 * repository's `?? DEFAULT` cannot catch it — NaN is not nullish — so it would
 * reach `LIMIT ? OFFSET ?`, where SQLite raises a datatype mismatch instead of
 * reading a page of rows. Dropping it leaves the repository to apply its own
 * default, which stays the single source of truth for what that default is.
 */
function usableNumber(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

@injectable()
export class ListAiSignalsUseCase {
  constructor(
    @inject('IAiChangeRiskSignalRepository')
    private readonly signalRepo: IAiChangeRiskSignalRepository
  ) {}

  async execute(input: ListAiSignalsInput = {}): Promise<AiChangeRiskSignal[]> {
    const filter: AiSignalListFilter = {
      applicationId: input.applicationId,
      agentSessionId: input.agentSessionId,
      states: input.states,
      signalTypes: input.signalTypes,
      limit: usableNumber(input.limit),
      offset: usableNumber(input.offset),
    };
    return this.signalRepo.list(filter);
  }
}
