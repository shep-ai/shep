'use client';

import { useMemo } from 'react';
import { AlertCircle, ExternalLink, FileCode2, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CodeReview, ReviewComment } from '@shepai/core/domain/generated/output';
import { CodeReviewStatus } from '@shepai/core/domain/generated/output';
import { ReviewStatusBadge } from './review-status-badge';
import { ReviewCommentCard } from './review-comment-card';

interface CodeReviewPanelProps {
  review?: CodeReview;
  loading?: boolean;
  error?: string;
  onPostToGitHub?: (reviewId: string) => void;
  postingInProgress?: boolean;
  className?: string;
}

/** Group comments by file path, preserving order of first appearance. */
function groupByFile(comments: ReviewComment[]): Map<string, ReviewComment[]> {
  const grouped = new Map<string, ReviewComment[]>();
  for (const comment of comments) {
    const existing = grouped.get(comment.path);
    if (existing) {
      existing.push(comment);
    } else {
      grouped.set(comment.path, [comment]);
    }
  }
  return grouped;
}

export function CodeReviewPanel({
  review,
  loading,
  error,
  onPostToGitHub,
  postingInProgress,
  className,
}: CodeReviewPanelProps) {
  const groupedComments = useMemo(() => {
    if (!review?.comments?.length) return new Map<string, ReviewComment[]>();
    return groupByFile(review.comments);
  }, [review?.comments]);

  const commentCount = review?.comments?.length ?? 0;

  // Loading state
  if (loading) {
    return (
      <div className={cn('space-y-4 p-4', className)}>
        <div className="flex items-center gap-3">
          <div className="bg-muted h-5 w-20 animate-pulse rounded-full" />
          <div className="bg-muted h-4 w-32 animate-pulse rounded" />
        </div>
        <div className="bg-muted h-16 animate-pulse rounded-lg" />
        <div className="space-y-3">
          <div className="bg-muted h-24 animate-pulse rounded-lg" />
          <div className="bg-muted h-24 animate-pulse rounded-lg" />
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400',
          className
        )}
      >
        <AlertCircle className="h-4 w-4 shrink-0" />
        {error}
      </div>
    );
  }

  // No review
  if (!review) {
    return null;
  }

  // Empty review (completed but no comments)
  const isEmpty = review.status === CodeReviewStatus.Completed && commentCount === 0;

  const canPost = review.status === CodeReviewStatus.Completed && onPostToGitHub;

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header: status + comment count + post button */}
      <div className="flex items-center gap-3">
        <ReviewStatusBadge status={review.status} />
        <span className="text-muted-foreground flex items-center gap-1 text-xs">
          <MessageSquare className="h-3.5 w-3.5" />
          {commentCount} {commentCount === 1 ? 'finding' : 'findings'}
        </span>
        {review.reviewUrl ? (
          <a
            href={review.reviewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto flex items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400"
          >
            <ExternalLink className="h-3 w-3" />
            View on GitHub
          </a>
        ) : null}
        {canPost ? (
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={() => onPostToGitHub(review.id)}
            disabled={postingInProgress}
          >
            {postingInProgress ? 'Posting...' : 'Post to GitHub'}
          </Button>
        ) : null}
      </div>

      {/* Summary */}
      {review.summary ? (
        <div className="bg-muted/50 rounded-lg border p-3 text-sm">{review.summary}</div>
      ) : null}

      {/* Error message */}
      {review.status === CodeReviewStatus.Failed && review.errorMessage ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {review.errorMessage}
        </div>
      ) : null}

      {/* Empty state */}
      {isEmpty ? (
        <div className="text-muted-foreground flex flex-col items-center gap-2 py-8 text-center">
          <FileCode2 className="h-8 w-8" />
          <p className="text-sm">No findings — the code looks good!</p>
        </div>
      ) : null}

      {/* Comments grouped by file */}
      {groupedComments.size > 0 ? (
        <div className="space-y-4">
          {Array.from(groupedComments.entries()).map(([filePath, comments]) => (
            <div key={filePath} className="space-y-2">
              <h4 className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
                <FileCode2 className="h-3.5 w-3.5" />
                {filePath}
                <span className="bg-muted rounded px-1 py-0.5">{comments.length}</span>
              </h4>
              <div className="space-y-2">
                {comments.map((comment) => (
                  <ReviewCommentCard
                    key={`${comment.path}:${comment.line}:${comment.side}`}
                    comment={comment}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
