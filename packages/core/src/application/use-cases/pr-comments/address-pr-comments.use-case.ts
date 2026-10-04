/**
 * Address PR comments (spec 124): one agent turn in the feature's worktree
 * changes what the comments ask for, commits and pushes to the feature
 * branch, and returns a reply per comment, which shep posts on GitHub.
 *
 * Two steps, so a surface can show the round before the agent finishes:
 * start() validates and records a Running round; run() does the work and
 * always ends Completed or Failed. Nothing is replied when the change could
 * not be pushed.
 */

import { randomUUID } from 'node:crypto';
import { injectable, inject } from 'tsyringe';
import {
  PrCommentRoundStatus,
  PrCommentStatus,
  type AgentType,
  type PrComment,
  type PrCommentRound,
} from '../../../domain/generated/output.js';
import {
  MAX_COMMENTS_PER_ROUND,
  PR_COMMENT_ROUND_TIMEOUT_MS,
} from '../../../domain/shared/pr-comments.js';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import type {
  IPrCommentRepository,
  IPrCommentRoundRepository,
} from '../../ports/output/repositories/pr-comment-repository.interface.js';
import type { IWorktreePathProvider } from '../../ports/output/services/worktree-path-provider.interface.js';
import type { IPullRequestCommentService } from '../../ports/output/services/pull-request-comment-service.interface.js';
import type { IStructuredAgentCaller } from '../../ports/output/agents/structured-agent-caller.interface.js';
import type { IGitPrService } from '../../ports/output/services/git-pr-service.interface.js';
import type { IAgentRunRepository } from '../../ports/output/agents/agent-run-repository.interface.js';
import type { ISettingsProvider } from '../../ports/output/services/settings-provider.interface.js';
import { ResolveSpaceEnvironmentUseCase } from '../spaces/resolve-space-environment.use-case.js';
import { resolveFeaturePullRequest, type FeaturePullRequest } from './pr-comment-feature.js';
import { listRounds } from './pr-comment-records.js';
import {
  ADDRESS_MAX_TURNS,
  ADDRESS_RESULT_SCHEMA,
  buildAddressCommentsPrompt,
  type AddressCommentsResult,
} from './pr-comment-prompt.js';
import { answerComment, ensurePushed } from './settle-pr-comment-round.js';

export interface AddressPrCommentsInput {
  /** Feature id or id prefix. */
  feature: string;
  /** Comments to address, by id or unique id prefix; every pending one when omitted. */
  commentIds?: string[];
}

export type StartRoundResult =
  | { ok: true; round: PrCommentRound; comments: PrComment[] }
  | { ok: false; error: string };

/** Comments a round may take on: never addressed, or failed last time. */
const ADDRESSABLE = new Set<PrCommentStatus>([PrCommentStatus.Pending, PrCommentStatus.Failed]);

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

@injectable()
export class AddressPrCommentsUseCase {
  constructor(
    @inject('IFeatureRepository') private readonly features: IFeatureRepository,
    @inject('IWorktreePathProvider') private readonly worktreePaths: IWorktreePathProvider,
    @inject('IPrCommentRepository') private readonly comments: IPrCommentRepository,
    @inject('IPrCommentRoundRepository') private readonly rounds: IPrCommentRoundRepository,
    @inject('IPullRequestCommentService') private readonly github: IPullRequestCommentService,
    @inject('IStructuredAgentCaller') private readonly agent: IStructuredAgentCaller,
    @inject('IGitPrService') private readonly git: IGitPrService,
    @inject('IAgentRunRepository') private readonly agentRuns: IAgentRunRepository,
    @inject('ISettingsProvider') private readonly settings: ISettingsProvider,
    @inject(ResolveSpaceEnvironmentUseCase)
    private readonly spaceEnvironment: ResolveSpaceEnvironmentUseCase
  ) {}

  async start(input: AddressPrCommentsInput): Promise<StartRoundResult> {
    const found = await resolveFeaturePullRequest(this.features, this.worktreePaths, input.feature);
    if (!found.ok) return found;
    const { feature } = found;

    const previous = await listRounds(this.rounds, this.comments, feature.id);
    if (previous.some((round) => round.status === PrCommentRoundStatus.Running)) {
      return { ok: false, error: `${feature.name} is already addressing comments.` };
    }

    const chosen = await this.chooseComments(feature.id, input.commentIds);
    if ('error' in chosen) return { ok: false, error: chosen.error };
    if (chosen.length === 0) {
      return { ok: false, error: `${feature.name} has no comments waiting to be addressed.` };
    }

    const agentType = await this.agentTypeFor(found);
    const { agentRefusal } = await this.spaceEnvironment.execute(feature.repositoryPath, agentType);
    if (agentRefusal) return { ok: false, error: agentRefusal };

    const now = new Date();
    const round: PrCommentRound = {
      id: randomUUID(),
      featureId: feature.id,
      commentIds: chosen.map((comment) => comment.id),
      status: PrCommentRoundStatus.Running,
      agentType,
      createdAt: now,
      updatedAt: now,
    };
    await this.rounds.create(round);
    const addressing = chosen.map((comment) => ({
      ...comment,
      status: PrCommentStatus.Addressing,
      roundId: round.id,
      updatedAt: now,
    }));
    for (const comment of addressing) await this.comments.update(comment);
    return { ok: true, round, comments: addressing };
  }

