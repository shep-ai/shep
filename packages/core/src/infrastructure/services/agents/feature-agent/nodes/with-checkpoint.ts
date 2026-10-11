/**
 * Checkpoint wrapper for graph nodes (spec 138).
 *
 * Wraps a node that can change the feature's worktree so the worktree is
 * snapshotted into a hidden git ref around it: a baseline before the first
 * wrapped node, and a checkpoint after every one — in `finally`, so a node
 * that fails or stops at an approval gate (LangGraph's interrupt throws)
 * still leaves its partial work behind.
 *
 * A checkpoint is never worth a failed run: recorder errors are swallowed here
 * as a last line of defence (the worker's recorder already logs them).
 */

import type { FeatureAgentState } from '../state.js';

/** Receives node events; supplied by the worker, absent in most tests. */
export interface CheckpointRecorder {
  /** Before a wrapped node runs — ensures the feature has a baseline. */
  beforeNode(state: FeatureAgentState): Promise<void>;
  /** After a wrapped node finished, failed or interrupted. */
  afterNode(node: string, state: FeatureAgentState): Promise<void>;
}

export type FeatureAgentNode = (state: FeatureAgentState) => Promise<Partial<FeatureAgentState>>;

async function quietly(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch {
    // Best-effort by design; see the module comment.
  }
}

export function withCheckpoint(
  node: string,
  fn: FeatureAgentNode,
  recorder?: CheckpointRecorder
): FeatureAgentNode {
  if (!recorder) return fn;
  return async (state) => {
    await quietly(() => recorder.beforeNode(state));
    try {
      return await fn(state);
    } finally {
      await quietly(() => recorder.afterNode(node, state));
    }
  };
}
