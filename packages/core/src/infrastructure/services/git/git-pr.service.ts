/**
 * Git PR Service Implementation
 *
 * Manages git operations for PR creation, merging, and CI status checks.
 * Uses constructor dependency injection for the command executor.
 */

import { injectable, inject } from 'tsyringe';
import type { IGitPrService } from '../../../application/ports/output/services/git-pr-service.interface.js';
import type {
  CiStatusResult,
  DiffHunk,
  DiffLine,
  DiffSummary,
  FileDiff,
  MergeStrategy,
  PrCreateResult,
  PrStatusInfo,
} from '../../../application/ports/output/services/git-pr-service.interface.js';
import {
  GitPrError,
  GitPrErrorCode,
} from '../../../application/ports/output/services/git-pr-service.interface.js';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { PrStatus } from '../../../domain/generated/output.js';
import type { ExecFunction } from './worktree.service.js';
import { applyPrBranding } from './pr-branding.js';

@injectable()
export class GitPrService implements IGitPrService {
  constructor(@inject('ExecFunction') private readonly execFile: ExecFunction) {}

  async hasRemote(cwd: string): Promise<boolean> {
    const { stdout } = await this.execFile('git', ['remote'], { cwd });
    return stdout.trim().length > 0;
  }

  async getRemoteUrl(cwd: string): Promise<string | null> {
    try {
      const { stdout } = await this.execFile('git', ['remote', 'get-url', 'origin'], { cwd });
      const raw = stdout.trim();
      if (!raw) return null;
      // Convert SSH URLs to HTTPS: git@github.com:org/repo.git → https://github.com/org/repo
      if (raw.startsWith('git@')) {
        return raw.replace(/^git@([^:]+):/, 'https://$1/').replace(/\.git$/, '');
      }
      // Strip trailing .git from HTTPS URLs
      return raw.replace(/\.git$/, '');
    } catch {
      return null;
    }
  }

  async getDefaultBranch(cwd: string): Promise<string> {
    // 1. Try remote HEAD reference (most reliable when remote exists)
    try {
      const { stdout } = await this.execFile('git', ['symbolic-ref', 'refs/remotes/origin/HEAD'], {
        cwd,
      });
      const ref = stdout.trim(); // e.g. "refs/remotes/origin/main"
      if (ref) return ref.replace('refs/remotes/origin/', '');
    } catch {
      // No remote HEAD configured — continue to fallbacks
    }

    // 2. Check for common default branch names locally.
    //    If both exist, pick the one with the most recent commit.
    const candidates: string[] = [];
    for (const name of ['main', 'master']) {
      try {
        const { stdout } = await this.execFile(
          'git',
          ['rev-parse', '--verify', `refs/heads/${name}`],
          { cwd }
        );
        if (stdout.trim()) candidates.push(name);
      } catch {
        // Branch doesn't exist — try next
      }
    }
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1) {
      // Pick the branch with the most recent commit
      try {
        const { stdout } = await this.execFile(
          'git',
          [
            'for-each-ref',
            '--sort=-committerdate',
            '--format=%(refname:short)',
            ...candidates.map((c) => `refs/heads/${c}`),
          ],
          { cwd }
        );
        const newest = stdout.trim().split('\n')[0];
        if (newest) return newest;
      } catch {
        // Fall through to first candidate
      }
      return candidates[0];
    }

    // 3. Check git config init.defaultBranch (user/system-level default)
    try {
      const { stdout } = await this.execFile('git', ['config', 'init.defaultBranch'], { cwd });
      const configured = stdout.trim();
      if (configured) return configured;
    } catch {
      // Not configured — continue
    }

    // 4. Fall back to current branch ONLY in the main worktree (not feature worktrees).
    // In a feature worktree, symbolic-ref HEAD returns the feature branch, not the default.
    try {
      const gitDir = await this.execFile('git', ['rev-parse', '--git-dir'], { cwd });
      const gitCommonDir = await this.execFile('git', ['rev-parse', '--git-common-dir'], { cwd });
      const isMainWorktree = gitDir.stdout.trim() === gitCommonDir.stdout.trim();
      if (isMainWorktree) {
        const { stdout } = await this.execFile('git', ['symbolic-ref', '--short', 'HEAD'], { cwd });
        const branch = stdout.trim();
        if (branch) return branch;
      }
    } catch {
      // Detached HEAD or other error — continue
    }

