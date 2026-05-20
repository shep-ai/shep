/**
 * `shep contributors welcome-pr` — invoked by the
 * `.github/workflows/welcome-first-time-contributor.yml` workflow on
 * `pull_request.opened`. Pure presentation: parses the GitHub event
 * payload, resolves `WelcomeFirstTimeContributorUseCase` via DI, prints a
 * one-line outcome, and maps any failure to a non-zero exit code.
 *
 * Environment:
 *   - GITHUB_EVENT_PATH: path to the JSON payload (set by Actions)
 *   - GITHUB_REPOSITORY: "owner/repo" slug (set by Actions)
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { WelcomeFirstTimeContributorUseCase } from '@/application/use-cases/contributors/welcome-first-time-contributor.use-case.js';
import { messages } from '../../ui/index.js';
import { loadGitHubEvent, readGitHubRepositoryEnv } from './load-github-event.js';

interface PullRequestEventPayload {
  pull_request: {
    number: number;
    user: {
      login: string;
      avatar_url?: string;
    };
  };
  repository?: {
    owner: { login: string };
    name: string;
  };
}

function parsePullRequestEvent(raw: unknown): PullRequestEventPayload {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Event payload is not an object.');
  }
  const event = raw as Partial<PullRequestEventPayload>;
  const pr = event.pull_request;
  if (!pr || typeof pr.number !== 'number' || !pr.user || typeof pr.user.login !== 'string') {
    throw new Error('Event payload is missing pull_request.user.login or pull_request.number.');
  }
  return event as PullRequestEventPayload;
}

export function createWelcomePrCommand(): Command {
  return new Command('welcome-pr')
    .description('Welcome a first-time contributor on pull_request.opened (GitHub Actions entry).')
    .addHelpText(
      'after',
      `
Examples:
  $ shep contributors welcome-pr                                                   Run from GitHub Actions event context
  $ GITHUB_EVENT_PATH=event.json shep contributors welcome-pr                       Read a local pull_request event payload
  $ GITHUB_EVENT_PATH=event.json GITHUB_REPOSITORY=shep-ai/shep shep contributors welcome-pr`
    )
    .action(async () => {
      try {
        const payload = parsePullRequestEvent(loadGitHubEvent());
        const repoFromEnv = readGitHubRepositoryEnv();
        const owner = repoFromEnv?.owner ?? payload.repository?.owner.login;
        const repo = repoFromEnv?.repo ?? payload.repository?.name;
        if (!owner || !repo) {
          throw new Error('Unable to resolve owner/repo from GITHUB_REPOSITORY or payload.');
        }

        const useCase = container.resolve(WelcomeFirstTimeContributorUseCase);
        const result = await useCase.execute({
          prRef: { owner, repo, issueNumber: payload.pull_request.number },
          authorLogin: payload.pull_request.user.login,
          authorAvatarUrl: payload.pull_request.user.avatar_url,
        });

        if (!result.firstTime) {
          messages.info(
            `@${payload.pull_request.user.login} is not a first-time contributor — skipping.`
          );
          return;
        }

        const note = result.commentPosted
          ? 'comment posted'
          : `comment skipped (${result.gateRationale})`;
        messages.success(
          `Welcomed first-time contributor @${payload.pull_request.user.login} on PR #${payload.pull_request.number} — ${note}.`
        );
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to welcome first-time contributor', err);
        process.exitCode = 1;
      }
    });
}
