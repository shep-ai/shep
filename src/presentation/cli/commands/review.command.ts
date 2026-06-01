/**
 * Review Command
 *
 * AI-powered code review for GitHub pull requests.
 * Triggers a review, displays completed reviews, or lists recent reviews.
 *
 * Usage:
 *   shep review <target>         Trigger a new code review
 *   shep review show <id>        Display a completed review
 *   shep review list             List recent reviews
 *   shep review post <id>        Post a review to GitHub
 *
 * <target> can be:
 *   - A PR number (requires --owner and --repo, or a local git remote)
 *   - A PR URL (https://github.com/owner/repo/pull/42)
 *
 * @example
 * $ shep review 42
 * $ shep review https://github.com/org/repo/pull/42
 * $ shep review show abc12345
 * $ shep review list
 * $ shep review post abc12345
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import {
  RunCodeReviewUseCase,
  parsePrUrl,
} from '@/application/use-cases/code-review/run-code-review.use-case.js';
import { GetCodeReviewUseCase } from '@/application/use-cases/code-review/get-code-review.use-case.js';
import { ListCodeReviewsUseCase } from '@/application/use-cases/code-review/list-code-reviews.use-case.js';
import { PostCodeReviewUseCase } from '@/application/use-cases/code-review/post-code-review.use-case.js';
import type { CodeReview, ReviewComment } from '@/domain/generated/output.js';
import { CodeReviewStatus } from '@/domain/generated/output.js';
import type { IGitPrService } from '@/application/ports/output/services/git-pr-service.interface.js';
import type { IGitHubRepositoryService } from '@/application/ports/output/services/github-repository-service.interface.js';
import {
  colors,
  symbols,
  messages,
  spinner,
  renderDetailView,
  renderListView,
} from '../ui/index.js';
import { getCliI18n } from '../i18n.js';

// ---------------------------------------------------------------------------
// Status formatting
// ---------------------------------------------------------------------------

function formatReviewStatus(status: CodeReviewStatus): string {
  switch (status) {
    case CodeReviewStatus.Pending:
      return `${colors.muted(symbols.dotEmpty)} ${colors.muted('Pending')}`;
    case CodeReviewStatus.InProgress:
      return `${colors.info(symbols.spinner[0])} ${colors.info('In Progress')}`;
    case CodeReviewStatus.Completed:
      return `${colors.success(symbols.success)} ${colors.success('Completed')}`;
    case CodeReviewStatus.Posted:
      return `${colors.success(symbols.success)} ${colors.success('Posted')}`;
    case CodeReviewStatus.Failed:
      return `${colors.error(symbols.error)} ${colors.error('Failed')}`;
    default:
      return colors.muted(String(status));
  }
}

// ---------------------------------------------------------------------------
// Findings rendering (shared between default action and show subcommand)
// ---------------------------------------------------------------------------

/**
 * Render review findings grouped by file path.
 * Each finding shows: line number, body, and optional suggestion.
 */
function renderFindings(comments: ReviewComment[]): void {
  if (comments.length === 0) {
    messages.info('No findings.');
    return;
  }

  // Group comments by file path
  const byFile = new Map<string, ReviewComment[]>();
  for (const c of comments) {
    const list = byFile.get(c.path) ?? [];
    list.push(c);
    byFile.set(c.path, list);
  }

  for (const [filePath, fileComments] of byFile) {
    console.log(`  ${colors.accent(filePath)}`);
    for (const c of fileComments) {
      const lineLabel = colors.muted(`L${c.line}`);
      const rangeIndicator = c.inDiffRange ? '' : ` ${colors.warning('(outside diff)')}`;
      console.log(`    ${lineLabel}${rangeIndicator}  ${c.body}`);

      if (c.suggestion) {
        console.log(colors.muted('    suggestion:'));
        for (const line of c.suggestion.split('\n')) {
          console.log(`      ${colors.success(`+ ${line}`)}`);
        }
      }
    }
    console.log('');
  }
}

// ---------------------------------------------------------------------------
// Resolve owner/repo from local git remote
// ---------------------------------------------------------------------------

/**
 * Try to resolve owner/repo from the git remote origin of the given cwd.
 * Returns null if unable to determine.
 */
