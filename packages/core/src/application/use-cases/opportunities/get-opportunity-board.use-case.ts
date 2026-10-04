/**
 * GetOpportunityBoardUseCase (spec 126)
 *
 * A space's decision board in one call: its open opportunities scored and
 * ranked by value per review hour, the line that fits the week's review
 * capacity, signals not yet linked to an opportunity, and recent decisions.
 */

import { injectable, inject } from 'tsyringe';
import {
  OpportunityStatus,
  type Opportunity,
  type OpportunityWeights,
  type Signal,
  type Space,
} from '../../../domain/generated/output.js';
import {
  OPEN_STATUSES,
  drawLine,
  rankOpportunities,
  scoreOpportunity,
  type OpportunityLine,
  type ScoredOpportunity,
} from '../../../domain/shared/opportunity-score.js';
import type { ISpaceRepository } from '../../ports/output/repositories/space-repository.interface.js';
import type { IProductLineRepository } from '../../ports/output/repositories/product-line-repository.interface.js';
import type {
  IOpportunityRepository,
  IOpportunityWeightsRepository,
  ISignalRepository,
} from '../../ports/output/repositories/opportunity-repository.interface.js';
import { resolveScope, weightsFor, type OpportunityResult } from './opportunity-scope.js';

/** Dropped and shipped opportunities the board shows, newest first. */
export const RECENT_DECISIONS = 20;

export interface OpportunityBoard {
  space: Pick<Space, 'id' | 'name' | 'slug'>;
  weights: OpportunityWeights;
  /** Open opportunities (proposed, accepted, building), best first. */
  ranked: ScoredOpportunity[];
  line: OpportunityLine;
  unlinkedSignals: Signal[];
  /** Recently dropped or shipped. */
  decided: Opportunity[];
}

@injectable()
export class GetOpportunityBoardUseCase {
  constructor(
    @inject('IOpportunityRepository') private readonly opportunities: IOpportunityRepository,
    @inject('ISignalRepository') private readonly signals: ISignalRepository,
    @inject('IOpportunityWeightsRepository')
    private readonly weights: IOpportunityWeightsRepository,
    @inject('ISpaceRepository') private readonly spaces: ISpaceRepository,
    @inject('IProductLineRepository') private readonly productLines: IProductLineRepository
  ) {}

  /** `space` is a space id or slug; the default space when omitted. */
  async execute(space?: string): Promise<OpportunityResult<{ board: OpportunityBoard }>> {
    const scope = await resolveScope(this.spaces, this.productLines, space ? { space } : {});
    if (!scope.ok) return scope;
    const spaceId = scope.space.id;
    const [open, signals, weights, closed] = await Promise.all([
      this.opportunities.list({ spaceId, statuses: OPEN_STATUSES }),
      this.signals.list({ spaceId }),
      weightsFor(this.weights, spaceId),
      this.opportunities.list({
        spaceId,
        statuses: [OpportunityStatus.Dropped, OpportunityStatus.Shipped],
      }),
    ]);
    const ranked = rankOpportunities(
      open.map((opportunity) =>
        scoreOpportunity(
          opportunity,
          signals.filter((signal) => signal.opportunityId === opportunity.id),
          weights
        )
      )
    );
    const decided = [...closed]
      .sort(
        (a, b) => (b.decidedAt ?? b.updatedAt).getTime() - (a.decidedAt ?? a.updatedAt).getTime()
      )
      .slice(0, RECENT_DECISIONS);
    return {
      ok: true,
      board: {
        space: { id: scope.space.id, name: scope.space.name, slug: scope.space.slug },
        weights,
        ranked,
        line: drawLine(ranked, weights.weeklyReviewHours),
        unlinkedSignals: signals.filter((signal) => signal.opportunityId === undefined),
        decided,
      },
    };
  }
}
