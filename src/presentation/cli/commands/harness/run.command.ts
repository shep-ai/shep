/**
 * shep harness run "<task>" — run a standalone harness task in its own
 * worktree (spec 119, F4). Turns stream as they happen; permission asks are
 * answered inline unless --non-interactive (then ask resolves to deny).
 */
import { Command, Option } from 'commander';
import { resolve } from 'node:path';
import { container } from '@/infrastructure/di/container.js';
import { HarnessBudgetMode, HarnessMode } from '@/domain/generated/output.js';
import { RunHarnessTaskUseCase } from '@/application/use-cases/harness/run-harness-task.use-case.js';
import type { HarnessRunOverrides } from '@/application/services/harness/harness-task-service.js';
import { colors, messages } from '../../ui/index.js';
import {
  fail,
  printJson,
  renderProgress,
  renderResult,
  renderStandaloneNextSteps,
  watchPermissions,
} from './harness-output.js';

interface RunOptions {
  repo: string;
  mode?: HarnessMode;
  budget?: HarnessBudgetMode;
  maxTurns?: string;
  model?: string;
  shadowContextRouter?: boolean;
  shadowPermissions?: boolean;
  shadowToolRouter?: boolean;
  testCommand?: string;
  nonInteractive?: boolean;
  json?: boolean;
}

export function runOverrides(opts: RunOptions): HarnessRunOverrides {
  const maxTurns = opts.maxTurns ? Number.parseInt(opts.maxTurns, 10) : undefined;
  return {
    ...(opts.mode && { mode: opts.mode }),
    ...(opts.budget && { budgetMode: opts.budget }),
    ...(maxTurns && maxTurns > 0 && { maxTurns }),
    shadow: {
      ...(opts.shadowContextRouter && { contextRouter: true }),
      ...(opts.shadowPermissions && { permissions: true }),
      ...(opts.shadowToolRouter && { toolRouter: true }),
    },
  };
}

/** Interactive only with a terminal attached and without --non-interactive. */
export function isInteractive(opts: { nonInteractive?: boolean; json?: boolean }): boolean {
  return !opts.nonInteractive && !opts.json && process.stdin.isTTY === true;
}

export function createRunCommand(): Command {
  return new Command('run')
    .description('Run a standalone task in its own worktree')
    .argument('<task>', 'What the agent should do')
    .option('-r, --repo <path>', 'Repository to work on', process.cwd())
    .addOption(new Option('--mode <mode>', 'Context mode').choices(Object.values(HarnessMode)))
    .addOption(
      new Option('--budget <mode>', 'Budget mode').choices(Object.values(HarnessBudgetMode))
    )
    .option('--max-turns <n>', 'Turn limit')
    .option('--model <id>', 'Backend model id')
    .option('--test-command <cmd>', 'Test command for run_tests')
    .option('--shadow-context-router', 'Run as baseline and record query-aware plans')
    .option('--shadow-permissions', 'Record AI permission risk without enforcing it')
    .option('--shadow-tool-router', 'Record capability routing without enforcing it')
    .option('--non-interactive', 'Never prompt: permission asks resolve to deny')
    .option('--json', 'Print the result as JSON')
    .action(async (task: string, opts: RunOptions) => {
      const interactive = isInteractive(opts);
      let watcher: { stop: () => void } | undefined;
      try {
        if (!interactive && !opts.json) {
          messages.info('Non-interactive: actions that need approval will be denied.');
        }
        const result = await container.resolve(RunHarnessTaskUseCase).execute({
          repoRoot: resolve(opts.repo),
          task,
          interactive,
          overrides: runOverrides(opts),
          ...(opts.model && { modelId: opts.model }),
          ...(opts.testCommand && { testCommand: opts.testCommand }),
          ...(!opts.json && { onProgress: renderProgress }),
          onSession: (session) => {
            if (!opts.json)
              console.log(
                colors.muted(`  session ${session.id} · worktree ${session.worktreePath}`)
              );
            if (interactive) watcher = watchPermissions(session.id);
          },
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
        fail(error, 'Harness run failed');
      } finally {
        watcher?.stop();
      }
    });
}
