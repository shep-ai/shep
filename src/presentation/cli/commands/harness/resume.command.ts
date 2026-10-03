/**
 * shep harness resume <id> ["<next instruction>"] — the next task of a
 * standalone session (spec 119, F7). State is restored, never replayed.
 */
import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ResumeHarnessSessionUseCase } from '@/application/use-cases/harness/resume-harness-session.use-case.js';
import {
  fail,
  printJson,
  renderProgress,
  renderResult,
  renderStandaloneNextSteps,
  watchPermissions,
} from './harness-output.js';
import { isInteractive } from './run.command.js';

export function createResumeCommand(): Command {
  return new Command('resume')
    .description(
      'Continue a standalone session with a follow-up instruction (or retry its last goal)'
    )
    .argument('<id>', 'Session id')
    .argument('[task]', 'Follow-up instruction')
    .option('--test-command <cmd>', 'Test command for run_tests')
    .option('--non-interactive', 'Never prompt: permission asks resolve to deny')
    .option('--json', 'Print the result as JSON')
    .action(
      async (
        id: string,
        task: string | undefined,
        opts: { testCommand?: string; nonInteractive?: boolean; json?: boolean }
      ) => {
        const interactive = isInteractive(opts);
        const watcher = interactive ? watchPermissions(id) : undefined;
        try {
          const result = await container.resolve(ResumeHarnessSessionUseCase).execute({
            sessionId: id,
            ...(task && { task }),
            interactive,
            ...(opts.testCommand && { testCommand: opts.testCommand }),
            ...(!opts.json && { onProgress: renderProgress }),
          });
          if (opts.json) {
            printJson({
              session: result.session,
              task: result.task,
              result: result.result,
              usage: result.usage,
            });
            return;
          }
          renderResult(result);
          renderStandaloneNextSteps(result.session);
        } catch (error) {
          fail(error, 'Harness resume failed');
        } finally {
          watcher?.stop();
        }
      }
    );
}
