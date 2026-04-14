/**
 * GitRemoteService
 *
 * Backs IGitRemoteService with the user's local `gh` CLI. Shares the same
 * injected ExecFunction used by git-fork.service.ts and worktree.service.ts.
 *
 * Spec 089 — one-click-cloud-deploy, phase 4.
 */

import { inject, injectable } from 'tsyringe';

import type { ExecFunction } from './worktree.service.js';
import type {
  CommitAndPushInput,
  CommitAndPushResult,
  CreateGitHubRepoInput,
  GitRemoteLogEmitter,
  GitWorkingTreeStatus,
  IGitRemoteService,
} from '../../../application/ports/output/services/git-remote.service.interface.js';
import { GhNotAuthenticatedError } from '../../../domain/errors/gh-not-authenticated.error.js';
import { GitHubRepoNameTakenError } from '../../../domain/errors/github-repo-name-taken.error.js';
import { GitRemoteCreationError } from '../../../domain/errors/git-remote-creation.error.js';

const NOOP_LOG: GitRemoteLogEmitter = () => undefined;

const GIT_USER_NAME = 'shep-ai[bot]';
const GIT_USER_EMAIL = 'bot@shep.bot';
const INITIAL_COMMIT_MESSAGE = 'Initial commit';

@injectable()
export class GitRemoteService implements IGitRemoteService {
  constructor(@inject('ExecFunction') private readonly execFile: ExecFunction) {}

