'use client';

import { FileCode2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReviewComment } from '@shepai/core/domain/generated/output';

interface ReviewCommentCardProps {
  comment: ReviewComment;
  className?: string;
}

export function ReviewCommentCard({ comment, className }: ReviewCommentCardProps) {
  const lineDisplay =
    comment.startLine !== undefined ? `L${comment.startLine}-${comment.line}` : `L${comment.line}`;

  return (
    <div
      className={cn(
        'bg-card text-card-foreground rounded-lg border',
        !comment.inDiffRange && 'border-amber-300 dark:border-amber-700',
        className
      )}
    >
      {/* Header: file path + line number */}
      <div className="flex items-center gap-2 border-b px-3 py-2 text-xs">
        <FileCode2 className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
        <span className="text-muted-foreground min-w-0 truncate font-mono">{comment.path}</span>
        <span className="bg-muted text-muted-foreground shrink-0 rounded px-1.5 py-0.5 font-mono">
          {lineDisplay}
        </span>
        {!comment.inDiffRange && (
          <span className="ml-auto flex shrink-0 items-center gap-1 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3" />
            Outside diff
          </span>
        )}
      </div>

      {/* Comment body */}
      <div className="px-3 py-2 text-sm">{comment.body}</div>

      {/* Suggestion block */}
      {comment.suggestion ? (
        <div className="border-t px-3 py-2">
          <p className="text-muted-foreground mb-1 text-xs font-medium">Suggestion:</p>
          <pre className="overflow-x-auto rounded-md bg-emerald-50 p-2 font-mono text-xs text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
            {comment.suggestion}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
