/**
 * Conflict Resolution Service
 *
 * Orchestrates agent-powered conflict resolution during git rebase.
 * Follows the CI watch/fix loop pattern: detect conflict → invoke agent →
 * validate resolution → stage files → continue rebase, with retry logic.
 */

import { injectable, inject } from 'tsyringe';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IAgentExecutorProvider } from '@/application/ports/output/agents/agent-executor-provider.interface.js';
import type { IConflictResolutionService } from '@/application/ports/output/services/conflict-resolution.interface.js';
import type { IGitPrService } from '@/application/ports/output/services/git-pr-service.interface.js';
import {
  GitPrError,
  GitPrErrorCode,
} from '@/application/ports/output/services/git-pr-service.interface.js';
import {
  buildConflictResolutionPrompt,
  buildStashPopResolutionPrompt,
  type ConflictedFile,
} from './conflict-resolution.prompt.js';

const MAX_RETRIES_PER_COMMIT = 3;

/** Conflict markers that indicate unresolved conflicts */
const CONFLICT_MARKERS = ['<<<<<<<', '=======', '>>>>>>>'];

@injectable()
export class ConflictResolutionService implements IConflictResolutionService {
  constructor(
    @inject('IAgentExecutorProvider')
    private readonly agentProvider: IAgentExecutorProvider,
    @inject('IGitPrService')
    private readonly gitPrService: IGitPrService
  ) {}

  /**
   * Resolve all conflicts during a rebase operation.
   *
   * Handles multi-commit rebases where each commit may introduce conflicts.
   * For each conflicted commit: reads conflicted files, invokes agent to
   * resolve, validates no remaining markers, stages resolved files, and
   * continues the rebase. Retries up to MAX_RETRIES_PER_COMMIT times.
   *
   * If retries are exhausted, aborts the rebase and throws REBASE_CONFLICT.
   *
   * @param cwd - Working directory (repo root or worktree path)
   * @param featureBranch - Feature branch being rebased
   * @param baseBranch - Base branch being rebased onto
   */
  async resolve(cwd: string, featureBranch: string, baseBranch: string): Promise<void> {
    const executor = await this.agentProvider.getExecutor();

    // Outer loop: handle multi-commit rebases where rebaseContinue
    // may reveal conflicts on the next commit
    while (true) {
      const conflictedFiles = await this.gitPrService.getConflictedFiles(cwd);
      if (conflictedFiles.length === 0) {
        return; // No conflicts — rebase is complete
      }

      // Inner loop: retry agent resolution for the current commit's conflicts
      let resolved = false;
      for (let attempt = 1; attempt <= MAX_RETRIES_PER_COMMIT; attempt++) {
        const fileContents = this.readConflictedFileContents(cwd, conflictedFiles);

        const previousFeedback =
          attempt > 1 ? this.buildFeedbackFromRemainingMarkers(cwd, conflictedFiles) : undefined;

        const prompt = buildConflictResolutionPrompt({
          conflictedFiles: fileContents,
          featureBranch,
          baseBranch,
          attemptNumber: attempt,
          maxAttempts: MAX_RETRIES_PER_COMMIT,
          previousFeedback,
        });

        await executor.execute(prompt, { cwd });

        // Validate: check no conflict markers remain
        if (this.validateResolution(cwd, conflictedFiles)) {
          resolved = true;
          break;
        }
      }

      if (!resolved) {
        // Exhausted retries — abort and report
        await this.gitPrService.rebaseAbort(cwd);
        const remaining = conflictedFiles.join(', ');
        throw new GitPrError(
          `Failed to resolve conflicts after ${MAX_RETRIES_PER_COMMIT} attempts. ` +
            `Unresolved files: ${remaining}. The rebase has been aborted.`,
          GitPrErrorCode.REBASE_CONFLICT
        );
      }

      // Resolution succeeded — stage files and continue rebase
      await this.gitPrService.stageFiles(cwd, conflictedFiles);

      try {
        await this.gitPrService.rebaseContinue(cwd);
        // rebaseContinue succeeded — loop back to check if subsequent
        // commits have conflicts (getConflictedFiles at top of while loop)
        continue;
      } catch (error) {
        if (error instanceof GitPrError && error.code === GitPrErrorCode.REBASE_CONFLICT) {
          // Next commit has conflicts — loop back to resolve them
          continue;
        }
        throw error; // Unexpected error
      }
    }
  }

