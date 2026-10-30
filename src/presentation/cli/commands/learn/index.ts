/**
 * shep learn — the self-learning harness (spec 150), gated by the
 * `selfLearning` feature flag.
 *
 *   shep learn status [--repo <path>] [--json]
 *   shep learn history [--repo <path>] [--limit <n>] [--json]
 *   shep learn show <version> [--json]
 *   shep learn diff <from> <to> [--json]
 *   shep learn adopt <version> | --from-dir <dir> [--repo <path>]
 *   shep learn reject <version> [--feedback <text>]
 *   shep learn rollback [--repo <path>] [--reason <text>]
 *   shep learn reflect <feature>
 *
 * (`shep harness` is the query-aware harness of spec 119.)
 */

import { Command } from 'commander';
import { getCliI18n } from '../../i18n.js';
import { LEARN } from './learn-output.js';
import { createHistoryCommand, createStatusCommand } from './read.commands.js';
import { createDiffCommand, createShowCommand } from './show.commands.js';
import {
  createAdoptCommand,
  createReflectCommand,
  createRejectCommand,
  createRollbackCommand,
} from './decide.commands.js';

export function createLearnCommand(): Command {
  return new Command('learn')
    .description(getCliI18n().t(`${LEARN}.description`))
    .addCommand(createStatusCommand())
    .addCommand(createHistoryCommand())
    .addCommand(createShowCommand())
    .addCommand(createDiffCommand())
    .addCommand(createAdoptCommand())
    .addCommand(createRejectCommand())
    .addCommand(createRollbackCommand())
    .addCommand(createReflectCommand());
}
