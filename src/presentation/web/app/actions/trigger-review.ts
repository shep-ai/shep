'use server';

import { resolve } from '@/lib/server-container';
import type { RunCodeReviewUseCase } from '@shepai/core/application/use-cases/code-review/run-code-review.use-case';
import type { PostCodeReviewUseCase } from '@shepai/core/application/use-cases/code-review/post-code-review.use-case';
import type { CodeReview } from '@shepai/core/domain/generated/output';

interface TriggerReviewInput {
  /** PR number or PR URL */
  target: string;
  /** Repository owner (required when target is a plain PR number) */
  owner?: string;
  /** Repository name (required when target is a plain PR number) */
  repo?: string;
  /** Absolute path to the repository */
  repositoryPath?: string;
  /** Optional feature ID to link the review to */
  featureId?: string;
  /** When true, automatically post the review to GitHub after completion */
  autoPost?: boolean;
}

export async function triggerReview(
  input: TriggerReviewInput
): Promise<{ review?: CodeReview; error?: string }> {
  const { target, owner, repo, repositoryPath, featureId, autoPost } = input;

  if (!target) {
    return { error: 'target is required (PR number or URL)' };
  }

  try {
    const runUseCase = resolve<RunCodeReviewUseCase>('RunCodeReviewUseCase');
    const result = await runUseCase.execute({
      target,
      owner,
      repo,
      repositoryPath,
      featureId,
    });

    if (!result.ok) {
      return { error: result.error };
    }

    // Optionally post to GitHub
    if (autoPost) {
      try {
        const postUseCase = resolve<PostCodeReviewUseCase>('PostCodeReviewUseCase');
        const postedReview = await postUseCase.execute(result.review.id);
        return { review: postedReview };
      } catch (postError) {
        // Review was completed but posting failed — return the completed review with error
        return {
          review: result.review,
          error: `Review completed but posting failed: ${postError instanceof Error ? postError.message : String(postError)}`,
        };
      }
    }

    return { review: result.review };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
