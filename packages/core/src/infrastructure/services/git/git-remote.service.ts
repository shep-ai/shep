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
  CreateGitHubRepoInput,
  GitRemoteLogEmitter,
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
    const { cwd, slug, description, visibility = 'public', ownerLogin, onLog } = input;
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
}
