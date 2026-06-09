/**
 * GitHub Repository Service Implementation
 *
 * Implements IGitHubRepositoryService using the gh CLI for authentication
 * checks, repository listing, cloning (with progress streaming), and URL parsing.
 */

import { injectable, inject } from 'tsyringe';
import { resolve, normalize } from 'node:path';
import { rm } from 'node:fs/promises';
import { spawn, type ChildProcess } from 'node:child_process';
import type { ExecFunction } from '../git/worktree.service.js';
import type {
  IGitHubRepositoryService,
  GitHubRepo,
  GitHubOrganization,
  ListUserRepositoriesOptions,
  CloneOptions,
  ParsedGitHubUrl,
  ForkOptions,
  PushAccessResult,
  ForkResult,
  GovernanceFinding,
} from '../../../application/ports/output/services/github-repository-service.interface.js';
import {
  GitHubAuthError,
  GitHubCloneError,
  GitHubForkError,
  GitHubPermissionError,
  GitHubRepoListError,
  GitHubUrlParseError,
  GovernanceFindingCategory,
} from '../../../application/ports/output/services/github-repository-service.interface.js';

// ---------------------------------------------------------------------------
// URL regex patterns
// ---------------------------------------------------------------------------

/** Matches https://github.com/owner/repo or https://github.com/owner/repo.git */
const HTTPS_PATTERN = /^https:\/\/github\.com\/([^/]+)\/([^/.]+?)(?:\.git)?$/;

/** Matches git@github.com:owner/repo.git */
const SSH_PATTERN = /^git@github\.com:([^/]+)\/([^/.]+?)(?:\.git)?$/;

/** Matches owner/repo shorthand (no slashes except the one separating owner/repo) */
const SHORTHAND_PATTERN = /^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/;

/** Default limit for listing repositories */
const DEFAULT_LIST_LIMIT = 30;

@injectable()
export class GitHubRepositoryService implements IGitHubRepositoryService {
  constructor(@inject('ExecFunction') private readonly execFile: ExecFunction) {}

  async checkAuth(): Promise<void> {
    try {
      // Use `gh auth token` instead of `gh auth status` because `gh auth status`
      // exits non-zero when *any* configured account has a stale token, even if
      // the active account is fully authenticated. `gh auth token` only checks the
      // active account and exits 0 as long as it has a valid token.
      await this.execFile('gh', ['auth', 'token']);
    } catch (error) {
      const cause = error instanceof Error ? error : undefined;
      const errnoCode = (error as NodeJS.ErrnoException)?.code;

      if (errnoCode === 'ENOENT') {
        throw new GitHubAuthError(
          'GitHub CLI (gh) is not installed. Install it from https://cli.github.com/',
          cause
        );
      }

      throw new GitHubAuthError(
        'GitHub CLI is not authenticated. Run `gh auth login` to sign in.',
        cause
      );
    }
  }

