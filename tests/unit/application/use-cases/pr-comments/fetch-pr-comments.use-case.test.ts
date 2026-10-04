import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FetchPrCommentsUseCase } from '@/application/use-cases/pr-comments/fetch-pr-comments.use-case.js';
import {
  PrCommentKind,
  PrCommentStatus,
  PrStatus,
  SdlcLifecycle,
  type Feature,
} from '@/domain/generated/output.js';
import { SHEP_REPLY_MARKER } from '@/domain/shared/pr-comments.js';
import { InMemoryPrComments } from '../../../../helpers/pr-comment-repositories.mock.js';
import {
  FEATURE,
  SPACE_ENVIRONMENT,
  T0,
  WORKTREE_PATHS,
  fakeClient,
  fakeFeatures,
  fakeSpaceEnvironment,
  remote,
  stored,
} from './pr-comments.fixtures.js';

describe('FetchPrCommentsUseCase', () => {
  let comments: InMemoryPrComments;

  beforeEach(() => {
    vi.useFakeTimers({ now: T0 });
    comments = new InMemoryPrComments();
  });
  afterEach(() => vi.useRealTimers());

  function useCase(client = fakeClient(), features = [FEATURE]) {
    return new FetchPrCommentsUseCase(
      fakeFeatures(features),
      WORKTREE_PATHS,
      comments,
      client,
      fakeSpaceEnvironment()
    );
  }

  it('stores new comments as pending, reading in the worktree as the space', async () => {
    const client = fakeClient([
      remote(),
      remote({ githubId: '401', kind: PrCommentKind.Conversation, body: 'why?', path: undefined }),
    ]);
    const result = await useCase(client).execute('feat-1234');

    expect(client.list).toHaveBeenCalledWith({
      cwd: '/wt/refund-guests',
      prNumber: 7,
      environment: SPACE_ENVIRONMENT,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.added).toBe(2);
    expect(result.comments.map((c) => [c.githubId, c.kind, c.status])).toEqual([
      ['301', PrCommentKind.Inline, PrCommentStatus.Pending],
      ['401', PrCommentKind.Conversation, PrCommentStatus.Pending],
    ]);
    expect(result.comments[0]).toMatchObject({
      featureId: FEATURE.id,
      author: 'ada',
      path: 'src/refund.ts',
      line: 42,
      diffHunk: '@@ -40,3 +40,3 @@',
      threadId: 'PRRT_1',
      writtenAt: T0,
    });
  });

  it('is idempotent and keeps what happened to known comments', async () => {
    await comments.create(stored({ status: PrCommentStatus.Addressed, reply: 'Done.' }));
    const result = await useCase(fakeClient([remote({ body: 'edited body' })])).execute(FEATURE.id);
    expect(result.ok && result.added).toBe(0);
    expect([...comments.rows.values()]).toEqual([
      stored({ status: PrCommentStatus.Addressed, reply: 'Done.', body: 'edited body' }),
    ]);
  });

  it('skips shep replies and bots, and records comments in resolved threads as addressed', async () => {
    const result = await useCase(
      fakeClient([
        remote({ githubId: '1', body: `Renamed.\n\n${SHEP_REPLY_MARKER}` }),
        remote({ githubId: '2', authorIsBot: true }),
        remote({ githubId: '3', threadResolved: true }),
      ])
    ).execute(FEATURE.id);
    expect(result.ok && result.comments.map((c) => [c.githubId, c.status])).toEqual([
      ['3', PrCommentStatus.Addressed],
    ]);
  });

  it('refuses a feature without an open pull request or not in review', async () => {
    const merged = { ...FEATURE, pr: { ...FEATURE.pr, status: PrStatus.Merged } } as Feature;
    expect(await useCase(fakeClient(), [merged]).execute(FEATURE.id)).toEqual({
      ok: false,
      error: 'Refund guests has no open pull request.',
    });
    const implementing = { ...FEATURE, lifecycle: SdlcLifecycle.Implementation } as Feature;
    expect(await useCase(fakeClient(), [implementing]).execute(FEATURE.id)).toEqual({
      ok: false,
      error: 'Refund guests is not waiting for review (it is in Implementation).',
    });
    expect(await useCase().execute('nope')).toEqual({
      ok: false,
      error: 'Feature not found: "nope"',
    });
  });

  it('falls back to the computed worktree path', async () => {
    const client = fakeClient([]);
    const { worktreePath: _unset, ...withoutWorktree } = FEATURE;
    await useCase(client, [withoutWorktree as Feature]).execute(FEATURE.id);
    expect(client.list.mock.calls[0][0].cwd).toBe('/src/pay/.wt/feat/refund-guests');
  });
});
