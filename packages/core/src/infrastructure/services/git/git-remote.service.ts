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
import {
  GhNotAuthenticatedError,
  GitRemoteCreationError,
  type CreateGitHubRepoInput,
  type IGitRemoteService,
} from '../../../application/ports/output/services/git-remote.service.interface.js';

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
    const { cwd, slug, description, visibility = 'public' } = input;

    if (!(await this.isGhAuthenticated())) {
      throw new GhNotAuthenticatedError();
    }

    try {
      await this.ensureGitInitialized(cwd);
      await this.ensureInitialCommit(cwd);
      await this.createRepoAndPush(cwd, slug, description, visibility);
      return { remoteUrl: await this.readOriginUrl(cwd) };
    } catch (err) {
      if (err instanceof GhNotAuthenticatedError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      throw new GitRemoteCreationError(`Failed to create GitHub repository: ${message}`);
    }
  }

  private async ensureGitInitialized(cwd: string): Promise<void> {
    try {
      await this.execFile('git', ['rev-parse', '--is-inside-work-tree'], { cwd });
      return;
    } catch {
      // Not a repo yet — initialise.
    }
    await this.execFile('git', ['init', '-b', 'main'], { cwd });
    await this.execFile('git', ['config', 'user.name', GIT_USER_NAME], { cwd });
    await this.execFile('git', ['config', 'user.email', GIT_USER_EMAIL], { cwd });
  }

  private async ensureInitialCommit(cwd: string): Promise<void> {
    try {
      await this.execFile('git', ['rev-parse', 'HEAD'], { cwd });
      return;
    } catch {
      // No commit yet — stage and commit everything.
    }
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
    visibility: 'public' | 'private'
  ): Promise<void> {
    try {
      await this.execFile('git', ['remote', 'get-url', 'origin'], { cwd });
      // Origin already exists — skip create, just push.
      await this.execFile('git', ['push', '-u', 'origin', 'HEAD'], { cwd });
      return;
    } catch {
      // No origin remote yet — create via gh.
    }

    const ghArgs = [
      'repo',
      'create',
      slug,
      `--${visibility}`,
      '--source=.',
      '--remote=origin',
      '--push',
    ];
    if (description) {
      ghArgs.push('--description', description);
    }

    try {
      await this.execFile('gh', ghArgs, { cwd });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/auth|login|token/i.test(message)) {
        throw new GhNotAuthenticatedError();
      }
      throw new GitRemoteCreationError(`gh repo create failed: ${message}`);
    }
  }

  private async readOriginUrl(cwd: string): Promise<string> {
    const { stdout } = await this.execFile('git', ['remote', 'get-url', 'origin'], { cwd });
    return stdout.trim();
  }
}