async function resolveOwnerRepoFromGit(
  cwd: string
): Promise<{ owner: string; repo: string } | null> {
  try {
    const gitPrService = container.resolve<IGitPrService>('IGitPrService');
    const remoteUrl = await gitPrService.getRemoteUrl(cwd);
    if (!remoteUrl) return null;

    const gitHubService = container.resolve<IGitHubRepositoryService>('IGitHubRepositoryService');
    const parsed = gitHubService.parseGitHubUrl(remoteUrl);
    return { owner: parsed.owner, repo: parsed.repo };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Command factory
// ---------------------------------------------------------------------------

interface ReviewOptions {
  owner?: string;
  repo?: string;
  post?: boolean;
}

export function createReviewCommand(): Command {
  const t = getCliI18n().t;

  const reviewCmd = new Command('review')
    .description(t('cli:commands.codeReview.description'))
    .argument('[target]', t('cli:commands.codeReview.targetArgument'))
    .option('--owner <owner>', t('cli:commands.codeReview.ownerOption'))
    .option('--repo <repo>', t('cli:commands.codeReview.repoOption'))
    .option('--post', t('cli:commands.codeReview.postOption'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep review 42
  $ shep review https://github.com/org/repo/pull/42
  $ shep review show abc12345
  $ shep review list
  $ shep review post abc12345`
    )
    .action(async (target: string | undefined, options: ReviewOptions) => {
      if (!target) {
        reviewCmd.help();
        return;
      }

      try {
        // Determine owner/repo
        let owner = options.owner;
        let repo = options.repo;
        const cwd = process.cwd();

        // If target is a URL, extract owner/repo from it
        const urlParsed = parsePrUrl(target);
        if (urlParsed) {
          owner = urlParsed.owner;
          repo = urlParsed.repo;
        }

        // If still missing, try to resolve from git remote
        if (!owner || !repo) {
          const fromGit = await resolveOwnerRepoFromGit(cwd);
          if (fromGit) {
            owner = owner ?? fromGit.owner;
            repo = repo ?? fromGit.repo;
          }
        }

        // Run the review
        const useCase = container.resolve(RunCodeReviewUseCase);

        messages.newline();
        console.log(`  ${symbols.info} ${t('cli:commands.codeReview.reviewingPr', { target })}`);

        const result = await spinner(t('cli:commands.codeReview.spinnerText'), () =>
          useCase.execute({
            target,
            owner,
            repo,
            repositoryPath: cwd,
          })
        );

        if (!result.ok) {
          messages.error(t('cli:commands.codeReview.reviewFailed'), new Error(result.error));
          process.exitCode = 1;
          return;
        }

        const review = result.review;
        messages.success(
          t('cli:commands.codeReview.reviewCompleted', {
            comments: String(review.comments?.length ?? 0),
          })
        );

        // Show summary
        if (review.summary) {
          messages.newline();
          console.log(`  ${review.summary}`);
        }

        // Show findings
        if (review.comments && review.comments.length > 0) {
          messages.newline();
          renderFindings(review.comments);
        }

        // Auto-post if --post flag is set
        if (options.post && review.status === CodeReviewStatus.Completed) {
          messages.newline();
          try {
            const postUseCase = container.resolve(PostCodeReviewUseCase);
            const posted = await spinner(t('cli:commands.codeReview.postingReview'), () =>
              postUseCase.execute(review.id)
            );
            messages.success(
              t('cli:commands.codeReview.postedSuccess', {
                url: posted.reviewUrl ?? '',
              })
            );
          } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            messages.error(t('cli:commands.codeReview.postFailed'), err);
          }
        } else if (!options.post && review.comments && review.comments.length > 0) {
          // Hint about posting
          const shortId = review.id.slice(0, 8);
          console.log(colors.muted(`  ${t('cli:commands.codeReview.postHint', { id: shortId })}`));
        }

        messages.newline();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.codeReview.failedToReview'), err);
        process.exitCode = 1;
      }
    });

  // -------------------------------------------------------------------------
  // show subcommand
  // -------------------------------------------------------------------------

  reviewCmd.addCommand(
    new Command('show')
      .description(t('cli:commands.codeReview.show.description'))
      .argument('<id>', t('cli:commands.codeReview.show.idArgument'))
      .action(async (id: string) => {
        try {
          const useCase = container.resolve(GetCodeReviewUseCase);
          const review = await useCase.execute(id);

          renderReviewDetail(review);
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          messages.error(t('cli:commands.codeReview.show.failedToShow'), err);
          process.exitCode = 1;
        }
      })
  );

  // -------------------------------------------------------------------------
  // list subcommand
  // -------------------------------------------------------------------------

  reviewCmd.addCommand(
    new Command('list')
      .description(t('cli:commands.codeReview.list.description'))
      .option('-n, --limit <n>', t('cli:commands.codeReview.list.limitOption'), '20')
      .action(async (options: { limit: string }) => {
        try {
          const useCase = container.resolve(ListCodeReviewsUseCase);
          const cwd = process.cwd();
          const reviews = await useCase.execute({
            repositoryPath: cwd,
            limit: parseInt(options.limit, 10) || 20,
          });

          renderListView({
            title: t('cli:commands.codeReview.list.title'),
            columns: [
              { label: t('cli:commands.codeReview.list.idColumn'), width: 10 },
              { label: t('cli:commands.codeReview.list.prColumn'), width: 8 },
              { label: t('cli:commands.codeReview.list.statusColumn'), width: 14 },
              { label: t('cli:commands.codeReview.list.commentsColumn'), width: 10 },
              { label: t('cli:commands.codeReview.list.dateColumn'), width: 20 },
            ],
            rows: reviews.map((r) => [
              r.id.slice(0, 8),
              `#${r.prNumber}`,
              formatReviewStatus(r.status),
              String(r.comments?.length ?? 0),
              formatDate(r.createdAt),
            ]),
            emptyMessage: t('cli:commands.codeReview.list.noReviews'),
          });
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          messages.error(t('cli:commands.codeReview.list.failedToList'), err);
          process.exitCode = 1;
        }
      })
  );

  // -------------------------------------------------------------------------
  // post subcommand
  // -------------------------------------------------------------------------

  reviewCmd.addCommand(
    new Command('post')
      .description(t('cli:commands.codeReview.post.description'))
      .argument('<id>', t('cli:commands.codeReview.post.idArgument'))
      .action(async (id: string) => {
        try {
          const useCase = container.resolve(PostCodeReviewUseCase);

          const review = await spinner(t('cli:commands.codeReview.postingReview'), () =>
            useCase.execute(id)
          );

          messages.success(
            t('cli:commands.codeReview.postedSuccess', {
              url: review.reviewUrl ?? '',
            })
          );
          messages.newline();
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          messages.error(t('cli:commands.codeReview.post.failedToPost'), err);
          process.exitCode = 1;
        }
      })
  );

  return reviewCmd;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(date: unknown): string {
  if (date instanceof Date) return date.toLocaleDateString();
  if (typeof date === 'string' || typeof date === 'number')
    return new Date(date).toLocaleDateString();
  return '';
}

