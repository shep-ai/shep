'use client';

/**
 * PrCommentsSection — the review comments on a feature's pull request (spec
 * 124), shown under the merge review: what each says, what shep did about
 * it, and a button that has an agent address the pending ones in the
 * feature's worktree, push, and reply on each.
 */

import { useTranslation } from 'react-i18next';
import { MessagesSquare, RefreshCw } from 'lucide-react';
import { PrCommentRoundStatus, PrCommentStatus } from '@shepai/core/domain/generated/output';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { PrCommentItem } from './pr-comment-item';
import { usePrComments, type PrCommentsState } from './use-pr-comments';

const SHORT_SHA_LENGTH = 7;
const ADDRESSABLE = new Set([PrCommentStatus.Pending, PrCommentStatus.Failed]);

export interface PrCommentsSectionProps {
  featureId: string;
  /** Data to show without loading (stories, tests). */
  initial?: PrCommentsState;
}

export function PrCommentsSection({ featureId, initial }: PrCommentsSectionProps) {
  const { t } = useTranslation('web');
  const { comments, rounds, error, refreshing, starting, running, refresh, address } =
    usePrComments(featureId, initial);
  const addressable = comments.filter((comment) => ADDRESSABLE.has(comment.status)).length;
  const [latest] = rounds;

  return (
    <section data-testid="pr-comments-section" className="space-y-3 rounded-lg border p-4">
      <header className="flex flex-wrap items-center gap-2">
        <MessagesSquare className="text-muted-foreground size-4" />
        <h3 className="text-sm font-semibold">{t('prComments.title')}</h3>
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            aria-label={t('prComments.refresh')}
            disabled={refreshing}
            onClick={() => void refresh()}
          >
            <RefreshCw className={refreshing ? 'size-3.5 animate-spin' : 'size-3.5'} />
          </Button>
          <Button
            size="sm"
            disabled={addressable === 0 || running || starting}
            onClick={() => void address()}
          >
            {addressable === 0
              ? t('prComments.addressNone')
              : t('prComments.address', { count: addressable })}
          </Button>
        </div>
      </header>

      {running && latest ? (
        <p className="text-muted-foreground flex items-center gap-2 text-xs">
          <Spinner size="sm" />
          {t('prComments.running', { count: latest.commentIds.length })}
        </p>
      ) : null}
      {!running && latest ? (
        <p
          className={
            latest.status === PrCommentRoundStatus.Failed
              ? 'text-destructive text-xs'
              : 'text-muted-foreground text-xs'
          }
        >
          {latest.status === PrCommentRoundStatus.Failed
            ? t('prComments.roundFailed', { error: latest.error ?? '' })
            : t(latest.commitSha ? 'prComments.roundPushed' : 'prComments.roundAnswered', {
                sha: latest.commitSha?.slice(0, SHORT_SHA_LENGTH),
              })}
          {latest.summary ? ` ${latest.summary}` : ''}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}

      {comments.length === 0 && !refreshing ? (
        <p className="text-muted-foreground text-xs">{t('prComments.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {comments.map((comment) => (
            <PrCommentItem key={comment.id} comment={comment} />
          ))}
        </ul>
      )}
    </section>
  );
}
