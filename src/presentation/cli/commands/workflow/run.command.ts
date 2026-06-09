/**
 * Workflow Run Command
 *
 * Manually trigger a workflow execution.
 *
 * Usage:
 *   shep workflow run <name>
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { RunScheduledWorkflowUseCase } from '@/application/use-cases/scheduled-workflows/run-scheduled-workflow.use-case.js';
import { colors, messages } from '../../ui/index.js';

export function createRunCommand(): Command {
  return new Command('run')
    .description('Manually trigger a workflow')
    .argument('<name>', 'Workflow name or ID')
    .option('-r, --repo <path>', 'Repository path (defaults to current directory)')
    .action(async (nameOrId: string, options: { repo?: string }) => {
      try {
        const repositoryPath = options.repo ?? process.cwd();
        const useCase = container.resolve(RunScheduledWorkflowUseCase);
        const execution = await useCase.execute(nameOrId, repositoryPath);

        messages.newline();
        messages.success('Workflow execution queued');
        console.log(`  ${colors.muted('Execution ID:')} ${execution.id.substring(0, 8)}`);
        console.log(`  ${colors.muted('Status:')}       ${colors.info('queued')}`);
        console.log(`  ${colors.muted('Trigger:')}      ${colors.info('manual')}`);
        messages.newline();
        messages.info(
          `View execution history: ${colors.accent(`shep workflow history ${nameOrId}`)}`
        );
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to run workflow', err);
        process.exitCode = 1;
      }
    });
}
