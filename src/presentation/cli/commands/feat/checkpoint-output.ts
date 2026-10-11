/**
 * Terminal rendering shared by `shep feat checkpoints | diff | restore` (spec 135).
 */

import type { FileDiff } from '@/application/ports/output/services/git-pr-service.interface.js';
import {
  CheckpointRestoreRefusedError,
  GitCheckpointNotFoundError,
  InvalidCheckpointNameError,
} from '@/domain/errors/git-checkpoint-errors.js';
import { colors, messages } from '../../ui/index.js';

/** Characters of a commit id shown in lists, like `git log --oneline`. */
export const SHORT_SHA_LENGTH = 7;

/** Errors whose message is the whole story — no stack for these. */
const EXPECTED_ERRORS = [
  GitCheckpointNotFoundError,
  CheckpointRestoreRefusedError,
  InvalidCheckpointNameError,
];

export function shortSha(sha: string): string {
  return sha.slice(0, SHORT_SHA_LENGTH);
}

/** `+12 −3` coloured, for a change summary. */
export function formatChangeCounts(additions: number, deletions: number): string {
  return `${colors.success(`+${additions}`)} ${colors.error(`-${deletions}`)}`;
}

export function reportCheckpointError(title: string, error: unknown): void {
  const err = error instanceof Error ? error : new Error(String(error));
  if (EXPECTED_ERRORS.some((type) => err instanceof type)) {
    messages.error(err.message);
  } else {
    messages.error(title, err);
  }
  process.exitCode = 1;
}

const STATUS_MARK: Record<FileDiff['status'], string> = {
  added: colors.success('A'),
  modified: colors.warning('M'),
  deleted: colors.error('D'),
  renamed: colors.info('R'),
};

function fileHeading(file: FileDiff): string {
  const path = file.oldPath ? `${file.oldPath} → ${file.path}` : file.path;
  return `  ${STATUS_MARK[file.status]} ${path}  ${formatChangeCounts(file.additions, file.deletions)}`;
}

/** One line per file. */
export function renderDiffStat(files: readonly FileDiff[]): void {
  for (const file of files) console.log(fileHeading(file));
}

/** Files with their hunks, unified-diff style. */
export function renderDiff(files: readonly FileDiff[]): void {
  for (const file of files) {
    console.log('');
    console.log(fileHeading(file));
    for (const hunk of file.hunks) {
      console.log(colors.info(`    ${hunk.header}`));
      for (const line of hunk.lines) {
        if (line.type === 'added') console.log(colors.success(`    +${line.content}`));
        else if (line.type === 'removed') console.log(colors.error(`    -${line.content}`));
        else console.log(colors.muted(`     ${line.content}`));
      }
    }
  }
}
