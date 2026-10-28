/**
 * GitCommitHistoryService
 *
 * Infrastructure adapter for IGitCommitHistoryService, over the injected
 * ExecFunction like the other git services.
 */

import { inject, injectable } from 'tsyringe';
import type { IGitCommitHistoryService } from '../../../application/ports/output/services/git-commit-history.service.interface.js';
import { assertSafeGitRef } from '../../../domain/shared/git-ref-argument.js';
import type { ExecFunction } from './worktree.service.js';

const REMOTE_PREFIX = 'origin/';
const MS_PER_SECOND = 1000;

@injectable()
export class GitCommitHistoryService implements IGitCommitHistoryService {
  constructor(@inject('ExecFunction') private readonly execFile: ExecFunction) {}

  async getCommitDate(cwd: string, ref: string): Promise<Date | null> {
    assertSafeGitRef(ref, 'ref');
    for (const candidate of [ref, `${REMOTE_PREFIX}${ref}`]) {
      const date = await this.committerDate(cwd, candidate);
      if (date) return date;
    }
    return null;
  }

  private async committerDate(cwd: string, ref: string): Promise<Date | null> {
    try {
      const { stdout } = await this.execFile('git', ['log', '-1', '--format=%ct', ref, '--'], {
        cwd,
      });
      const seconds = Number.parseInt(stdout.trim(), 10);
      return Number.isFinite(seconds) ? new Date(seconds * MS_PER_SECOND) : null;
    } catch {
      return null;
    }
  }
}
