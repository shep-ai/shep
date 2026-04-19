/**
 * Post Code Review Use Case
 *
 * Posts a completed code review to GitHub as a pull request review.
 * Only reviews with status=Completed can be posted.
 *
 * Valid comments (inDiffRange=true) become inline review comments.
 * Invalid comments (inDiffRange=false) are appended to the review body.
 * Suggestions are formatted with GitHub's ```suggestion syntax.
 */

import { injectable, inject } from 'tsyringe';
import type { CodeReview, ReviewComment } from '../../../domain/generated/output.js';
import { CodeReviewStatus } from '../../../domain/generated/output.js';
import type { ICodeReviewRepository } from '../../ports/output/repositories/code-review-repository.interface.js';
import type {
  IPlatformReviewService,
  ReviewInlineComment,
} from '../../ports/output/services/platform-review-service.interface.js';
import { parsePrUrl } from './run-code-review.use-case.js';

@injectable()
export class PostCodeReviewUseCase {
  constructor(
    @inject('ICodeReviewRepository')
    private readonly codeReviewRepo: ICodeReviewRepository,
    @inject('IPlatformReviewService')
    private readonly platformReviewService: IPlatformReviewService
  ) {}

  async execute(reviewId: string): Promise<CodeReview> {
    // 1. Fetch the persisted review
    const review = await this.codeReviewRepo.findById(reviewId);
    if (!review) {
      throw new Error(`Code review not found: "${reviewId}"`);
    }

    // 2. Validate status — only Completed reviews can be posted
    if (review.status !== CodeReviewStatus.Completed) {
      throw new Error(
        `Cannot post review with status "${review.status}". Only completed reviews can be posted.`
      );
    }

    // 3. Resolve owner/repo from prUrl
    const prInfo = review.prUrl ? parsePrUrl(review.prUrl) : null;
    if (!prInfo) {
      throw new Error(
        'Cannot determine repository owner/name from review. PR URL is missing or invalid.'
      );
    }

    const { owner, repo } = prInfo;
    const comments = review.comments ?? [];

    // 4. Separate valid and invalid comments
    const validComments = comments.filter((c) => c.inDiffRange);
    const invalidComments = comments.filter((c) => !c.inDiffRange);

    // 5. Build review body
    let body = review.summary ?? 'AI Code Review';

    // Append invalid comments to body
    if (invalidComments.length > 0) {
      body += '\n\n---\n\n**Additional findings** (outside diff range):\n';
      for (const c of invalidComments) {
        body += `\n- **${c.path}:${c.line}** — ${c.body}`;
        if (c.suggestion) {
          body += `\n  \`\`\`suggestion\n  ${c.suggestion}\n  \`\`\``;
        }
      }
    }

    // 6. Format inline comments
    const inlineComments: ReviewInlineComment[] = validComments.map((c) =>
      this.formatInlineComment(c)
    );

    // 7. Post to GitHub
    try {
      const result = await this.platformReviewService.postReview(
        owner,
        repo,
        review.prNumber,
        body,
        inlineComments
      );

      // 8. Update review with Posted status and review URL
      const updatedReview: CodeReview = {
        ...review,
        status: CodeReviewStatus.Posted,
        reviewUrl: result.reviewUrl,
        updatedAt: new Date(),
      };
      await this.codeReviewRepo.update(updatedReview);

      return updatedReview;
    } catch (error) {
      // Posting failed — keep status as Completed (review data is still valid)
      // Re-throw so the caller knows it failed
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to post review to GitHub: ${message}`);
    }
  }

  /**
   * Format a ReviewComment as a GitHub inline review comment.
   * Includes suggestion syntax if the comment has a suggestion.
   */
  private formatInlineComment(comment: ReviewComment): ReviewInlineComment {
    let body = comment.body;

    // Append suggestion in GitHub's suggestion syntax
    if (comment.suggestion) {
      body += `\n\n\`\`\`suggestion\n${comment.suggestion}\n\`\`\``;
    }

    const inline: ReviewInlineComment = {
      path: comment.path,
      line: comment.line,
      body,
      side: comment.side as 'LEFT' | 'RIGHT',
    };

    if (comment.startLine !== undefined) {
      inline.startLine = comment.startLine;
      inline.startSide = comment.side as 'LEFT' | 'RIGHT';
    }

    return inline;
  }
}
