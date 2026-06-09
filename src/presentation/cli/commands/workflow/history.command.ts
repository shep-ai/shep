/**
 * Workflow History Command
 *
 * View execution history for a workflow.
 *
 * Usage:
 *   shep workflow history <name>
 *   shep workflow history <name> --limit 50
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { GetScheduledWorkflowHistoryUseCase } from '@/application/use-cases/scheduled-workflows/get-scheduled-workflow-history.use-case.js';
import { messages, renderListView } from '../../ui/index.js';
import { formatExecutionRow } from './format-helpers.js';

export function createHistoryCommand(): Command {
  return new Command('history')
    .description('View workflow execution history')
    .argument('<name>', 'Workflow name or ID')
    .option('-l, --limit <number>', 'Max results (default: 20)', parseInt)
    .option('-r, --repo <path>', 'Repository path (defaults to current directory)')
    .action(async (nameOrId: string, options: { limit?: number; repo?: string }) => {
      try {
        const repositoryPath = options.repo ?? process.cwd();
        const useCase = container.resolve(GetScheduledWorkflowHistoryUseCase);
        const executions = await useCase.execute(nameOrId, repositoryPath, options.limit);

        const rows = executions.map(formatExecutionRow);

        renderListView({
          title: `Execution History: ${nameOrId}`,
          columns: [
            { label: 'ID', width: 10 },
            { label: 'Status', width: 16 },
            { label: 'Trigger', width: 12 },
            { label: 'Duration', width: 10 },
            { label: 'Started', width: 22 },
          ],
          rows,
          emptyMessage: 'No execution history found',
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to get workflow history', err);
        process.exitCode = 1;
      }
    });
}
