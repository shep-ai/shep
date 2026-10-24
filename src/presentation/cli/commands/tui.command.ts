/**
 * TUI Command (specs 142, 143)
 *
 * Opens the full-screen terminal feature console: every feature, live, with a
 * needs-you strip and keys to approve, reject, stop, resume and read logs, and
 * to open a feature's shell or followed log in a tmux / Zellij / WezTerm /
 * kitty pane.
 *
 * Usage: shep tui [--repo <path>] [--all] [--no-notify]
 */

import { resolve as resolvePath } from 'node:path';
import { Command } from 'commander';
import { ProcessTerminal, type Terminal } from '@mariozechner/pi-tui';
import { container } from '@/infrastructure/di/container.js';
import { GetFeatureConsoleSnapshotUseCase } from '@/application/use-cases/feature-console/get-feature-console-snapshot.use-case.js';
import { RunFeatureConsoleActionUseCase } from '@/application/use-cases/feature-console/run-feature-console-action.use-case.js';
import { GetFeatureLogTailUseCase } from '@/application/use-cases/feature-console/get-feature-log-tail.use-case.js';
import { OpenFeaturePaneUseCase } from '@/application/use-cases/feature-console/open-feature-pane.use-case.js';
import type { GetFeatureConsoleSnapshotInput } from '@/application/use-cases/feature-console/feature-console.types.js';
import { normalizeRepositoryPath } from '@/domain/shared/repository-path.js';
import {
  runFeatureConsole,
  type FeatureConsoleAppDeps,
} from '../../tui/feature-console/feature-console.app.js';
import { FullscreenTerminal } from '../../tui/feature-console/fullscreen-terminal.js';
import { runInline } from '../../tui/feature-console/run-inline.js';
import { terminalNotification } from '../../tui/feature-console/terminal-notification.js';
import { getTuiI18n } from '../../tui/i18n.js';
import { getCliI18n } from '../i18n.js';
import { messages } from '../ui/index.js';

interface TuiOptions {
  repo?: string;
  all?: boolean;
  /** Commander sets this to false for --no-notify. */
  notify: boolean;
}

/** Variables a pane must share with the console so its shep commands read the same data. */
const PANE_ENVIRONMENT_VARIABLES = ['SHEP_HOME'] as const;
const NOTIFICATION_TITLE = 'shep';

interface ConsoleUseCases {
  snapshot: Pick<GetFeatureConsoleSnapshotUseCase, 'execute'>;
  action: Pick<RunFeatureConsoleActionUseCase, 'execute'>;
  logTail: Pick<GetFeatureLogTailUseCase, 'execute'>;
  pane: Pick<OpenFeaturePaneUseCase, 'execute'>;
}

/** Seams for tests; production uses the defaults. */
export interface TuiCommandOptions {
  isInteractive?: () => boolean;
  resolveUseCases?: () => ConsoleUseCases;
  runConsole?: (deps: FeatureConsoleAppDeps) => Promise<void>;
  createTerminal?: () => Terminal;
  err?: (line: string) => void;
  /** argv that runs this CLI, for panes that run `shep feat logs -f`. */
  shepCommand?: () => string[];
  environment?: () => Readonly<Record<string, string | undefined>>;
  runInline?: FeatureConsoleAppDeps['runInline'];
}

const defaults: Required<TuiCommandOptions> = {
  isInteractive: () => Boolean(process.stdin.isTTY && process.stdout.isTTY),
  resolveUseCases: () => ({
    snapshot: container.resolve(GetFeatureConsoleSnapshotUseCase),
    action: container.resolve(RunFeatureConsoleActionUseCase),
    logTail: container.resolve(GetFeatureLogTailUseCase),
    pane: container.resolve(OpenFeaturePaneUseCase),
  }),
  runConsole: runFeatureConsole,
  createTerminal: () => new FullscreenTerminal(new ProcessTerminal()),
  err: (line) => messages.error(line),
  shepCommand: () => [process.execPath, ...process.execArgv, process.argv[1]],
  environment: () => process.env,
  runInline: (plan) => runInline(plan),
};

export function createTuiCommand(overrides: TuiCommandOptions = {}): Command {
  const deps = { ...defaults, ...overrides };
  const t = getCliI18n().t;
  return new Command('tui')
    .description(t('cli:commands.tui.description'))
    .option('--repo <path>', t('cli:commands.tui.repoOption'))
    .option('--all', t('cli:commands.tui.allOption'))
    .option('--no-notify', t('cli:commands.tui.noNotifyOption'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep tui                 Every feature, live
  $ shep tui --repo .        Only features of the current repository
  $ shep tui --all           Include archived features
  $ shep tui --no-notify     No bell or terminal notification when a feature needs you

Inside tmux, Zellij, WezTerm or kitty, t opens a shell and f follows the agent
log in a split pane (T / F: a new window). Set SHEP_MULTIPLEXER=none to run
them in this terminal instead.`
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

      const env = deps.environment();
      const paneEnvironment = Object.fromEntries(
        PANE_ENVIRONMENT_VARIABLES.flatMap((name) => (env[name] ? [[name, env[name]]] : []))
      ) as Record<string, string>;
      const terminal = deps.createTerminal();

      await deps.runConsole({
        t: tuiT,
        terminal,
        loadSnapshot: () => useCases.snapshot.execute(scope),
        runAction: (featureId, action, feedback) =>
          useCases.action.execute({ featureId, action, feedback }),
        loadLogTail: (featureId, maxLines) => useCases.logTail.execute(featureId, maxLines),
        openPane: (featureId, content, placement) =>
          useCases.pane.execute({
            featureId,
            content,
            placement,
            shepCommand: deps.shepCommand(),
            environment: paneEnvironment,
          }),
        runInline: deps.runInline,
        ...(options.notify && {
          notify: (message: string) =>
            terminal.write(terminalNotification(env, NOTIFICATION_TITLE, message)),
        }),
      });
    });
}
