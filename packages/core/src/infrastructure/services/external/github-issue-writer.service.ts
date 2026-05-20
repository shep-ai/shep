/**
 * GitHub Issue Writer Service
 *
 * Octokit-backed implementation of `IGitHubIssueWriter`. Reuses the
 * existing GitHub-integration token (resolved by `gh auth token` — same path
 * `IGitHubRepositoryService` uses) so no new auth flow or token storage is
 * introduced (NFR-10).
 *
 * Resilience: the production factory composes `@octokit/rest` with the
 * retry and throttling plugins. Retry handles transient 5xx and abuse-rate-
 * limit (Retry-After). Throttling pauses requests proactively when primary
 * or secondary rate-limit budgets are near exhaustion.
 */

import { promisify } from 'node:util';
import { execFile as execFileCb } from 'node:child_process';
import { injectable } from 'tsyringe';
import { Octokit } from '@octokit/rest';
import { retry } from '@octokit/plugin-retry';
import { throttling } from '@octokit/plugin-throttling';

import {
  GitHubIssueWriterError,
  type IGitHubIssueWriter,
  type IssueRef,
} from '../../../application/ports/output/services/github-issue-writer.interface.js';

/**
 * Minimal Octokit shape this adapter touches. Defined in terms of methods so
 * tests can substitute a hand-rolled double without pulling Octokit's full
 * generated types into the test surface.
 */
export interface OctokitLike {
  issues: {
    addLabels(params: {
      owner: string;
      repo: string;
      issue_number: number;
      labels: readonly string[];
    }): Promise<unknown>;
    removeLabel(params: {
      owner: string;
      repo: string;
      issue_number: number;
      name: string;
    }): Promise<unknown>;
    createComment(params: {
      owner: string;
      repo: string;
      issue_number: number;
      body: string;
    }): Promise<unknown>;
    addAssignees(params: {
      owner: string;
      repo: string;
      issue_number: number;
      assignees: readonly string[];
    }): Promise<unknown>;
  };
}

/**
 * Constructs an Octokit-shaped client given a resolved bearer token.
 * The default factory composes retry + throttling plugins.
 */
export type OctokitFactory = (options: { auth: string }) => OctokitLike;

/**
 * Resolves the bearer token from the existing GitHub-integration code path
 * (i.e. `gh auth token`). Returns the raw token string.
 */
export type TokenResolver = () => Promise<string>;

const NOOP_LOG = (): void => undefined;

const RETRY_THROTTLED_OCTOKIT = Octokit.plugin(retry, throttling);

/**
 * Default production factory — composes retry + throttling. Tests inject a
 * stub factory instead so they never hit the network.
 */
export const defaultOctokitFactory: OctokitFactory = ({ auth }) =>
  new RETRY_THROTTLED_OCTOKIT({
    auth,
    throttle: {
      onRateLimit: () => true,
      onSecondaryRateLimit: () => true,
    },
  }) as unknown as OctokitLike;

/**
 * Default token resolver — shells out to `gh auth token` exactly like
 * `IGitHubRepositoryService.checkAuth` does. Reuses any token already
 * configured by the user (no new auth flow per NFR-10).
 */
export const defaultTokenResolver: TokenResolver = async () => {
  const execFile = promisify(execFileCb);
  const { stdout } = await execFile('gh', ['auth', 'token']);
  const token = stdout.trim();
  if (!token) {
    throw new Error('gh auth token returned empty output — run `gh auth login`');
  }
  return token;
};

interface ErrorWithStatus {
  status?: number;
}

function isNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as ErrorWithStatus).status === 404;
}

function wrap(message: string, cause: unknown): GitHubIssueWriterError {
  const causeError = cause instanceof Error ? cause : new Error(String(cause));
  return new GitHubIssueWriterError(message, causeError);
}

@injectable()
export class GitHubIssueWriter implements IGitHubIssueWriter {
  private clientPromise: Promise<OctokitLike> | null = null;

  constructor(
    private readonly tokenResolver: TokenResolver = defaultTokenResolver,
    private readonly octokitFactory: OctokitFactory = defaultOctokitFactory
  ) {}

  async addLabels(ref: IssueRef, labels: readonly string[]): Promise<void> {
    if (labels.length === 0) return;
    const client = await this.client();
    try {
      await client.issues.addLabels({
        owner: ref.owner,
        repo: ref.repo,
        issue_number: ref.issueNumber,
        labels,
      });
    } catch (err) {
      throw wrap(`Failed to add labels to ${ref.owner}/${ref.repo}#${ref.issueNumber}`, err);
    }
  }

  async removeLabels(ref: IssueRef, labels: readonly string[]): Promise<void> {
    if (labels.length === 0) return;
    const client = await this.client();
    for (const name of labels) {
      try {
        await client.issues.removeLabel({
          owner: ref.owner,
          repo: ref.repo,
          issue_number: ref.issueNumber,
          name,
        });
      } catch (err) {
        if (isNotFound(err)) continue;
        throw wrap(
          `Failed to remove label "${name}" from ${ref.owner}/${ref.repo}#${ref.issueNumber}`,
          err
        );
      }
    }
  }

  async addComment(ref: IssueRef, body: string): Promise<void> {
    const client = await this.client();
    try {
      await client.issues.createComment({
        owner: ref.owner,
        repo: ref.repo,
        issue_number: ref.issueNumber,
        body,
      });
    } catch (err) {
      throw wrap(`Failed to comment on ${ref.owner}/${ref.repo}#${ref.issueNumber}`, err);
    }
  }

  async assignUsers(ref: IssueRef, logins: readonly string[]): Promise<void> {
    if (logins.length === 0) return;
    const client = await this.client();
    try {
      await client.issues.addAssignees({
        owner: ref.owner,
        repo: ref.repo,
        issue_number: ref.issueNumber,
        assignees: logins,
      });
    } catch (err) {
      throw wrap(`Failed to assign users to ${ref.owner}/${ref.repo}#${ref.issueNumber}`, err);
    }
  }

  private client(): Promise<OctokitLike> {
    this.clientPromise ??= this.tokenResolver()
      .then((auth) => this.octokitFactory({ auth }))
      .catch((err: unknown) => {
        this.clientPromise = null;
        throw wrap('Failed to resolve GitHub auth token for issue writer', err);
      });
    return this.clientPromise;
  }
}

// Reference NOOP_LOG so tree-shakers leave it intact when an adapter wants
// silent debug hooks; not used in the default code path.
void NOOP_LOG;
