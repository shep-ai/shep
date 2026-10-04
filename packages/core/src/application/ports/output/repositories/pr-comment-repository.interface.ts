/** PR comment and round repositories (spec 124). */

import type {
  PrComment,
  PrCommentKind,
  PrCommentRound,
} from '../../../../domain/generated/output.js';

export interface IPrCommentRepository {
  /** A feature's comments, oldest first. */
  listByFeature(featureId: string): Promise<PrComment[]>;
  findByGithubId(
    featureId: string,
    kind: PrCommentKind,
    githubId: string
  ): Promise<PrComment | null>;
  create(comment: PrComment): Promise<void>;
  update(comment: PrComment): Promise<void>;
}

export interface IPrCommentRoundRepository {
  findById(id: string): Promise<PrCommentRound | null>;
  /** A feature's rounds, newest first. */
  listByFeature(featureId: string): Promise<PrCommentRound[]>;
  create(round: PrCommentRound): Promise<void>;
  update(round: PrCommentRound): Promise<void>;
}