  async listUserRepositories(options?: ListUserRepositoriesOptions): Promise<GitHubRepo[]> {
    const limit = options?.limit ?? DEFAULT_LIST_LIMIT;
    const args = [
      'repo',
      'list',
      ...(options?.owner ? [options.owner] : []),
      '--json',
      'name,nameWithOwner,description,isPrivate,pushedAt',
      '--limit',
      String(limit),
    ];

    if (options?.search) {
      // gh repo list does not have a --match flag; use jq to filter by name
      const escaped = options.search.replace(/"/g, '\\"');
      args.push('-q', `[.[] | select(.name | test("${escaped}"; "i"))]`);
    }

    try {
      const { stdout } = await this.execFile('gh', args);
      return JSON.parse(stdout) as GitHubRepo[];
    } catch (error) {
      const cause = error instanceof Error ? error : undefined;
      const errnoCode = (error as NodeJS.ErrnoException)?.code;

      if (errnoCode === 'ENOENT') {
        throw new GitHubRepoListError(
          'GitHub CLI (gh) is not installed. Install it from https://cli.github.com/',
          cause
        );
      }

      throw new GitHubRepoListError(
        `Failed to list GitHub repositories: ${cause?.message ?? String(error)}`,
        cause
      );
    }
  }

  async listOrganizations(): Promise<GitHubOrganization[]> {
    try {
      const { stdout } = await this.execFile('gh', [
        'api',
        '/user/orgs',
        '--jq',
        '[.[] | {login: .login, description: (.description // "")}]',
      ]);
      return JSON.parse(stdout) as GitHubOrganization[];
    } catch (error) {
      const cause = error instanceof Error ? error : undefined;
      const errnoCode = (error as NodeJS.ErrnoException)?.code;

      if (errnoCode === 'ENOENT') {
        throw new GitHubRepoListError(
          'GitHub CLI (gh) is not installed. Install it from https://cli.github.com/',
          cause
        );
      }

      throw new GitHubRepoListError(
        `Failed to list GitHub organizations: ${cause?.message ?? String(error)}`,
        cause
      );
    }
  }

  async cloneRepository(
    nameWithOwner: string,
    destination: string,
    options?: CloneOptions
  ): Promise<void> {
    // Validate destination path — reject path traversal
    const resolved = resolve(destination);
    const normalized = normalize(resolved);
    if (normalized !== resolved || destination.includes('..')) {
      throw new GitHubCloneError(
        `Invalid clone destination: path traversal detected in "${destination}"`
      );
    }

    return new Promise<void>((resolvePromise, reject) => {
      const child: ChildProcess = spawn('gh', ['repo', 'clone', nameWithOwner, resolved], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stderrOutput = '';

      child.stderr?.on('data', (chunk: Buffer) => {
        const data = chunk.toString();
        stderrOutput += data;
        options?.onProgress?.(data);
      });

      child.stdout?.on('data', (chunk: Buffer) => {
        const data = chunk.toString();
        options?.onProgress?.(data);
      });

      child.on('error', async (error: Error) => {
        await this.cleanupPartialClone(resolved);
        reject(new GitHubCloneError(`Failed to clone ${nameWithOwner}: ${error.message}`, error));
      });

      child.on('close', async (code: number | null) => {
        if (code === 0) {
          resolvePromise();
        } else {
          await this.cleanupPartialClone(resolved);
          reject(
            new GitHubCloneError(
              `Clone of ${nameWithOwner} failed with exit code ${code}: ${stderrOutput.trim()}`
            )
          );
        }
      });
    });
  }

  parseGitHubUrl(url: string): ParsedGitHubUrl {
    const trimmed = url.trim();
    if (!trimmed) {
      throw new GitHubUrlParseError('URL cannot be empty');
    }

    // Try HTTPS format
    const httpsMatch = trimmed.match(HTTPS_PATTERN);
    if (httpsMatch) {
      return {
        owner: httpsMatch[1],
        repo: httpsMatch[2],
        nameWithOwner: `${httpsMatch[1]}/${httpsMatch[2]}`,
      };
    }

    // Try SSH format
    const sshMatch = trimmed.match(SSH_PATTERN);
    if (sshMatch) {
      return {
        owner: sshMatch[1],
        repo: sshMatch[2],
        nameWithOwner: `${sshMatch[1]}/${sshMatch[2]}`,
      };
    }

    // Try shorthand format (must be last — it's the loosest pattern)
    const shorthandMatch = trimmed.match(SHORTHAND_PATTERN);
    if (shorthandMatch) {
      return {
        owner: shorthandMatch[1],
        repo: shorthandMatch[2],
        nameWithOwner: `${shorthandMatch[1]}/${shorthandMatch[2]}`,
      };
    }

    throw new GitHubUrlParseError(
      `Unrecognized GitHub URL format: "${trimmed}". ` +
        'Supported formats: https://github.com/owner/repo, ' +
        'git@github.com:owner/repo.git, or owner/repo shorthand.'
    );
  }

  async getViewerPermission(repoPath: string): Promise<string> {
    try {
      const { stdout } = await this.execFile('gh', ['repo', 'view', '--json', 'viewerPermission'], {
        cwd: repoPath,
      });
      const parsed = JSON.parse(stdout) as { viewerPermission: string };
      return parsed.viewerPermission;
    } catch (error) {
      const cause = error instanceof Error ? error : undefined;
      const errnoCode = (error as NodeJS.ErrnoException)?.code;

      if (errnoCode === 'ENOENT') {
        throw new GitHubPermissionError(
          'GitHub CLI (gh) is not installed. Install it from https://cli.github.com/',
          cause
        );
      }

      throw new GitHubPermissionError(
        `Failed to check repository permission: ${cause?.message ?? String(error)}`,
        cause
      );
    }
  }

  async getAuthenticatedUser(): Promise<string> {
    try {
      const { stdout } = await this.execFile('gh', ['api', 'user', '--jq', '.login']);
      return stdout.trim();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      throw new GitHubAuthError(`Failed to get authenticated user: ${err.message}`, err);
    }
  }

  async checkPushAccess(nameWithOwner: string): Promise<PushAccessResult> {
    try {
      const viewerLogin = await this.getAuthenticatedUser();
      const { stdout } = await this.execFile('gh', [
        'api',
        `repos/${nameWithOwner}`,
        '--jq',
        '.permissions.push',
      ]);
      return {
        hasPushAccess: stdout.trim() === 'true',
        viewerLogin,
      };
    } catch (error) {
      if (error instanceof GitHubAuthError) throw error;
      const err = error instanceof Error ? error : new Error(String(error));
      throw new GitHubPermissionError(
        `Failed to check push access for ${nameWithOwner}: ${err.message}`,
        err
      );
    }
  }

  async forkRepository(nameWithOwner: string, options?: ForkOptions): Promise<ForkResult> {
    try {
      options?.onProgress?.(`Forking ${nameWithOwner}...`);
      const { stdout, stderr } = await this.execFile('gh', [
        'repo',
        'fork',
        nameWithOwner,
        '--clone=false',
      ]);
      const combined = `${stdout}\n${stderr}`;
      const alreadyExisted = combined.toLowerCase().includes('already exists');

      // Extract fork nameWithOwner from output
      // gh repo fork outputs the fork URL like "https://github.com/user/repo"
      const urlMatch = combined.match(/github\.com\/([^\s/]+\/[^\s/]+)/);
      const forkNwo = urlMatch ? urlMatch[1].replace(/\.git$/, '') : nameWithOwner;

      options?.onProgress?.(alreadyExisted ? 'Using existing fork' : 'Fork created');
      return { nameWithOwner: forkNwo, alreadyExisted };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      throw new GitHubForkError(`Failed to fork ${nameWithOwner}: ${err.message}`, err);
    }
  }

  async auditRepositoryGovernance(
    owner: string,
    repo: string,
    defaultBranch = 'main'
  ): Promise<GovernanceFinding[]> {
    const findings: GovernanceFinding[] = [];

    // Check branch protection
    const branchFindings = await this.checkBranchProtection(owner, repo, defaultBranch);
    findings.push(...branchFindings);

    // Check CODEOWNERS presence
    const codeownersFindings = await this.checkCodeowners(owner, repo);
    findings.push(...codeownersFindings);

    return findings;
  }

  private async checkBranchProtection(
    owner: string,
    repo: string,
    branch: string
  ): Promise<GovernanceFinding[]> {
    try {
      const { stdout } = await this.execFile('gh', [
        'api',
        `/repos/${owner}/${repo}/branches/${branch}/protection`,
      ]);
      const protection = JSON.parse(stdout);

      // Protection exists — check for PR review requirements
      if (!protection.required_pull_request_reviews) {
        return [
          {
            category: GovernanceFindingCategory.BranchProtection,
            severity: 'Medium',
            message: `Branch "${branch}" has protection enabled but does not require pull request reviews.`,
            remediation: `Enable "Require a pull request before merging" in branch protection settings for "${branch}".`,
          },
        ];
      }

      return [];
    } catch (error) {
      return this.handleGovernanceCheckError(
        error,
        GovernanceFindingCategory.BranchProtection,
        `Branch "${branch}" has no branch protection rules configured.`,
        `Enable branch protection for "${branch}" in repository settings. Require pull request reviews and status checks.`
      );
    }
  }

  private async checkCodeowners(owner: string, repo: string): Promise<GovernanceFinding[]> {
    // CODEOWNERS can live in repo root or .github/ directory
    const paths = [
      `/repos/${owner}/${repo}/contents/CODEOWNERS`,
      `/repos/${owner}/${repo}/contents/.github/CODEOWNERS`,
    ];

    for (const path of paths) {
      try {
        await this.execFile('gh', ['api', path]);
        // Found CODEOWNERS — no finding needed
        return [];
      } catch {
        // Not found at this path — try next
      }
    }

    // Neither location found
    return [
      {
        category: GovernanceFindingCategory.Codeowners,
        severity: 'Medium',
        message: 'No CODEOWNERS file found in the repository.',
        remediation:
          'Add a CODEOWNERS file to the repository root or .github/ directory to enforce code review ownership.',
      },
    ];
  }

  /**
   * Handle errors from governance API calls gracefully.
   * 404 errors are treated as findings (missing config).
   * Auth/permission errors are treated as Unknown severity findings.
   */
  private handleGovernanceCheckError(
    error: unknown,
    category: GovernanceFindingCategory,
    notFoundMessage: string,
    notFoundRemediation: string
  ): GovernanceFinding[] {
    const errMessage = error instanceof Error ? error.message : String(error);
    const errnoCode = (error as NodeJS.ErrnoException)?.code;

    // gh not installed
    if (errnoCode === 'ENOENT') {
      return [
        {
          category,
          severity: 'Unknown',
          message: 'GitHub CLI (gh) is not installed. Cannot audit repository governance.',
          remediation: 'Install the GitHub CLI from https://cli.github.com/',
        },
      ];
    }

    // 404 = resource not configured (branch protection, file missing, etc.)
    if (errMessage.includes('404')) {
      return [
        {
          category,
          severity: 'High',
          message: notFoundMessage,
          remediation: notFoundRemediation,
        },
      ];
    }

    // Auth/permission errors or other unexpected failures — return Unknown finding
    return [
      {
        category,
        severity: 'Unknown',
        message: `Unable to audit ${category}: ${errMessage}`,
        remediation:
          'Verify that the GitHub CLI is authenticated with sufficient permissions. Run `gh auth login`.',
      },
    ];
  }

  private async cleanupPartialClone(destination: string): Promise<void> {
    try {
      await rm(destination, { recursive: true, force: true });
    } catch {
      // Cleanup is best-effort
    }
  }
}
