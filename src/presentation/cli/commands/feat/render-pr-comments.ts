/** Terminal rendering of a feature's PR review comments (spec 124). */

import {
  PrCommentKind,
  PrCommentStatus,
  type PrComment,
  type PrCommentRound,
} from '@/domain/generated/output.js';
import { colors } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';

/** Characters of a comment id shown; `address-comments` accepts the prefix. */
export const SHORT_COMMENT_ID_LENGTH = 8;
const SHORT_SHA_LENGTH = 7;
const PREVIEW_CHARS = 100;

const STATUS_COLOR: Record<PrCommentStatus, (text: string) => string> = {
  [PrCommentStatus.Pending]: colors.warning,
  [PrCommentStatus.Addressing]: colors.info,
  [PrCommentStatus.Addressed]: colors.success,
  [PrCommentStatus.Declined]: colors.muted,
  [PrCommentStatus.Failed]: colors.error,
};

function preview(body: string): string {
  const firstLine = body.trim().split(/\r?\n/)[0] ?? '';
  return firstLine.length > PREVIEW_CHARS ? `${firstLine.slice(0, PREVIEW_CHARS - 1)}…` : firstLine;
}

function where(comment: PrComment): string {
  if (comment.kind !== PrCommentKind.Inline) return comment.kind.toLowerCase();
  return `${comment.path ?? '?'}${comment.line ? `:${comment.line}` : ''}`;
}

export function renderComment(comment: PrComment): string[] {
  const lines = [
    `${colors.muted(comment.id.slice(0, SHORT_COMMENT_ID_LENGTH))}  ${STATUS_COLOR[comment.status](comment.status.padEnd(10))}  @${comment.author}  ${colors.accent(where(comment))}`,
    `   ${preview(comment.body)}`,
  ];
  if (comment.reply) lines.push(`   ${colors.muted('↳')} ${preview(comment.reply)}`);
  if (comment.error) lines.push(`   ${colors.error(comment.error)}`);
  return lines;
}

export function renderRound(round: PrCommentRound): string {
  const t = getCliI18n().t;
  return t('cli:commands.feat.comments.round', {
    status: round.status,
    count: round.commentIds.length,
    commit: round.commitSha
      ? t('cli:commands.feat.comments.commit', {
          sha: round.commitSha.slice(0, SHORT_SHA_LENGTH),
        })
      : '',
    error: round.error ? ` — ${round.error}` : '',
  });
}
