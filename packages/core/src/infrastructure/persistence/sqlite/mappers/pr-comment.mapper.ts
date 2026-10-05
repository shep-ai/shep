/** Row ⇄ entity conversion for PR comments and rounds (spec 124). */

import type {
  AgentType,
  PrComment,
  PrCommentKind,
  PrCommentRound,
  PrCommentRoundStatus,
  PrCommentStatus,
} from '../../../../domain/generated/output.js';
import { defined, millis, optionalDate, optionalMillis } from './row-values.js';

export interface PrCommentRow {
  id: string;
  feature_id: string;
  github_id: string;
  kind: string;
  author: string;
  body: string;
  path: string | null;
  line: number | null;
  diff_hunk: string | null;
  thread_id: string | null;
  url: string;
  written_at: number;
  status: string;
  reply: string | null;
  reply_url: string | null;
  round_id: string | null;
  error: string | null;
  created_at: number;
  updated_at: number;
}

export interface PrCommentRoundRow {
  id: string;
  feature_id: string;
  comment_ids: string;
  status: string;
  agent_type: string | null;
  commit_sha: string | null;
  summary: string | null;
  error: string | null;
  finished_at: number | null;
  created_at: number;
  updated_at: number;
}

export function prCommentToDatabase(comment: PrComment): PrCommentRow {
  return {
    id: comment.id,
    feature_id: comment.featureId,
    github_id: comment.githubId,
    kind: comment.kind,
    author: comment.author,
    body: comment.body,
    path: comment.path ?? null,
    line: comment.line ?? null,
    diff_hunk: comment.diffHunk ?? null,
    thread_id: comment.threadId ?? null,
    url: comment.url,
    written_at: millis(comment.writtenAt),
    status: comment.status,
    reply: comment.reply ?? null,
    reply_url: comment.replyUrl ?? null,
    round_id: comment.roundId ?? null,
    error: comment.error ?? null,
    created_at: millis(comment.createdAt),
    updated_at: millis(comment.updatedAt),
  };
}

export function prCommentFromDatabase(row: PrCommentRow): PrComment {
  return {
    id: row.id,
    featureId: row.feature_id,
    githubId: row.github_id,
    kind: row.kind as PrCommentKind,
    author: row.author,
    body: row.body,
    ...defined({
      path: row.path,
      line: row.line,
      diffHunk: row.diff_hunk,
      threadId: row.thread_id,
    }),
    url: row.url,
    writtenAt: new Date(row.written_at),
    status: row.status as PrCommentStatus,
    ...defined({
      reply: row.reply,
      replyUrl: row.reply_url,
      roundId: row.round_id,
      error: row.error,
    }),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function prCommentRoundToDatabase(round: PrCommentRound): PrCommentRoundRow {
  return {
    id: round.id,
    feature_id: round.featureId,
    comment_ids: JSON.stringify(round.commentIds),
    status: round.status,
    agent_type: round.agentType ?? null,
    commit_sha: round.commitSha ?? null,
    summary: round.summary ?? null,
    error: round.error ?? null,
    finished_at: optionalMillis(round.finishedAt),
    created_at: millis(round.createdAt),
    updated_at: millis(round.updatedAt),
  };
}

export function prCommentRoundFromDatabase(row: PrCommentRoundRow): PrCommentRound {
  return {
    id: row.id,
    featureId: row.feature_id,
    commentIds: JSON.parse(row.comment_ids) as string[],
    status: row.status as PrCommentRoundStatus,
    ...defined({
      agentType: row.agent_type as AgentType | null,
      commitSha: row.commit_sha,
      summary: row.summary,
      error: row.error,
      finishedAt: optionalDate(row.finished_at),
    }),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
