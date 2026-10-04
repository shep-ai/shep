/**
 * Knowledge Command Group (spec 125)
 *
 * Team knowledge — Notion pages and databases kept in sync as documents of a
 * space (or one of its product lines). Agents in the space read the passages
 * that match their task.
 *
 * Usage:
 *   shep knowledge source add <connection> --scope <link> [--product-line <l>] [--every <min>]
 *   shep knowledge source ls
 *   shep knowledge source enable|disable|rm <source>
 *   shep knowledge sync [source]
 *   shep knowledge ls [--space <space>]
 *   shep knowledge search <query> [--repo <path>]
 */

import { Command } from 'commander';
import { getCliI18n } from '../../i18n.js';
import { createSourceCommand } from './source.command.js';
import { createLsCommand, createSearchCommand, createSyncCommand } from './browse.command.js';

export function createKnowledgeCommand(): Command {
  return new Command('knowledge')
    .description(getCliI18n().t('cli:commands.knowledge.description'))
    .addCommand(createSourceCommand())
    .addCommand(createSyncCommand())
    .addCommand(createLsCommand())
    .addCommand(createSearchCommand());
}
