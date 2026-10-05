/** Opportunity outcome repository (output port) — spec 130. */

import type { OpportunityOutcome } from '../../../../domain/generated/output.js';

export interface OutcomeFilter {
  spaceId?: string;
}

export interface IOutcomeRepository {
  /** Newest shipped first. */
  list(filter?: OutcomeFilter): Promise<OpportunityOutcome[]>;
  /** Pending outcomes whose window ended by `at`. */
  listDue(at: Date): Promise<OpportunityOutcome[]>;
  findByOpportunity(opportunityId: string): Promise<OpportunityOutcome | null>;
  /** Refuses a second outcome for the same opportunity. */
  create(outcome: OpportunityOutcome): Promise<void>;
  update(outcome: OpportunityOutcome): Promise<void>;
}
