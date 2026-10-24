/**
 * TUI Command (spec 142)
 *
 * Opens the full-screen terminal feature console: every feature, live, with a
 * needs-you strip and keys to approve, reject, stop, resume and read logs.
 *
 * Usage: shep tui [--repo <path>] [--all]
 */

import { resolve as resolvePath } from 'node:path';
import { Command } from 'commander';
import { ProcessTerminal, type Terminal } from '@mariozechner/pi-tui';
import { container } from '@/infrastructure/di/container.js';
import { GetFeatureConsoleSnapshotUseCase } from '@/application/use-cases/feature-console/get-feature-console-snapshot.use-case.js';
import { RunFeatureConsoleActionUseCase } from '@/application/use-cases/feature-console/run-feature-console-action.use-case.js';
import { GetFeatureLogTailUseCase } from '@/application/use-cases/feature-console/get-feature-log-tail.use-case.js';
import type { GetFeatureConsoleSnapshotInput } from '@/application/use-cases/feature-console/feature-console.types.js';
import { normalizeRepositoryPath } from '@/domain/shared/repository-path.js';
import {
  runFeatureConsole,
  type FeatureConsoleAppDeps,
} from '../../tui/feature-console/feature-console.app.js';
import { FullscreenTerminal } from '../../tui/feature-console/fullscreen-terminal.js';
import { getTuiI18n } from '../../tui/i18n.js';
import { getCliI18n } from '../i18n.js';
import { messages } from '../ui/index.js';

interface TuiOptions {
  repo?: string;
  all?: boolean;
}

interface ConsoleUseCases {
  snapshot: Pick<GetFeatureConsoleSnapshotUseCase, 'execute'>;
  action: Pick<RunFeatureConsoleActionUseCase, 'execute'>;
  logTail: Pick<GetFeatureLogTailUseCase, 'execute'>;
}

/** Seams for tests; production uses the defaults. */
export interface TuiCommandOptions {
  isInteractive?: () => boolean;
  resolveUseCases?: () => ConsoleUseCases;
  runConsole?: (deps: FeatureConsoleAppDeps) => Promise<void>;
  createTerminal?: () => Terminal;
  err?: (line: string) => void;
}

const defaults: Required<TuiCommandOptions> = {
  isInteractive: () => Boolean(process.stdin.isTTY && process.stdout.isTTY),
  resolveUseCases: () => ({
    snapshot: container.resolve(GetFeatureConsoleSnapshotUseCase),
    action: container.resolve(RunFeatureConsoleActionUseCase),
    logTail: container.resolve(GetFeatureLogTailUseCase),
  }),
  runConsole: runFeatureConsole,
  createTerminal: () => new FullscreenTerminal(new ProcessTerminal()),
  err: (line) => messages.error(line),
};

export function createTuiCommand(overrides: TuiCommandOptions = {}): Command {
  const deps = { ...defaults, ...overrides };
  const t = getCliI18n().t;
  return new Command('tui')
    .description(t('cli:commands.tui.description'))
    .option('--repo <path>', t('cli:commands.tui.repoOption'))
    .option('--all', t('cli:commands.tui.allOption'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep tui                 Every feature, live
  $ shep tui --repo .        Only features of the current repository
  $ shep tui --all           Include archived features`
    )
    .action(async (options: TuiOptions) => {
      const tuiT = getTuiI18n().t;
      if (!deps.isInteractive()) {
        deps.err(tuiT('tui:console.notTty'));
        process.exitCode = 1;
        return;
      }

      const useCases = deps.resolveUseCases();
      const scope: GetFeatureConsoleSnapshotInput = {
        ...(options.repo && {
          repositoryPath: normalizeRepositoryPath(resolvePath(options.repo)),
        }),
        ...(options.all && { includeArchived: true }),
      };

      await deps.runConsole({
        t: tuiT,
        terminal: deps.createTerminal(),
        loadSnapshot: () => useCases.snapshot.execute(scope),
        runAction: (featureId, action, feedback) =>
          useCases.action.execute({ featureId, action, feedback }),
        loadLogTail: (featureId, maxLines) => useCases.logTail.execute(featureId, maxLines),
      });
    });
}
