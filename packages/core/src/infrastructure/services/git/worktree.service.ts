/**
 * Git Worktree Service Implementation
 *
 * Manages git worktrees using native execFile for process execution.
 * Uses constructor dependency injection for the command executor
 * to enable testability without mocking node:child_process directly.
 *
 * Provisioning is customisable: when the user configures
 * `settings.worktree.createCommand`, that command replaces `git worktree add`
 * entirely, and `settings.worktree.postCreateCommand` always runs afterwards.
 * Both are delegated to IWorktreeHookRunner.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { injectable, inject } from 'tsyringe';

const GIT_AUTO_INIT_USER = 'shep-ai[bot]';
const GIT_AUTO_INIT_EMAIL = 'bot@shep.bot';
import type {
  IWorktreeService,
  WorktreeInfo,
} from '../../../application/ports/output/services/worktree-service.interface.js';
import {
  WorktreeError,
  WorktreeErrorCode,
} from '../../../application/ports/output/services/worktree-service.interface.js';
import type {
  IWorktreeHookRunner,
  WorktreeHookContext,
} from '../../../application/ports/output/services/worktree-hook-runner.interface.js';
import { getShepHomeDir } from '../filesystem/shep-directory.service.js';
import {
  arePathsEquivalent,
  parseGitError,
  parseWorktreeOutput,
} from './worktree-output.parser.js';

/**
 * Type for the command executor dependency.
 * Matches the promisified signature of child_process.execFile.
 */
export type ExecFunction = (
  file: string,
  args: string[],
  options?: object
) => Promise<{ stdout: string; stderr: string }>;

@injectable()
export class WorktreeService implements IWorktreeService {
  constructor(
    @inject('ExecFunction') private readonly execFile: ExecFunction,
    @inject('IWorktreeHookRunner') private readonly hookRunner: IWorktreeHookRunner
  ) {}

  async create(
    repoPath: string,
    branch: string,
    worktreePath: string,
    startPoint?: string
  ): Promise<WorktreeInfo> {
    const context: WorktreeHookContext = {
      repoPath,
      worktreePath,
      branch,
      ...(startPoint !== undefined && { startPoint }),
    };

    if (this.hookRunner.hasCreateHook()) {
      await this.hookRunner.runCreateHook(context);
    } else {
      try {
        const args = ['worktree', 'add', worktreePath, '-b', branch];
        if (startPoint) args.push(startPoint);
        await this.execFile('git', args, { cwd: repoPath });
      } catch (error) {
        throw parseGitError(error);
      }
    }

    const created = await this.resolveCreated(repoPath, branch, worktreePath);
    await this.hookRunner.runPostCreateHook(context);
    return created;
  }

  async addExisting(repoPath: string, branch: string, worktreePath: string): Promise<WorktreeInfo> {
    // No start point: the branch already exists and is only checked out here.
    const context: WorktreeHookContext = { repoPath, worktreePath, branch };

    if (this.hookRunner.hasCreateHook()) {
      await this.hookRunner.runCreateHook(context);
    } else {
      try {
        await this.execFile('git', ['worktree', 'add', worktreePath, branch], { cwd: repoPath });
      } catch (error) {
        throw parseGitError(error);
      }
    }

    const created = await this.resolveCreated(repoPath, branch, worktreePath);
    await this.hookRunner.runPostCreateHook(context);
    return created;
  }

  async remove(repoPath: string, worktreePath: string, force?: boolean): Promise<void> {
    try {
      const args = ['worktree', 'remove'];
      if (force) args.push('--force');
      args.push(worktreePath);
      await this.execFile('git', args, { cwd: repoPath });
    } catch (error) {
      throw parseGitError(error);
    }
  }

  async prune(repoPath: string): Promise<void> {
    try {
      await this.execFile('git', ['worktree', 'prune'], { cwd: repoPath });
    } catch (error) {
      throw parseGitError(error);
    }
  }

  async list(repoPath: string): Promise<WorktreeInfo[]> {
    const { stdout } = await this.execFile('git', ['worktree', 'list', '--porcelain'], {
      cwd: repoPath,
    });
    return parseWorktreeOutput(stdout);
  }

  async exists(repoPath: string, branch: string): Promise<boolean> {
    const worktrees = await this.list(repoPath);
    return worktrees.some((w) => w.branch === branch);
  }

