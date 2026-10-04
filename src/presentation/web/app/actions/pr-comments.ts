'use server';

/**
 * Server actions for the feature drawer's Review comments section (spec 124).
 * A round runs on in the web server after `addressPrComments` returns; the
 * section polls `getPrComments` until it finishes.
 */

import { resolve } from '@/lib/server-container';
import type { PrComment, PrCommentRound } from '@shepai/core/domain/generated/output';
import type { GetPrCommentsUseCase } from '@shepai/core/application/use-cases/pr-comments/get-pr-comments.use-case';
import type { FetchPrCommentsUseCase } from '@shepai/core/application/use-cases/pr-comments/fetch-pr-comments.use-case';
import type { AddressPrCommentsUseCase } from '@shepai/core/application/use-cases/pr-comments/address-pr-comments.use-case';

export type PrCommentsSnapshot =
  | { ok: true; comments: PrComment[]; rounds: PrCommentRound[] }
  | { ok: false; error: string };

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The stored comments and rounds, without asking GitHub. */
export async function getPrComments(featureId: string): Promise<PrCommentsSnapshot> {
  try {
    const result = await resolve<GetPrCommentsUseCase>('GetPrCommentsUseCase').execute(featureId);
    return result.ok ? { ok: true, comments: result.comments, rounds: result.rounds } : result;
  } catch (error: unknown) {
    return { ok: false, error: message(error) };
  }
}

/** Reads the pull request's comments from GitHub, then returns the snapshot. */
export async function refreshPrComments(featureId: string): Promise<PrCommentsSnapshot> {
  try {
    const fetched =
      await resolve<FetchPrCommentsUseCase>('FetchPrCommentsUseCase').execute(featureId);
    if (!fetched.ok) return fetched;
    return getPrComments(featureId);
  } catch (error: unknown) {
    return { ok: false, error: message(error) };
  }
}

export async function addressPrComments(
  featureId: string,
  commentIds?: string[]
): Promise<{ ok: true; round: PrCommentRound } | { ok: false; error: string }> {
  try {
    const useCase = resolve<AddressPrCommentsUseCase>('AddressPrCommentsUseCase');
    const started = await useCase.start({
      feature: featureId,
      ...(commentIds && commentIds.length > 0 ? { commentIds } : {}),
    });
    if (!started.ok) return started;
    // run() records its own failure; this only guards against a crash before it can.
    useCase.run(started.round.id).catch((error: unknown) => {
      // eslint-disable-next-line no-console
      console.error('[addressPrComments] round failed:', error);
    });
    return { ok: true, round: started.round };
  } catch (error: unknown) {
    return { ok: false, error: message(error) };
  }
}
