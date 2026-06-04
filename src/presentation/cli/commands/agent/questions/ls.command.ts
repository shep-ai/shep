/**
 * shep agent questions ls
 *
 * Lists agent questions filtered by scope (mandatory `--app`) and
 * optional `--feature`, `--status`, `--limit`. Wraps
 * ListAgentQuestionsUseCase.
 */

import { Command, Option } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ListAgentQuestionsUseCase } from '@/application/use-cases/agents/list-agent-questions.use-case.js';
import { AgentQuestionStatus } from '@/domain/generated/output.js';
import { colors, messages, renderListView } from '../../../ui/index.js';

interface LsOptions {
  app: string;
  feature?: string;
  status?: AgentQuestionStatus;
  limit?: string;
}

const STATUS_VALUES = Object.values(AgentQuestionStatus) as string[];

export function createListCommand(): Command {
  return new Command('ls')
    .description('List agent questions for an app or feature')
    .requiredOption('--app <id>', 'Application id (required)')
    .option('--feature <id>', 'Feature id to narrow the list')
    .addOption(new Option('--status <status>', 'Filter by status').choices(STATUS_VALUES))
    .option('--limit <n>', 'Maximum rows to return')
    .addHelpText(
      'after',
      `
Examples:
  $ shep agent questions ls --app app-123                List all questions for an app
  $ shep agent questions ls --app app-123 --status pending   Show only pending questions
  $ shep agent questions ls --app app-123 --limit 10      Limit to 10 results`
    )
    .action(async (options: LsOptions) => {
      try {
        const useCase = container.resolve(ListAgentQuestionsUseCase);
        const limit = options.limit ? Number(options.limit) : undefined;
        const questions = await useCase.execute({
          appId: options.app,
          featureId: options.feature,
          status: options.status,
          limit: typeof limit === 'number' && Number.isFinite(limit) ? limit : undefined,
        });

        const rows = questions.map((q) => [
          q.id.substring(0, 8),
          q.kind,
          q.status,
          q.agentRunId.substring(0, 8),
          q.prompt.length > 60 ? `${q.prompt.slice(0, 57)}…` : q.prompt,
          q.answer ? colors.muted(q.answer.slice(0, 30)) : colors.muted('-'),
        ]);

        renderListView({
          title: 'Agent questions',
          columns: [
            { label: 'ID', width: 10 },
            { label: 'Kind', width: 10 },
            { label: 'Status', width: 12 },
            { label: 'Run', width: 10 },
            { label: 'Prompt', width: 60 },
            { label: 'Answer', width: 32 },
          ],
          rows,
          emptyMessage: 'No agent questions match the filters',
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to list agent questions', err);
        process.exitCode = 1;
      }
    });
}
