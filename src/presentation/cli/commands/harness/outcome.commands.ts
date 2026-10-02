/**
 * Standalone session outcomes (spec 119, F4): stop, apply, promote, discard.
 */
import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ApplyHarnessSessionUseCase } from '@/application/use-cases/harness/apply-harness-session.use-case.js';
import { DiscardHarnessSessionUseCase } from '@/application/use-cases/harness/discard-harness-session.use-case.js';
import { PromoteHarnessSessionUseCase } from '@/application/use-cases/harness/promote-harness-session.use-case.js';
import { StopHarnessSessionUseCase } from '@/application/use-cases/harness/stop-harness-session.use-case.js';
import { messages } from '../../ui/index.js';
import { fail, printJson } from './harness-output.js';

export function createStopCommand(): Command {
  return new Command('stop')
    .description('Stop the running task of a session before its next turn')
    .argument('<id>', 'Session id')
    .action(async (id: string) => {
      try {
        const { cancelledTaskIds } = await container
          .resolve(StopHarnessSessionUseCase)
          .execute({ sessionId: id });
        messages.success(
          cancelledTaskIds.length > 0
            ? 'Stopped: the process running the task had exited, so it is cancelled.'
            : 'Stop requested; the task stops before its next turn.'
        );
      } catch (error) {
        fail(error, 'Could not stop the session');
      }
    });
}

export function createApplyCommand(): Command {
  return new Command('apply')
    .description("Commit a standalone session's changes to a branch (nothing is pushed)")
    .argument('<id>', 'Session id')
    .option('-b, --branch <name>', 'Branch to create (default: the harness/<id> branch)')
    .option('-m, --message <text>', 'Commit message')
    .option('--json', 'Print the result as JSON')
    .action(async (id: string, opts: { branch?: string; message?: string; json?: boolean }) => {
      try {
        const result = await container.resolve(ApplyHarnessSessionUseCase).execute({
          sessionId: id,
          ...(opts.branch && { branch: opts.branch }),
          ...(opts.message && { message: opts.message }),
        });
        if (opts.json) return printJson(result);
        messages.success(
          `Committed ${result.files.length} file(s) to ${result.branch} (${result.commit.slice(0, 10)})`
        );
      } catch (error) {
        fail(error, 'Could not apply the session');
      }
    });
}

export function createPromoteCommand(): Command {
  return new Command('promote')
    .description('Continue a standalone result as a feature (spec → review → PR)')
    .argument('<id>', 'Session id')
    .option('--agent <type>', 'Agent type for the feature')
    .option('--json', 'Print the result as JSON')
    .action(async (id: string, opts: { agent?: string; json?: boolean }) => {
      try {
        const result = await container.resolve(PromoteHarnessSessionUseCase).execute({
          sessionId: id,
          ...(opts.agent && { agentType: opts.agent }),
        });
        if (opts.json)
          return printJson({
            featureId: result.feature.id,
            branch: result.branch,
            commit: result.commit,
          });
        messages.success(
          `Created feature ${result.feature.name} (${result.feature.id}) from ${result.branch}@${result.commit.slice(0, 10)}`
        );
        if (result.warning) messages.warning(result.warning);
      } catch (error) {
        fail(error, 'Could not promote the session');
      }
    });
}

export function createDiscardCommand(): Command {
  return new Command('discard')
    .description("Remove a standalone session's worktree (its state and evidence are kept)")
    .argument('<id>', 'Session id')
    .action(async (id: string) => {
      try {
        await container.resolve(DiscardHarnessSessionUseCase).execute({ sessionId: id });
        messages.success('Worktree removed; the session is kept for inspection.');
      } catch (error) {
        fail(error, 'Could not discard the session');
      }
    });
}
