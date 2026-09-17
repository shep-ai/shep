/**
 * GitCommitService
 *
 * Infrastructure adapter for IGitCommitService. Uses the injected
 * ExecFunction to run `git` commands — same strategy as GitRemoteService
 * and WorktreeService so the service can be unit tested against a
 * stubbed executor without spawning real processes.
 */

import { inject, injectable } from 'tsyringe';

import type {
  CommitAndPushResult,
  CommitChangesInput,
  CommitChangesResult,
  IGitCommitService,
} from '../../../application/ports/output/services/git-commit.service.interface.js';
import {
  GitCommitError,
  GitPushError,
} from '../../../application/ports/output/services/git-commit.service.interface.js';
import type { ExecFunction } from './worktree.service.js';

/**
 * Pathspec under which Shep injects agent skills into feature worktrees.
 * Injected skills are worktree-local tooling and must never be committed,
 * so staging always unstages newly-added files under this path.
 */
const INJECTED_SKILLS_PATHSPEC = '.claude/skills/';

@injectable()
export class GitCommitService implements IGitCommitService {
  constructor(@inject('ExecFunction') private readonly execFile: ExecFunction) {}

  async commitChanges(input: CommitChangesInput): Promise<CommitChangesResult> {
    const { cwd, message } = input;
    return this.stageAndCommit(cwd, message);
  }

  async commitAndPush(input: CommitChangesInput): Promise<CommitAndPushResult> {
    const { cwd, message } = input;
    const commitResult = await this.stageAndCommit(cwd, message);

    // Even if nothing was committed right now, there may be earlier
    // local commits ahead of origin — try to push either way.
    if (!(await this.hasOriginRemote(cwd))) {
      throw new GitPushError('No "origin" remote configured for this repository.');
    }

    try {
      await this.execFile('git', ['push', 'origin', 'HEAD'], { cwd });
    } catch (err) {
      const messageText = err instanceof Error ? err.message : String(err);
      throw new GitPushError(`git push failed: ${messageText}`);
    }

    return { committed: commitResult.committed, pushed: true };
  }

  private async stageAndCommit(cwd: string, message: string): Promise<CommitChangesResult> {
    try {
      await this.execFile('git', ['add', '-A'], { cwd });
    } catch (err) {
      const messageText = err instanceof Error ? err.message : String(err);
      throw new GitCommitError(`git add failed: ${messageText}`);
    }

    await this.unstageInjectedSkills(cwd);

    // If the working tree is clean, skip the commit entirely.
    const hasStaged = await this.hasStagedChanges(cwd);
    if (!hasStaged) {
      return { committed: false };
    }

    try {
      await this.execFile('git', ['commit', '-m', message], { cwd });
    } catch (err) {
      const messageText = err instanceof Error ? err.message : String(err);
      throw new GitCommitError(`git commit failed: ${messageText}`);
    }

    return { committed: true };
  }

  /**
   * Unstage newly-added files under `.claude/skills/` so injected skills
   * never enter a commit. Only files that are *newly added* relative to HEAD
   * are unstaged — edits to skills already tracked in the repo stay staged
   * and committable.
   *
   * Best-effort by design: if git cannot enumerate the added files, fall back
   * to unstaging the whole directory (mirroring the specs/ convention); if
   * that fails too, continue so the exclusion never breaks an ordinary commit.
   */
  private async unstageInjectedSkills(cwd: string): Promise<void> {
    try {
      const { stdout } = await this.execFile(
        'git',
        [
          'diff',
          '--cached',
          '--name-only',
          '--diff-filter=A',
          '-z',
          '--',
          INJECTED_SKILLS_PATHSPEC,
        ],
        { cwd }
      );
      const addedFiles = stdout.split('\0').filter((path) => path.length > 0);
      if (addedFiles.length === 0) return;
      await this.execFile('git', ['reset', '-q', '--', ...addedFiles], { cwd });
    } catch {
      try {
        await this.execFile('git', ['reset', '-q', '--', INJECTED_SKILLS_PATHSPEC], { cwd });
      } catch {
        // Exclusion is best-effort — never block an ordinary commit.
      }
    }
  }

  private async hasStagedChanges(cwd: string): Promise<boolean> {
    try {
      // `git diff --cached --quiet` exits 0 when there are NO staged
      // changes and exits 1 when there are. Use the `--name-only` flag
      // output length instead for cross-platform portability with our
      // ExecFunction signature (which throws on non-zero exit).
      const { stdout } = await this.execFile('git', ['diff', '--cached', '--name-only'], { cwd });
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  private async hasOriginRemote(cwd: string): Promise<boolean> {
    try {
      const { stdout } = await this.execFile('git', ['remote', 'get-url', 'origin'], { cwd });
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }
}
