/**
 * Pull request comments over the gh CLI (spec 124).
 *
 * gh resolves `{owner}` and `{repo}` from the checkout it runs in, handles
 * authentication and GitHub Enterprise, and runs here with the space's
 * environment so the space's GitHub login is the one used.
 *
 * - Inline comments: REST `pulls/{n}/comments`; their review threads (ids and
 *   resolution) come from GraphQL `reviewThreads`.
 * - Conversation comments: REST `issues/{n}/comments`.
 * - Review summaries: REST `pulls/{n}/reviews`, those with a body.
 *
 * REST lists are read with `--paginate --jq '.[]'`, one JSON object per line.
 */

import { PrCommentKind } from '../../../domain/generated/output.js';
import { applySpaceEnvironment } from '../../../domain/shared/space-environment.js';
import type {
  IPullRequestCommentService,
  PullRequestTarget,
  RemotePrComment,
  ReplyTarget,
} from '../../../application/ports/output/services/pull-request-comment-service.interface.js';
import type { ExecFunction } from './worktree.service.js';

const GH = 'gh';
const PER_PAGE = 100;
const BOT_USER_TYPE = 'Bot';

/** Review threads read per pull request (GraphQL page). */
const MAX_THREADS = 100;

const THREADS_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: ${MAX_THREADS}) {
        nodes { id isResolved comments(first: 100) { nodes { databaseId } } }
      }
    }
  }
}`;

const THREAD_REPLY_MUTATION = `mutation($threadId: ID!, $body: String!) {
  addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: $threadId, body: $body }) {
    comment { url }
  }
}`;

const RESOLVE_MUTATION = `mutation($threadId: ID!) {
  resolveReviewThread(input: { threadId: $threadId }) { thread { isResolved } }
}`;

interface GitHubUser {
  login: string;
  type: string;
}

interface RestComment {
  id: number;
  body: string | null;
  html_url: string;
  created_at?: string;
  submitted_at?: string | null;
  user: GitHubUser | null;
  path?: string;
  line?: number | null;
  original_line?: number | null;
  diff_hunk?: string;
}

interface ThreadsResponse {
  data?: {
    repository?: {
      pullRequest?: {
        reviewThreads?: {
          nodes: {
            id: string;
            isResolved: boolean;
            comments: { nodes: { databaseId: number }[] };
          }[];
        };
      };
    };
  };
}

const GHOST_LOGIN = 'ghost';

export class GhPullRequestCommentService implements IPullRequestCommentService {
  constructor(private readonly execFile: ExecFunction) {}

  async list(target: PullRequestTarget): Promise<RemotePrComment[]> {
    const pulls = `repos/{owner}/{repo}/pulls/${target.prNumber}`;
    const [inline, conversation, reviews, threads] = await Promise.all([
      this.restList(target, `${pulls}/comments`),
      this.restList(target, `repos/{owner}/{repo}/issues/${target.prNumber}/comments`),
      this.restList(target, `${pulls}/reviews`),
      this.threads(target),
    ]);
    return [
      ...inline.map((comment) => {
        const thread = threads.get(comment.id);
        const line = comment.line ?? comment.original_line ?? undefined;
        return {
          ...this.common(comment, PrCommentKind.Inline),
          ...(comment.path ? { path: comment.path } : {}),
          ...(line ? { line } : {}),
          ...(comment.diff_hunk ? { diffHunk: comment.diff_hunk } : {}),
          ...(thread ? { threadId: thread.id, threadResolved: thread.resolved } : {}),
        };
      }),
      ...conversation.map((comment) => this.common(comment, PrCommentKind.Conversation)),
      ...reviews
        .filter((review) => (review.body ?? '').trim() !== '')
        .map((review) => this.common(review, PrCommentKind.Review)),
    ];
  }

  async reply(target: PullRequestTarget, to: ReplyTarget, body: string): Promise<string> {
    if (to.kind === PrCommentKind.Inline && to.threadId) {
      const response = JSON.parse(
        await this.gh(target, [
          'api',
          'graphql',
          '-f',
          `query=${THREAD_REPLY_MUTATION}`,
          '-f',
          `threadId=${to.threadId}`,
          '-f',
          `body=${body}`,
        ])
      ) as { data?: { addPullRequestReviewThreadReply?: { comment?: { url?: string } } } };
      return response.data?.addPullRequestReviewThreadReply?.comment?.url ?? '';
    }
    const endpoint =
      to.kind === PrCommentKind.Inline
        ? `repos/{owner}/{repo}/pulls/${target.prNumber}/comments/${to.githubId}/replies`
        : `repos/{owner}/{repo}/issues/${target.prNumber}/comments`;
    const posted = JSON.parse(
      await this.gh(target, ['api', '--method', 'POST', endpoint, '-f', `body=${body}`])
    ) as { html_url?: string };
    return posted.html_url ?? '';
  }

  async resolveThread(target: PullRequestTarget, threadId: string): Promise<void> {
    await this.gh(target, [
      'api',
      'graphql',
      '-f',
      `query=${RESOLVE_MUTATION}`,
      '-f',
      `threadId=${threadId}`,
    ]);
  }

  private common(comment: RestComment, kind: PrCommentKind): RemotePrComment {
    return {
      githubId: String(comment.id),
      kind,
      author: comment.user?.login ?? GHOST_LOGIN,
      authorIsBot: comment.user?.type === BOT_USER_TYPE,
      body: comment.body ?? '',
      url: comment.html_url,
      writtenAt: new Date(comment.created_at ?? comment.submitted_at ?? 0),
    };
  }

  private async restList(target: PullRequestTarget, endpoint: string): Promise<RestComment[]> {
    const stdout = await this.gh(target, [
      'api',
      '--paginate',
      `${endpoint}?per_page=${PER_PAGE}`,
      '--jq',
      '.[]',
    ]);
    return stdout
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line) as RestComment);
  }

  /** Review thread of each inline comment, by comment id. */
  private async threads(
    target: PullRequestTarget
  ): Promise<Map<number, { id: string; resolved: boolean }>> {
    const response = JSON.parse(
      await this.gh(target, [
        'api',
        'graphql',
        '-f',
        `query=${THREADS_QUERY}`,
        '-F',
        'owner={owner}',
        '-F',
        'name={repo}',
        '-F',
        `number=${target.prNumber}`,
      ])
    ) as ThreadsResponse;
    const byComment = new Map<number, { id: string; resolved: boolean }>();
    for (const thread of response.data?.repository?.pullRequest?.reviewThreads?.nodes ?? []) {
      for (const comment of thread.comments.nodes) {
        byComment.set(comment.databaseId, { id: thread.id, resolved: thread.isResolved });
      }
    }
    return byComment;
  }

  private async gh(target: PullRequestTarget, args: string[]): Promise<string> {
    const env = target.environment
      ? applySpaceEnvironment(process.env, target.environment)
      : process.env;
    try {
      return (await this.execFile(GH, args, { cwd: target.cwd, env })).stdout;
    } catch (error) {
      const stderr = (error as { stderr?: string }).stderr?.trim() ?? '';
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `gh ${args[1] === 'graphql' ? 'graphql' : args.at(-1)}: ${stderr === '' ? message : stderr}`
      );
    }
  }
}
