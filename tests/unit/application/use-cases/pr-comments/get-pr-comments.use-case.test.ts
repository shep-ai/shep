import 'reflect-metadata';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { GetPrCommentsUseCase } from '@/application/use-cases/pr-comments/get-pr-comments.use-case.js';
import { ABANDONED_ROUND_ERROR } from '@/application/use-cases/pr-comments/pr-comment-records.js';
import { PrCommentRoundStatus, PrCommentStatus } from '@/domain/generated/output.js';
import { PR_COMMENT_ROUND_STALE_AFTER_MS } from '@/domain/shared/pr-comments.js';
import {
  InMemoryPrCommentRounds,
  InMemoryPrComments,
} from '../../../../helpers/pr-comment-repositories.mock.js';
import { FEATURE, T0, fakeFeatures, stored } from './pr-comments.fixtures.js';

describe('GetPrCommentsUseCase', () => {
  afterEach(() => vi.useRealTimers());

  it('returns stored comments and rounds, failing an abandoned round and its comments', async () => {
    vi.useFakeTimers({ now: new Date(T0.getTime() + PR_COMMENT_ROUND_STALE_AFTER_MS + 1) });
    const comments = new InMemoryPrComments();
    const rounds = new InMemoryPrCommentRounds();
    await comments.create(stored({ status: PrCommentStatus.Addressing, roundId: 'r1' }));
    await rounds.create({
      id: 'r1',
      featureId: FEATURE.id,
      commentIds: ['c1'],
      status: PrCommentRoundStatus.Running,
      createdAt: T0,
      updatedAt: T0,
    });

    const result = await new GetPrCommentsUseCase(fakeFeatures(), comments, rounds).execute(
      'feat-1234'
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.feature.id).toBe(FEATURE.id);
    expect(result.rounds[0]).toMatchObject({
      status: PrCommentRoundStatus.Failed,
      error: ABANDONED_ROUND_ERROR,
    });
    expect(result.comments[0]).toMatchObject({
      status: PrCommentStatus.Failed,
      error: ABANDONED_ROUND_ERROR,
    });
  });

  it('refuses an unknown feature', async () => {
    const useCase = new GetPrCommentsUseCase(
      fakeFeatures(),
      new InMemoryPrComments(),
      new InMemoryPrCommentRounds()
    );
    expect(await useCase.execute('zzz')).toEqual({ ok: false, error: 'Feature not found: "zzz"' });
  });
});
