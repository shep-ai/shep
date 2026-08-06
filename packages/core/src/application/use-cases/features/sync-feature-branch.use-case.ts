/**
 * Sync Feature Branch Use Case
 *
 * Brings a feature branch in sync with its base branch without ever putting
 * work at risk:
 *
 *   commit work in progress → fetch the base branch from the remote →
 *   rebase the feature branch onto it → delegate conflicts to the agent
 *
 * Uncommitted work is COMMITTED, not stashed. `git stash push` ignores
 * untracked files, so a worktree holding only new files was left dirty and
 * the rebase aborted with "working directory has uncommitted changes"; and a
 * stash that fails to pop leaves work stranded outside the branch. A commit
 * always lands on the branch and is undone with `git reset --soft HEAD~1`.
 *
 * Shared by the manual "Rebase on Main" action and by starting a pending
 * feature, so both surfaces get identical semantics.
 */

import { injectable, inject } from 'tsyringe';
import type { IGitPrService } from '../../ports/output/services/git-pr-service.interface.js';
import {
  GitPrError,
  GitPrErrorCode,
} from '../../ports/output/services/git-pr-service.interface.js';
import type { IWorktreeService } from '../../ports/output/services/worktree-service.interface.js';
import type { IConflictResolutionService } from '../../ports/output/services/conflict-resolution.interface.js';

/** Conventional-commit subject used for Shep's automatic checkpoint commits. */
export const AUTO_COMMIT_SUBJECT = 'chore: auto-commit work in progress before sync';

/**
 * Build the message for the automatic checkpoint commit.
 *
 * The branch names live in the body so the subject stays within the
 * conventional-commit length limit regardless of how long a branch name is.
 */
export function buildAutoCommitMessage(branch: string, baseBranch: string): string {
  return (
    `${AUTO_COMMIT_SUBJECT}\n\n` +
    `Shep committed the working tree of '${branch}' before rebasing it onto ` +
    `'${baseBranch}' so that no work is lost.\n` +
    `Undo with \`git reset --soft HEAD~1\`.`
  );
}

export interface SyncFeatureBranchInput {
  /** Absolute path to the repository root. */
  repositoryPath: string;
  /** Feature branch to bring in sync with the base branch. */
  branch: string;
}

export interface SyncFeatureBranchResult {
  /** Directory the git operations ran in — worktree path or repository root. */
  cwd: string;
  /** Base branch the feature branch was rebased onto. */
  baseBranch: string;
  /** Whether work in progress was committed before the rebase. */
  committed: boolean;
  /** SHA of the automatic checkpoint commit, when one was created. */
  commitSha?: string;
  /** Whether the rebase conflicted and was resolved by the agent. */
  conflictsResolved: boolean;
}

@injectable()
export class SyncFeatureBranchUseCase {
  constructor(
    @inject('IGitPrService')
    private readonly gitPrService: IGitPrService,
    @inject('IWorktreeService')
    private readonly worktreeService: IWorktreeService,
    @inject('IConflictResolutionService')
    private readonly conflictResolutionService: IConflictResolutionService
  ) {}

  async execute(input: SyncFeatureBranchInput): Promise<SyncFeatureBranchResult> {
    const cwd = await this.resolveCwd(input.repositoryPath, input.branch);
    const baseBranch = await this.gitPrService.getDefaultBranch(input.repositoryPath);

    // 1. Checkpoint any work in progress so the rebase cannot lose it and
    //    cannot be refused for a dirty working directory. Hooks are skipped:
    //    a repo's pre-commit linter or commitlint must not block Shep's own
    //    housekeeping commit.
    let committed = false;
    let commitSha: string | undefined;
    if (await this.gitPrService.hasUncommittedChanges(cwd)) {
      commitSha = await this.gitPrService.commitAll(
        cwd,
        buildAutoCommitMessage(input.branch, baseBranch),
        { noVerify: true }
      );
      committed = true;
    }

    // 2. Refresh the base branch from the remote so the rebase target is the
    //    latest upstream state, not a stale local ref.
    await this.gitPrService.syncMain(cwd, baseBranch);

    // 3. Rebase, delegating any conflicts to agent-powered resolution.
    let conflictsResolved = false;
    try {
      await this.gitPrService.rebaseOnMain(cwd, input.branch, baseBranch);
    } catch (error) {
      if (error instanceof GitPrError && error.code === GitPrErrorCode.REBASE_CONFLICT) {
        await this.conflictResolutionService.resolve(cwd, input.branch, baseBranch);
        conflictsResolved = true;
      } else {
        throw error;
      }
    }

    return {
      cwd,
      baseBranch,
      committed,
      ...(commitSha ? { commitSha } : {}),
      conflictsResolved,
    };
  }

  /**
   * Resolve the correct working directory for the branch.
   * Uses the worktree path if a worktree exists, otherwise the repository root.
   */
  private async resolveCwd(repositoryPath: string, branch: string): Promise<string> {
    const hasWorktree = await this.worktreeService.exists(repositoryPath, branch);
    if (hasWorktree) {
      return this.worktreeService.getWorktreePath(repositoryPath, branch);
    }
    return repositoryPath;
  }
}
