/**
 * GitHub Issue Fetcher Service
 *
 * Adapter implementing `IExternalIssueFetcher` against the `gh` CLI.
 * GitHub-specific methods shell out to `gh`; `fetchJiraTicket` is not
 * supported by this adapter and throws `IssueServiceUnavailableError`.
 *
 * Supports owner/repo#number and #number (current repo) formats.
 */

import { inject, injectable } from 'tsyringe';

import type {
  IExternalIssueFetcher,
  ExternalIssue,
  ExternalIssueSummary,
} from '@/application/ports/output/services/external-issue-fetcher.interface.js';
import {
  IssueNotFoundError,
  IssueServiceUnavailableError,
} from '@/application/ports/output/services/external-issue-fetcher.interface.js';

type ExecFileFn = (
  cmd: string,
  args: string[],
  options?: object
) => Promise<{ stdout: string; stderr?: string }>;

const GH_TIMEOUT_MS = 30_000;

@injectable()
export class GitHubIssueFetcher implements IExternalIssueFetcher {
  constructor(@inject('ExecFunction') private readonly execFile: ExecFileFn) {}

  async fetchGitHubIssue(ref: string): Promise<ExternalIssue> {
    const { issueNumber, repo } = this.parseRef(ref);
    const args = ['issue', 'view', issueNumber];
    if (repo) {
      args.push('--repo', repo);
    }
    args.push('--json', 'title,body,labels,url');

    try {
      const { stdout } = await this.execFile('gh', args, { timeout: GH_TIMEOUT_MS });
      const data = JSON.parse(stdout) as {
        title: string;
        body: string | null;
        labels: { name: string }[];
        url: string;
      };

      return {
        title: data.title,
        description: data.body ?? '',
        labels: data.labels.map((l) => l.name),
        url: data.url,
        source: 'github',
      };
    } catch (err: unknown) {
      throw this.translateError(err, `GitHub issue ${ref}`);
    }
  }

  async fetchJiraTicket(_key: string): Promise<ExternalIssue> {
    throw new IssueServiceUnavailableError(
      'Jira fetching is not configured for this Shep instance. Configure a Jira adapter to enable it.'
    );
  }

  async getMergedPrCount(owner: string, repo: string, login: string): Promise<number> {
    const args = [
      'pr',
      'list',
      '--repo',
      `${owner}/${repo}`,
      '--state',
      'merged',
      '--author',
      login,
      '--limit',
      '1000',
      '--json',
      'number',
    ];

    try {
      const { stdout } = await this.execFile('gh', args, { timeout: GH_TIMEOUT_MS });
      const items = JSON.parse(stdout || '[]') as { number: number }[];
      return items.length;
    } catch (err: unknown) {
      throw this.translateError(err, `merged PR count for ${login} in ${owner}/${repo}`);
    }
  }

  async listIssuesByLabel(
    owner: string,
    repo: string,
    label: string
  ): Promise<ExternalIssueSummary[]> {
    return this.listIssuesByLabels(owner, repo, [label]);
  }

  async listIssuesByLabels(
    owner: string,
    repo: string,
    labels: readonly string[]
  ): Promise<ExternalIssueSummary[]> {
    if (labels.length === 0) return [];
    const args = [
      'issue',
      'list',
      '--repo',
      `${owner}/${repo}`,
      '--state',
      'open',
      '--label',
      labels.join(','),
      '--limit',
      '200',
      '--json',
      'number,title,labels,updatedAt,url',
    ];

    try {
      const { stdout } = await this.execFile('gh', args, { timeout: GH_TIMEOUT_MS });
      const items = JSON.parse(stdout || '[]') as {
        number: number;
        title: string;
        labels: { name: string }[];
        updatedAt: string;
        url: string;
      }[];
      return items.map((i) => ({
        owner,
        repo,
        issueNumber: i.number,
        title: i.title,
        labels: i.labels.map((l) => l.name),
        lastActivityAt: i.updatedAt,
        url: i.url,
      }));
    } catch (err: unknown) {
      throw this.translateError(
        err,
        `issues with labels [${labels.join(',')}] in ${owner}/${repo}`
      );
    }
  }

  private parseRef(ref: string): { issueNumber: string; repo?: string } {
    const fullMatch = ref.match(/^([^#]+)#(\d+)$/);
    if (fullMatch) {
      return { issueNumber: fullMatch[2], repo: fullMatch[1] };
    }
    const hashMatch = ref.match(/^#(\d+)$/);
    if (hashMatch) {
      return { issueNumber: hashMatch[1] };
    }
    if (/^\d+$/.test(ref)) {
      return { issueNumber: ref };
    }
    throw new IssueNotFoundError(`Invalid GitHub issue reference: ${ref}`);
  }

  private translateError(err: unknown, context: string): Error {
    const error = err instanceof Error ? err : new Error(String(err));
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return new IssueServiceUnavailableError(
        'GitHub CLI (gh) is not installed. Install it from https://cli.github.com/'
      );
    }
    if (error.message.includes('Could not resolve')) {
      return new IssueNotFoundError(`${context} not found`);
    }
    return new IssueNotFoundError(`Failed to fetch ${context}: ${error.message}`);
  }
}
