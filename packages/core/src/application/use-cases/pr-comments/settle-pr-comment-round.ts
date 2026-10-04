/**
 * The steps of a PR comment round after the agent's turn (spec 124): make
 * sure the change reached the pull request, then answer each comment on
 * GitHub and record what happened to it.
 */

import {
  PrCommentKind,
  PrCommentStatus,
  type PrComment,
} from '../../../domain/generated/output.js';
import { formatReply, quoteForReply } from '../../../domain/shared/pr-comments.js';
import type { IPrCommentRepository } from '../../ports/output/repositories/pr-comment-repository.interface.js';
import type { IGitPrService } from '../../ports/output/services/git-pr-service.interface.js';
import type {
  IPullRequestCommentService,
  PullRequestTarget,
} from '../../ports/output/services/pull-request-comment-service.interface.js';
import { CommentAction, type CommentResponse } from './pr-comment-prompt.js';

/** Commit message when shep commits changes the agent left uncommitted. */
export const LEFTOVER_COMMIT_MESSAGE = 'fix: address review comments';
export const UNANSWERED_ERROR = 'The agent did not answer this comment.';

const SHORT_SHA_LENGTH = 7;

type PushGit = Pick<IGitPrService, 'revParse' | 'hasUncommittedChanges' | 'commitAll' | 'push'>;

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The commit now on the pull request when the agent changed code, undefined
 * when it did not. Commits what the agent left uncommitted and pushes what it
 * did not push; throws when the push fails.
 */
export async function ensurePushed(
  git: PushGit,
  cwd: string,
  branch: string,
  headBefore: string
): Promise<string | undefined> {
  if (await git.hasUncommittedChanges(cwd)) await git.commitAll(cwd, LEFTOVER_COMMIT_MESSAGE);
  const head = await git.revParse(cwd, 'HEAD');
  if (head === headBefore) return undefined;
  const remote = await git.revParse(cwd, `origin/${branch}`).catch(() => '');
  if (remote !== head) {
    try {
      await git.push(cwd, branch);
    } catch (error) {
      throw new Error(`Could not push ${head.slice(0, SHORT_SHA_LENGTH)}: ${message(error)}`);
    }
  }
  return head;
}

export interface ReplyContext {
  github: IPullRequestCommentService;
  comments: IPrCommentRepository;
  target: PullRequestTarget;
  commitSha?: string;
  resolveThreads: boolean;
}

/** Posts the agent's reply to one comment and records the outcome on it. */
export async function answerComment(
  context: ReplyContext,
  comment: PrComment,
  response: CommentResponse | undefined
): Promise<void> {
  const now = new Date();
  if (!response) {
    await context.comments.update({
      ...comment,
      status: PrCommentStatus.Failed,
      error: UNANSWERED_ERROR,
      updatedAt: now,
    });
    return;
  }
  const changed = response.action === CommentAction.Changed;
  const quote =
    comment.kind === PrCommentKind.Inline ? '' : quoteForReply(comment.author, comment.body);
  const body = quote + formatReply(response.reply, changed ? context.commitSha : undefined);
  try {
    const replyUrl = await context.github.reply(
      context.target,
      {
        kind: comment.kind,
        githubId: comment.githubId,
        ...(comment.threadId ? { threadId: comment.threadId } : {}),
      },
      body
    );
    if (changed && context.resolveThreads && comment.threadId) {
      await context.github.resolveThread(context.target, comment.threadId);
    }
    const { error: _previous, ...rest } = comment;
    await context.comments.update({
      ...rest,
      status:
        response.action === CommentAction.Declined
          ? PrCommentStatus.Declined
          : PrCommentStatus.Addressed,
      reply: response.reply.trim(),
      ...(replyUrl ? { replyUrl } : {}),
      updatedAt: now,
    });
  } catch (error) {
    await context.comments.update({
      ...comment,
      status: PrCommentStatus.Failed,
      error: message(error),
      updatedAt: now,
    });
  }
}
