/**
 * `shep contributors groom-issue` — invoked by the
 * `.github/workflows/label-by-lane.yml` workflow on `issues.opened`.
 *
 * Pure presentation: parses the GitHub event payload, runs
 * `GroomIssueUseCase` to derive the structured recommendation
 * (lane / difficulty / acceptance criteria / suggested labels), then
 * funnels the proposed labels through `IContributorActionGate` and
 * applies them via `IGitHubIssueWriter` only when the gate approves.
 *
 * Environment:
 *   - GITHUB_EVENT_PATH: path to the JSON payload (set by Actions)
 *   - GITHUB_REPOSITORY: "owner/repo" slug (set by Actions)
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { GroomIssueUseCase } from '@/application/use-cases/contributors/groom-issue.use-case.js';
import type { IGitHubIssueWriter } from '@/application/ports/output/services/github-issue-writer.interface.js';
import type { IContributorActionGate } from '@/application/ports/output/services/contributor-action-gate.interface.js';
import { messages } from '../../ui/index.js';
import { loadGitHubEvent, readGitHubRepositoryEnv } from './load-github-event.js';

interface IssuesEventPayload {
  issue: { number: number };
  repository?: { owner: { login: string }; name: string };
}

function parseIssuesEvent(raw: unknown): IssuesEventPayload {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Event payload is not an object.');
  }
  const event = raw as Partial<IssuesEventPayload>;
  if (!event.issue || typeof event.issue.number !== 'number') {
    throw new Error('Event payload is missing issue.number.');
  }
  return event as IssuesEventPayload;
}

export function createGroomIssueCommand(): Command {
  return new Command('groom-issue')
    .description('Groom a newly opened GitHub issue (GitHub Actions entry).')
    .action(async () => {
      try {
        const payload = parseIssuesEvent(loadGitHubEvent());
        const repoFromEnv = readGitHubRepositoryEnv();
        const owner = repoFromEnv?.owner ?? payload.repository?.owner.login;
        const repo = repoFromEnv?.repo ?? payload.repository?.name;
        if (!owner || !repo) {
          throw new Error('Unable to resolve owner/repo from GITHUB_REPOSITORY or payload.');
        }

        const issueNumber = payload.issue.number;
        const useCase = container.resolve(GroomIssueUseCase);
        const recommendation = await useCase.execute({ ref: `${owner}/${repo}#${issueNumber}` });

        messages.info(
          `Groomed issue #${issueNumber} → lane=${recommendation.lane}, difficulty=${recommendation.difficulty}.`
        );

        const gate = container.resolve<IContributorActionGate>('IContributorActionGate');
        const decision = await gate.gate({
          kind: 'github-label',
          summary: `Apply ${recommendation.suggestedLabels.length} grooming label(s) to ${owner}/${repo}#${issueNumber}`,
          context: {
            owner,
            repo,
            issueNumber,
            labels: recommendation.suggestedLabels,
          },
        });

        if (!decision.approved) {
          messages.info(`Label application skipped: ${decision.rationale}`);
          return;
        }

        const writer = container.resolve<IGitHubIssueWriter>('IGitHubIssueWriter');
        await writer.addLabels({ owner, repo, issueNumber }, recommendation.suggestedLabels);
        messages.success(`Applied labels: ${recommendation.suggestedLabels.join(', ')}.`);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to groom issue', err);
        process.exitCode = 1;
      }
    });
}
