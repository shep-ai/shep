/**
 * Workflow List Command
 *
 * List all workflows with their schedule, status, last run, and enabled state.
 *
 * Usage:
 *   shep workflow list
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ListScheduledWorkflowsUseCase } from '@/application/use-cases/scheduled-workflows/list-scheduled-workflows.use-case.js';
import type { ScheduledWorkflow } from '@/domain/generated/output.js';
import { colors, symbols, messages, renderListView } from '../../ui/index.js';
import { formatWorkflowStatus, formatRelativeTime } from './format-helpers.js';

export function createListCommand(): Command {
  return new Command('list')
    .alias('ls')
    .description('List all workflows')
    .option('-r, --repo <path>', 'Repository path (defaults to current directory)')
    .action(async (options: { repo?: string }) => {
      try {
        const repositoryPath = options.repo ?? process.cwd();
        const useCase = container.resolve(ListScheduledWorkflowsUseCase);
        const workflows = await useCase.execute({ repositoryPath });

        const rows = workflows.map((w: ScheduledWorkflow) => [
          w.name,
          w.cronExpression ?? colors.muted('-'),
          formatWorkflowStatus(w),
          w.lastRunAt ? formatRelativeTime(new Date(w.lastRunAt)) : colors.muted('never'),
          w.enabled
            ? `${colors.success(symbols.dot)} ${colors.success('on')}`
            : `${colors.muted(symbols.dotEmpty)} ${colors.muted('off')}`,
        ]);

        renderListView({
          title: 'Workflows',
          columns: [
            { label: 'Name', width: 22 },
            { label: 'Schedule', width: 20 },
            { label: 'Status', width: 16 },
            { label: 'Last Run', width: 14 },
            { label: 'Enabled', width: 10 },
          ],
          rows,
          emptyMessage:
            'No workflows found. Create one with: shep workflow create <name> --prompt <prompt>',
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to list workflows', err);
        process.exitCode = 1;
      }
    });
}
