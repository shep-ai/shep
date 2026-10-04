import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AddressPrCommentsUseCase } from '@/application/use-cases/pr-comments/address-pr-comments.use-case.js';
import {
  ADDRESS_MAX_TURNS,
  CommentAction,
  type AddressCommentsResult,
} from '@/application/use-cases/pr-comments/pr-comment-prompt.js';
import type { IGitPrService } from '@/application/ports/output/services/git-pr-service.interface.js';
import type { IAgentRunRepository } from '@/application/ports/output/agents/agent-run-repository.interface.js';
import type { ISettingsProvider } from '@/application/ports/output/services/settings-provider.interface.js';
import {
  AgentType,
  PrCommentKind,
  PrCommentRoundStatus,
  PrCommentStatus,
} from '@/domain/generated/output.js';
import {
  PR_COMMENT_ROUND_STALE_AFTER_MS,
  PR_COMMENT_ROUND_TIMEOUT_MS,
  SHEP_REPLY_MARKER,
} from '@/domain/shared/pr-comments.js';
import {
  InMemoryPrCommentRounds,
  InMemoryPrComments,
} from '../../../../helpers/pr-comment-repositories.mock.js';
import {
  FEATURE,
  SPACE_ENVIRONMENT,
  T0,
  WORKTREE_PATHS,
  fakeClient,
  fakeFeatures,
  fakeSpaceEnvironment,
  stored,
} from './pr-comments.fixtures.js';

const INLINE = stored();
const QUESTION = stored({
  id: 'c2',
  githubId: '401',
  kind: PrCommentKind.Conversation,
  author: 'bob',
  body: 'Why a new table?',
  path: undefined,
  line: undefined,
  threadId: undefined,
  writtenAt: new Date(T0.getTime() + 1),
});

const RESULT: AddressCommentsResult = {
  summary: 'Renamed total and explained the table.',
  responses: [
    { commentId: 'c1', action: CommentAction.Changed, reply: 'Renamed to totalCents.' },
    { commentId: 'c2', action: CommentAction.Answered, reply: 'Refunds outlive orders.' },
  ],
};

function fakeGit(heads: string[] = ['aaa', 'bbb'], pushed = 'bbb') {
  const queue = [...heads];
  return {
    revParse: vi.fn(async (_cwd: string, ref: string) =>
      ref.startsWith('origin/') ? pushed : (queue.shift() ?? heads.at(-1) ?? '')
    ),
    hasUncommittedChanges: vi.fn(async () => false),
    commitAll: vi.fn(async () => 'ccc'),
    push: vi.fn(async () => undefined),
  };
}

