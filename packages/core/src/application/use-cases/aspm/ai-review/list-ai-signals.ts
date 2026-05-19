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
      limit: input.limit,
      offset: input.offset,
    };
    return this.signalRepo.list(filter);
  }
}
