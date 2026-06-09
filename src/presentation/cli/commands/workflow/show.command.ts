/**
 * Workflow Show Command
 *
 * Display detailed information about a specific workflow.
 *
 * Usage:
 *   shep workflow show <name>
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { GetScheduledWorkflowUseCase } from '@/application/use-cases/scheduled-workflows/get-scheduled-workflow.use-case.js';
import { colors, messages, renderDetailView } from '../../ui/index.js';
import { formatWorkflowStatus, formatTimestamp, formatRelativeTime } from './format-helpers.js';

export function createShowCommand(): Command {
  return new Command('show')
    .description('Show workflow details')
    .argument('<name>', 'Workflow name or ID')
    .option('-r, --repo <path>', 'Repository path (defaults to current directory)')
    .action(async (nameOrId: string, options: { repo?: string }) => {
      try {
        const repositoryPath = options.repo ?? process.cwd();
        const useCase = container.resolve(GetScheduledWorkflowUseCase);
        const workflow = await useCase.execute(nameOrId, repositoryPath);

        renderDetailView({
          title: `Workflow: ${workflow.name}`,
          sections: [
            {
              fields: [
                { label: 'ID', value: workflow.id },
                { label: 'Name', value: colors.accent(workflow.name) },
                { label: 'Description', value: workflow.description ?? null },
                { label: 'Status', value: formatWorkflowStatus(workflow) },
                {
                  label: 'Enabled',
                  value: workflow.enabled ? colors.success('yes') : colors.muted('no'),
                },
                { label: 'Repository', value: workflow.repositoryPath },
              ],
            },
            {
              title: 'Schedule',
              fields: [
                { label: 'Cron', value: workflow.cronExpression ?? colors.muted('none') },
                { label: 'Timezone', value: workflow.timezone ?? colors.muted('system default') },
                {
                  label: 'Next Run',
                  value: workflow.nextRunAt
                    ? formatTimestamp(new Date(workflow.nextRunAt))
                    : colors.muted('none'),
                },
                {
                  label: 'Last Run',
                  value: workflow.lastRunAt
                    ? `${formatTimestamp(new Date(workflow.lastRunAt))} (${formatRelativeTime(new Date(workflow.lastRunAt))})`
                    : colors.muted('never'),
                },
              ],
            },
            {
              title: 'Constraints',
              fields: [
                {
                  label: 'Tools',
                  value:
                    workflow.toolConstraints && workflow.toolConstraints.length > 0
                      ? workflow.toolConstraints.join(', ')
                      : colors.muted('all tools allowed'),
                },
              ],
            },
            {
              title: 'Timestamps',
              fields: [
                { label: 'Created', value: formatTimestamp(new Date(workflow.createdAt)) },
                { label: 'Updated', value: formatTimestamp(new Date(workflow.updatedAt)) },
              ],
            },
          ],
          textBlocks: [
            {
              title: 'Prompt',
              content: workflow.prompt,
              color: colors.muted,
            },
          ],
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to show workflow', err);
        process.exitCode = 1;
      }
    });
}
