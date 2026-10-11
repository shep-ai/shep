/**
 * GitCheckpoint ⇄ git_checkpoints row (spec 138).
 */

import { GitCheckpointKind, type GitCheckpoint } from '../../../../domain/generated/output.js';

const KINDS = new Set<string>(Object.values(GitCheckpointKind));

/** An unknown stored kind (a newer build's value) reads as an ordinary step. */
function parseKind(value: string): GitCheckpointKind {
  return KINDS.has(value) ? (value as GitCheckpointKind) : GitCheckpointKind.Step;
}

export interface GitCheckpointRow {
  id: string;
  feature_id: string;
  agent_run_id: string | null;
  sequence: number;
  kind: string;
  node: string;
  ref: string;
  commit_sha: string;
  tree_sha: string;
  head_sha: string | null;
  files_changed: number;
  additions: number;
  deletions: number;
  created_at: number;
  updated_at: number;
}

export function toDatabase(checkpoint: GitCheckpoint): GitCheckpointRow {
  return {
    id: checkpoint.id,
    feature_id: checkpoint.featureId,
    agent_run_id: checkpoint.agentRunId ?? null,
    sequence: checkpoint.sequence,
    kind: checkpoint.kind,
    node: checkpoint.node,
    ref: checkpoint.ref,
    commit_sha: checkpoint.commitSha,
    tree_sha: checkpoint.treeSha,
    head_sha: checkpoint.headSha ?? null,
    files_changed: checkpoint.filesChanged,
    additions: checkpoint.additions,
    deletions: checkpoint.deletions,
    created_at: new Date(checkpoint.createdAt).getTime(),
    updated_at: new Date(checkpoint.updatedAt).getTime(),
  };
}

export function fromDatabase(row: GitCheckpointRow): GitCheckpoint {
  return {
    id: row.id,
    featureId: row.feature_id,
    ...(row.agent_run_id !== null && { agentRunId: row.agent_run_id }),
    sequence: row.sequence,
    kind: parseKind(row.kind),
    node: row.node,
    ref: row.ref,
    commitSha: row.commit_sha,
    treeSha: row.tree_sha,
    ...(row.head_sha !== null && { headSha: row.head_sha }),
    filesChanged: row.files_changed,
    additions: row.additions,
    deletions: row.deletions,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