  /**
   * Resolve conflicts from a failed stash pop.
   *
   * After a rebase, stash pop may fail if the rebased code conflicts with
   * stashed uncommitted changes. This method invokes the agent to resolve
   * those conflicts, validates, and stages the resolved files.
   *
   * Unlike resolve(), this does NOT call rebaseContinue — the rebase is
   * already complete. On success, the caller is responsible for dropping
   * the stash entry.
   *
   * @param cwd - Working directory (repo root or worktree path)
   * @param featureBranch - Feature branch name
   * @param baseBranch - Base branch name
   */
  async resolveStashPop(cwd: string, featureBranch: string, baseBranch: string): Promise<void> {
    const conflictedFiles = await this.gitPrService.getConflictedFiles(cwd);
    if (conflictedFiles.length === 0) {
      return;
    }

    const executor = await this.agentProvider.getExecutor();

    for (let attempt = 1; attempt <= MAX_RETRIES_PER_COMMIT; attempt++) {
      const fileContents = this.readConflictedFileContents(cwd, conflictedFiles);

      const previousFeedback =
        attempt > 1 ? this.buildFeedbackFromRemainingMarkers(cwd, conflictedFiles) : undefined;

      const prompt = buildStashPopResolutionPrompt({
        conflictedFiles: fileContents,
        featureBranch,
        baseBranch,
        attemptNumber: attempt,
        maxAttempts: MAX_RETRIES_PER_COMMIT,
        previousFeedback,
      });

      await executor.execute(prompt, { cwd });

      if (this.validateResolution(cwd, conflictedFiles)) {
        await this.gitPrService.stageFiles(cwd, conflictedFiles);
        return;
      }
    }

    const remaining = conflictedFiles.join(', ');
    throw new Error(
      `Failed to resolve stash pop conflicts after ${MAX_RETRIES_PER_COMMIT} attempts. ` +
        `Unresolved files: ${remaining}. Your stash entry is preserved — ` +
        `run \`git stash pop\` manually to resolve.`
    );
  }

  /**
   * Read the contents of conflicted files from the working directory.
   */
  private readConflictedFileContents(cwd: string, filePaths: string[]): ConflictedFile[] {
    return filePaths.map((filePath) => {
      try {
        const content = readFileSync(join(cwd, filePath), 'utf-8');
        return { path: filePath, content };
      } catch {
        return { path: filePath, content: '(unable to read file)' };
      }
    });
  }

  /**
   * Validate that no conflict markers remain in the previously-conflicted files.
   */
  private validateResolution(cwd: string, filePaths: string[]): boolean {
    for (const filePath of filePaths) {
      try {
        const content = readFileSync(join(cwd, filePath), 'utf-8');
        for (const marker of CONFLICT_MARKERS) {
          if (content.includes(marker)) {
            return false;
          }
        }
      } catch {
        return false;
      }
    }
    return true;
  }

  /**
   * Build feedback about remaining conflict markers for retry attempts.
   */
  private buildFeedbackFromRemainingMarkers(cwd: string, filePaths: string[]): string {
    const remaining: string[] = [];
    for (const filePath of filePaths) {
      try {
        const content = readFileSync(join(cwd, filePath), 'utf-8');
        const lines = content.split('\n');
        const markerLines: number[] = [];
        lines.forEach((line, index) => {
          if (CONFLICT_MARKERS.some((marker) => line.includes(marker))) {
            markerLines.push(index + 1);
          }
        });
        if (markerLines.length > 0) {
          remaining.push(
            `- \`${filePath}\`: conflict markers remain on lines ${markerLines.join(', ')}`
          );
        }
      } catch {
        remaining.push(`- \`${filePath}\`: unable to read file`);
      }
    }
    return remaining.length > 0
      ? remaining.join('\n')
      : 'No specific markers found, but validation failed.';
  }
}
