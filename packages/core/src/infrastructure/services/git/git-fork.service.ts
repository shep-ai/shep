/**
 * Git Fork Service Implementation
 *
 * Manages GitHub fork operations: forking repos, pushing to forks,
 * creating upstream PRs, and polling upstream PR status.
 * Uses `gh` CLI for all GitHub API interactions.
 */

import { basename } from 'node:path';
import { injectable, inject } from 'tsyringe';
import type { IGitForkService } from '../../../application/ports/output/services/git-fork-service.interface.js';
import type { UpstreamPrResult } from '../../../application/ports/output/services/git-fork-service.interface.js';
import {
  GitForkError,
  GitForkErrorCode,
} from '../../../application/ports/output/services/git-fork-service.interface.js';
import { PrStatus } from '../../../domain/generated/output.js';
import { assertSafeGitRef } from '../../../domain/shared/git-ref-argument.js';
import type { ExecFunction } from './worktree.service.js';
import { applyPrBranding } from './pr-branding.js';
import { setupGhGitCredentials } from './gh-credential-helper.js';

@injectable()
export class GitForkService implements IGitForkService {
  constructor(@inject('ExecFunction') private readonly execFile: ExecFunction) {}

  async forkRepository(cwd: string): Promise<void> {
    // Check if origin is already a fork — if so, just ensure upstream remote exists
    try {
      const { stdout } = await this.execFile('gh', ['repo', 'view', '--json', 'isFork,parent'], {
        cwd,
      });
      const repoInfo = JSON.parse(stdout);
      if (repoInfo.isFork && repoInfo.parent) {
        // Origin is already a fork — ensure upstream remote points to parent
        const parentUrl = `https://github.com/${repoInfo.parent.owner.login}/${repoInfo.parent.name}.git`;
        try {
          await this.execFile('git', ['remote', 'add', 'upstream', parentUrl], { cwd });
        } catch {
          // Remote may already exist — update it
          await this.execFile('git', ['remote', 'set-url', 'upstream', parentUrl], { cwd });
        }
        return;
      }
    } catch {
      // gh repo view failed — could be auth issue or not a GitHub repo
    }

    // Fork the repository: gh repo fork --remote remaps origin to fork, adds upstream
    try {
      await this.execFile('gh', ['repo', 'fork', '--remote', '--remote-name', 'origin'], { cwd });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('auth') || message.includes('login')) {
        throw new GitForkError(
          'GitHub authentication required to fork',
          GitForkErrorCode.AUTH_FAILURE,
          err instanceof Error ? err : undefined
        );
      }

      // Fallback: when fork fails because there are no remotes (e.g. freshly-init'd repo),
      // create a new GitHub repository instead.
      if (message.includes('unable to determine base repository')) {
        await this.createRepositoryFallback(cwd);
        return;
      }

      throw new GitForkError(
        `Failed to fork repository: ${message}`,
        GitForkErrorCode.FORK_FAILED,
        err instanceof Error ? err : undefined
      );
    }
  }

  /**
   * Fallback when gh repo fork fails due to missing remotes.
   * Creates a new private GitHub repository and sets it as origin.
   */
  private async createRepositoryFallback(cwd: string): Promise<void> {
    const { stdout: ghUser } = await this.execFile('gh', ['api', 'user', '--jq', '.login'], {
      cwd,
    });
    const username = ghUser.trim();
    const repoName = basename(cwd);

    try {
      await this.execFile(
        'gh',
        [
          'repo',
          'create',
          `${username}/${repoName}`,
          '--source',
          '.',
          '--remote',
          'origin',
          '--private',
        ],
        { cwd }
      );
    } catch (createErr) {
      const createMessage = createErr instanceof Error ? createErr.message : String(createErr);
      throw new GitForkError(
        `Failed to create repository: ${createMessage}`,
        GitForkErrorCode.FORK_FAILED,
        createErr instanceof Error ? createErr : undefined
      );
    }
  }

  async pushToFork(cwd: string, branch: string): Promise<void> {
    assertSafeGitRef(branch, 'branch');

    // Without gh's credential helper an HTTPS fork remote has no credentials.
    await setupGhGitCredentials(this.execFile, cwd);

    try {
      await this.execFile('git', ['push', '-u', 'origin', '--', branch], { cwd });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new GitForkError(
        `Failed to push to fork: ${message}`,
        GitForkErrorCode.PUSH_FAILED,
        err instanceof Error ? err : undefined
      );
    }
  }

  async createUpstreamPr(
    cwd: string,
    title: string,
    body: string,
    head: string,
    base: string
  ): Promise<UpstreamPrResult> {
    assertSafeGitRef(head, 'head');
    assertSafeGitRef(base, 'base');

    try {
      // Get the upstream repo identifier
      const { stdout: upstreamUrl } = await this.execFile(
        'git',
        ['remote', 'get-url', 'upstream'],
        { cwd }
      );
      const upstreamRepo = this.extractRepoFromUrl(upstreamUrl.trim());

      // Get the fork owner for the head ref (owner:branch format)
      const { stdout: forkUrl } = await this.execFile('git', ['remote', 'get-url', 'origin'], {
        cwd,
      });
      const forkRepo = this.extractRepoFromUrl(forkUrl.trim());
      const forkOwner = forkRepo.split('/')[0];

      const brandedBody = applyPrBranding(body);
      const { stdout } = await this.execFile(
        'gh',
        [
          'pr',
          'create',
          '--repo',
          upstreamRepo,
          '--title',
          title,
          '--body',
          brandedBody,
          '--head',
          `${forkOwner}:${head}`,
          '--base',
          base,
          '--json',
          'url,number',
        ],
        { cwd }
      );
      const result = JSON.parse(stdout);
      return { url: result.url, number: result.number };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new GitForkError(
        `Failed to create upstream PR: ${message}`,
        GitForkErrorCode.PR_CREATE_FAILED,
        err instanceof Error ? err : undefined
      );
    }
  }

  async getUpstreamPrStatus(upstreamRepo: string, prNumber: number): Promise<PrStatus> {
    try {
      const { stdout } = await this.execFile(
        'gh',
        ['pr', 'view', String(prNumber), '--repo', upstreamRepo, '--json', 'state'],
        {}
      );
      const result = JSON.parse(stdout);
      const state = ((result.state as string) ?? '').toUpperCase();
      if (state === 'MERGED') return PrStatus.Merged;
      if (state === 'CLOSED') return PrStatus.Closed;
      return PrStatus.Open;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new GitForkError(
        `Failed to get upstream PR status: ${message}`,
        GitForkErrorCode.PR_STATUS_FAILED,
        err instanceof Error ? err : undefined
      );
    }
  }

  /**
   * Extract owner/repo from a git remote URL.
   * Handles both HTTPS and SSH formats.
   */
  private extractRepoFromUrl(url: string): string {
    // SSH: git@github.com:owner/repo.git
    const sshMatch = url.match(/git@[^:]+:([^/]+\/[^/.]+)/);
    if (sshMatch) return sshMatch[1];
    // HTTPS: https://github.com/owner/repo.git
    const httpsMatch = url.match(/github\.com\/([^/]+\/[^/.]+)/);
    if (httpsMatch) return httpsMatch[1];
    // Strip .git suffix and return as-is
    return url.replace(/\.git$/, '');
  }
}
