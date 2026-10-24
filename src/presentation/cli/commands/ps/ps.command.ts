/**
 * ps Command (spec 144)
 *
 * The processes Shep runs on this machine: the web daemon and every agent
 * worker, with feature, agent, status, uptime, CPU and memory.
 *
 * Usage: shep ps [--all] [--json] [--watch]
 *        shep ps stop <id> [--force]
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ListShepProcessesUseCase } from '@/application/use-cases/processes/list-shep-processes.use-case.js';
import { StopShepProcessUseCase } from '@/application/use-cases/processes/stop-shep-process.use-case.js';
import { FEATURE_SHORT_ID_LENGTH } from '@/application/use-cases/feature-console/feature-console.types.js';
import type { EnvironmentVariables } from '@/domain/shared/agent-run-environment.js';
import { colors, messages, renderListView } from '../../ui/index.js';
import type { ListViewConfig } from '../../ui/list-view.js';
import { getCliI18n } from '../../i18n.js';
import { processFooter, processJson, processTable } from './ps-render.js';

const NS = 'cli:commands.ps';
const REFRESH_INTERVAL_MS = 2000;
const CLEAR_SCREEN = '\x1b[2J\x1b[H';

interface PsOptions {
  all?: boolean;
  json?: boolean;
  watch?: boolean;
}

interface PsUseCases {
  list: Pick<ListShepProcessesUseCase, 'execute'>;
  stop: Pick<StopShepProcessUseCase, 'execute'>;
}

/** Seams for tests; production uses the defaults. */
export interface PsCommandOptions {
  resolveUseCases?: () => PsUseCases;
  render?: (config: ListViewConfig) => void;
  out?: (text: string) => void;
  err?: (line: string) => void;
  success?: (line: string) => void;
  isInteractive?: () => boolean;
  /** Resolves when the user presses ctrl+c (watch mode). */
  waitForInterrupt?: () => Promise<void>;
  environment?: () => EnvironmentVariables;
  refreshIntervalMs?: number;
}

const defaults: Required<PsCommandOptions> = {
  resolveUseCases: () => ({
    list: container.resolve(ListShepProcessesUseCase),
    stop: container.resolve(StopShepProcessUseCase),
  }),
  render: renderListView,
  out: (text) => process.stdout.write(text),
  err: (line) => messages.error(line),
  success: (line) => messages.success(line),
  isInteractive: () => Boolean(process.stdout.isTTY),
  waitForInterrupt: () => new Promise((resolve) => process.once('SIGINT', () => resolve())),
  environment: () => process.env,
  refreshIntervalMs: REFRESH_INTERVAL_MS,
};

export function createPsCommand(overrides: PsCommandOptions = {}): Command {
  const deps = { ...defaults, ...overrides };
  const t = getCliI18n().t;

  const show = async (options: PsOptions): Promise<void> => {
    const list = await deps.resolveUseCases().list.execute({ includeAll: options.all === true });
    if (options.json) return deps.out(processJson(list));
    deps.render(processTable(list, t));
    deps.out(processFooter(list, t));
  };

  const watch = async (options: PsOptions): Promise<void> => {
    let drawing = false;
    const draw = async () => {
      if (drawing) return;
      drawing = true;
      try {
        deps.out(CLEAR_SCREEN);
        await show(options);
        deps.out(`  ${colors.muted(t(`${NS}.watchHint`))}\n`);
      } finally {
        drawing = false;
      }
    };
    await draw();
    const timer = setInterval(() => void draw(), deps.refreshIntervalMs);
    try {
      await deps.waitForInterrupt();
    } finally {
      clearInterval(timer);
    }
  };

  const stopCommand = new Command('stop')
    .description(t(`${NS}.stop.description`))
    .argument('<id>', t(`${NS}.stop.idArgument`))
    .option('--force', t('cli:ui.agentGuard.forceOption'))
    .action(async (id: string, options: { force?: boolean }) => {
      const result = await deps.resolveUseCases().stop.execute(id, {
        environment: deps.environment(),
        force: options.force === true,
      });
      if (!result.stopped) {
        deps.err(result.message);
        process.exitCode = 1;
        return;
      }
      const shortId = (result.runId ?? id).slice(0, FEATURE_SHORT_ID_LENGTH);
      deps.success(t(`${NS}.stop.stopped`, { id: shortId, reason: result.message }));
    });

  return new Command('ps')
    .description(t(`${NS}.description`))
    .option('--all', t(`${NS}.allOption`))
    .option('--json', t(`${NS}.jsonOption`))
    .option('-w, --watch', t(`${NS}.watchOption`))
    .addCommand(stopCommand)
    .addHelpText(
      'after',
      `
Examples:
  $ shep ps                  Live Shep processes
  $ shep ps --all            Include runs that exited (finished, failed, at a gate)
  $ shep ps --json           Rows for scripts
  $ shep ps -w               Redraw every 2 seconds
  $ shep ps stop feat-abc1   Stop a feature's running agent

CPU and memory come from ps and are not available on Windows.`
    )
    .action(async (options: PsOptions) => {
      try {
        if (!options.watch) return await show(options);
        if (!deps.isInteractive()) {
          deps.err(t(`${NS}.watchNotTty`));
          process.exitCode = 1;
          return;
        }
        await watch(options);
      } catch (error) {
        deps.err(`${t(`${NS}.failed`)}: ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
      }
    });
}