  /** Runs a started round to Completed or Failed and returns it. */
  async run(roundId: string): Promise<PrCommentRound> {
    const round = await this.rounds.findById(roundId);
    if (!round) throw new Error(`PR comment round not found: ${roundId}`);
    if (round.status !== PrCommentRoundStatus.Running) return round;

    const roundComments = (await this.comments.listByFeature(round.featureId)).filter(
      (comment) => comment.roundId === round.id
    );
    try {
      const found = await resolveFeaturePullRequest(
        this.features,
        this.worktreePaths,
        round.featureId
      );
      if (!found.ok) throw new Error(found.error);
      const { feature, worktreePath, prNumber } = found;
      const { context, environment, agentRefusal } = await this.spaceEnvironment.execute(
        feature.repositoryPath,
        round.agentType
      );
      if (agentRefusal) throw new Error(agentRefusal);

      const headBefore = await this.git.revParse(worktreePath, 'HEAD');
      const result = await this.agent.call<AddressCommentsResult>(
        buildAddressCommentsPrompt(feature, roundComments),
        ADDRESS_RESULT_SCHEMA,
        {
          cwd: worktreePath,
          maxTurns: ADDRESS_MAX_TURNS,
          timeout: PR_COMMENT_ROUND_TIMEOUT_MS,
          silent: true,
          ...(round.agentType ? { agentType: round.agentType } : {}),
          environment,
        }
      );
      const commitSha = await ensurePushed(this.git, worktreePath, feature.branch, headBefore);

      const replies = {
        github: this.github,
        comments: this.comments,
        target: { cwd: worktreePath, prNumber, environment },
        ...(commitSha ? { commitSha } : {}),
        resolveThreads: context.space.agentSettings?.prCommentResolveThreads === true,
      };
      const responses = Array.isArray(result.responses) ? result.responses : [];
      for (const comment of roundComments) {
        const response = responses.find((candidate) => candidate.commentId === comment.id);
        await answerComment(replies, comment, response);
      }
      const summary = typeof result.summary === 'string' ? result.summary.trim() : '';
      return this.finish(round, {
        status: PrCommentRoundStatus.Completed,
        ...(commitSha ? { commitSha } : {}),
        ...(summary ? { summary } : {}),
      });
    } catch (error) {
      const now = new Date();
      for (const comment of roundComments) {
        await this.comments.update({
          ...comment,
          status: PrCommentStatus.Failed,
          error: message(error),
          updatedAt: now,
        });
      }
      return this.finish(round, { status: PrCommentRoundStatus.Failed, error: message(error) });
    }
  }

  private async finish(
    round: PrCommentRound,
    outcome: Partial<PrCommentRound>
  ): Promise<PrCommentRound> {
    const finishedAt = new Date();
    const finished = { ...round, ...outcome, finishedAt, updatedAt: finishedAt };
    await this.rounds.update(finished);
    return finished;
  }

  private async chooseComments(
    featureId: string,
    ids: string[] | undefined
  ): Promise<PrComment[] | { error: string }> {
    const all = await this.comments.listByFeature(featureId);
    if (!ids || ids.length === 0) {
      return all
        .filter((comment) => ADDRESSABLE.has(comment.status))
        .slice(0, MAX_COMMENTS_PER_ROUND);
    }
    const chosen: PrComment[] = [];
    for (const ref of ids) {
      const matches = all.filter((candidate) => candidate.id.startsWith(ref));
      if (matches.length > 1) return { error: `Comment id ${ref} matches more than one comment.` };
      const comment = matches[0];
      if (!comment || !ADDRESSABLE.has(comment.status)) {
        return { error: `Comment ${ref} is not waiting to be addressed.` };
      }
      chosen.push(comment);
    }
    return chosen.slice(0, MAX_COMMENTS_PER_ROUND);
  }

  /** The agent of the feature's run, else the configured agent. */
  private async agentTypeFor({ feature }: FeaturePullRequest): Promise<AgentType> {
    const run = feature.agentRunId ? await this.agentRuns.findById(feature.agentRunId) : null;
    return run?.agentType ?? this.settings.get().agent.type;
  }
}