  async branchExists(repoPath: string, branch: string): Promise<boolean> {
    try {
      const { stdout } = await this.execFile('git', ['branch', '--list', branch], {
        cwd: repoPath,
      });
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  async remoteBranchExists(repoPath: string, branch: string): Promise<boolean> {
    try {
      const { stdout } = await this.execFile('git', ['ls-remote', '--heads', 'origin', branch], {
        cwd: repoPath,
      });
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  async listBranches(repoPath: string): Promise<string[]> {
    try {
      const { stdout } = await this.execFile('git', ['branch', '-a', '--format=%(refname:short)'], {
        cwd: repoPath,
      });
      const seen = new Set<string>();
      const branches: string[] = [];
      for (const line of stdout.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'origin/HEAD' || trimmed.startsWith('origin/HEAD ->')) continue;
        // Strip "origin/" prefix for remote branches
        const name = trimmed.startsWith('origin/') ? trimmed.slice('origin/'.length) : trimmed;
        if (!seen.has(name)) {
          seen.add(name);
          branches.push(name);
        }
      }
      return branches.sort();
    } catch {
      return [];
    }
  }

  async ensureGitRepository(repoPath: string): Promise<void> {
    let isExistingRepo = false;
    try {
      await this.execFile('git', ['rev-parse', '--is-inside-work-tree'], { cwd: repoPath });
      isExistingRepo = true;
    } catch {
      // Not a git repo — will initialize below
    }

    if (isExistingRepo) {
      // Repo exists but may have an unborn branch (no commits).
      // git worktree add requires at least one commit as a start-point.
      try {
        await this.execFile('git', ['rev-parse', 'HEAD'], { cwd: repoPath });
        return; // Has commits — nothing to do
      } catch {
        // Unborn branch (no commits) — create initial commit below
      }
    }

    try {
      if (!isExistingRepo) {
        mkdirSync(repoPath, { recursive: true });
        await this.execFile('git', ['init', '-b', 'main'], { cwd: repoPath });
      }
      await this.execFile('git', ['config', 'user.name', GIT_AUTO_INIT_USER], { cwd: repoPath });
      await this.execFile('git', ['config', 'user.email', GIT_AUTO_INIT_EMAIL], { cwd: repoPath });
      // Stage any existing files so they appear in the worktree after creation.
      // --allow-empty ensures the commit succeeds even if the directory is empty.
      await this.execFile('git', ['add', '.'], { cwd: repoPath });
      await this.execFile(
        'git',
        ['commit', '--allow-empty', '--no-gpg-sign', '-m', 'Initial commit'],
        { cwd: repoPath }
      );
    } catch (error) {
      throw parseGitError(error);
    }
  }

  getWorktreePath(repoPath: string, branch: string): string {
    // Normalize separators before hashing so C:\foo and C:/foo produce the same hash
    const normalizedRepoPath = repoPath.replace(/\\/g, '/');
    const repoHash = createHash('sha256').update(normalizedRepoPath).digest('hex').slice(0, 16);
    const slug = branch.replace(/\//g, '-');
    return path.join(getShepHomeDir(), 'repos', repoHash, 'wt', slug).replace(/\\/g, '/');
  }

  /**
   * Resolve the WorktreeInfo for a freshly provisioned tree — match by branch
   * (reliable) then path.
   *
   * A custom create command may lay down something git does not register as a
   * worktree of `repoPath` (a shared clone, a bind mount). Rather than failing
   * a tree the user deliberately provisioned, fall back to inspecting the
   * directory itself; only a missing directory is an error.
   */
  private async resolveCreated(
    repoPath: string,
    branch: string,
    worktreePath: string
  ): Promise<WorktreeInfo> {
    const worktrees = await this.list(repoPath);
    const registered =
      worktrees.find((w) => w.branch === branch) ??
      worktrees.find((w) => arePathsEquivalent(w.path, worktreePath));
    if (registered) return registered;

    if (!existsSync(worktreePath)) {
      throw new WorktreeError(
        `Worktree created but not found in list: ${worktreePath}`,
        WorktreeErrorCode.GIT_ERROR
      );
    }

    let head = '';
    try {
      const { stdout } = await this.execFile('git', ['rev-parse', 'HEAD'], { cwd: worktreePath });
      head = stdout.trim();
    } catch {
      // Unborn branch or non-git directory — HEAD stays empty.
    }
    return { path: worktreePath, head, branch, isMain: false };
  }
}
