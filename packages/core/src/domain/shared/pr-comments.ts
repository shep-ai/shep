/**
 * PR comment loop rules (spec 124): which comments shep addresses without
 * being asked, how its replies read, and how it recognises them.
 *
 * gh posts as the user, so shep's replies come from the same account as the
 * user's own comments; a hidden marker tells them apart.
 *
 * Pure: no I/O. Per the domain/ convention, relative imports carry no
 * extension.
 */

import { PrCommentRoundStatus, PrCommentTrigger } from '../generated/output';

/** Ends every reply shep posts; comments containing it are never read back. */
export const SHEP_REPLY_MARKER = '<!-- shep:pr-comment-reply -->';

/** `#shep` as a word of its own: not `#shepherd`, `#shep-1` or `email#shep`. */
const SHEP_MENTION = /(^|[^\w#-])#shep(?![\w-])/i;

/** The trigger when a space sets none. */
export const DEFAULT_PR_COMMENT_TRIGGER = PrCommentTrigger.Mention;

/** Most comments one round takes on. */
export const MAX_COMMENTS_PER_ROUND = 20;

const MS_PER_MINUTE = 60_000;

/** The agent's budget for one round. */
export const PR_COMMENT_ROUND_TIMEOUT_MS = 30 * MS_PER_MINUTE;

/** A running round not updated for this long belongs to a process that is gone. */
export const PR_COMMENT_ROUND_STALE_AFTER_MS = PR_COMMENT_ROUND_TIMEOUT_MS + 5 * MS_PER_MINUTE;

const SHORT_SHA_LENGTH = 7;
const QUOTED_LINES = 3;

export function mentionsShep(body: string): boolean {
  return SHEP_MENTION.test(body);
}

export function isShepReply(body: string): boolean {
  return body.includes(SHEP_REPLY_MARKER);
}

/** Whether the daemon addresses a comment without being asked. */
export function isAutoAddressed(trigger: PrCommentTrigger | undefined, body: string): boolean {
  switch (trigger ?? DEFAULT_PR_COMMENT_TRIGGER) {
    case PrCommentTrigger.All:
      return true;
    case PrCommentTrigger.Mention:
      return mentionsShep(body);
    default:
      return false;
  }
}

/** The text shep posts: the agent's reply, the commit when code changed, and the marker. */
export function formatReply(reply: string, commitSha?: string): string {
  const commit = commitSha ? `Changed in ${commitSha.slice(0, SHORT_SHA_LENGTH)}.\n\n` : '';
  return `${reply.trim()}\n\n${commit}${SHEP_REPLY_MARKER}`;
}

/** A quote of the comment a reply answers, for replies posted on the conversation. */
export function quoteForReply(author: string, body: string): string {
  const lines = body.trim().split(/\r?\n/);
  const quoted = lines.slice(0, QUOTED_LINES);
  if (lines.length > QUOTED_LINES) quoted.push('…');
  return `${quoted.map((line, index) => (index === 0 ? `> @${author}: ${line}` : `> ${line}`)).join('\n')}\n\n`;
}

/** A running round abandoned by the process that ran it. */
export function isRoundStale(
  round: { status: PrCommentRoundStatus; updatedAt: Date | string },
  now: Date
): boolean {
  return (
    round.status === PrCommentRoundStatus.Running &&
    now.getTime() - new Date(round.updatedAt).getTime() > PR_COMMENT_ROUND_STALE_AFTER_MS
  );
}
