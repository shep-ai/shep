/**
 * Reading a feature's rounds (spec 124): a round left Running by a process
 * that died is recorded as Failed on the way out, and its comments become
 * addressable again.
 */

import {
  PrCommentRoundStatus,
  PrCommentStatus,
  type PrCommentRound,
} from '../../../domain/generated/output.js';
import { isRoundStale } from '../../../domain/shared/pr-comments.js';
import type {
  IPrCommentRepository,
  IPrCommentRoundRepository,
} from '../../ports/output/repositories/pr-comment-repository.interface.js';

export const ABANDONED_ROUND_ERROR =
  'The round stopped without finishing (shep was restarted or the agent hung).';

/** A feature's rounds, newest first, with abandoned ones failed. */
export async function listRounds(
  rounds: IPrCommentRoundRepository,
  comments: IPrCommentRepository,
  featureId: string
): Promise<PrCommentRound[]> {
  const now = new Date();
  const all = await rounds.listByFeature(featureId);
  const stale = all.filter((round) => isRoundStale(round, now));
  if (stale.length === 0) return all;

  const staleIds = new Set(stale.map((round) => round.id));
  for (const comment of await comments.listByFeature(featureId)) {
    if (comment.status === PrCommentStatus.Addressing && staleIds.has(comment.roundId ?? '')) {
      await comments.update({
        ...comment,
        status: PrCommentStatus.Failed,
        error: ABANDONED_ROUND_ERROR,
        updatedAt: now,
      });
    }
  }
  return Promise.all(
    all.map(async (round) => {
      if (!staleIds.has(round.id)) return round;
      const failed: PrCommentRound = {
        ...round,
        status: PrCommentRoundStatus.Failed,
        error: ABANDONED_ROUND_ERROR,
        finishedAt: now,
        updatedAt: now,
      };
      await rounds.update(failed);
      return failed;
    })
  );
}
