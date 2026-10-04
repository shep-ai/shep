/**
 * Pull request comment port (spec 124): read a pull request's review comments
 * and answer them. Implemented over the gh CLI.
 */

import type { PrCommentKind } from '../../../../domain/generated/output.js';
import type { SpaceEnvironment } from '../../../../domain/shared/space-environment.js';

/** Which pull request, from where, and as whom. */
export interface PullRequestTarget {
  /** A checkout of the repository (the feature worktree or the repository). */
  cwd: string;
  prNumber: number;
  /** The space environment gh runs with, so the space's GitHub login is used. */
  environment?: SpaceEnvironment;
}

/** A comment as GitHub has it. */
export interface RemotePrComment {
  githubId: string;
  kind: PrCommentKind;
  author: string;
  authorIsBot: boolean;
  body: string;
  path?: string;
  line?: number;
  diffHunk?: string;
  /** GraphQL id of the review thread (inline comments). */
  threadId?: string;
  /** Whether that thread is resolved. */
  threadResolved?: boolean;
  url: string;
  writtenAt: Date;
}

/** The comment a reply answers. */
export interface ReplyTarget {
  kind: PrCommentKind;
  githubId: string;
  threadId?: string;
}

export interface IPullRequestCommentService {
  /** Every inline, conversation and review comment on the pull request. */
  list(target: PullRequestTarget): Promise<RemotePrComment[]>;
  /**
   * Posts `body` as a reply: on the review thread for an inline comment, on
   * the conversation otherwise. Returns the reply's URL.
   */
  reply(target: PullRequestTarget, to: ReplyTarget, body: string): Promise<string>;
  resolveThread(target: PullRequestTarget, threadId: string): Promise<void>;
}
