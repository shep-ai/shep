'use client';

/**
 * PrCommentItem — one review comment on a feature's pull request: who wrote
 * it and where, what shep did about it, and the reply it posted.
 */

import { useTranslation } from 'react-i18next';
import { ExternalLink } from 'lucide-react';
import {
  PrCommentKind,
  PrCommentStatus,
  type PrComment,
} from '@shepai/core/domain/generated/output';
import { Badge } from '@/components/ui/badge';

const STATUS_VARIANT: Record<PrCommentStatus, 'default' | 'secondary' | 'outline' | 'destructive'> =
  {
    [PrCommentStatus.Pending]: 'outline',
    [PrCommentStatus.Addressing]: 'secondary',
    [PrCommentStatus.Addressed]: 'default',
    [PrCommentStatus.Declined]: 'secondary',
    [PrCommentStatus.Failed]: 'destructive',
  };

export interface PrCommentItemProps {
  comment: PrComment;
}

export function PrCommentItem({ comment }: PrCommentItemProps) {
  const { t } = useTranslation('web');
  const where =
    comment.kind === PrCommentKind.Inline
      ? `${comment.path ?? ''}${comment.line ? `:${comment.line}` : ''}`
      : t(`prComments.kind.${comment.kind}`);
  return (
    <li
      data-testid={`pr-comment-${comment.githubId}`}
      className="space-y-1.5 rounded-md border p-3"
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-medium">@{comment.author}</span>
        <code className="text-muted-foreground break-all">{where}</code>
        <Badge variant={STATUS_VARIANT[comment.status]} className="ml-auto text-[10px]">
          {t(`prComments.status.${comment.status}`)}
        </Badge>
        <a
          href={comment.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('prComments.openOnGitHub')}
          className="text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="size-3" />
        </a>
      </div>
      <p className="line-clamp-4 text-sm whitespace-pre-wrap">{comment.body}</p>
      {comment.reply ? (
        <p className="border-muted text-muted-foreground border-l-2 pl-2 text-xs whitespace-pre-wrap">
          {comment.replyUrl ? (
            <a
              href={comment.replyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              {comment.reply}
            </a>
          ) : (
            comment.reply
          )}
        </p>
      ) : null}
      {comment.error ? <p className="text-destructive text-xs">{comment.error}</p> : null}
    </li>
  );
}