describe('AddressPrCommentsUseCase', () => {
  let comments: InMemoryPrComments;
  let rounds: InMemoryPrCommentRounds;
  let client: ReturnType<typeof fakeClient>;
  let agent: { call: ReturnType<typeof vi.fn> };
  let git: ReturnType<typeof fakeGit>;

  function useCase(space: Parameters<typeof fakeSpaceEnvironment>[0] = {}) {
    return new AddressPrCommentsUseCase(
      fakeFeatures(),
      WORKTREE_PATHS,
      comments,
      rounds,
      client,
      agent as never,
      git as unknown as IGitPrService,
      {
        findById: vi.fn(async () => ({ agentType: AgentType.CodexCli })),
      } as unknown as IAgentRunRepository,
      {
        has: () => true,
        get: () => ({ agent: { type: AgentType.ClaudeCode } }),
      } as unknown as ISettingsProvider,
      fakeSpaceEnvironment(space)
    );
  }

  beforeEach(async () => {
    vi.useFakeTimers({ now: T0 });
    comments = new InMemoryPrComments();
    rounds = new InMemoryPrCommentRounds();
    await comments.create(INLINE);
    await comments.create(QUESTION);
    client = fakeClient();
    agent = { call: vi.fn(async () => RESULT) };
    git = fakeGit();
  });
  afterEach(() => vi.useRealTimers());

  async function started(space: Parameters<typeof fakeSpaceEnvironment>[0] = {}) {
    const result = await useCase(space).start({ feature: 'feat-1234' });
    if (!result.ok) throw new Error(result.error);
    return result.round;
  }

  describe('start', () => {
    it('records a running round over the pending comments with the feature run agent', async () => {
      const result = await useCase().start({ feature: 'feat-1234' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.round).toMatchObject({
        featureId: FEATURE.id,
        commentIds: ['c1', 'c2'],
        status: PrCommentRoundStatus.Running,
        agentType: AgentType.CodexCli,
      });
      expect((await comments.listByFeature(FEATURE.id)).map((c) => [c.status, c.roundId])).toEqual([
        [PrCommentStatus.Addressing, result.round.id],
        [PrCommentStatus.Addressing, result.round.id],
      ]);
    });

    it('takes only the named comments, and refuses one that is not pending', async () => {
      const result = await useCase().start({ feature: FEATURE.id, commentIds: ['c2'] });
      expect(result.ok && result.round.commentIds).toEqual(['c2']);

      rounds.rows.clear();
      expect(await useCase().start({ feature: FEATURE.id, commentIds: ['c'] })).toEqual({
        ok: false,
        error: 'Comment id c matches more than one comment.',
      });

      rounds.rows.clear();
      await comments.update({ ...INLINE, status: PrCommentStatus.Addressed });
      expect(await useCase().start({ feature: FEATURE.id, commentIds: ['c1'] })).toEqual({
        ok: false,
        error: 'Comment c1 is not waiting to be addressed.',
      });
    });

    it('retries failed comments and refuses when nothing is pending', async () => {
      await comments.update({ ...INLINE, status: PrCommentStatus.Failed });
      await comments.update({ ...QUESTION, status: PrCommentStatus.Declined });
      const retry = await useCase().start({ feature: FEATURE.id });
      expect(retry.ok && retry.round.commentIds).toEqual(['c1']);

      await comments.update({ ...INLINE, status: PrCommentStatus.Addressed });
      rounds.rows.clear();
      expect(await useCase().start({ feature: FEATURE.id })).toEqual({
        ok: false,
        error: 'Refund guests has no comments waiting to be addressed.',
      });
    });

    it('allows one round at a time, failing an abandoned one', async () => {
      await started();
      expect(await useCase().start({ feature: FEATURE.id })).toEqual({
        ok: false,
        error: 'Refund guests is already addressing comments.',
      });

      vi.setSystemTime(new Date(T0.getTime() + PR_COMMENT_ROUND_STALE_AFTER_MS + 1));
      const fresh = await useCase().start({ feature: FEATURE.id });
      expect(fresh.ok).toBe(true);
      expect([...rounds.rows.values()].map((r) => r.status).sort()).toEqual([
        PrCommentRoundStatus.Failed,
        PrCommentRoundStatus.Running,
      ]);
    });

    it('refuses an agent the space does not allow, recording nothing', async () => {
      expect(await useCase({ refusal: 'Not here' }).start({ feature: FEATURE.id })).toEqual({
        ok: false,
        error: 'Not here',
      });
      expect(rounds.rows.size).toBe(0);
    });
  });

  describe('run', () => {
    it('has the agent work in the worktree, then replies on each comment with the commit', async () => {
      const round = await started();
      const done = await useCase().run(round.id);

      const [prompt, schema, options] = agent.call.mock.calls[0];
      expect(prompt).toContain('Comment c1');
      expect(prompt).toContain('#shep rename total to totalCents');
      expect(prompt).toContain('git push origin feat/refund-guests');
      expect(schema).toMatchObject({ required: ['summary', 'responses'] });
      expect(options).toEqual({
        cwd: '/wt/refund-guests',
        maxTurns: ADDRESS_MAX_TURNS,
        timeout: PR_COMMENT_ROUND_TIMEOUT_MS,
        silent: true,
        agentType: AgentType.CodexCli,
        environment: SPACE_ENVIRONMENT,
      });

      const target = { cwd: '/wt/refund-guests', prNumber: 7, environment: SPACE_ENVIRONMENT };
      expect(client.reply).toHaveBeenCalledWith(
        target,
        { kind: PrCommentKind.Inline, githubId: '301', threadId: 'PRRT_1' },
        `Renamed to totalCents.\n\nChanged in bbb.\n\n${SHEP_REPLY_MARKER}`
      );
      expect(client.reply).toHaveBeenCalledWith(
        target,
        { kind: PrCommentKind.Conversation, githubId: '401' },
        `> @bob: Why a new table?\n\nRefunds outlive orders.\n\n${SHEP_REPLY_MARKER}`
      );
      expect(client.resolveThread).not.toHaveBeenCalled();

      expect(done).toMatchObject({
        status: PrCommentRoundStatus.Completed,
        commitSha: 'bbb',
        summary: RESULT.summary,
        finishedAt: T0,
      });
      const [inline, question] = await comments.listByFeature(FEATURE.id);
      expect(inline).toMatchObject({
        status: PrCommentStatus.Addressed,
        reply: 'Renamed to totalCents.',
        replyUrl: 'reply-to-301',
      });
      expect(question).toMatchObject({
        status: PrCommentStatus.Addressed,
        replyUrl: 'reply-to-401',
      });
    });

    it('resolves the threads it changed code for when the space says so', async () => {
      const round = await started({ resolveThreads: true });
      await useCase({ resolveThreads: true }).run(round.id);
      expect(client.resolveThread).toHaveBeenCalledWith(
        { cwd: '/wt/refund-guests', prNumber: 7, environment: SPACE_ENVIRONMENT },
        'PRRT_1'
      );
      expect(client.resolveThread).toHaveBeenCalledTimes(1);
    });

    it('records declined comments and comments the agent did not answer', async () => {
      agent.call.mockResolvedValue({
        summary: 'Kept the table.',
        responses: [{ commentId: 'c2', action: CommentAction.Declined, reply: 'Keeping it.' }],
      });
      git = fakeGit(['aaa', 'aaa'], 'aaa');
      const round = await started();
      const done = await useCase().run(round.id);

      expect(done.commitSha).toBeUndefined();
      const [inline, question] = await comments.listByFeature(FEATURE.id);
      expect(inline).toMatchObject({
        status: PrCommentStatus.Failed,
        error: 'The agent did not answer this comment.',
      });
      expect(question).toMatchObject({ status: PrCommentStatus.Declined, reply: 'Keeping it.' });
      expect(client.reply).toHaveBeenCalledTimes(1);
    });

    it('commits and pushes what the agent left behind', async () => {
      git = fakeGit(['aaa', 'ccc'], 'aaa');
      git.hasUncommittedChanges.mockResolvedValue(true);
      const round = await started();
      const done = await useCase().run(round.id);
      expect(git.commitAll).toHaveBeenCalledWith(
        '/wt/refund-guests',
        'fix: address review comments'
      );
      expect(git.push).toHaveBeenCalledWith('/wt/refund-guests', 'feat/refund-guests');
      expect(done.commitSha).toBe('ccc');
    });

    it('fails without replying when the change cannot be pushed', async () => {
      git = fakeGit(['aaa', 'bbb'], 'aaa');
      git.push.mockRejectedValue(new Error('rejected: non-fast-forward'));
      const round = await started();
      const done = await useCase().run(round.id);

      expect(done).toMatchObject({
        status: PrCommentRoundStatus.Failed,
        error: 'Could not push bbb: rejected: non-fast-forward',
      });
      expect(client.reply).not.toHaveBeenCalled();
      expect((await comments.listByFeature(FEATURE.id)).map((c) => c.status)).toEqual([
        PrCommentStatus.Failed,
        PrCommentStatus.Failed,
      ]);
    });

    it('fails the round when the agent fails', async () => {
      agent.call.mockRejectedValue(new Error('agent timed out'));
      const round = await started();
      const done = await useCase().run(round.id);
      expect(done).toMatchObject({ status: PrCommentRoundStatus.Failed, error: 'agent timed out' });
      expect((await comments.listByFeature(FEATURE.id))[0]).toMatchObject({
        status: PrCommentStatus.Failed,
        error: 'agent timed out',
      });
    });

    it('records a reply that GitHub refused on that comment only', async () => {
      client.reply.mockRejectedValueOnce(new Error('gh: HTTP 403'));
      const round = await started();
      const done = await useCase().run(round.id);
      expect(done.status).toBe(PrCommentRoundStatus.Completed);
      const [inline, question] = await comments.listByFeature(FEATURE.id);
      expect(inline).toMatchObject({ status: PrCommentStatus.Failed, error: 'gh: HTTP 403' });
      expect(question.status).toBe(PrCommentStatus.Addressed);
    });

    it('leaves a finished round alone', async () => {
      const round = await started();
      await rounds.update({ ...round, status: PrCommentRoundStatus.Completed });
      await useCase().run(round.id);
      expect(agent.call).not.toHaveBeenCalled();
    });
  });
});
