/** A feature's stored PR comments and rounds, without asking GitHub (spec 124). */

import { injectable, inject } from 'tsyringe';
import type { Feature, PrComment, PrCommentRound } from '../../../domain/generated/output.js';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import type {
  IPrCommentRepository,
  IPrCommentRoundRepository,
} from '../../ports/output/repositories/pr-comment-repository.interface.js';
import { findFeature } from './pr-comment-feature.js';
import { listRounds } from './pr-comment-records.js';

export type GetPrCommentsResult =
  | { ok: true; feature: Feature; comments: PrComment[]; rounds: PrCommentRound[] }
  | { ok: false; error: string };

@injectable()
export class GetPrCommentsUseCase {
  constructor(
    @inject('IFeatureRepository') private readonly features: IFeatureRepository,
    @inject('IPrCommentRepository') private readonly comments: IPrCommentRepository,
    @inject('IPrCommentRoundRepository') private readonly rounds: IPrCommentRoundRepository
  ) {}

  /** `featureRef` is a feature id or id prefix. */
  async execute(featureRef: string): Promise<GetPrCommentsResult> {
    const feature = await findFeature(this.features, featureRef);
    if (!feature) return { ok: false, error: `Feature not found: "${featureRef}"` };
    // Rounds first: failing an abandoned round also updates its comments.
    const rounds = await listRounds(this.rounds, this.comments, feature.id);
    return { ok: true, feature, comments: await this.comments.listByFeature(feature.id), rounds };
  }
}
