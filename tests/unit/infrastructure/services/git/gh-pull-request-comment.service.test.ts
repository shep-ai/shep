/**
 * GhPullRequestCommentService (spec 124): the gh calls it makes, how it reads
 * the three comment kinds and their threads, and the space environment it
 * runs gh with. gh itself is faked.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GhPullRequestCommentService } from '@/infrastructure/services/git/gh-pull-request-comment.service.js';
import type { ExecFunction } from '@/infrastructure/services/git/worktree.service.js';
import { PrCommentKind } from '@/domain/generated/output.js';

const TARGET = {
  cwd: '/wt/feature',
  prNumber: 7,
  environment: { set: { GH_CONFIG_DIR: '/gh-work' }, unset: ['GH_TOKEN'] },
};

const INLINE = [
  {
    id: 301,
    body: 'rename this',
    path: 'src/a.ts',
    line: 42,
    original_line: 40,
    diff_hunk: '@@ -1 +1 @@',
    html_url: 'https://github.com/o/r/pull/7#discussion_r301',
    created_at: '2026-10-05T10:00:00Z',
    user: { login: 'ada', type: 'User' },
  },
  {
    id: 302,
    body: 'outdated one',
    path: 'src/b.ts',
    line: null,
    original_line: 9,
    diff_hunk: '@@',
    html_url: 'u302',
    created_at: '2026-10-05T10:01:00Z',
    user: { login: 'linter[bot]', type: 'Bot' },
  },
];
const CONVERSATION = [
  {
    id: 401,
    body: 'why this approach?',
    html_url: 'u401',
    created_at: '2026-10-05T11:00:00Z',
    user: { login: 'bob', type: 'User' },
  },
];
const REVIEWS = [
  {
    id: 501,
    body: 'Please add tests',
    state: 'CHANGES_REQUESTED',
    html_url: 'u501',
    submitted_at: '2026-10-05T12:00:00Z',
    user: { login: 'ada', type: 'User' },
  },
  { id: 502, body: '', state: 'COMMENTED', html_url: 'u502', submitted_at: null, user: null },
];
const THREADS = {
  data: {
    repository: {
      pullRequest: {
        reviewThreads: {
          nodes: [
            { id: 'PRRT_1', isResolved: false, comments: { nodes: [{ databaseId: 301 }] } },
            { id: 'PRRT_2', isResolved: true, comments: { nodes: [{ databaseId: 302 }] } },
          ],
        },
      },
    },
  },
};

const lines = (items: unknown[]) => items.map((item) => JSON.stringify(item)).join('\n');

describe('GhPullRequestCommentService', () => {
  let exec: ReturnType<typeof vi.fn>;
  let service: GhPullRequestCommentService;

  beforeEach(() => {
    vi.stubEnv('GH_TOKEN', 'host-token');
    exec = vi.fn(async (_file: string, args: string[]) => {
      const joined = args.join(' ');
      if (args.includes('POST')) {
        return { stdout: JSON.stringify({ html_url: 'posted-url' }), stderr: '' };
      }
      if (joined.includes('/pulls/7/comments')) return { stdout: lines(INLINE), stderr: '' };
      if (joined.includes('/issues/7/comments')) return { stdout: lines(CONVERSATION), stderr: '' };
      if (joined.includes('/pulls/7/reviews')) return { stdout: lines(REVIEWS), stderr: '' };
      if (joined.includes('reviewThreads')) return { stdout: JSON.stringify(THREADS), stderr: '' };
      if (joined.includes('addPullRequestReviewThreadReply')) {
        return {
          stdout: JSON.stringify({
            data: { addPullRequestReviewThreadReply: { comment: { url: 'reply-url' } } },
          }),
          stderr: '',
        };
      }
      return { stdout: '{}', stderr: '' };
    });
    service = new GhPullRequestCommentService(exec as unknown as ExecFunction);
  });

  afterEach(() => vi.unstubAllEnvs());

  it('reads every page of the three comment kinds, with threads, in the worktree as the space', async () => {
    const comments = await service.list(TARGET);

    expect(comments).toEqual([
      {
        githubId: '301',
        kind: PrCommentKind.Inline,
        author: 'ada',
        authorIsBot: false,
        body: 'rename this',
        path: 'src/a.ts',
        line: 42,
        diffHunk: '@@ -1 +1 @@',
        threadId: 'PRRT_1',
        threadResolved: false,
        url: 'https://github.com/o/r/pull/7#discussion_r301',
        writtenAt: new Date('2026-10-05T10:00:00Z'),
      },
      {
        githubId: '302',
        kind: PrCommentKind.Inline,
        author: 'linter[bot]',
        authorIsBot: true,
        body: 'outdated one',
        path: 'src/b.ts',
        line: 9,
        diffHunk: '@@',
        threadId: 'PRRT_2',
        threadResolved: true,
        url: 'u302',
        writtenAt: new Date('2026-10-05T10:01:00Z'),
      },
      {
        githubId: '401',
        kind: PrCommentKind.Conversation,
        author: 'bob',
        authorIsBot: false,
        body: 'why this approach?',
        url: 'u401',
        writtenAt: new Date('2026-10-05T11:00:00Z'),
      },
      {
        githubId: '501',
        kind: PrCommentKind.Review,
        author: 'ada',
        authorIsBot: false,
        body: 'Please add tests',
        url: 'u501',
        writtenAt: new Date('2026-10-05T12:00:00Z'),
      },
    ]);

    const restCall = exec.mock.calls.find((call) =>
      call[1].join(' ').includes('/pulls/7/comments')
    );
    expect(restCall?.[0]).toBe('gh');
    expect(restCall?.[1]).toEqual([
      'api',
      '--paginate',
      'repos/{owner}/{repo}/pulls/7/comments?per_page=100',
      '--jq',
      '.[]',
    ]);
    const options = restCall?.[2] as { cwd: string; env: NodeJS.ProcessEnv };
    expect(options.cwd).toBe('/wt/feature');
    expect(options.env.GH_CONFIG_DIR).toBe('/gh-work');
    expect(options.env).not.toHaveProperty('GH_TOKEN');
  });

  it('replies on the review thread of an inline comment', async () => {
    const url = await service.reply(
      TARGET,
      { kind: PrCommentKind.Inline, githubId: '301', threadId: 'PRRT_1' },
      'Renamed.'
    );
    expect(url).toBe('reply-url');
    const args = exec.mock.calls.at(-1)?.[1] as string[];
    expect(args.slice(0, 2)).toEqual(['api', 'graphql']);
    expect(args).toContain('threadId=PRRT_1');
    expect(args).toContain('body=Renamed.');
  });

  it('replies to an inline comment without a known thread through the replies endpoint', async () => {
    await service.reply(TARGET, { kind: PrCommentKind.Inline, githubId: '301' }, 'Renamed.');
    expect(exec.mock.calls.at(-1)?.[1]).toEqual([
      'api',
      '--method',
      'POST',
      'repos/{owner}/{repo}/pulls/7/comments/301/replies',
      '-f',
      'body=Renamed.',
    ]);
  });

  it('answers conversation and review comments on the conversation', async () => {
    const url = await service.reply(
      TARGET,
      { kind: PrCommentKind.Review, githubId: '501' },
      '> @ada: Please add tests\n\nAdded.'
    );
    expect(url).toBe('posted-url');
    expect(exec.mock.calls.at(-1)?.[1]).toEqual([
      'api',
      '--method',
      'POST',
      'repos/{owner}/{repo}/issues/7/comments',
      '-f',
      'body=> @ada: Please add tests\n\nAdded.',
    ]);
  });

  it('resolves a thread', async () => {
    await service.resolveThread(TARGET, 'PRRT_1');
    const args = exec.mock.calls.at(-1)?.[1] as string[];
    expect(args.join(' ')).toContain('resolveReviewThread');
    expect(args).toContain('threadId=PRRT_1');
  });

  it('reports gh failures with gh error output', async () => {
    exec.mockRejectedValueOnce(
      Object.assign(new Error('exit 1'), { stderr: 'HTTP 404: Not Found' })
    );
    await expect(service.list(TARGET)).rejects.toThrow(/HTTP 404: Not Found/);
  });
});
