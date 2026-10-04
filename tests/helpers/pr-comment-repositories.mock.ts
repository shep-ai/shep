/** In-memory PR comment and round repositories for use-case tests (spec 124). */

import type { PrComment, PrCommentKind, PrCommentRound } from '@/domain/generated/output.js';
import type {
  IPrCommentRepository,
  IPrCommentRoundRepository,
} from '@/application/ports/output/repositories/pr-comment-repository.interface.js';

export class InMemoryPrComments implements IPrCommentRepository {
  readonly rows = new Map<string, PrComment>();
  async listByFeature(featureId: string) {
    return [...this.rows.values()]
      .filter((row) => row.featureId === featureId)
      .sort((a, b) => new Date(a.writtenAt).getTime() - new Date(b.writtenAt).getTime());
  }
  async findByGithubId(featureId: string, kind: PrCommentKind, githubId: string) {
    return (
      [...this.rows.values()].find(
        (row) => row.featureId === featureId && row.kind === kind && row.githubId === githubId
      ) ?? null
    );
  }
  async create(comment: PrComment) {
    this.rows.set(comment.id, comment);
  }
  async update(comment: PrComment) {
    this.rows.set(comment.id, comment);
  }
}

export class InMemoryPrCommentRounds implements IPrCommentRoundRepository {
  readonly rows = new Map<string, PrCommentRound>();
  async findById(id: string) {
    return this.rows.get(id) ?? null;
  }
  async listByFeature(featureId: string) {
    return [...this.rows.values()]
      .filter((row) => row.featureId === featureId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  async create(round: PrCommentRound) {
    this.rows.set(round.id, round);
  }
  async update(round: PrCommentRound) {
    this.rows.set(round.id, round);
  }
}