/**
 * Render a full review detail view using the shared renderDetailView utility.
 */
function renderReviewDetail(review: CodeReview): void {
  const t = getCliI18n().t;

  const textBlocks = [];

  // Summary text block
  if (review.summary) {
    textBlocks.push({
      title: t('cli:commands.codeReview.show.summaryTitle'),
      content: review.summary,
    });
  }

  // Error text block
  if (review.errorMessage) {
    textBlocks.push({
      title: t('cli:commands.codeReview.show.errorTitle'),
      content: review.errorMessage,
      color: colors.error,
    });
  }

  renderDetailView({
    title: t('cli:commands.codeReview.show.title', { pr: String(review.prNumber) }),
    sections: [
      {
        fields: [
          {
            label: t('cli:commands.codeReview.show.idLabel'),
            value: review.id,
          },
          {
            label: t('cli:commands.codeReview.show.prLabel'),
            value: review.prUrl ?? `#${review.prNumber}`,
          },
          {
            label: t('cli:commands.codeReview.show.statusLabel'),
            value: formatReviewStatus(review.status),
          },
          {
            label: t('cli:commands.codeReview.show.commentsLabel'),
            value: String(review.comments?.length ?? 0),
          },
          {
            label: t('cli:commands.codeReview.show.modelLabel'),
            value: review.agentModel ?? null,
          },
          {
            label: t('cli:commands.codeReview.show.reviewUrlLabel'),
            value: review.reviewUrl ?? null,
          },
          {
            label: t('cli:commands.codeReview.show.createdLabel'),
            value: formatDate(review.createdAt),
          },
        ],
      },
    ],
    textBlocks,
  });

  // Show findings after the detail view
  if (review.comments && review.comments.length > 0) {
    messages.newline();
    console.log(`  ${colors.muted(t('cli:commands.codeReview.show.findingsTitle'))}`);
    messages.newline();
    renderFindings(review.comments);
  }
}
