/**
 * Workflow Schedule Command
 *
 * Set, update, or remove a cron schedule on a workflow.
 *
 * Usage:
 *   shep workflow schedule <name> --cron "0 9 * * MON"
 *   shep workflow schedule <name> --cron "0 9 * * MON" --timezone "America/New_York"
 *   shep workflow schedule <name> --remove
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ScheduleScheduledWorkflowUseCase } from '@/application/use-cases/scheduled-workflows/schedule-scheduled-workflow.use-case.js';
import { colors, messages } from '../../ui/index.js';
import { formatTimestamp } from './format-helpers.js';

export function createScheduleCommand(): Command {
  return new Command('schedule')
    .description('Set a cron schedule on a workflow')
    .argument('<name>', 'Workflow name or ID')
    .option(
      '-c, --cron <expression>',
      'Cron expression (e.g., "0 9 * * MON" for every Monday at 9am)'
    )
    .option('-z, --timezone <tz>', 'IANA timezone (e.g., "America/New_York")')
    .option('--remove', 'Remove the current schedule')
    .option('-r, --repo <path>', 'Repository path (defaults to current directory)')
    .addHelpText(
      'after',
      `
Examples:
  shep workflow schedule my-workflow --cron "0 9 * * MON"           Every Monday at 9am
  shep workflow schedule my-workflow --cron "0 */6 * * *"           Every 6 hours
  shep workflow schedule my-workflow --cron "30 2 * * *" -z UTC     Daily at 2:30 AM UTC
  shep workflow schedule my-workflow --remove                        Remove schedule

Cron format: minute hour day-of-month month day-of-week
  minute:        0-59
  hour:          0-23
  day-of-month:  1-31
  month:         1-12 (or JAN-DEC)
  day-of-week:   0-7 (0 and 7 are Sunday, or MON-SUN)
`
    )
    .action(
      async (
        nameOrId: string,
        options: {
          cron?: string;
          timezone?: string;
          remove?: boolean;
          repo?: string;
        }
      ) => {
        try {
          if (!options.cron && !options.remove) {
            messages.error(
              'Specify a cron expression with --cron or --remove to clear the schedule.\n' +
                'Example: shep workflow schedule my-workflow --cron "0 9 * * MON"'
            );
            process.exitCode = 1;
            return;
          }

          const repositoryPath = options.repo ?? process.cwd();
          const useCase = container.resolve(ScheduleScheduledWorkflowUseCase);

          const workflow = await useCase.execute({
            nameOrId,
            repositoryPath,
            cronExpression: options.remove ? null : (options.cron ?? null),
            ...(options.timezone != null && { timezone: options.timezone }),
          });

          messages.newline();
          if (options.remove) {
            messages.success(`Schedule removed from "${workflow.name}"`);
          } else {
            messages.success(`Schedule set for "${workflow.name}"`);
            console.log(
              `  ${colors.muted('Cron:')}     ${colors.accent(workflow.cronExpression ?? '-')}`
            );
            if (workflow.timezone) {
              console.log(`  ${colors.muted('Timezone:')} ${workflow.timezone}`);
            }
            if (workflow.nextRunAt) {
              console.log(
                `  ${colors.muted('Next run:')} ${formatTimestamp(new Date(workflow.nextRunAt))}`
              );
            }
          }
          messages.newline();
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          messages.error('Failed to set schedule', err);
          process.exitCode = 1;
        }
      }
    );
}