  async isGhAuthenticated(): Promise<boolean> {
    try {
      const { stdout } = await this.execFile('gh', ['auth', 'token'], {});
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  async createGitHubRepoAndPush(input: CreateGitHubRepoInput): Promise<{ remoteUrl: string }> {
    const { cwd, slug, description, visibility = 'private', ownerLogin, onLog } = input;
    const log: GitRemoteLogEmitter = onLog ?? NOOP_LOG;

    log('info', `Starting GitHub repo creation for "${slug}"`);
    log('debug', `cwd=${cwd}  visibility=${visibility}  ownerLogin=${ownerLogin ?? '<personal>'}`);

    if (!(await this.isGhAuthenticated())) {
      log('error', 'gh CLI is not authenticated — aborting before any subprocess runs');
      throw new GhNotAuthenticatedError();
    }
    log('debug', 'gh auth token check passed');

    try {
      await this.ensureGitInitialized(cwd, log);
      await this.ensureInitialCommit(cwd, log);
      // Make sure git itself uses gh's credentials when pushing over https.
      // Idempotent — gh auth setup-git is safe to call repeatedly.
      try {
        await this.execFile('gh', ['auth', 'setup-git'], { cwd });
        log('debug', 'gh auth setup-git completed');
      } catch (err) {
        // best-effort; the push below will fail with a clearer error if creds are wrong
        log(
          'warn',
          'gh auth setup-git failed (best-effort)',
          err instanceof Error ? err.message : String(err)
        );
      }
      // Drop any stale origin before creating. A leftover origin from a
      // previous failed attempt would break `gh repo create --remote=origin`
      // and `git push -u origin HEAD`.
      try {
        await this.execFile('git', ['remote', 'remove', 'origin'], { cwd });
        log('debug', 'Removed pre-existing origin remote (cleanup before fresh create)');
      } catch {
        // origin didn't exist; that's fine
      }
      await this.createRepoAndPush(cwd, slug, description, visibility, ownerLogin, log);
      const remoteUrl = await this.readOriginUrl(cwd);
      log('info', `Repository created and pushed — origin: ${remoteUrl}`);
      return { remoteUrl };
    } catch (err) {
      if (err instanceof GhNotAuthenticatedError) {
        log('error', 'gh authentication required — sign in with gh auth login first');
        throw err;
      }
      if (err instanceof GitHubRepoNameTakenError) {
        log(
          'error',
          `Repository "${err.repoName}" already exists on ${err.ownerLogin} — pick a different name`
        );
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      log(
        'error',
        `GitHub repo creation failed: ${message}`,
        err instanceof Error && err.stack ? err.stack : undefined
      );
      throw new GitRemoteCreationError(`Failed to create GitHub repository: ${message}`);
    }
  }

  private async ensureGitInitialized(cwd: string, log: GitRemoteLogEmitter): Promise<void> {
    try {
      await this.execFile('git', ['rev-parse', '--is-inside-work-tree'], { cwd });
      log('debug', 'cwd is already a git work tree');
      return;
    } catch {
      // Not a repo yet — initialise.
    }
    log('info', 'cwd is not a git repo yet — running git init -b main');
    await this.execFile('git', ['init', '-b', 'main'], { cwd });
    await this.execFile('git', ['config', 'user.name', GIT_USER_NAME], { cwd });
    await this.execFile('git', ['config', 'user.email', GIT_USER_EMAIL], { cwd });
  }

  private async ensureInitialCommit(cwd: string, log: GitRemoteLogEmitter): Promise<void> {
    try {
      await this.execFile('git', ['rev-parse', 'HEAD'], { cwd });
      log('debug', 'HEAD already exists — skipping initial commit');
      return;
    } catch {
      // No commit yet — stage and commit everything.
    }
    log('info', 'No HEAD yet — staging all files and creating initial commit');
    await this.execFile('git', ['add', '-A'], { cwd });
    try {
      await this.execFile('git', ['commit', '-m', INITIAL_COMMIT_MESSAGE, '--allow-empty'], {
        cwd,
      });
    } catch (err) {
      throw new GitRemoteCreationError(
        `git commit failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private async createRepoAndPush(
    cwd: string,
    slug: string,
    description: string,
    visibility: 'public' | 'private',
    ownerLogin: string | undefined,
    log: GitRemoteLogEmitter
  ): Promise<void> {
    // Build the full repo name. If an org/user login is provided, qualify
    // the slug with `<owner>/<slug>` so gh creates it under that account
    // instead of the authenticated user's personal namespace.
    const repoName = ownerLogin ? `${ownerLogin}/${slug}` : slug;
    const ghArgs = [
      'repo',
      'create',
      repoName,
      `--${visibility}`,
      '--source=.',
      '--remote=origin',
      '--push',
    ];
    if (description) {
      ghArgs.push('--description', description);
    }

    log('info', `Running: gh ${ghArgs.join(' ')}`);
    try {
      await this.execFile('gh', ghArgs, { cwd });
      log('info', `gh repo create succeeded for ${repoName}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/Name already exists/i.test(message)) {
        // Resolve the effective owner: explicit org or fall back to the
        // authenticated user. We need it for the structured error so the
        // UI can show "owner/repo already exists, pick a new name".
        const owner = ownerLogin ?? (await this.getAuthenticatedLogin(cwd)) ?? 'this account';
        throw new GitHubRepoNameTakenError(owner, slug);
      }
      if (/auth|login|token|not.*signed/i.test(message)) {
        throw new GhNotAuthenticatedError();
      }
      throw new GitRemoteCreationError(`gh repo create failed: ${message}`);
    }
  }

  private async getAuthenticatedLogin(cwd: string): Promise<string | null> {
    try {
      const { stdout } = await this.execFile('gh', ['api', 'user', '--jq', '.login'], { cwd });
      const login = stdout.trim();
      return login.length > 0 ? login : null;
    } catch {
      return null;
    }
  }

  private async readOriginUrl(cwd: string): Promise<string> {
    const { stdout } = await this.execFile('git', ['remote', 'get-url', 'origin'], { cwd });
    return stdout.trim();
  }

  /**
   * Read a single, cheap snapshot of the working tree for the SmartDeployButton
   * label state machine. Every git invocation is wrapped in try/catch so a
   * brand-new repo (no commits, no upstream, no remote) returns a sensible
   * all-zeros result instead of throwing.
   */
  async getStatus(cwd: string): Promise<GitWorkingTreeStatus> {
    // Branch — `git rev-parse --abbrev-ref HEAD` returns the branch name on
    // a normal repo, "HEAD" on a detached checkout, or fails on an empty
    // repo with no commits yet.
    let branch: string | null = null;
    try {
      const { stdout } = await this.execFile('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd,
      });
      const candidate = stdout.trim();
      branch = candidate === 'HEAD' || candidate.length === 0 ? null : candidate;
    } catch {
      // No commits yet — fall back to the configured init.defaultBranch if
      // we can find one, otherwise leave null.
      try {
        const { stdout } = await this.execFile('git', ['symbolic-ref', '--short', 'HEAD'], { cwd });
        const candidate = stdout.trim();
        branch = candidate.length > 0 ? candidate : null;
      } catch {
        branch = null;
      }
    }

    // Working-tree dirty count via porcelain v1 (one line per changed path).
    let uncommittedCount = 0;
    try {
      const { stdout } = await this.execFile('git', ['status', '--porcelain=v1'], { cwd });
      uncommittedCount = stdout.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
    } catch {
      uncommittedCount = 0;
    }

    // Origin URL — we use this both to set hasRemote and to expose the URL
    // to the UI. `git remote get-url origin` exits non-zero when there's no
    // remote configured, which we map to `hasRemote: false`.
    //
    // GetGitStatusUseCase has a defensive fallback that prefers the
    // persisted Application.gitRemoteUrl over this live read, so a
    // transient subprocess failure here CANNOT leave the UI showing
    // "No backup yet" for an app that's actually published.
    let remoteUrl: string | null = null;
    try {
      const { stdout } = await this.execFile('git', ['remote', 'get-url', 'origin'], { cwd });
      const trimmed = stdout.trim();
      remoteUrl = trimmed.length > 0 ? trimmed : null;
    } catch {
      // Swallow — the use-case-level fallback handles the missing-remote
      // case more accurately than we can here.
      remoteUrl = null;
    }
    const hasRemote = remoteUrl !== null;

    // Unpushed commit count. Only meaningful when we have an upstream
    // configured; otherwise we leave it at 0. `git rev-list @{u}..HEAD
    // --count` is the canonical incantation.
    let unpushedCount = 0;
    if (hasRemote) {
      try {
        const { stdout } = await this.execFile('git', ['rev-list', '@{u}..HEAD', '--count'], {
          cwd,
        });
        unpushedCount = Number.parseInt(stdout.trim(), 10) || 0;
      } catch {
        // No upstream configured (e.g. we have origin but the local branch
        // hasn't been pushed yet). Treat all commits on this branch as
        // unpushed so the UI knows there's something to ship.
        try {
          const { stdout } = await this.execFile('git', ['rev-list', '--count', 'HEAD'], { cwd });
          unpushedCount = Number.parseInt(stdout.trim(), 10) || 0;
        } catch {
          unpushedCount = 0;
        }
      }
    }

    return { branch, uncommittedCount, unpushedCount, hasRemote, remoteUrl };
  }

  /**
   * Stage all → commit → push. No-op when both counts are zero.
   *
   * The orchestrating SyncRepoUseCase wraps this in operation-log entries,
   * so this method only emits structured logs through the optional onLog
   * callback rather than persisting anything itself.
   */
  async commitAndPush(input: CommitAndPushInput): Promise<CommitAndPushResult> {
    const { cwd, message, onLog } = input;
    const log: GitRemoteLogEmitter = onLog ?? NOOP_LOG;

    const before = await this.getStatus(cwd);
    log(
      'debug',
      `Pre-sync status: ${before.uncommittedCount} uncommitted, ${before.unpushedCount} unpushed, branch=${before.branch ?? '<detached>'}`
    );

    if (!before.hasRemote) {
      // Sync requires a remote — Publish flow has to run first.
      log('error', 'No git remote configured — run Publish to GitHub first');
      throw new GitRemoteCreationError('No origin remote configured for this repository');
    }

    if (before.uncommittedCount === 0 && before.unpushedCount === 0) {
      log('info', 'Nothing to sync — working tree is clean and up to date with origin');
      const headSha = await this.readHeadSha(cwd);
      return { headSha, committed: false, pushed: false };
    }

    let committed = false;
    if (before.uncommittedCount > 0) {
      log('info', `Staging ${before.uncommittedCount} change(s) for commit`);
      try {
        await this.execFile('git', ['add', '-A'], { cwd });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log('error', 'git add -A failed', msg);
        throw new GitRemoteCreationError(`git add failed: ${msg}`);
      }

      try {
        await this.execFile('git', ['commit', '-m', message, '--allow-empty-message'], { cwd });
        committed = true;
        log('info', `Created commit "${message}"`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // "nothing to commit" is benign — it means another process committed
        // between our status check and our add. Treat as no-op.
        if (/nothing to commit/i.test(msg)) {
          log('warn', 'Nothing staged for commit (race with another process) — continuing');
          committed = false;
        } else {
          log('error', 'git commit failed', msg);
          throw new GitRemoteCreationError(`git commit failed: ${msg}`);
        }
      }
    }

    // Make sure git uses gh's stored credentials over https. Idempotent.
    try {
      await this.execFile('gh', ['auth', 'setup-git'], { cwd });
    } catch {
      // best-effort; the push below will fail with a clearer error if creds are wrong
    }

    log('info', 'Pushing to origin');
    try {
      // -u sets upstream on the first push. Subsequent pushes are no-ops for
      // -u but it's idempotent so we always pass it.
      const branchName = before.branch ?? 'HEAD';
      await this.execFile('git', ['push', '-u', 'origin', branchName], { cwd });
      log('info', `Push succeeded for branch ${branchName}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/auth|login|token|denied|403/i.test(msg)) {
        log('error', 'Push rejected by GitHub — gh credentials may be missing', msg);
        throw new GhNotAuthenticatedError();
      }
      log('error', 'git push failed', msg);
      throw new GitRemoteCreationError(`git push failed: ${msg}`);
    }

    const headSha = await this.readHeadSha(cwd);
    return { headSha, committed, pushed: true };
  }

  private async readHeadSha(cwd: string): Promise<string> {
    try {
      const { stdout } = await this.execFile('git', ['rev-parse', 'HEAD'], { cwd });
      return stdout.trim();
    } catch {
      return '';
    }
  }
}
