/**
 * Git checkpoint naming and selection (spec 138).
 *
 * A checkpoint lives at `refs/shep/checkpoints/<featureId>/<seq>-<node>`.
 * Every component is validated here, before it can reach a git argument: the
 * feature id and node name are restricted to characters that cannot form an
 * option (`-` first), a path step (`/`, `..`) or anything `check-ref-format`
 * rejects.
 *
 * Note the import convention for `domain/`: relative imports carry no file
 * extension — the web package consumes this directory as raw TypeScript.
 */

import type { GitCheckpoint } from '../generated/output';
import {
  GitCheckpointNotFoundError,
  InvalidCheckpointNameError,
} from '../errors/git-checkpoint-errors';

/** Root of every checkpoint ref. Hidden: not under refs/heads or refs/tags. */
export const CHECKPOINT_REF_ROOT = 'refs/shep/checkpoints';

/** Node name of the snapshot taken before the first recorded step. */
export const BASELINE_CHECKPOINT_NODE = 'baseline';

/** Node name of the snapshot taken just before a restore. */
export const PRE_RESTORE_CHECKPOINT_NODE = 'pre-restore';

/** Width the sequence is zero-padded to, so refs sort in step order. */
const SEQUENCE_WIDTH = 4;

/** Graph node names: lowercase, digits, `_` and `-`, never starting with `-`. */
const NODE_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

/** Feature ids are UUIDs; accept the character set, never `-` first. */
const FEATURE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]*$/;

/** `<seq>-<node>` with or without padding. */
const LABEL_PATTERN = /^(\d+)-(.+)$/;

const DIGITS_PATTERN = /^\d+$/;

function assertFeatureId(featureId: string): void {
  if (!FEATURE_ID_PATTERN.test(featureId)) {
    throw new InvalidCheckpointNameError('feature id', featureId);
  }
}

/** Throw unless `node` is safe to embed in a ref name. */
export function assertCheckpointNodeName(node: string): void {
  if (!NODE_NAME_PATTERN.test(node)) throw new InvalidCheckpointNameError('node name', node);
}

/** `refs/shep/checkpoints/<featureId>/` — the trailing slash keeps features apart. */
export function featureCheckpointRefPrefix(featureId: string): string {
  assertFeatureId(featureId);
  return `${CHECKPOINT_REF_ROOT}/${featureId}/`;
}

/** `0003-implement` */
function formatLabel(sequence: number, node: string): string {
  return `${String(sequence).padStart(SEQUENCE_WIDTH, '0')}-${node}`;
}

/** Full ref for one checkpoint. Validates every component. */
export function buildCheckpointRef(featureId: string, sequence: number, node: string): string {
  if (!Number.isInteger(sequence) || sequence < 0) {
    throw new InvalidCheckpointNameError('sequence', String(sequence));
  }
  assertCheckpointNodeName(node);
  return `${featureCheckpointRefPrefix(featureId)}${formatLabel(sequence, node)}`;
}

/** The human-facing name of a checkpoint: the last component of its ref. */
export function checkpointLabel(checkpoint: Pick<GitCheckpoint, 'sequence' | 'node'>): string {
  return formatLabel(checkpoint.sequence, checkpoint.node);
}

/**
 * Find the checkpoint a user meant.
 *
 * - `3` — the checkpoint with that sequence;
 * - `0003-implement` / `3-implement` — sequence and node must both match;
 * - `implement` — the latest checkpoint of that node (a node can run more than
 *   once: rework after a rejection, repeated repairs).
 */
export function resolveCheckpointSelector(
  checkpoints: readonly GitCheckpoint[],
  selector: string
): GitCheckpoint {
  const wanted = selector.trim();
  let match: GitCheckpoint | undefined;
  if (DIGITS_PATTERN.test(wanted)) {
    const sequence = Number(wanted);
    match = checkpoints.find((c) => c.sequence === sequence);
  } else {
    const label = LABEL_PATTERN.exec(wanted);
    if (label) {
      const sequence = Number(label[1]);
      match = checkpoints.find((c) => c.sequence === sequence && c.node === label[2]);
    } else if (wanted.length > 0) {
      match = checkpoints
        .filter((c) => c.node === wanted)
        .reduce<
          GitCheckpoint | undefined
        >((latest, c) => (latest && latest.sequence > c.sequence ? latest : c), undefined);
    }
  }
  if (!match) throw new GitCheckpointNotFoundError(selector);
  return match;
}

/** The checkpoint taken immediately before `checkpoint`, if any. */
export function previousCheckpoint(
  checkpoints: readonly GitCheckpoint[],
  checkpoint: Pick<GitCheckpoint, 'sequence'>
): GitCheckpoint | undefined {
  return checkpoints
    .filter((c) => c.sequence < checkpoint.sequence)
    .reduce<
      GitCheckpoint | undefined
    >((best, c) => (best && best.sequence > c.sequence ? best : c), undefined);
}

/** The most recent checkpoint, if any. */
export function latestCheckpoint(checkpoints: readonly GitCheckpoint[]): GitCheckpoint | undefined {
  return previousCheckpoint(checkpoints, { sequence: Number.POSITIVE_INFINITY });
}