    // 5. Ultimate fallback — throw instead of silently guessing
    throw new Error(
      `Unable to determine default branch for repository at ${cwd}. ` +
        `No remote HEAD, no main/master branch, and no init.defaultBranch configured.`
    );
  }

  async revParse(cwd: string, ref: string): Promise<string> {
    const { stdout } = await this.execFile('git', ['rev-parse', ref], { cwd });
    return stdout.trim();
  }

  async hasUncommittedChanges(cwd: string): Promise<boolean> {
    const { stdout } = await this.execFile('git', ['status', '--porcelain'], { cwd });
    return stdout.trim().length > 0;
  }

  async commitAll(cwd: string, message: string): Promise<string> {
    try {
      await this.execFile('git', ['add', '-A'], { cwd });
      await this.execFile('git', ['commit', '-m', message], { cwd });
      const { stdout } = await this.execFile('git', ['rev-parse', 'HEAD'], { cwd });
      return stdout.trim();
    } catch (error) {
      throw this.parseGitError(error);
    }
  }

  async push(cwd: string, branch: string, setUpstream?: boolean): Promise<void> {
    const args = ['push'];
    if (setUpstream) args.push('--set-upstream');
    args.push('origin', branch);

    try {
      await this.execFile('git', args, { cwd });
    } catch (error) {
      throw this.parseGitError(error);
    }
  }

  async createPr(cwd: string, prYamlPath: string): Promise<PrCreateResult> {
    try {
      // Parse pr.yaml to extract PR metadata
      const prYamlContent = readFileSync(prYamlPath, 'utf-8');
      const prData = yaml.load(prYamlContent) as {
        title?: string;
        body?: string;
        baseBranch?: string;
        headBranch?: string;
        labels?: string[];
        draft?: boolean;
      };

      const title = prData.title ?? 'Untitled PR';
      const body = applyPrBranding(prData.body ?? '');
      const args = ['pr', 'create', '--title', title, '--body', body];

      if (prData.baseBranch) {
        args.push('--base', prData.baseBranch);
      }
      if (prData.headBranch) {
        args.push('--head', prData.headBranch);
      }
      if (prData.labels?.length) {
        args.push('--label', prData.labels.join(','));
      }
      if (prData.draft) {
        args.push('--draft');
      }

      const { stdout } = await this.execFile('gh', args, { cwd });
      const url = stdout.trim();
      const number = this.parsePrNumberFromUrl(url);
      return { url, number };
    } catch (error) {
      throw this.parseGhError(error);
    }
  }

  async mergePr(cwd: string, prNumber: number, strategy: MergeStrategy = 'squash'): Promise<void> {
    try {
      await this.execFile('gh', ['pr', 'merge', String(prNumber), `--${strategy}`], {
        cwd,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const cause = error instanceof Error ? error : undefined;
      throw new GitPrError(message, GitPrErrorCode.MERGE_FAILED, cause);
    }

    // Try to delete the remote branch gracefully — not fatal if it fails
    // (e.g. branch already deleted by GitHub auto-delete, or permissions)
    try {
      await this.execFile(
        'gh',
        [
          'api',
          '--method',
          'DELETE',
          `repos/{owner}/{repo}/git/refs/heads/${await this.getPrHeadBranch(cwd, prNumber)}`,
        ],
        { cwd }
      );
    } catch {
      // Branch deletion is best-effort — log-level concern, not an error
    }
  }

  private async getPrHeadBranch(cwd: string, prNumber: number): Promise<string> {
    const { stdout } = await this.execFile(
      'gh',
      ['pr', 'view', String(prNumber), '--json', 'headRefName', '--jq', '.headRefName'],
      { cwd }
    );
    return stdout.trim();
  }

  async localMergeSquash(
    cwd: string,
    featureBranch: string,
    baseBranch: string,
    commitMessage: string,
    hasRemote = false
  ): Promise<void> {
    try {
      // Clean up any stale merge/rebase state and dirty index BEFORE checkout.
      // A previous failed merge may have left the repo in a merge state, causing
      // "you need to resolve your current index first" on checkout.
      try {
        await this.execFile('git', ['merge', '--abort'], { cwd });
      } catch {
        // No merge in progress — expected, non-fatal
      }
      try {
        await this.execFile('git', ['reset', '--hard', 'HEAD'], { cwd });
      } catch {
        // Reset failure is non-fatal
      }
      try {
        await this.execFile('git', ['clean', '-fd'], { cwd });
      } catch {
        // Clean failure is non-fatal
      }

      // Fetch latest from remote if available
      if (hasRemote) {
        try {
          await this.execFile('git', ['fetch', 'origin'], { cwd });
        } catch {
          // Fetch failure is non-fatal — proceed with local state
        }
      }

      // Checkout base branch
      await this.execFile('git', ['checkout', baseBranch], { cwd });

      // Pull latest base if remote available
      if (hasRemote) {
        try {
          await this.execFile('git', ['pull', 'origin', baseBranch], { cwd });
        } catch {
          // Pull failure is non-fatal — proceed with local state
        }
      }

      // Squash merge the feature branch.
      // git merge --squash writes conflict info to STDOUT (not stderr), so the
      // error.message from execFile won't contain "CONFLICT". We must check
      // error.stdout to detect conflicts and include it in diagnostics.
      try {
        await this.execFile('git', ['merge', '--squash', featureBranch], { cwd });
      } catch (mergeError: unknown) {
        // Abort the in-progress merge to leave the repo clean
        try {
          await this.execFile('git', ['merge', '--abort'], { cwd });
        } catch {
          // merge --abort may fail if there's no merge in progress; non-fatal
          try {
            await this.execFile('git', ['reset', '--merge'], { cwd });
          } catch {
            // Last-resort cleanup; non-fatal
          }
        }

        // Check stdout for CONFLICT text (git merge --squash puts it there, not stderr)
        const stdout = (mergeError as { stdout?: string })?.stdout ?? '';
        const stderr = (mergeError as { stderr?: string })?.stderr ?? '';
        const combined = `${stdout}\n${stderr}`;
        const mergeMsg = mergeError instanceof Error ? mergeError.message : String(mergeError);

        if (
          combined.includes('CONFLICT') ||
          combined.includes('conflict') ||
          mergeMsg.includes('CONFLICT') ||
          mergeMsg.includes('conflict')
        ) {
          throw new GitPrError(
            `Merge conflict while squash-merging ${featureBranch} into ${baseBranch}: ${combined.trim()}`,
            GitPrErrorCode.MERGE_CONFLICT,
            mergeError instanceof Error ? mergeError : undefined
          );
        }

        // Include stdout in the error for better diagnostics
        const detail = combined.trim() || mergeMsg;
        throw new GitPrError(
          `Local squash merge failed: ${detail}`,
          GitPrErrorCode.GIT_ERROR,
          mergeError instanceof Error ? mergeError : undefined
        );
      }

      // Commit the squash merge (skip if nothing to commit — branches may be equivalent)
      const { stdout: status } = await this.execFile('git', ['status', '--porcelain'], { cwd });
      if (status.trim().length > 0) {
        // Write commit message to a temp file to avoid shell splitting on Windows
        // (DI-injected execFile uses shell: true on Windows, which splits on spaces)
        const msgFile = join(tmpdir(), `shep-merge-msg-${Date.now()}.txt`);
        try {
          writeFileSync(msgFile, commitMessage, 'utf8');
          await this.execFile('git', ['commit', '--file', msgFile], { cwd });
        } finally {
          try {
            unlinkSync(msgFile);
          } catch {
            // Cleanup failure is non-fatal
          }
        }
      }

      // Delete the feature branch after successful merge
      try {
        await this.execFile('git', ['branch', '-d', featureBranch], { cwd });
      } catch {
        // Branch deletion failure is non-fatal (branch may have already been deleted)
      }
    } catch (error) {
      // Re-throw GitPrErrors as-is (already properly classified above)
      if (error instanceof GitPrError) throw error;

      const message = error instanceof Error ? error.message : String(error);
      const cause = error instanceof Error ? error : undefined;
      throw new GitPrError(
        `Local squash merge failed: ${message}`,
        GitPrErrorCode.GIT_ERROR,
        cause
      );
    }
  }

  async mergeBranch(cwd: string, sourceBranch: string, targetBranch: string): Promise<void> {
    try {
      await this.execFile('git', ['checkout', targetBranch], { cwd });
      await this.execFile('git', ['merge', sourceBranch], { cwd });
      await this.execFile('git', ['push'], { cwd });
    } catch (error) {
      throw this.parseGitError(error);
    }
  }

  async getCiStatus(cwd: string, branch: string): Promise<CiStatusResult> {
    try {
      const { stdout } = await this.execFile(
        'gh',
        ['run', 'list', '--branch', branch, '--json', 'conclusion,url', '--limit', '1'],
        { cwd }
      );

      const runs = JSON.parse(stdout) as { conclusion: string | null; url: string }[];
      if (runs.length === 0 || !runs[0].conclusion) {
        return { status: 'pending', runUrl: runs[0]?.url };
      }

      return {
        status: runs[0].conclusion === 'success' ? 'success' : 'failure',
        runUrl: runs[0].url,
      };
    } catch (error) {
      throw this.parseGhError(error);
    }
  }

  async watchCi(
    cwd: string,
    branch: string,
    timeoutMs?: number,
    intervalSeconds?: number
  ): Promise<CiStatusResult> {
    // Resolve the latest run for the branch BEFORE the try/catch so the
    // runUrl is available in both success and failure return paths.
    let runUrl: string | undefined;
    try {
      // gh run watch requires a run ID — it does not support --branch.
      // First, resolve the latest run ID for the branch via gh run list.
      const { stdout: listOut } = await this.execFile(
        'gh',
        ['run', 'list', '--branch', branch, '--json', 'databaseId,url', '--limit', '1'],
        { cwd }
      );
      const runs = JSON.parse(listOut) as { databaseId: number; url: string }[];
      if (runs.length === 0 || !runs[0].databaseId) {
        return { status: 'pending' };
      }

      const runId = String(runs[0].databaseId);
      runUrl = runs[0].url;
      const interval = intervalSeconds ?? 30;
      const args = [
        'run',
        'watch',
        runId,
        '--exit-status',
        '--compact',
        '--interval',
        String(interval),
      ];
      const { stdout } = await this.execFile('gh', args, {
        cwd,
        ...(timeoutMs ? { timeout: timeoutMs } : {}),
      });

      // gh run watch --exit-status exits 0 when the run succeeds.
      // If we reach here (no exception), CI passed — no need for fragile stdout parsing.
      return {
        status: 'success',
        runUrl,
        logExcerpt: stdout.trim(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const cause = error instanceof Error ? error : undefined;
      if (message.includes('timed out') || message.includes('timeout')) {
        throw new GitPrError(message, GitPrErrorCode.CI_TIMEOUT, cause);
      }
      // gh run watch --exit-status exits non-zero when the run fails.
      // Node.js execFile produces errors with a numeric `code` (exit code) and
      // stdout/stderr from the process. The error.message is typically
      // "Command failed: gh run watch <id> --exit-status\n" — detect this by
      // checking for a numeric exit code or the "Command failed" prefix.
      const exitCode = (error as NodeJS.ErrnoException)?.code;
      const hasNumericExitCode = typeof exitCode === 'number';
      const isCommandFailure = message.includes('Command failed') || message.includes('exit code');
      if (hasNumericExitCode || isCommandFailure) {
        // Build a useful log excerpt from stdout/stderr if available
        const errObj = error as { stdout?: string; stderr?: string };
        const parts = [errObj.stdout, errObj.stderr, message].filter(Boolean);
        return { status: 'failure', runUrl, logExcerpt: parts.join('\n').trim() };
      }
      throw new GitPrError(message, GitPrErrorCode.GIT_ERROR, cause);
    }
  }

  async deleteBranch(cwd: string, branch: string, deleteRemote?: boolean): Promise<void> {
    try {
      await this.execFile('git', ['branch', '-d', branch], { cwd });
      if (deleteRemote) {
        await this.execFile('git', ['push', 'origin', '--delete', branch], { cwd });
      }
    } catch (error) {
      throw this.parseGitError(error);
    }
  }

  async getPrDiffSummary(cwd: string, baseBranch: string): Promise<DiffSummary> {
    const { stdout: diffStat } = await this.execFile(
      'git',
      ['diff', '--stat', `${baseBranch}...HEAD`],
      { cwd }
    );
    const { stdout: logOutput } = await this.execFile(
      'git',
      ['log', '--oneline', `${baseBranch}...HEAD`],
      { cwd }
    );

    return this.parseDiffStat(diffStat, logOutput);
  }

  async getFileDiffs(cwd: string, baseBranch: string): Promise<FileDiff[]> {
    try {
      const { stdout } = await this.execFile(
        'git',
        ['diff', '--unified=3', `${baseBranch}...HEAD`],
        { cwd }
      );
      return this.parseUnifiedDiff(stdout);
    } catch (error) {
      throw this.parseGitError(error);
    }
  }

  private parseUnifiedDiff(rawDiff: string): FileDiff[] {
    if (!rawDiff.trim()) return [];

    const files: FileDiff[] = [];
    // Split on "diff --git" boundaries (keeping the delimiter)
    const fileSections = rawDiff.split(/^(?=diff --git )/m).filter((s) => s.trim());

    for (const section of fileSections) {
      const file = this.parseFileDiff(section);
      if (file) files.push(file);
    }

    return files;
  }

  private parseFileDiff(section: string): FileDiff | null {
    const lines = section.split('\n');
    if (lines.length === 0) return null;

    // Parse header: "diff --git a/path b/path"
    const headerMatch = lines[0].match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (!headerMatch) return null;

    const oldPath = headerMatch[1];
    const newPath = headerMatch[2];

    // Determine status from diff header lines
    let status: FileDiff['status'] = 'modified';
    const isNew = lines.some((l) => l.startsWith('new file mode'));
    const isDeleted = lines.some((l) => l.startsWith('deleted file mode'));
    const isRenamed = lines.some((l) => l.startsWith('rename from'));

    if (isNew) status = 'added';
    else if (isDeleted) status = 'deleted';
    else if (isRenamed) status = 'renamed';

    // Parse hunks
    const hunks: DiffHunk[] = [];
    let currentHunk: DiffHunk | null = null;
    let oldLineNum = 0;
    let newLineNum = 0;
    let additions = 0;
    let deletions = 0;

    for (const line of lines) {
      const hunkHeaderMatch = line.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@(.*)$/);
      if (hunkHeaderMatch) {
        currentHunk = { header: line, lines: [] };
        hunks.push(currentHunk);
        oldLineNum = parseInt(hunkHeaderMatch[1], 10);
        newLineNum = parseInt(hunkHeaderMatch[2], 10);
        continue;
      }

      if (!currentHunk) continue;

      if (line.startsWith('+')) {
        const diffLine: DiffLine = {
          type: 'added',
          content: line.slice(1),
          newNumber: newLineNum,
        };
        currentHunk.lines.push(diffLine);
        newLineNum++;
        additions++;
      } else if (line.startsWith('-')) {
        const diffLine: DiffLine = {
          type: 'removed',
          content: line.slice(1),
          oldNumber: oldLineNum,
        };
        currentHunk.lines.push(diffLine);
        oldLineNum++;
        deletions++;
      } else if (line.startsWith(' ')) {
        const diffLine: DiffLine = {
          type: 'context',
          content: line.slice(1),
          oldNumber: oldLineNum,
          newNumber: newLineNum,
        };
        currentHunk.lines.push(diffLine);
        oldLineNum++;
        newLineNum++;
      }
      // Skip lines like "\ No newline at end of file"
    }

    return {
      path: newPath,
      oldPath: isRenamed || oldPath !== newPath ? oldPath : undefined,
      additions,
      deletions,
      status,
      hunks,
    };
  }

  async listPrStatuses(cwd: string): Promise<PrStatusInfo[]> {
    try {
      const { stdout } = await this.execFile(
        'gh',
        [
          'pr',
          'list',
          '--json',
          'number,state,url,headRefName,mergeable',
          '--state',
          'all',
          '--limit',
          '100',
        ],
        { cwd }
      );

      const prs = JSON.parse(stdout) as {
        number: number;
        state: string;
        url: string;
        headRefName: string;
        mergeable?: string;
      }[];
      return prs.map((pr) => ({
        number: pr.number,
        state: this.normalizeGhState(pr.state),
        url: pr.url,
        headRefName: pr.headRefName,
        mergeable: this.parseMergeable(pr.mergeable),
      }));
    } catch (error) {
      throw this.parseGhError(error);
    }
  }

  async getMergeableStatus(cwd: string, prNumber: number): Promise<boolean | undefined> {
    try {
      const { stdout } = await this.execFile(
        'gh',
        ['pr', 'view', String(prNumber), '--json', 'mergeable'],
        { cwd }
      );
      const result = JSON.parse(stdout) as { mergeable?: string };
      return this.parseMergeable(result.mergeable);
    } catch (error) {
      throw this.parseGhError(error);
    }
  }

  async verifyMerge(
    cwd: string,
    featureBranch: string,
    baseBranch: string,
    premergeBaseSha?: string
  ): Promise<boolean> {
    // Resolve the feature branch ref — the local branch may have been deleted
    // after a squash merge (git branch -d succeeds when pushed to remote).
    // Fall back to the remote tracking branch if the local ref is gone.
    const resolvedRef = await this.resolveRef(cwd, featureBranch);
    if (!resolvedRef) return false;

    // First try: true merge (feature branch is ancestor of base)
    try {
      await this.execFile('git', ['merge-base', '--is-ancestor', resolvedRef, baseBranch], {
        cwd,
      });
      return true;
    } catch {
      // Not a true merge — check for squash merge by comparing tree content.
      // After a squash merge, all changes from the feature branch are on the base
      // branch, so `git diff featureBranch baseBranch` should produce no output.
    }

    try {
      await this.execFile('git', ['diff', '--quiet', resolvedRef, baseBranch], { cwd });
      // --quiet exits 0 when there's no diff → squash merge verified
      return true;
    } catch {
      // Exit code 1 = diff exists (not merged), other errors also mean unverified.
      // Fall through to premergeBaseSha check if available.
    }

    // Third fallback: if the caller recorded the base branch HEAD before the merge
    // agent ran, check whether it advanced. This handles agents that legitimately
    // modify the tree during squash merge (e.g. adding .gitignore, removing
    // node_modules). If baseBranch HEAD moved forward, the agent committed something.
    if (premergeBaseSha) {
      try {
        const { stdout } = await this.execFile('git', ['rev-parse', baseBranch], { cwd });
        const currentSha = stdout.trim();
        return currentSha !== premergeBaseSha;
      } catch {
        return false;
      }
    }

    return false;
  }

  /**
   * Resolve a branch name to a valid git ref, falling back to the remote
   * tracking branch if the local ref has been deleted.
   */
  private async resolveRef(cwd: string, branch: string): Promise<string | null> {
    // Try local ref first
    try {
      await this.execFile('git', ['rev-parse', '--verify', branch], { cwd });
      return branch;
    } catch {
      // Local ref doesn't exist
    }

    // Try remote tracking branch
    const remoteRef = `origin/${branch}`;
    try {
      await this.execFile('git', ['rev-parse', '--verify', remoteRef], { cwd });
      return remoteRef;
    } catch {
      return null;
    }
  }

  async getFailureLogs(
    cwd: string,
    runId: string,
    _branch: string,
    logMaxChars = 50_000
  ): Promise<string> {
    try {
      const { stdout } = await this.execFile('gh', ['run', 'view', runId, '--log-failed'], {
        cwd,
      });
      return this.truncateLog(stdout, logMaxChars, runId);
    } catch (error) {
      throw this.parseGhError(error);
    }
  }

  private truncateLog(output: string, maxChars: number, runId: string): string {
    if (output.length <= maxChars) return output;
    return `${output.slice(
      0,
      maxChars
    )}\n[Log truncated at ${maxChars} chars — full log available via gh run view ${runId}]`;
  }

  private parseMergeable(value: string | undefined): boolean | undefined {
    if (value === 'MERGEABLE') return true;
    if (value === 'CONFLICTING') return false;
    return undefined; // UNKNOWN or missing
  }

  private normalizeGhState(state: string): PrStatus {
    const normalized = state.charAt(0).toUpperCase() + state.slice(1).toLowerCase();
    return normalized as PrStatus;
  }

  private parseGitError(error: unknown): GitPrError {
    const message = error instanceof Error ? error.message : String(error);
    const cause = error instanceof Error ? error : undefined;

    // Rebase-specific: detect "CONFLICT" during rebase operations
    if (message.includes('CONFLICT') && message.includes('rebase')) {
      return new GitPrError(message, GitPrErrorCode.REBASE_CONFLICT, cause);
    }
    // Sync-specific: non-fast-forward or diverged branch
    if (message.includes('non-fast-forward') || message.includes('diverged')) {
      return new GitPrError(message, GitPrErrorCode.SYNC_FAILED, cause);
    }
    if (message.includes('rejected') || message.includes('conflict')) {
      return new GitPrError(message, GitPrErrorCode.MERGE_CONFLICT, cause);
    }
    if (message.includes('Authentication') || message.includes('auth') || message.includes('403')) {
      return new GitPrError(message, GitPrErrorCode.AUTH_FAILURE, cause);
    }

    return new GitPrError(message, GitPrErrorCode.GIT_ERROR, cause);
  }

  private parseGhError(error: unknown): GitPrError {
    const message = error instanceof Error ? error.message : String(error);
    const cause = error instanceof Error ? error : undefined;
    const errnoCode = (error as NodeJS.ErrnoException)?.code;

    if (errnoCode === 'ENOENT' || message.includes('ENOENT')) {
      return new GitPrError(message, GitPrErrorCode.GH_NOT_FOUND, cause);
    }
    if (message.includes('Authentication') || message.includes('auth') || message.includes('403')) {
      return new GitPrError(message, GitPrErrorCode.AUTH_FAILURE, cause);
    }

    return new GitPrError(message, GitPrErrorCode.GIT_ERROR, cause);
  }

  private parsePrNumberFromUrl(url: string): number {
    const match = url.match(/\/pull\/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  async createGitHubRepo(
    cwd: string,
    name: string,
    options: { isPrivate: boolean; org?: string }
  ): Promise<string> {
    const repoName = options.org ? `${options.org}/${name}` : name;
    const visibilityFlag = options.isPrivate ? '--private' : '--public';
    const args = [
      'repo',
      'create',
      repoName,
      visibilityFlag,
      '--source=.',
      '--remote=origin',
      '--push',
    ];

    try {
      const { stdout, stderr } = await this.execFile('gh', args, { cwd });
      // `gh repo create` emits status lines to stdout/stderr that include the
      // created repo URL somewhere in the output (e.g. "✓ Created repository
      // org/name on GitHub\n  https://github.com/org/name"). Scrape the first
      // github.com URL we can find rather than returning the raw multi-line blob.
      const combined = `${stdout}\n${stderr}`;
      const parsedUrl = this.extractGitHubUrl(combined);
      if (parsedUrl) {
        return parsedUrl;
      }

      // Fall back to `gh repo view` from the cwd — after --push, origin is the
      // authoritative source of the repo URL.
      return await this.queryRepoUrl(cwd);
    } catch (error) {
      const ghError = this.parseGhError(error);
      if (ghError.code === GitPrErrorCode.GIT_ERROR) {
        throw new GitPrError(ghError.message, GitPrErrorCode.REPO_CREATE_FAILED, ghError.cause);
      }
      throw ghError;
    }
  }

  /**
   * Extracts the first github.com repository URL from a blob of text.
   * Returns a normalized URL without a trailing `.git` suffix or punctuation.
   */
  private extractGitHubUrl(text: string): string | null {
    const match = text.match(/https:\/\/github\.com\/[\w.-]+\/[\w.-]+/);
    if (!match) {
      return null;
    }
    return match[0].replace(/\.git$/, '').replace(/[).,;]+$/, '');
  }

  /**
   * Queries the current repo's URL via `gh repo view --json url`. Used as a
   * fallback when URL parsing from `gh repo create` output fails.
   */
  private async queryRepoUrl(cwd: string): Promise<string> {
    const { stdout } = await this.execFile(
      'gh',
      ['repo', 'view', '--json', 'url', '--jq', '.url'],
      { cwd }
    );
    return stdout.trim();
  }

  async addRemote(cwd: string, remoteName: string, remoteUrl: string): Promise<void> {
    try {
      await this.execFile('git', ['remote', 'add', remoteName, remoteUrl], { cwd });
    } catch (error) {
      throw this.parseGitError(error);
    }
  }

  private parseDiffStat(diffStat: string, logOutput: string): DiffSummary {
    const summaryLine = diffStat.trim().split('\n').pop() ?? '';
    const filesMatch = summaryLine.match(/(\d+)\s+files?\s+changed/);
    const addMatch = summaryLine.match(/(\d+)\s+insertions?\(\+\)/);
    const delMatch = summaryLine.match(/(\d+)\s+deletions?\(-\)/);
    const commitCount = logOutput
      .trim()
      .split('\n')
      .filter((l) => l.trim()).length;

    return {
      filesChanged: filesMatch ? parseInt(filesMatch[1], 10) : 0,
      additions: addMatch ? parseInt(addMatch[1], 10) : 0,
      deletions: delMatch ? parseInt(delMatch[1], 10) : 0,
      commitCount,
    };
  }

  // --- Rebase & Sync operations ---

  async syncMain(cwd: string, baseBranch: string): Promise<void> {
    try {
      // Detect current branch
      const { stdout } = await this.execFile('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
      const currentBranch = stdout.trim();

      if (currentBranch === baseBranch) {
        // On the base branch — use git pull --ff-only
        await this.execFile('git', ['pull', '--ff-only', 'origin', baseBranch], { cwd });
      } else {
        // On a different branch — fetch the remote ref only (updates origin/<baseBranch>).
        // We intentionally do NOT update the local <baseBranch> ref because it may be
        // checked out in another worktree, which causes git to refuse the update with:
        //   "fatal: refusing to fetch into branch 'refs/heads/main' checked out at ..."
        await this.execFile('git', ['fetch', 'origin', baseBranch], { cwd });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const cause = error instanceof Error ? error : undefined;

      if (
        message.includes('non-fast-forward') ||
        message.includes('Not possible to fast-forward') ||
        message.includes('diverged')
      ) {
        throw new GitPrError(
          `Cannot fast-forward '${baseBranch}': local branch has diverged from remote. ` +
            `Resolve the divergence manually with 'git checkout ${baseBranch} && git reset --hard origin/${baseBranch}' ` +
            `if you want to discard local changes on ${baseBranch}.`,
          GitPrErrorCode.SYNC_FAILED,
          cause
        );
      }

      throw new GitPrError(
        `Failed to sync '${baseBranch}' with remote: ${message}`,
        GitPrErrorCode.GIT_ERROR,
        cause
      );
    }
  }

  async rebaseOnMain(cwd: string, featureBranch: string, baseBranch: string): Promise<void> {
    // Check for dirty worktree before starting
    const dirty = await this.hasUncommittedChanges(cwd);
    if (dirty) {
      throw new GitPrError(
        `Cannot rebase: working directory has uncommitted changes. ` +
          `Please commit or stash your changes before rebasing.`,
        GitPrErrorCode.GIT_ERROR
      );
    }

    // Checkout the feature branch
    try {
      await this.execFile('git', ['checkout', featureBranch], { cwd });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const cause = error instanceof Error ? error : undefined;
      if (
        message.includes('did not match') ||
        message.includes('not a commit') ||
        message.includes('pathspec')
      ) {
        throw new GitPrError(
          `Branch '${featureBranch}' not found.`,
          GitPrErrorCode.BRANCH_NOT_FOUND,
          cause
        );
      }
      throw new GitPrError(
        `Failed to checkout '${featureBranch}': ${message}`,
        GitPrErrorCode.GIT_ERROR,
        cause
      );
    }

    // Rebase onto origin/<baseBranch> (the remote-tracking ref).
    // We use origin/<baseBranch> rather than the local <baseBranch> because:
    // 1. syncMain fetches origin/<baseBranch> — it's always up-to-date
    // 2. The local <baseBranch> may be checked out in another worktree and stale
    const rebaseTarget = `origin/${baseBranch}`;
    try {
      await this.execFile('git', ['rebase', rebaseTarget], { cwd });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const cause = error instanceof Error ? error : undefined;

      // Detect rebase conflict from git stderr/exit code
      if (message.includes('CONFLICT') || message.includes('could not apply')) {
        // Get the list of conflicted files to include in the error message
        let conflictedFiles: string[] = [];
        try {
          conflictedFiles = await this.getConflictedFiles(cwd);
        } catch {
          // Failed to get conflicted files — still report the conflict
        }

        const fileList =
          conflictedFiles.length > 0 ? ` Conflicted files: ${conflictedFiles.join(', ')}` : '';
        throw new GitPrError(
          `Rebase of '${featureBranch}' onto '${baseBranch}' encountered conflicts.${fileList}`,
          GitPrErrorCode.REBASE_CONFLICT,
          cause
        );
      }

      throw new GitPrError(
        `Rebase of '${featureBranch}' onto '${baseBranch}' failed: ${message}`,
        GitPrErrorCode.GIT_ERROR,
        cause
      );
    }
  }

  async getConflictedFiles(cwd: string): Promise<string[]> {
    try {
      const { stdout } = await this.execFile('git', ['diff', '--name-only', '--diff-filter=U'], {
        cwd,
      });
      return stdout
        .trim()
        .split('\n')
        .filter((f) => f.length > 0)
        .map((f) => f.replace(/\\/g, '/'));
    } catch (error) {
      throw this.parseGitError(error);
    }
  }

  async stageFiles(cwd: string, files: string[]): Promise<void> {
    try {
      await this.execFile('git', ['add', ...files], { cwd });
    } catch (error) {
      throw this.parseGitError(error);
    }
  }

  async rebaseContinue(cwd: string): Promise<void> {
    try {
      await this.execFile('git', ['rebase', '--continue'], {
        cwd,
        env: { ...process.env, GIT_EDITOR: 'true' },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const cause = error instanceof Error ? error : undefined;

      if (message.includes('CONFLICT') || message.includes('could not apply')) {
        throw new GitPrError(
          `Rebase continue encountered new conflicts: ${message}`,
          GitPrErrorCode.REBASE_CONFLICT,
          cause
        );
      }
      throw this.parseGitError(error);
    }
  }

  async rebaseAbort(cwd: string): Promise<void> {
    try {
      await this.execFile('git', ['rebase', '--abort'], { cwd });
    } catch (error) {
      throw this.parseGitError(error);
    }
  }

  async stash(cwd: string, message?: string): Promise<boolean> {
    try {
      const args = ['stash', 'push'];
      if (message) {
        args.push('-m', message);
      }
      const { stdout } = await this.execFile('git', args, { cwd });
      // git stash push outputs "No local changes to save" when clean
      return !stdout.includes('No local changes to save');
    } catch (error) {
      throw this.parseGitError(error);
    }
  }

  async stashPop(cwd: string): Promise<void> {
    try {
      await this.execFile('git', ['stash', 'pop'], { cwd });
    } catch (error) {
      throw this.parseGitError(error);
    }
  }

  async stashDrop(cwd: string): Promise<void> {
    try {
      await this.execFile('git', ['stash', 'drop'], { cwd });
    } catch (error) {
      throw this.parseGitError(error);
    }
  }

  async getBranchSyncStatus(
    cwd: string,
    featureBranch: string,
    baseBranch: string
  ): Promise<{ ahead: number; behind: number }> {
    try {
      const remoteRef = `origin/${baseBranch}`;
      const [aheadResult, behindResult] = await Promise.all([
        this.execFile('git', ['rev-list', '--count', `${remoteRef}..${featureBranch}`], { cwd }),
        this.execFile('git', ['rev-list', '--count', `${featureBranch}..${remoteRef}`], { cwd }),
      ]);
      return {
        ahead: parseInt(aheadResult.stdout.trim(), 10) || 0,
        behind: parseInt(behindResult.stdout.trim(), 10) || 0,
      };
    } catch (error) {
      throw this.parseGitError(error);
    }
  }
}
