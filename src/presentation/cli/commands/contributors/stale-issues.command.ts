/**
 * `shep contributors stale-issues` — lists good-first-issues with no activity
 * for longer than the threshold. Run by
 * `.github/workflows/contributor-maintenance.yml` on a schedule; it used to
 * run as a watcher inside every user's daemon (spec 097, FR-42).
 *
 * Environment:
 *   - GITHUB_REPOSITORY: "owner/repo" slug, used when --repo is omitted
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { DetectStaleGoodFirstIssueUseCase } from '@/application/use-cases/contributors/detect-stale-good-first-issue.use-case.js';
import { messages } from '../../ui/index.js';
import { readGitHubRepositoryEnv } from './load-github-event.js';
import { parseRepositorySlug } from './repository-slug.js';

interface StaleIssuesOptions {
  repo?: string;
  days?: string;
}

export function createStaleIssuesCommand(): Command {
  return new Command('stale-issues')
    .description('List good-first-issues with no recent activity (maintainer workflow entry).')
    .option('-r, --repo <owner/repo>', 'Repository to check (default: $GITHUB_REPOSITORY)')
    .option('-d, --days <n>', 'Days without activity before an issue counts as stale')
    .addHelpText(
      'after',
      `
Examples:
  $ shep contributors stale-issues --repo shep-ai/shep
  $ shep contributors stale-issues --repo shep-ai/shep --days 45
  $ GITHUB_REPOSITORY=shep-ai/shep shep contributors stale-issues`
    )
    .action(async (options: StaleIssuesOptions) => {
      try {
        const target = options.repo ? parseRepositorySlug(options.repo) : readGitHubRepositoryEnv();
        if (!target) {
          throw new Error('Pass --repo owner/repo or set GITHUB_REPOSITORY.');
        }
        const staleDays = options.days === undefined ? undefined : Number(options.days);
        if (staleDays !== undefined && (!Number.isInteger(staleDays) || staleDays <= 0)) {
          throw new Error(`--days must be a positive whole number, got "${options.days}".`);
        }

        const useCase = container.resolve(DetectStaleGoodFirstIssueUseCase);
        const result = await useCase.execute({ owner: target.owner, repo: target.repo, staleDays });

        if (result.stale.length === 0) {
          messages.success(
            `No good-first-issues in ${target.owner}/${target.repo} are older than ${result.thresholdDays} days.`
          );
          return;
        }
        messages.info(
          `${result.stale.length} good-first-issue(s) in ${target.owner}/${target.repo} have had no activity for over ${result.thresholdDays} days:`
        );
        for (const issue of result.stale) {
          console.log(
            `- #${issue.issueNumber} ${issue.title} (${issue.staleForDays} days) ${issue.url}`
          );
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to check for stale good-first-issues', err);
        process.exitCode = 1;
      }
    });
}
