/**
 * Dev Server Command Group
 *
 * The CLI surface for local dev servers — the same capability the web preview
 * tab drives, over the same use cases (FR-21). A complete surface rather than
 * a single `start` is the honest test of a presentation-agnostic core API: it
 * exercises every run-plan use case and would expose any web-shaped assumption
 * baked into the ports.
 *
 * Usage:
 *   shep dev start                       Start the dev server and stream it
 *   shep dev stop                        Stop the dev server
 *   shep dev status                      Show state, URL and resolved command
 *   shep dev logs [--follow]             Show captured output
 *   shep dev plan show                   Show the resolved run plan
 *   shep dev plan set --command "…"      Pin a run plan of your own
 *   shep dev plan clear                  Discard the cached plan (re-analyze)
 *
 * Every subcommand takes `--app`, `--feature` or `--repo`; with none of them
 * the current working directory decides which target is meant.
 *
 * `dev` is deliberately its own namespace: the existing top-level `start`,
 * `stop`, `status` and `_serve` commands are the web-UI daemon's lifecycle, and
 * overloading them with dev-server semantics would break that documented UX.
 */

import { Command } from 'commander';

import { getCliI18n } from '../../i18n.js';
import { createDevLogsCommand } from './logs.command.js';
import { createDevPlanCommand } from './plan.command.js';
import { createDevStartCommand } from './start.command.js';
import { createDevStatusCommand } from './status.command.js';
import { createDevStopCommand } from './stop.command.js';

export function createDevCommand(): Command {
  const t = getCliI18n().t;

  return new Command('dev')
    .description(t('cli:commands.dev.description'))
    .addCommand(createDevStartCommand())
    .addCommand(createDevStopCommand())
    .addCommand(createDevStatusCommand())
    .addCommand(createDevLogsCommand())
    .addCommand(createDevPlanCommand());
}
