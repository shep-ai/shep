/**
 * Fetch a feature's PR comments (spec 124): read the pull request's inline,
 * conversation and review comments from GitHub, as the repository's space, and
 * store the new ones as pending. Known comments keep their status; an edited
 * body is updated. shep's own replies and bots' comments are skipped, and a
 * new comment in an already resolved thread counts as addressed.
 */

import { randomUUID } from 'node:crypto';
import { injectable, inject } from 'tsyringe';
import { PrCommentStatus, type Feature, type PrComment } from '../../../domain/generated/output.js';
import { isShepReply } from '../../../domain/shared/pr-comments.js';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import type { IPrCommentRepository } from '../../ports/output/repositories/pr-comment-repository.interface.js';
import type { IWorktreePathProvider } from '../../ports/output/services/worktree-path-provider.interface.js';
import type {
  IPullRequestCommentService,
  RemotePrComment,
} from '../../ports/output/services/pull-request-comment-service.interface.js';
import { ResolveSpaceEnvironmentUseCase } from '../spaces/resolve-space-environment.use-case.js';
import { resolveFeaturePullRequest } from './pr-comment-feature.js';

export type FetchPrCommentsResult =
  | { ok: true; feature: Feature; comments: PrComment[]; added: number }
  | { ok: false; error: string };

@injectable()
export class FetchPrCommentsUseCase {
  constructor(
    @inject('IFeatureRepository') private readonly features: IFeatureRepository,
    @inject('IWorktreePathProvider') private readonly worktreePaths: IWorktreePathProvider,
    @inject('IPrCommentRepository') private readonly comments: IPrCommentRepository,
    @inject('IPullRequestCommentService') private readonly github: IPullRequestCommentService,
    @inject(ResolveSpaceEnvironmentUseCase)
    private readonly spaceEnvironment: ResolveSpaceEnvironmentUseCase
  ) {}

  /** `featureRef` is a feature id or id prefix. */
  async execute(featureRef: string): Promise<FetchPrCommentsResult> {
    const found = await resolveFeaturePullRequest(this.features, this.worktreePaths, featureRef);
    if (!found.ok) return found;
    const { feature, prNumber, worktreePath } = found;

    const { environment } = await this.spaceEnvironment.execute(feature.repositoryPath);
    const remote = await this.github.list({ cwd: worktreePath, prNumber, environment });

    let added = 0;
    for (const comment of remote) {
      if (comment.authorIsBot || isShepReply(comment.body)) continue;
      const known = await this.comments.findByGithubId(feature.id, comment.kind, comment.githubId);
      if (!known) {
        await this.comments.create(this.newComment(feature.id, comment));
        added += 1;
      } else if (known.body !== comment.body || known.threadId !== comment.threadId) {
        await this.comments.update({
          ...known,
          body: comment.body,
          ...(comment.threadId ? { threadId: comment.threadId } : {}),
          updatedAt: new Date(),
        });
      }
    }
    return {
      ok: true,
      feature,
      comments: await this.comments.listByFeature(feature.id),
      added,
    };
  }

  private newComment(featureId: string, comment: RemotePrComment): PrComment {
    const now = new Date();
    return {
      id: randomUUID(),
      featureId,
      githubId: comment.githubId,
      kind: comment.kind,
      author: comment.author,
      body: comment.body,
      ...(comment.path ? { path: comment.path } : {}),
      ...(comment.line ? { line: comment.line } : {}),
      ...(comment.diffHunk ? { diffHunk: comment.diffHunk } : {}),
      ...(comment.threadId ? { threadId: comment.threadId } : {}),
      url: comment.url,
      writtenAt: comment.writtenAt,
      status: comment.threadResolved ? PrCommentStatus.Addressed : PrCommentStatus.Pending,
      createdAt: now,
      updatedAt: now,
    };
  }
}
