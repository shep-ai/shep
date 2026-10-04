/** Sample review comments and rounds for stories and tests of the Review comments section. */

import {
  AgentType,
  PrCommentKind,
  PrCommentRoundStatus,
  PrCommentStatus,
  type PrComment,
  type PrCommentRound,
} from '@shepai/core/domain/generated/output';

const T = new Date('2026-10-05T10:00:00Z');

export const INLINE_COMMENT: PrComment = {
  id: 'c1',
  featureId: 'feature-1',
  githubId: '301',
  kind: PrCommentKind.Inline,
  author: 'ada',
  body: '#shep rename `total` to `totalCents` — it holds cents, not dollars.',
  path: 'src/refunds/refund-order.ts',
  line: 42,
  url: 'https://github.com/acme/pay/pull/7#discussion_r301',
  writtenAt: T,
  status: PrCommentStatus.Pending,
  createdAt: T,
  updatedAt: T,
};

export const QUESTION_COMMENT: PrComment = {
  id: 'c2',
  featureId: 'feature-1',
  githubId: '401',
  kind: PrCommentKind.Conversation,
  author: 'bob',
  body: 'Why does this need a new table instead of a column on orders?',
  url: 'https://github.com/acme/pay/pull/7#issuecomment-401',
  writtenAt: T,
  status: PrCommentStatus.Pending,
  createdAt: T,
  updatedAt: T,
};

export const PENDING_STATE = { comments: [INLINE_COMMENT, QUESTION_COMMENT], rounds: [] };

export const RUNNING_ROUND: PrCommentRound = {
  id: 'r1',
  featureId: 'feature-1',
  commentIds: ['c1', 'c2'],
  status: PrCommentRoundStatus.Running,
  agentType: AgentType.ClaudeCode,
  createdAt: T,
  updatedAt: T,
};

export const RUNNING_STATE = {
  comments: [
    { ...INLINE_COMMENT, status: PrCommentStatus.Addressing, roundId: 'r1' },
    { ...QUESTION_COMMENT, status: PrCommentStatus.Addressing, roundId: 'r1' },
  ],
  rounds: [RUNNING_ROUND],
};

export const ADDRESSED_STATE = {
  comments: [
    {
      ...INLINE_COMMENT,
      status: PrCommentStatus.Addressed,
      roundId: 'r1',
      reply: 'Renamed to totalCents across refund-order.ts and its tests.',
      replyUrl: 'https://github.com/acme/pay/pull/7#discussion_r310',
    },
    {
      ...QUESTION_COMMENT,
      status: PrCommentStatus.Addressed,
      roundId: 'r1',
      reply: 'Refunds outlive their orders after archival, so they need their own rows.',
    },
  ],
  rounds: [
    {
      ...RUNNING_ROUND,
      status: PrCommentRoundStatus.Completed,
      commitSha: 'c0ffee1234567',
      summary: 'Renamed the field and explained the table.',
      finishedAt: T,
    },
  ],
};

export const FAILED_STATE = {
  comments: [
    {
      ...INLINE_COMMENT,
      status: PrCommentStatus.Failed,
      error: 'Could not push c0ffee1: rejected (non-fast-forward)',
    },
  ],
  rounds: [
    {
      ...RUNNING_ROUND,
      commentIds: ['c1'],
      status: PrCommentRoundStatus.Failed,
      error: 'Could not push c0ffee1: rejected (non-fast-forward)',
      finishedAt: T,
    },
  ],
};
